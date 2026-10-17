// Associe une matière (son nom) à une icône et une couleur.
// Les noms viennent de la base : on reconnaît des mots-clés, sans accents.
const COLORS = {
  maths: '#0E7FC4', francais: '#6A3FC8', physique: '#0891B2', svt: '#2E9E6B',
  histoire: '#D97706', geo: '#D9480F', histgeo: '#C2670A', philo: '#CF1F5A',
  anglais: '#2B35A6', eps: '#DC2626', emc: '#9A3412', info: '#475569', defaut: '#2B35A6',
};

export function subjectKey(nom = '') {
  const n = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/math/.test(n)) return 'maths';
  if (/fran/.test(n)) return 'francais';
  if (/physique|chimie/.test(n)) return 'physique';
  if (/svt|vie et de la terre|science.*vie/.test(n)) return 'svt';
  if (/histoire.*geo|hist.?geo/.test(n)) return 'histgeo';
  if (/histoire/.test(n)) return 'histoire';
  if (/geo/.test(n)) return 'geo';
  if (/philo/.test(n)) return 'philo';
  if (/angl/.test(n)) return 'anglais';
  if (/eps|sport/.test(n)) return 'eps';
  if (/moral|civique|emc/.test(n)) return 'emc';
  if (/info|numeri|techno/.test(n)) return 'info';
  return 'defaut';
}

export function subjectColor(nom) {
  return COLORS[subjectKey(nom)];
}
