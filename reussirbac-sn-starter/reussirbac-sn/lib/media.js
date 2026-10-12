// Extrait l'identifiant d'une vidéo YouTube depuis les formats de lien courants :
// watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID, /live/ID
export function youtubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/?]+)/);
      if (m) return m[2];
    }
  } catch (e) { /* lien invalide */ }
  return null;
}

// Retrouve le chemin d'un fichier dans le bucket "ressources" à partir de son URL publique
// (nécessaire pour supprimer le fichier quand on supprime la ressource).
export function storagePathFromUrl(url) {
  if (!url) return null;
  const marker = '/object/public/ressources/';
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}

// URL qui force le téléchargement du fichier (Supabase Storage accepte ?download=nom)
export function downloadUrl(url, filename) {
  if (!url) return '#';
  const name = encodeURIComponent((filename || 'cours') + '.pdf');
  return url + (url.includes('?') ? '&' : '?') + 'download=' + name;
}

// Nettoie un nom de fichier : pas d'accents, pas d'espaces (Supabase refuse sinon)
export function safeFileName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

export const TYPES = [
  { key: 'cours', label: 'Cours', plural: 'Cours', icon: '📘' },
  { key: 'exercice', label: 'Exercice', plural: 'Exercices', icon: '✏️' },
  { key: 'annale', label: 'Annale', plural: 'Annales', icon: '🗂️' },
];
