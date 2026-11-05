// Bibliothèque : catégories, lecture protégée, copie hors ligne chiffrée (abonnés).
import { supabase } from './supabaseClient';

export const CATEGORIES = [
  { key: 'fascicule', label: 'Fascicules', un: 'Fascicule' },
  { key: 'livre', label: 'Livres', un: 'Livre' },
  { key: 'methode', label: 'Méthodes', un: 'Méthode' },
  { key: 'orientation', label: 'Orientation', un: 'Orientation' },
];
export const libelleCategorie = (k) => CATEGORIES.find((c) => c.key === k)?.un || k;

export const estNouveau = (d) => Date.now() - new Date(d.cree_le).getTime() < 14 * 86400000;

export { chargerPdfjs } from './pdfjs';

// ---------- Droit de lecture ----------
export async function peutLireAbonnes() {
  try {
    const { data, error } = await supabase.rpc('peut_lire_niveau', { p_niveau: null });
    if (error) return null;
    return data === true;
  } catch (e) { return null; }
}

// ---------- Octets du PDF (lien temporaire de 2 minutes, jamais affiché) ----------
export async function lireOctets(chemin) {
  const { data, error } = await supabase.storage.from('bibliotheque').createSignedUrl(chemin, 120);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Lien indisponible');
  const rep = await fetch(data.signedUrl);
  if (!rep.ok) throw new Error('Téléchargement impossible');
  return rep.arrayBuffer();
}

export async function urlsCouvertures(documents) {
  const chemins = documents.map((d) => d.chemin_couverture).filter(Boolean);
  if (!chemins.length) return {};
  const { data } = await supabase.storage.from('bibliotheque').createSignedUrls(chemins, 3600);
  const out = {};
  (data || []).forEach((x) => { if (x.signedUrl) out[x.path] = x.signedUrl; });
  return out;
}

// ---------- Copie hors ligne (IndexedDB, chiffrée AES-GCM, clé non exportable) ----------
const BASE = 'rb-biblio';
function ouvrir() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('docs', { keyPath: 'id' });
      db.createObjectStore('cles', { keyPath: 'nom' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(store, mode, fn) {
  const db = await ouvrir();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); resolve(r && r.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}
async function cle() {
  const existante = await tx('cles', 'readonly', (s) => s.get('principale'));
  if (existante?.cle) return existante.cle;
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await tx('cles', 'readwrite', (s) => s.put({ nom: 'principale', cle: k }));
  return k;
}

export const horsLigneDisponible = () => typeof indexedDB !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle;

export async function garderHorsLigne(doc, octets, couvertureUrl, userId) {
  const k = await cle();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, octets);
  let couv = null;
  if (couvertureUrl) { try { couv = await (await fetch(couvertureUrl)).blob(); } catch (e) {} }
  await tx('docs', 'readwrite', (s) => s.put({
    id: doc.id, userId, iv, data: chiffre, couverture: couv, verifieLe: Date.now(), taille: octets.byteLength,
    meta: { id: doc.id, titre: doc.titre, auteur: doc.auteur, categorie: doc.categorie, pages: doc.pages, acces: doc.acces, cree_le: doc.cree_le, description: doc.description },
  }));
}
export async function lireHorsLigne(id) {
  const e = await tx('docs', 'readonly', (s) => s.get(id));
  if (!e) return null;
  const k = await cle();
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: e.iv }, k, e.data);
}
export async function supprimerHorsLigne(id) { await tx('docs', 'readwrite', (s) => s.delete(id)); }
export async function toutHorsLigne(userId) {
  const tous = (await tx('docs', 'readonly', (s) => s.getAll())) || [];
  return tous.filter((e) => !userId || e.userId === userId);
}
export async function idsHorsLigne(userId) {
  try { return new Set((await toutHorsLigne(userId)).map((e) => e.id)); } catch (e) { return new Set(); }
}
export async function renouvelerVerification(userId) {
  const tous = await toutHorsLigne(userId);
  await Promise.all(tous.map((e) => tx('docs', 'readwrite', (s) => s.put({ ...e, verifieLe: Date.now() }))));
}
export async function viderHorsLigne(userId) {
  const tous = await toutHorsLigne(userId);
  await Promise.all(tous.map((e) => supprimerHorsLigne(e.id)));
}
// Une copie n'est lisible hors ligne que si l'abonnement a été vérifié il y a moins de 30 jours
export const copieValide = (e) => e && Date.now() - e.verifieLe < 30 * 86400000;

// ---------- Dernière page lue (aussi en local pour le hors ligne) ----------
export const memoPage = (id) => { try { return Number(localStorage.getItem('rb_page_' + id)) || 1; } catch (e) { return 1; } };
export const retenirPage = (id, p) => { try { localStorage.setItem('rb_page_' + id, String(p)); } catch (e) {} };

export const tailleLisible = (o) => (o > 1048576 ? `${(o / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);
