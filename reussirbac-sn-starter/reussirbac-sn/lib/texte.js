// Clé de comparaison pour les noms de chapitres : on ignore la casse, les accents,
// les apostrophes/tirets typographiques et les espaces en trop.
// Ainsi « L’espace  nord-américain » et « l'espace nord-americain » sont le même chapitre.
export function cleChapitre(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}
