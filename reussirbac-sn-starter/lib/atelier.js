// Atelier d'entraînement : tirage d'un sujet, assemblage du PDF, chrono.

export const DUREE_DEFAUT = 60; // minutes, quand la durée d'un sujet n'est pas renseignée
export const NB_MAX = 6;
export const TYPES_ATELIER = [
  { key: 'exercice', label: 'Exercices' },
  { key: 'annale', label: 'Annales' },
];

export const DIFFICULTES = { 1: 'Accessible', 2: 'Abordable', 3: 'Exigeant' };

export const DUREE_EXERCICE = 25; // minutes, pour un exercice découpé sans durée
export const dureeDe = (r) => (r && r.duree_min) || (r && r.exercice ? DUREE_EXERCICE : DUREE_DEFAUT);
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

// Assemblage du sujet et du corrigé (PDF entiers ou zones d'exercices) : voir decoupe.js
export { assemblerPdf } from './decoupe';
