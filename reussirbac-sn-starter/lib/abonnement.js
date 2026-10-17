import { supabase } from './supabaseClient';

export const fcfa = (n) => `${Number(n).toLocaleString('fr-FR')} FCFA`;

export function dateFr(d) {
  try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; }
}

export function joursRestants(fin) {
  return Math.max(0, Math.ceil((new Date(fin).getTime() - Date.now()) / 86400000));
}

export const STATUTS_TX = {
  en_attente: 'En attente',
  payee: 'Payé',
  echouee: 'Échoué',
  annulee: 'Annulé',
  remboursee: 'Remboursé',
};

// Texte du périmètre d'un abonnement ou d'un plan
export function libellePortee(niveauxIds, niveaux) {
  if (!niveauxIds) return 'Toutes les classes';
  const noms = niveauxIds.map((id) => niveaux.find((n) => n.id === id)?.nom).filter(Boolean);
  return noms.length ? noms.join(', ') : 'Classe choisie';
}

// Mémorise où revenir après la connexion (choix de formule conservé)
export function memoriserSuite(chemin) {
  try { sessionStorage.setItem('rb_suite', chemin); } catch (e) {}
}
export function prendreSuite() {
  try {
    const s = sessionStorage.getItem('rb_suite');
    if (s && s.startsWith('/') && !s.startsWith('//')) { sessionStorage.removeItem('rb_suite'); return s; }
  } catch (e) {}
  return '/';
}

// Abonnements et transactions de l'élève connecté (protégés par RLS : uniquement les siens)
export async function chargerMonAbonnement(userId) {
  const [{ data: abos }, { data: txs }] = await Promise.all([
    supabase.from('abonnements').select('*').eq('user_id', userId).eq('statut', 'actif').order('fin', { ascending: false }),
    supabase.from('transactions').select('*').eq('user_id', userId).order('cree_le', { ascending: false }).limit(20),
  ]);
  const maintenant = Date.now();
  const liste = abos || [];
  const actifs = liste.filter((a) => new Date(a.debut).getTime() <= maintenant && new Date(a.fin).getTime() > maintenant);
  const avenir = liste.filter((a) => new Date(a.debut).getTime() > maintenant);
  const expires = liste.filter((a) => new Date(a.fin).getTime() <= maintenant);
  const transactions = txs || [];
  const enAttente = transactions.find((t) => t.statut === 'en_attente' && t.checkout_url && Date.now() - new Date(t.cree_le).getTime() < 30 * 60 * 1000) || null;
  const recent = transactions[0];
  const echec = recent && ['echouee', 'annulee'].includes(recent.statut) && Date.now() - new Date(recent.cree_le).getTime() < 24 * 3600 * 1000 ? recent : null;
  return { actifs, avenir, expires, transactions, enAttente, echec };
}

// Redemande le statut réel au serveur (qui interroge le prestataire)
export async function verifierPaiement(reference) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { etat: 'non_connecte' };
  try {
    const rep = await fetch('/api/paiement/verifier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ref: reference }),
    });
    const json = await rep.json();
    return { etat: json.etat || 'incertain' };
  } catch (e) { return { etat: 'reseau' }; }
}
