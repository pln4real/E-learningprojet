import { trouverChapitre } from './import';
import { cleChapitre } from './texte';

const LETTRES = ['A', 'B', 'C', 'D'];

// Accepte du JSON brut, ou entouré de ```json ... ``` (les IA le font souvent)
export function lireJson(texte) {
  let t = String(texte || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a > 0 || (b >= 0 && b < t.length - 1)) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

function indexBonne(v, nb) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v < nb ? v : -1;
  const s = String(v ?? '').trim().toUpperCase();
  const i = LETTRES.indexOf(s.charAt(0));
  return s.length <= 2 && i >= 0 && i < nb ? i : -1;
}

// Renvoie { quiz: [{chapitre, titre, questions, problemes:[...]}], erreur }
export function analyser(data) {
  const liste = Array.isArray(data) ? data : data?.quiz;
  if (!Array.isArray(liste) || !liste.length) return { quiz: [], erreur: 'Aucun quiz trouvé : le fichier doit contenir une liste « quiz ».' };
  const quiz = liste.map((q, n) => {
    const problemes = [];
    const questions = [];
    (Array.isArray(q.questions) ? q.questions : []).forEach((x, i) => {
      const options = Array.isArray(x.options) ? x.options.map((o) => String(o ?? '').trim()) : [];
      const enonce = String(x.enonce ?? '').trim();
      const bonne = indexBonne(x.bonne, options.length);
      if (!enonce) return problemes.push(`Question ${i + 1} : énoncé vide (ignorée).`);
      if (options.length < 2 || options.length > 4 || options.some((o) => !o)) return problemes.push(`Question ${i + 1} : il faut 2 à 4 réponses non vides (ignorée).`);
      if (bonne < 0) return problemes.push(`Question ${i + 1} : bonne réponse illisible (ignorée).`);
      questions.push({ enonce, options, bonne, explication: String(x.explication ?? '').trim() });
    });
    if (!questions.length) problemes.push('Aucune question valide.');
    return { chapitre: String(q.chapitre ?? '').trim(), titre: String(q.titre ?? '').trim(), questions, problemes };
  });
  return { quiz, erreur: '' };
}

export function chapitreCorrespondant(nom, chapitres) {
  const exact = chapitres.find((c) => cleChapitre(c.nom) === cleChapitre(nom));
  if (exact) return { chapitre: exact, niveau: 'sur' };
  const m = trouverChapitre(nom, chapitres);
  return { chapitre: m.chapitre, niveau: m.niveau };
}
