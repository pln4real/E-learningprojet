// Cœur de la logique de paiement (serveur). Appelé par le webhook, la page de retour et l'admin.
// Règle d'or : on ne croit JAMAIS le navigateur ni le contenu de la notification.
// On redemande le statut réel à PayDunya, puis on contrôle référence, montant et statut.
import { serviceClient } from './serveur';
import { confirmerFacture } from './paydunya';

const STATUTS_PAYES = ['completed'];
const STATUTS_ECHEC = ['cancelled', 'canceled', 'failed'];

// Renvoie { etat: 'payee' | 'en_attente' | 'echouee' | 'annulee' | 'anomalie' | 'introuvable' | 'incertain' }
export async function traiterTransaction(reference) {
  const db = serviceClient();
  const { data: tx } = await db.from('transactions').select('*').eq('reference', reference).maybeSingle();
  if (!tx) return { etat: 'introuvable' };
  if (tx.statut === 'payee' || tx.statut === 'remboursee') return { etat: tx.statut };
  if (!tx.ref_prestataire) return { etat: tx.statut === 'en_attente' ? 'en_attente' : tx.statut };

  let r;
  try { r = await confirmerFacture(tx.ref_prestataire); }
  catch (e) { return { etat: 'incertain' }; }          // réseau : on réessaiera (réconciliation)
  if (!r.trouve) return { etat: 'incertain' };

  // La facture doit bien appartenir à CETTE transaction
  if (r.reference !== tx.reference) {
    await db.rpc('signaler_transaction', { p_reference: tx.reference, p_motif: 'Référence du prestataire différente' });
    return { etat: 'anomalie' };
  }

  if (STATUTS_PAYES.includes(r.statut)) {
    if (r.montant !== tx.montant) {
      await db.rpc('signaler_transaction', { p_reference: tx.reference, p_motif: `Montant reçu ${r.montant} au lieu de ${tx.montant}` });
      return { etat: 'anomalie' };
    }
    const { error } = await db.rpc('activer_abonnement', {
      p_reference: tx.reference, p_montant: r.montant, p_ref_prestataire: tx.ref_prestataire,
    });
    if (error) return { etat: 'incertain' };
    return { etat: 'payee' };
  }

  if (STATUTS_ECHEC.includes(r.statut)) {
    const statut = r.statut === 'failed' ? 'echouee' : 'annulee';
    await db.rpc('marquer_transaction', { p_reference: tx.reference, p_statut: statut, p_motif: r.raison || null });
    return { etat: statut };
  }
  return { etat: 'en_attente' };
}
