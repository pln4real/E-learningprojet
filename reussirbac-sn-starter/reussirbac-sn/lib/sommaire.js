// Détection automatique du sommaire d'un PDF de cours (utilisée dans l'admin seulement :
// les élèves ne téléchargent jamais cette bibliothèque, ils reçoivent juste la liste enregistrée).
//
// 1) On lit d'abord les signets du PDF (créés par Word, Google Docs, Canva... à partir des titres).
// 2) Sinon, on repère les titres au texte : lignes courtes écrites plus grand que le texte courant.
// Le résultat est une liste [{ titre, page, niveau }] que l'admin peut corriger avant d'enregistrer.

const MAX_ENTREES = 30;

function nettoyer(t) {
  return String(t || '').replace(/\s+/g, ' ').trim();
}

async function viaSignets(pdf) {
  const outline = await pdf.getOutline();
  if (!outline || outline.length === 0) return [];
  const sortie = [];
  async function visiter(items, niveau) {
    for (const it of items) {
      if (sortie.length >= MAX_ENTREES) return;
      let page = null;
      try {
        let dest = it.dest;
        if (typeof dest === 'string') dest = await pdf.getDestination(dest);
        if (Array.isArray(dest) && dest[0] !== undefined && dest[0] !== null) {
          page = typeof dest[0] === 'object' ? (await pdf.getPageIndex(dest[0])) + 1 : Number(dest[0]) + 1;
        }
      } catch (e) { page = null; }
      const titre = nettoyer(it.title);
      if (titre && page) sortie.push({ titre, page, niveau });
      if (it.items && it.items.length && niveau < 1) await visiter(it.items, niveau + 1);
    }
  }
  await visiter(outline, 0);
  return sortie;
}

async function viaTexte(pdf) {
  const nbPages = Math.min(pdf.numPages, 80);
  const lignesParPage = [];
  const poids = new Map(); // taille de police -> nombre de caractères
  for (let p = 1; p <= nbPages; p++) {
    const page = await pdf.getPage(p);
    const contenu = await page.getTextContent();
    const lignes = new Map(); // ordonnée -> { texte, taille, gras }
    for (const it of contenu.items) {
      const texte = it.str;
      if (!texte || !texte.trim()) continue;
      const taille = Math.round(Math.abs(it.transform[3]) * 2) / 2 || Math.round(it.height * 2) / 2;
      const y = Math.round(it.transform[5] / 2);
      const cle = y;
      const l = lignes.get(cle) || { texte: '', taille: 0, nb: 0, y: it.transform[5] };
      l.texte += texte; l.nb += texte.length; l.taille = Math.max(l.taille, taille);
      lignes.set(cle, l);
      poids.set(taille, (poids.get(taille) || 0) + texte.length);
    }
    lignesParPage.push([...lignes.values()].sort((a, b) => b.y - a.y));
  }
  if (poids.size === 0) return []; // PDF scanné (images) : rien à lire

  // Taille du texte courant = celle qui porte le plus de caractères
  let courant = 0, max = -1;
  for (const [t, n] of poids) if (n > max) { max = n; courant = t; }

  // Lignes répétées sur plusieurs pages (en-têtes, pieds de page) : ignorées
  const frequence = new Map();
  lignesParPage.forEach((ls) => new Set(ls.map((l) => nettoyer(l.texte))).forEach((t) => frequence.set(t, (frequence.get(t) || 0) + 1)));

  const candidats = [];
  lignesParPage.forEach((ls, i) => {
    for (const l of ls) {
      const titre = nettoyer(l.texte);
      if (titre.length < 3 || titre.length > 90) continue;
      if (/^\d+$/.test(titre) || /^page\s*\d+/i.test(titre)) continue;
      if (nbPages >= 4 && (frequence.get(titre) || 0) >= 3) continue;
      if (l.taille >= courant * 1.25 && !/[,;:]$/.test(titre)) candidats.push({ titre, page: i + 1, taille: l.taille });
    }
  });
  if (candidats.length === 0) return [];

  // Le titre du document (la plus grande taille, une seule fois, page 1) n'est pas une section
  const tailles = [...new Set(candidats.map((c) => c.taille))].sort((a, b) => b - a);
  const plusGrande = tailles[0];
  let retenus = candidats;
  const grands = candidats.filter((c) => c.taille === plusGrande);
  if (grands.length === 1 && grands[0].page === 1 && candidats.length > 1) retenus = candidats.filter((c) => c !== grands[0]);

  const niveaux = [...new Set(retenus.map((c) => c.taille))].sort((a, b) => b - a);
  return retenus.slice(0, MAX_ENTREES).map((c) => ({ titre: c.titre, page: c.page, niveau: Math.min(niveaux.indexOf(c.taille), 1) }));
}

// `pdfjs` = la bibliothèque pdf.js déjà chargée ; `donnees` = ArrayBuffer ou Uint8Array du PDF
export async function extraireSommaire(pdfjs, donnees) {
  const pdf = await pdfjs.getDocument({ data: donnees }).promise;
  try {
    let liste = await viaSignets(pdf);
    if (liste.length < 2) liste = await viaTexte(pdf);
    // Une seule entrée n'a pas d'intérêt pour naviguer
    if (liste.length < 2) return [];
    return liste.slice(0, MAX_ENTREES);
  } finally {
    try { await pdf.destroy(); } catch (e) {}
  }
}

// Texte du lien vers une page précise du PDF
export function lienPage(url, page) {
  if (!url) return url;
  return page && page > 1 ? `${url.split('#')[0]}#page=${page}` : url.split('#')[0];
}
