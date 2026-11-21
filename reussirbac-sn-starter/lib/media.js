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
  const name = encodeURIComponent((filename || 'cours') + '.' + extensionDe(url));
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
  { key: 'cours', label: 'Cours', plural: 'Cours', icon: 'book' },
  { key: 'exercice', label: 'Exercice', plural: 'Exercices', icon: 'pencil' },
  { key: 'annale', label: 'Annale', plural: 'Annales', icon: 'archive' },
  { key: 'revision', label: 'Révision', plural: 'Révisions', icon: 'file' },
  { key: 'fiche', label: 'Fiche visuelle', plural: 'Fiches visuelles', icon: 'image' },
];

// Une fiche visuelle est une image (ou un PDF) : on reconnaît l'image à l'extension du fichier
export function estImageUrl(url) {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url || '');
}
function extensionDe(url) {
  const m = (url || '').split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  return m ? m[1].toLowerCase() : 'pdf';
}

// Un contenu peut avoir un PDF, une vidéo YouTube, ou les deux.
// (les ressources verrouillées arrivent avec a_pdf / a_video, sans les liens)
export function aPdf(r) {
  if (typeof r.a_pdf === 'boolean') return r.a_pdf;
  return !!r.url_fichier || (!r.url_video && r.source === 'pdf');
}
export function aVideo(r) {
  if (typeof r.a_video === 'boolean') return r.a_video;
  return !!r.url_video || (!r.url_fichier && r.source === 'video');
}

// Onglets de la page de cours : la vidéo de cours a son propre onglet.
// Un cours qui a un PDF ET une vidéo apparaît dans les deux onglets.
export const TABS = [
  { key: 'cours', label: 'Cours', icon: 'book', match: (r) => r.type === 'cours' && (aPdf(r) || !aVideo(r)) },
  { key: 'video', label: 'Vidéo', icon: 'play', match: (r) => r.type === 'cours' && aVideo(r) },
  { key: 'revision', label: 'Révision', icon: 'file', match: (r) => r.type === 'revision' },
  { key: 'fiche', label: 'Fiche visuelle', icon: 'image', match: (r) => r.type === 'fiche' },
  { key: 'exercice', label: 'Exercices', icon: 'pencil', match: (r) => r.type === 'exercice' },
  { key: 'annale', label: 'Annales', icon: 'archive', match: (r) => r.type === 'annale' },
];

// Chemin d'un fichier dans le bucket "ressources" à partir de son adresse enregistrée
export function cheminStockage(url) {
  if (!url) return null;
  const i = url.indexOf('/ressources/');
  if (i < 0) return null;
  try { return decodeURIComponent(url.slice(i + '/ressources/'.length).split('?')[0]); } catch (e) { return null; }
}

// Ajoute à chaque ressource des liens temporaires (2 h) pour lire et télécharger le PDF.
// Si le bucket est encore public ou si la signature échoue, on garde l'adresse d'origine.
export async function signerRessources(supabase, ressources) {
  return Promise.all((ressources || []).map(async (r) => {
    const chemin = cheminStockage(r.url_fichier);
    if (!chemin) return r;
    const stockage = supabase.storage.from('ressources');
    const [vue, tel] = await Promise.all([
      stockage.createSignedUrl(chemin, 7200),
      stockage.createSignedUrl(chemin, 7200, { download: (r.titre || 'cours') + '.' + extensionDe(chemin) }),
    ]);
    return {
      ...r,
      url_fichier_vue: vue?.data?.signedUrl || r.url_fichier,
      url_fichier_tel: tel?.data?.signedUrl || downloadUrl(r.url_fichier, r.titre),
    };
  }));
}
