// Atelier d'entraînement : tirage d'un sujet, assemblage du PDF, chrono.

export const DUREE_DEFAUT = 60; // minutes, quand la durée d'un sujet n'est pas renseignée
export const NB_MAX = 6;
export const TYPES_ATELIER = [
  { key: 'exercice', label: 'Exercices' },
  { key: 'annale', label: 'Annales' },
];

export const DIFFICULTES = { 1: 'Accessible', 2: 'Abordable', 3: 'Exigeant' };

export const dureeDe = (r) => (r && r.duree_min) || DUREE_DEFAUT;
export const baremeDe = (r) => (r && r.bareme) || null;

export function formatDuree(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

export function formatChrono(secondes) {
  const s = Math.max(0, Math.floor(secondes));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}

function melanger(a, alea = Math.random) {
  const t = [...a];
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

// Tire n sujets en répartissant sur les chapitres choisis : un tour par chapitre (dans un ordre aléatoire),
// en proposant d'abord ce que l'élève n'a pas encore réussi.
// ressources : [{ id, chapitre_id, ... }]   deja : Set d'identifiants marqués « réussi »
export function tirerSujet(ressources, n, deja = new Set(), alea = Math.random) {
  const parChapitre = new Map();
  melanger(ressources, alea).forEach((r) => {
    if (!parChapitre.has(r.chapitre_id)) parChapitre.set(r.chapitre_id, []);
    parChapitre.get(r.chapitre_id).push(r);
  });
  parChapitre.forEach((liste, k) => {
    parChapitre.set(k, [...liste.filter((r) => !deja.has(r.id)), ...liste.filter((r) => deja.has(r.id))]);
  });
  const files = melanger([...parChapitre.values()], alea);
  const out = [];
  while (out.length < n && files.some((f) => f.length)) {
    for (const f of files) {
      if (out.length >= n) break;
      if (f.length) out.push(f.shift());
    }
  }
  return out;
}

// Assemble les PDF des sujets en un seul document, avec une page de garde.
// items : [{ titre, chapitre, url }]  -> Uint8Array
export async function assemblerPdf(items, { titre, sousTitre } = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const nettoyer = (t) => String(t || '').replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, '-').replace(/\u0153/g, 'oe').replace(/\u0152/g, 'OE').replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '').trim();

  const garde = doc.addPage([595.28, 841.89]);
  const { width, height } = garde.getSize();
  garde.drawRectangle({ x: 0, y: height - 190, width, height: 190, color: rgb(0.106, 0.129, 0.408) });
  garde.drawText('Reussir', { x: 50, y: height - 70, size: 22, font: gras, color: rgb(1, 1, 1) });
  garde.drawText('Bac', { x: 50 + gras.widthOfTextAtSize('Reussir', 22), y: height - 70, size: 22, font: gras, color: rgb(0.81, 0.122, 0.353) });
  garde.drawText(' SN', { x: 50 + gras.widthOfTextAtSize('ReussirBac', 22), y: height - 70, size: 22, font: gras, color: rgb(1, 1, 1) });
  garde.drawText(nettoyer(titre || "Sujet d'entrainement"), { x: 50, y: height - 130, size: 26, font: gras, color: rgb(1, 1, 1) });
  if (sousTitre) garde.drawText(nettoyer(sousTitre), { x: 50, y: height - 158, size: 12, font: normal, color: rgb(0.85, 0.87, 1) });
  let y = height - 240;
  garde.drawText('Au programme', { x: 50, y, size: 14, font: gras, color: rgb(0.07, 0.08, 0.18) });
  y -= 26;
  items.forEach((it, i) => {
    const ligne = `${i + 1}.  ${nettoyer(it.titre)}`.slice(0, 80);
    garde.drawText(ligne, { x: 50, y, size: 12, font: gras, color: rgb(0.07, 0.08, 0.18) });
    y -= 16;
    if (it.chapitre) { garde.drawText(nettoyer(it.chapitre).slice(0, 90), { x: 66, y, size: 10, font: normal, color: rgb(0.32, 0.34, 0.48) }); y -= 22; }
    if (y < 80) return;
  });
  garde.drawText('Travaille sans regarder le corrige. Bon courage !', { x: 50, y: 50, size: 10, font: normal, color: rgb(0.32, 0.34, 0.48) });

  const pagesDe = [];
  for (const it of items) {
    const rep = await fetch(it.url);
    if (!rep.ok) throw new Error(`Impossible de lire « ${it.titre} » (code ${rep.status}).`);
    const src = await PDFDocument.load(await rep.arrayBuffer(), { ignoreEncryption: true });
    const pages = await doc.copyPages(src, src.getPageIndices());
    pages.forEach((p) => doc.addPage(p));
    pagesDe.push(pages.length);
  }
  const octets = await doc.save();
  return { octets, pagesDe };
}
