// Import en lot : associe chaque nom de fichier au bon chapitre et au bon type.

const MOTS_VIDES = new Set(['le','la','les','l','un','une','des','de','d','du','et','en','au','aux','a','sur','dans','pour','par','ou','ses','son','sa']);
const MOTS_FICHIER = new Set(['lecon','chapitre','chap','cours','complet','exercice','exo','exos','resume','revision','fiche','annale','corrige','pdf','page','garde','partie']);

export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’‘]/g, "'").replace(/[_\-–—.]+/g, ' ').replace(/'/g, ' ').replace(/\s+/g, ' ').trim();
}

function jetons(s, retirerMotsFichier) {
  return norm(s).split(' ')
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !MOTS_VIDES.has(t) && !(retirerMotsFichier && MOTS_FICHIER.has(t)))
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}

// Numéro d'un chapitre (« Leçon 3 : … », « Chapitre 02 … », « Domaine 1 - 2.3 : … »)
export function numeroChapitre(nom) {
  const sansDomaine = norm(nom).replace(/^domaine \d+ /, '');
  const m = sansDomaine.match(/\d+/);
  return m ? Number(m[0]) : null;
}
export function numeroFichier(nomFichier) {
  const m = norm(nomFichier).match(/(?:lecon|chapitre|chap|cours|partie|\b)\s*0*(\d+)/);
  return m ? Number(m[1]) : null;
}

export function typeDepuisNom(nomFichier, defaut) {
  const n = norm(nomFichier);
  if (/\bannales?\b|\bsujets?\b/.test(n)) return 'annale';
  if (/\bexercices?\b|\bexos?\b|\bcorriges?\b|\btd\b/.test(n)) return 'exercice';
  if (/\bresume\b|\brevisions?\b/.test(n)) return 'revision';
  if (/\bfiche\b/.test(n)) return 'fiche';
  if (/\bcours\b/.test(n)) return 'cours';
  return defaut;
}

export function nettoyerNom(fichier) {
  return fichier.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Titre proposé : le nom du fichier sans préfixe « Lecon 01 » / « Chapitre 3 »
export function titreDepuisNom(fichier, type, libelleType) {
  let t = nettoyerNom(fichier).replace(/^(le[cç]on|chapitre|chap)\s*0*\d+\s*[-–:.]?\s*/i, '').trim();
  if (!t) t = libelleType;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Cherche le meilleur chapitre. Renvoie { chapitre, score, niveau: 'sur'|'verifier'|'aucun' }
export function trouverChapitre(fichier, chapitres) {
  const base = nettoyerNom(fichier);
  const jf = new Set(jetons(base, true));
  const nf = numeroFichier(base);
  let best = null;
  let bestScore = 0;
  for (const c of chapitres) {
    const jc = new Set(jetons(c.nom.replace(/^domaine \d+\s*-\s*/i, ''), false));
    if (!jf.size || !jc.size) continue;
    let inter = 0;
    jf.forEach((t) => { if (jc.has(t)) inter++; });
    const contenu = inter / jf.size;
    const jaccard = inter / (jf.size + jc.size - inter);
    let score = 0.7 * contenu + 0.3 * jaccard;
    const nc = numeroChapitre(c.nom);
    if (nf != null && nc != null && nf === nc) score += 0.2;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (best && bestScore >= 0.6) return { chapitre: best, score: bestScore, niveau: 'sur' };
  if (best && bestScore >= 0.4) return { chapitre: best, score: bestScore, niveau: 'verifier' };
  return { chapitre: null, score: bestScore, niveau: 'aucun' };
}

// Pages sans contenu pédagogique : on ne les importe pas par défaut
export function estAnnexe(fichier) {
  return /garde|sommaire|annexe|presentation|couverture|index/.test(norm(fichier)) && !/lecon|chapitre|\bcours\b/.test(norm(fichier).replace(/sommaire/, ''));
}
