// Découpage d'un PDF en exercices, par zones.
// Un marqueur = un trait de coupe posé sur une page :
//   { d: 's' | 'c', p: numéro de page (1...), y: 0..1 depuis le haut de la page, k: 'ex' | 'co' | 'x', n: numéro }
//   d : le PDF concerné ('s' = sujet, 'c' = corrigé quand il est dans un autre fichier)
//   k : 'ex' début d'un exercice, 'co' début de sa correction, 'x' zone ignorée (titre, pied de page...)
// Chaque marqueur ouvre une zone qui dure jusqu'au marqueur suivant (ou la fin du PDF).

const HAUTEUR_MIN = 0.04; // en dessous, la tranche est du blanc : on l'ignore

export const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

export function trierMarqueurs(marqueurs) {
  return [...(marqueurs || [])].sort((a, b) => (a.d === b.d ? 0 : a.d < b.d ? -1 : 1) || a.p - b.p || a.y - b.y);
}

// pages : { s: nombre de pages du sujet, c: nombre de pages du corrigé }
// -> [{ numero, segments, segments_corrige }] triés par numéro
export function exercicesDepuisMarqueurs(marqueurs, pages) {
  const sorted = trierMarqueurs(marqueurs);
  const parNumero = new Map();
  for (const d of ['s', 'c']) {
    const liste = sorted.filter((m) => m.d === d);
    const nbPages = (pages && pages[d]) || 1;
    liste.forEach((m, i) => {
      const fin = liste[i + 1] || { p: nbPages, y: 1 };
      const segs = [];
      for (let p = m.p; p <= fin.p; p++) {
        const y0 = p === m.p ? clamp01(m.y) : 0;
        const y1 = p === fin.p ? clamp01(fin.y) : 1;
        if (y1 - y0 >= HAUTEUR_MIN) segs.push({ d, p, y0: Math.round(y0 * 10000) / 10000, y1: Math.round(y1 * 10000) / 10000 });
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

// Propose des marqueurs en lisant le texte du PDF (mots « Exercice n », « Solution n »...).
// Ne marche pas sur les PDF scannés (images) : l'admin pose alors les traits à la main.
// pdf : document pdfjs ; d : 's' ou 'c'
export async function detecterMarqueurs(pdf, d = 's') {
  const out = [];
  let correction = d === 'c';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const H = page.getViewport({ scale: 1 }).height;
    const txt = await page.getTextContent();
    const lignes = new Map();
    txt.items.forEach((it) => {
      if (!it.str || !it.str.trim()) return;
      const y = Math.round(it.transform[5] / 3);
      const l = lignes.get(y) || { y: it.transform[5], h: it.height || Math.abs(it.transform[3]) || 10, items: [] };
      l.items.push({ x: it.transform[4], s: it.str });
      lignes.set(y, l);
    });
    const tries = [...lignes.values()].sort((a, b) => b.y - a.y);
    for (const l of tries) {
      const s = l.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
      const yTop = clamp01((H - l.y - l.h * 0.9) / H - 0.006);
      if (/^(correction|corrig[eé]s?|solutions?)\b.*(s[eé]rie|exercices?|bac|chapitre|-|–|—)/i.test(s) && !/^solution\s*:/i.test(s) && s.length < 120 && !/^(exercice|solution)\s*(n|\d)/i.test(s)) {
        if (d === 's') { correction = true; out.push({ d, p, y: yTop, k: 'x', n: 0, auto: true, texte: s }); }
        continue;
      }
      if (/^page\s*\d+\s*(\/|sur)\s*\d+/i.test(s) && yTop > 0.85) {
        // pied de page : on l'exclut, et la zone en cours reprend en haut de la page suivante
        out.push({ d, p, y: clamp01(yTop - 0.03), k: 'x', n: 0, auto: true, texte: s });
        const cur = [...out].reverse().find((o) => o.k !== 'x');
        if (cur && p < pdf.numPages) out.push({ d, p: p + 1, y: 0, k: cur.k, n: cur.n, auto: true, texte: '(suite)' });
        continue;
      }
      if (/^(exercice|probl[eè]me)\b/i.test(s)) {
        const m = s.match(/(\d+)/);
        if (m) out.push({ d, p, y: yTop, k: correction ? 'co' : 'ex', n: Number(m[1]), auto: true, texte: s });
      } else if (/^(solution|corrig[eé]|correction)\b/i.test(s)) {
        const nums = s.match(/\d+/g);
        if (nums) {
          if (d === 's') correction = true;
          out.push({ d, p, y: yTop, k: 'co', n: Number(nums[nums.length - 1]), auto: true, texte: s });
        }
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
      const echelle = Math.min((A4[0] - 2 * M) / width, (A4[1] - M - bas - 10) / (height * (s.y1 - s.y0)));
      mesures.push({ pg, url, num, width, height, s, echelle, h: height * (s.y1 - s.y0) * echelle });
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
      page.pushOperators(pushGraphicsState(), rectangle(M, curseur - m.h, Ws, m.h), clip(), endPath());
      page.drawPage(emb.get(cle), { x: M, y: curseur - m.h - (1 - m.s.y1) * Hs, width: Ws, height: Hs });
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
