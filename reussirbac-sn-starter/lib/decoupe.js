// Découpage d'un PDF en exercices, par zones.
// Un marqueur = un trait de coupe posé sur une page :
//   { d: 's' | 'c', p: page (1...), c: colonne (0 gauche, 1 droite ; 0 si une seule colonne), y: 0..1 depuis le haut,
//     k: 'ex' | 'co' | 'x', n: numéro }
//   d : le PDF concerné ('s' = sujet, 'c' = corrigé quand il est dans un autre fichier)
//   k : 'ex' début d'un exercice, 'co' début de sa correction, 'x' zone ignorée (titre, pub...)
// Chaque marqueur ouvre une zone qui dure jusqu'au marqueur suivant (ou la fin du PDF).
// Sens de lecture : page par page ; sur une page à deux colonnes, la colonne de gauche puis celle de droite.
// mise : { s: { col: 1|2, haut: 0..0.15, bas: 0..0.15 }, c: {...} } : nombre de colonnes, et part de l'en-tête / du pied
//        de page à ne jamais recopier (titre répété, numéro de page, adresse e-mail...).

const HAUTEUR_MIN = 0.04; // en dessous, la tranche est du blanc : on l'ignore

export const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
const nbCol = (cfg) => (cfg && cfg.col === 2 ? 2 : 1);

export function trierMarqueurs(marqueurs) {
  return [...(marqueurs || [])].sort((a, b) => (a.d === b.d ? 0 : a.d < b.d ? -1 : 1) || a.p - b.p || (a.c || 0) - (b.c || 0) || a.y - b.y);
}

// pages : { s: nombre de pages du sujet, c: nombre de pages du corrigé }
// -> [{ numero, segments, segments_corrige }] triés par numéro
export function exercicesDepuisMarqueurs(marqueurs, pages, mise = {}) {
  const sorted = trierMarqueurs(marqueurs);
  const parNumero = new Map();
  for (const d of ['s', 'c']) {
    const cfg = (mise && mise[d]) || {};
    const cols = nbCol(cfg);
    const haut = clamp01(cfg.haut), bas = clamp01(cfg.bas);
    const liste = sorted.filter((m) => m.d === d).map((m) => ({ ...m, c: Math.min(cols - 1, m.c || 0) }));
    const nbPages = (pages && pages[d]) || 1;
    liste.forEach((m, i) => {
      const fin = liste[i + 1] || { p: nbPages, c: cols - 1, y: 1 };
      const segs = [];
      let p = m.p, c = m.c;
      for (let garde = 0; garde < 400; garde++) {
        const debut = p === m.p && c === m.c;
        const derniere = p === fin.p && c === fin.c;
        // un début d'exercice / de correction n'est jamais rogné par la bande : seule la suite d'une zone l'est
        const y0 = debut ? m.y : haut;
        const finBande = debut && m.y >= 1 - bas ? 1 : 1 - bas;
        const y1 = derniere ? Math.min(fin.y, finBande) : finBande;
        if (y1 - y0 >= HAUTEUR_MIN) {
          const s = { d, p, y0: Math.round(y0 * 10000) / 10000, y1: Math.round(y1 * 10000) / 10000 };
          if (cols === 2) { s.x0 = c ? 0.5 : 0; s.x1 = c ? 1 : 0.5; }
          segs.push(s);
        }
        if (derniere) break;
        c += 1; if (c >= cols) { c = 0; p += 1; }
        if (p > nbPages) break;
      }
      if (m.k === 'x' || !segs.length || !m.n) return;
      const e = parNumero.get(m.n) || { numero: m.n, segments: [], segments_corrige: [] };
      if (m.k === 'ex') e.segments.push(...segs); else if (m.k === 'co') e.segments_corrige.push(...segs);
      parNumero.set(m.n, e);
    });
  }
  return [...parNumero.values()]
    .filter((e) => e.segments.length)
    .map((e) => ({ ...e, segments_corrige: e.segments_corrige.length ? e.segments_corrige : null }))
    .sort((a, b) => a.numero - b.numero);
}

// ---------------------------------------------------------------------------
// Lecture du texte d'une page : lignes, avec leur colonne.
async function lignesPage(pdf, p, cols) {
  const page = await pdf.getPage(p);
  const { width: W, height: H } = page.getViewport({ scale: 1 });
  const txt = await page.getTextContent();
  const groupes = new Map();
  txt.items.forEach((it) => {
    if (!it.str || !it.str.trim()) return;
    const x = it.transform[4];
    const col = cols === 2 ? (x < W * 0.5 ? 0 : 1) : 0;
    const cle = `${col}|${Math.round(it.transform[5] / 3)}`;
    const l = groupes.get(cle) || { col, y: it.transform[5], h: it.height || Math.abs(it.transform[3]) || 10, items: [] };
    l.items.push({ x, w: it.width || 0, s: it.str });
    groupes.set(cle, l);
  });
  return [...groupes.values()].map((l) => {
    const items = l.items.sort((a, b) => a.x - b.x);
    return {
      col: l.col,
      texte: items.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim(),
      haut: (H - l.y - l.h * 0.9) / H, // bord haut de la ligne, 0..1
      bas: (H - l.y) / H,
      x0: items[0].x / W, x1: Math.max(...items.map((i) => (i.x + i.w) / W)),
      items, W, H,
    };
  }).sort((a, b) => a.col - b.col || a.haut - b.haut);
}

// Devine la mise en page : une ou deux colonnes, et l'en-tête / pied de page répétés sur chaque page.
export async function analyserMiseEnPage(pdf) {
  const n = Math.min(pdf.numPages, 8);
  let deux = 0, un = 0;
  const hauts = new Map(), bas = new Map();
  const candidatsHaut = [], candidatsBas = [];
  const CONTENU = /^(exercices?|probl[eè]mes?|solutions?|corrig[eé]s?|corrections?|r[eé]ponses?|questions?|partie)\b/i;
  const norm = (t) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  for (let p = 1; p <= n; p++) {
    const lignes = await lignesPage(pdf, p, 1);
    // une ligne coupée au milieu par un espace large = deux colonnes côte à côte
    lignes.forEach((l) => {
      if (l.items.length < 2) return;
      const centre = l.W / 2, marge = l.W * 0.02;
      const gauche = l.items.some((i) => i.x + i.w <= centre - marge * 0.3);
      const droite = l.items.some((i) => i.x >= centre + marge * 0.3);
      if (!gauche || !droite) return;
      const traverse = l.items.some((i) => i.x < centre - marge && i.x + i.w > centre + marge);
      if (traverse) un += 1; else deux += 1;
    });
    lignes.forEach((l) => {
      if (l.haut < 0.15) candidatsHaut.push({ cle: norm(l.texte), pos: l.bas, page: p });
      if (l.bas > 0.85) candidatsBas.push({ cle: norm(l.texte), pos: l.haut, page: p });
      if (l.haut < 0.08) { const k = norm(l.texte); const e = hauts.get(k) || { n: 0, fin: 0 }; e.n += 1; e.fin = Math.max(e.fin, l.bas); hauts.set(k, e); }
      if (l.bas > 0.92) { const k = norm(l.texte); const e = bas.get(k) || { n: 0, debut: 1 }; e.n += 1; e.debut = Math.min(e.debut, l.haut); bas.set(k, e); }
    });
  }
  const seuil = Math.max(2, Math.ceil(n * 0.5));
  let haut = 0, pied = 0;
  hauts.forEach((e, k) => { if (e.n >= seuil && !CONTENU.test(k)) haut = Math.max(haut, e.fin + 0.006); });
  bas.forEach((e, k) => { if (e.n >= seuil && !CONTENU.test(k)) pied = Math.max(pied, 1 - e.debut + 0.004); });
  // Sécurité : si un texte qui ne se répète pas (donc du vrai contenu) tombe dans la bande sur 2 pages ou plus, on réduit la bande
  const intrus = (zone) => {
    const par = new Map();
    zone.forEach(({ cle, pos, page }) => { const e = par.get(cle) || { pages: new Set(), pos: 1 }; e.pages.add(page); e.pos = Math.min(e.pos, pos); par.set(cle, e); });
    return [...par.values()].filter((e) => e.pages.size >= 2).map((e) => e.pos);
  };
  const repetesHaut = new Set([...hauts].filter(([, e]) => e.n >= seuil).map(([k]) => k));
  const repetesBas = new Set([...bas].filter(([, e]) => e.n >= seuil).map(([k]) => k));
  const dansHaut = intrus(candidatsHaut.filter((x) => x.pos < haut && !repetesHaut.has(x.cle)));
  if (dansHaut.length) haut = Math.max(0, Math.min(...dansHaut) - 0.004);
  const dansBas = intrus(candidatsBas.filter((x) => x.pos > 1 - pied && !repetesBas.has(x.cle)));
  if (dansBas.length) pied = Math.max(0, 1 - Math.max(...dansBas) - 0.004);
  return {
    col: deux >= 6 && deux > un * 3 ? 2 : 1,
    haut: Math.round(Math.min(0.12, haut) * 1000) / 1000,
    bas: Math.round(Math.min(0.12, pied) * 1000) / 1000,
  };
}

// Propose des marqueurs en lisant le texte du PDF (mots « Exercice n », « Solution n »...).
// Ne marche pas sur les PDF scannés (images) : l'admin pose alors les traits à la main.
// Reconnaît une correction : un titre « Corrigé / Correction / Solutions / Réponses », un « Solution n » ou
// « Correction de l'exercice n », ou un « Exercice n » dont le numéro revient une 2e fois (la partie corrigé).
export async function detecterMarqueurs(pdf, d = 's', cfg = {}) {
  const out = [];
  const cols = nbCol(cfg);
  const haut = cfg.haut || 0, bas = cfg.bas || 0;
  let correction = d === 'c';
  const vus = new Set();
  const TITRE = /^(?:corrig[eé]s?|corrections?|solutions?|r[eé]ponses?|[eé]l[eé]ments de (?:r[eé]ponse|correction))s?\s*(?:$|[-–—:|]|\s(?:de|du|des|d['’]|pour)\b)/i;
  const ETIQUETTE = /^(?:corrig[eé]s?|corrections?|solutions?|r[eé]ponses?)\s*(?:de\s+l['’]?\s*exercices?|d['’]\s*exercices?|des\s+exercices?)?\s*[:.\-–—]?\s*(?:n\s*[°o:]?\s*)?(?:\d+[.,])?(\d+)\s*[:.)\-–—]*\s*(?:\(.*\))?$/i;
  for (let p = 1; p <= pdf.numPages; p++) {
    const lignes = await lignesPage(pdf, p, cols);
    for (const l of lignes) {
      const s = l.texte;
      // en-tête / pied de page : ignorés, SAUF un titre numéroté (« Exercice 3 », « Solution 3 ») qui compte toujours
      if ((l.haut < haut - 0.002 || l.haut > 1 - bas) && !/^(exercice|probl[eè]me)\s*n?\s*[°o:]?\s*\d/i.test(s) && !ETIQUETTE.test(s)) continue;
      const yTop = clamp01(l.haut - 0.006);
      const base = { d, p, c: l.col, y: yTop, auto: true, texte: s };
      const strict = s.match(ETIQUETTE);
      if (strict) {
        // « Solution 3 », « Correction de l'exercice 3 », « Corrigé n°3 » : une ligne qui ne contient que ça
        if (d === 's') correction = true;
        out.push({ ...base, k: 'co', n: Number(strict[1]) });
        continue;
      }
      if (d === 's' && TITRE.test(s) && s.split(' ').length <= 8 && !/[.!?]$/.test(s)) {
        // simple titre « CORRIGÉ », « Correction de la série C3 » : tout ce qui suit est du corrigé
        correction = true; out.push({ ...base, k: 'x', n: 0 });
        continue;
      }
      if (/^(exercice|probl[eè]me)\b/i.test(s)) {
        const m = s.match(/(\d+)/);
        if (!m) continue;
        const n = Number(m[1]);
        if (!correction && vus.has(n) && d === 's') correction = true; // le numéro revient : c'est la partie corrigé
        if (correction) out.push({ ...base, k: 'co', n });
        else { vus.add(n); out.push({ ...base, k: 'ex', n }); }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Assemblage d'un PDF à partir d'éléments : exercices (zones recopiées) ou PDF entiers.
// items : [{ titre, chapitre, url }]                       -> toutes les pages du PDF
//         [{ titre, chapitre, segments, urls: { s, c } }]  -> seulement les zones
// options : { titre, sousTitre, couverture (défaut true), etiquette ('Partie' | 'Corrigé'), pied }
const A4 = [595.28, 841.89];

const nettoyer = (t) => String(t || '').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[^ -~ -ÿ]/g, '').trim();

export async function assemblerPdf(items, options = {}) {
  const { titre, sousTitre, couverture = true, etiquette = 'Partie', pied } = options;
  const { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const indigo = rgb(0.106, 0.129, 0.408);
  const hibiscus = rgb(0.81, 0.122, 0.353);
  const encre = rgb(0.07, 0.08, 0.18);
  const doux = rgb(0.32, 0.34, 0.48);

  if (couverture) {
    const garde = doc.addPage(A4);
    const { width, height } = garde.getSize();
    garde.drawRectangle({ x: 0, y: height - 190, width, height: 190, color: indigo });
    garde.drawText('Reussir', { x: 50, y: height - 70, size: 22, font: gras, color: rgb(1, 1, 1) });
    garde.drawText('Bac', { x: 50 + gras.widthOfTextAtSize('Reussir', 22), y: height - 70, size: 22, font: gras, color: hibiscus });
    garde.drawText(' SN', { x: 50 + gras.widthOfTextAtSize('ReussirBac', 22), y: height - 70, size: 22, font: gras, color: rgb(1, 1, 1) });
    garde.drawText(nettoyer(titre || "Sujet d'entrainement"), { x: 50, y: height - 130, size: 26, font: gras, color: rgb(1, 1, 1) });
    if (sousTitre) garde.drawText(nettoyer(sousTitre), { x: 50, y: height - 158, size: 12, font: normal, color: rgb(0.85, 0.87, 1) });
    let y = height - 240;
    garde.drawText('Au programme', { x: 50, y, size: 14, font: gras, color: encre });
    y -= 26;
    for (let i = 0; i < items.length; i++) {
      if (y < 80) break;
      garde.drawText(`${i + 1}.  ${nettoyer(items[i].titre)}`.slice(0, 80), { x: 50, y, size: 12, font: gras, color: encre });
      y -= 16;
      if (items[i].chapitre) { garde.drawText(nettoyer(items[i].chapitre).slice(0, 90), { x: 66, y, size: 10, font: normal, color: doux }); y -= 22; }
    }
    garde.drawText(nettoyer(pied || 'Travaille sans regarder le corrige. Bon courage !'), { x: 50, y: 50, size: 10, font: normal, color: doux });
  }

  const cache = new Map();
  const emb = new Map(); // une page source n'est recopiée qu'une fois, même si plusieurs exercices s'y trouvent
  const charger = async (url) => {
    if (!cache.has(url)) {
      cache.set(url, (async () => {
        const rep = await fetch(url);
        if (!rep.ok) throw new Error(`Impossible de lire un fichier du sujet (code ${rep.status}).`);
        return PDFDocument.load(await rep.arrayBuffer(), { ignoreEncryption: true });
      })());
    }
    return cache.get(url);
  };

  const M = 28; // marge
  const bas = 32;
  let page = null;
  let curseur = 0;
  const nouvellePage = () => { page = doc.addPage(A4); curseur = A4[1] - M; };

  const pagesDe = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.segments) {
      const src = await charger(it.url);
      const pages = await doc.copyPages(src, src.getPageIndices());
      pages.forEach((p) => doc.addPage(p));
      pagesDe.push(pages.length);
      page = null;
      continue;
    }
    // Exercice : en-tête puis zones recopiées, sans couper un exercice court en deux pages
    const mesures = [];
    for (const s of it.segments) {
      const url = it.urls && it.urls[s.d];
      if (!url) throw new Error('Le fichier du corrigé est introuvable.');
      const src = await charger(url);
      const num = Math.min(src.getPageCount(), Math.max(1, s.p));
      const pg = src.getPage(num - 1);
      const { width, height } = pg.getSize();
      const x0 = s.x0 || 0, x1 = s.x1 || 1;
      const largeur = width * (x1 - x0);
      const echelle = Math.min((A4[0] - 2 * M) / largeur, 1.5, (A4[1] - M - bas - 10) / (height * (s.y1 - s.y0)));
      mesures.push({ pg, url, num, width, height, s, x0, x1, echelle, h: height * (s.y1 - s.y0) * echelle });
    }
    const hTotal = 34 + mesures.reduce((t, m) => t + m.h, 0);
    if (!page || curseur - bas < Math.min(hTotal, 220)) nouvellePage();
    // en-tête de l'exercice
    page.drawRectangle({ x: M, y: curseur - 20, width: 4, height: 18, color: hibiscus });
    page.drawText(nettoyer(`${etiquette} ${i + 1}`), { x: M + 12, y: curseur - 15, size: 12.5, font: gras, color: indigo });
    if (it.chapitre) {
      const t = nettoyer(it.chapitre).slice(0, 70);
      page.drawText(t, { x: A4[0] - M - normal.widthOfTextAtSize(t, 8.5), y: curseur - 14, size: 8.5, font: normal, color: doux });
    }
    curseur -= 30;
    for (const m of mesures) {
      if (curseur - m.h < bas) nouvellePage();
      const cle = m.url + '#' + m.num;
      if (!emb.has(cle)) emb.set(cle, await doc.embedPage(m.pg));
      const Ws = m.width * m.echelle;
      const Hs = m.height * m.echelle;
      const Wc = Ws * (m.x1 - m.x0);
      page.pushOperators(pushGraphicsState(), rectangle(M, curseur - m.h, Wc, m.h), clip(), endPath());
      page.drawPage(emb.get(cle), { x: M - m.x0 * Ws, y: curseur - m.h - (1 - m.s.y1) * Hs, width: Ws, height: Hs });
      page.pushOperators(popGraphicsState());
      curseur -= m.h;
    }
    curseur -= 14;
    if (curseur > bas + 20) {
      page.drawLine({ start: { x: M, y: curseur + 7 }, end: { x: A4[0] - M, y: curseur + 7 }, thickness: 0.5, color: rgb(0.85, 0.86, 0.92) });
    }
    pagesDe.push(1);
  }
  if (!doc.getPageCount()) throw new Error('Aucune page a assembler.');
  const octets = await doc.save();
  return { octets, pagesDe };
}
