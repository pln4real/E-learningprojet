// Mode hors-ligne : chapitres téléchargés dans le téléphone (IndexedDB), lecture sans réseau,
// file d'attente des résultats de quiz, revérification de l'abonnement.
import { signerRessources, cheminStockage } from './media';

export const VALIDITE_JOURS = 14; // un téléchargement reste utilisable sans réseau pendant 14 jours
const JOUR = 24 * 3600 * 1000;
const NOM_BASE = 'rb-hors-ligne';

let promesseBase = null;
function ouvrir() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('indisponible'));
  if (!promesseBase) {
    promesseBase = new Promise((resolve, reject) => {
      const rq = indexedDB.open(NOM_BASE, 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains('chapitres')) db.createObjectStore('chapitres', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('fichiers')) db.createObjectStore('fichiers');
        if (!db.objectStoreNames.contains('attente')) db.createObjectStore('attente', { keyPath: 'cle', autoIncrement: true });
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => { promesseBase = null; reject(rq.error); };
    });
  }
  return promesseBase;
}

function demande(store, mode, fn) {
  return ouvrir().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const rq = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(rq ? rq.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('annulé'));
  }));
}

export async function horsLigneDisponible() {
  try { await ouvrir(); return true; } catch (e) { return false; }
}

export const listerChapitres = () => demande('chapitres', 'readonly', (s) => s.getAll()).then((l) => l || []);
export const lireChapitre = (id) => demande('chapitres', 'readonly', (s) => s.get(id));
export const lireFichier = (cle) => demande('fichiers', 'readonly', (s) => s.get(cle));

export async function supprimerChapitre(id) {
  await demande('fichiers', 'readwrite', (s) => s.delete(IDBKeyRange.bound(id + '/', id + '/￿')));
  await demande('chapitres', 'readwrite', (s) => s.delete(id));
}

export async function viderTout() {
  try {
    await demande('fichiers', 'readwrite', (s) => s.clear());
    await demande('chapitres', 'readwrite', (s) => s.clear());
    await demande('attente', 'readwrite', (s) => s.clear());
  } catch (e) { /* rien à vider */ }
}

// ---- File d'attente : résultats faits hors-ligne, envoyés au retour du réseau ----
export const ajouterAttente = (item) => demande('attente', 'readwrite', (s) => s.add(item));
export const listerAttente = () => demande('attente', 'readonly', (s) => s.getAll()).then((l) => l || []);
const retirerAttente = (cle) => demande('attente', 'readwrite', (s) => s.delete(cle));

export async function envoyerAttente(supabase, userId) {
  if (!userId) return 0;
  let envoyes = 0;
  const liste = await listerAttente();
  for (const it of liste) {
    if (it.user_id !== userId) continue; // appartient à un autre compte : on n'y touche pas
    const { error } = await supabase.from('quiz_resultats').insert({ user_id: userId, quiz_id: it.quiz_id, score: it.score, total: it.total });
    if (!error) { await retirerAttente(it.cle); envoyes++; }
    else if (error.code === '23503' || error.code === '23514') await retirerAttente(it.cle); // quiz supprimé ou score invalide : inutile de réessayer
  }
  return envoyes;
}

// ---- Téléchargement d'un chapitre ----
export function tailleLisible(octets) {
  if (!octets) return '0 Mo';
  const mo = octets / (1024 * 1024);
  return mo < 1 ? `${Math.max(1, Math.round(octets / 1024))} Ko` : `${mo.toFixed(mo < 10 ? 1 : 0).replace('.', ',')} Mo`;
}

async function placeLibre() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { quota, usage } = await navigator.storage.estimate();
      if (quota) return quota - (usage || 0);
    }
  } catch (e) { /* inconnu */ }
  return null;
}

// Prépare l'application pour qu'elle s'ouvre sans réseau : page hors-ligne, ses fichiers et le lecteur PDF.
async function preparerCoquille() {
  try {
    const m = await import('./pdfjs'); // le lecteur PDF est chargé à la demande : on le met en cache maintenant
    await m.chargerPdfjs();
    const rep = await fetch('/hors-ligne', { cache: 'reload' });
    const html = await rep.text();
    const fichiers = [...new Set(html.match(/\/_next\/static\/[^"'\\\s)]+\.(?:js|css)/g) || [])];
    await Promise.allSettled(fichiers.map((u) => fetch(u)));
  } catch (e) { /* le téléchargement reste utile */ }
}

// Télécharge tout ce que le compte a le droit de lire dans le chapitre (PDF, corrigés, quiz).
// onEtape({ fait, total, libelle }) pour la barre de progression. Renvoie l'enregistrement du chapitre.
export async function telechargerChapitre(supabase, chapitreId, userId, onEtape = () => {}) {
  await ouvrir();
  const { data: chap, error } = await supabase
    .from('chapitres')
    .select('id, nom, matieres(nom, niveaux(nom)), ressources(*)')
    .eq('id', chapitreId).maybeSingle();
  if (error || !chap) throw new Error("Impossible de lire ce chapitre. Vérifie ta connexion.");

  const lisibles = (chap.ressources || []).filter((r) => r.statut === 'publie' && r.url_fichier);
  const signees = await signerRessources(supabase, lisibles);

  const { data: qz } = await supabase.from('quiz').select('id, titre, description, statut, cree_le').eq('chapitre_id', chapitreId);
  const quizList = [];
  for (const q of (qz || []).filter((x) => x.statut === 'publie')) {
    const { data: qs } = await supabase.from('quiz_questions').select('*').eq('quiz_id', q.id).order('ordre');
    if (qs && qs.length) quizList.push({ id: q.id, titre: q.titre, description: q.description, questions: qs });
  }

  const aTelecharger = [];
  for (const r of signees) {
    aTelecharger.push({ cle: `${chapitreId}/${r.id}/sujet`, url: r.url_fichier_vue || r.url_fichier, libelle: r.titre });
    if (r.url_corrige && (r.type === 'exercice' || r.type === 'annale')) {
      const chemin = cheminStockage(r.url_corrige);
      let urlC = r.url_corrige;
      if (chemin) {
        const { data: s } = await supabase.storage.from('ressources').createSignedUrl(chemin, 7200);
        if (s?.signedUrl) urlC = s.signedUrl;
      }
      aTelecharger.push({ cle: `${chapitreId}/${r.id}/corrige`, url: urlC, libelle: 'Corrigé : ' + r.titre });
    }
  }

  if (!aTelecharger.length && !quizList.length) throw new Error("Ce chapitre n'a encore rien à télécharger.");

  // On refait le téléchargement proprement
  await supprimerChapitre(chapitreId);
  const total = aTelecharger.length + 1;
  let taille = 0;
  const gardes = new Set();
  try {
    for (let i = 0; i < aTelecharger.length; i++) {
      const f = aTelecharger[i];
      onEtape({ fait: i, total, libelle: f.libelle });
      const rep = await fetch(f.url);
      if (!rep.ok) throw new Error(`Le fichier « ${f.libelle} » n'a pas pu être téléchargé.`);
      const blob = await rep.blob();
      const libre = await placeLibre();
      if (libre !== null && blob.size > libre - 5 * 1024 * 1024) throw new Error("Il n'y a plus assez de place sur ton téléphone. Supprime un téléchargement ou libère de l'espace.");
      await demande('fichiers', 'readwrite', (s) => s.put(blob, f.cle));
      taille += blob.size;
      gardes.add(f.cle);
    }
    onEtape({ fait: aTelecharger.length, total, libelle: "Préparation de l'application" });
    await preparerCoquille();

    const maintenant = Date.now();
    const enreg = {
      id: chapitreId,
      user_id: userId,
      nom: chap.nom,
      matiere: chap.matieres?.nom || '',
      niveau: chap.matieres?.niveaux?.nom || '',
      telecharge_le: maintenant,
      valide_jusqu: maintenant + VALIDITE_JOURS * JOUR,
      taille,
      ressources: signees.map((r) => ({
        id: r.id, type: r.type, titre: r.titre, description: r.description || '', sommaire: r.sommaire || null,
        duree_min: r.duree_min || null, bareme: r.bareme || null, difficulte: r.difficulte || null, calculatrice: r.calculatrice || null,
        image: /\.(png|jpe?g|webp|gif)(\?|$)/i.test(r.url_fichier || ''),
        corrige: gardes.has(`${chapitreId}/${r.id}/corrige`),
      })),
      quiz: quizList,
    };
    await demande('chapitres', 'readwrite', (s) => s.put(enreg));
    onEtape({ fait: total, total, libelle: 'Terminé' });
    return enreg;
  } catch (e) {
    await supprimerChapitre(chapitreId).catch(() => {});
    throw e;
  }
}

// ---- Revérification de l'abonnement (à chaque ouverture avec réseau) ----
// Le téléchargement est gardé et prolongé de 14 jours seulement si le compte peut toujours lire le contenu.
export async function revalider(supabase, userId) {
  const liste = await listerChapitres();
  for (const c of liste) {
    if (c.user_id !== userId) { await supprimerChapitre(c.id); continue; }
    const { data, error } = await supabase.from('ressources').select('id').eq('chapitre_id', c.id).eq('statut', 'publie');
    if (error || !Array.isArray(data)) continue; // pas de réseau : on ne conclut rien
    const lisibles = new Set(data.map((r) => r.id));
    // Un document téléchargé n'est plus lisible (abonnement fini, ou retiré par l'administrateur) : on retire le chapitre
    if (c.ressources.some((r) => !lisibles.has(r.id))) { await supprimerChapitre(c.id); continue; }
    await demande('chapitres', 'readwrite', (s) => s.put({ ...c, valide_jusqu: Date.now() + VALIDITE_JOURS * JOUR }));
  }
}

export const estExpire = (c) => !c || Date.now() > c.valide_jusqu;
