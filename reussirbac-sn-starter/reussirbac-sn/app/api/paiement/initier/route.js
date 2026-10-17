import { NextResponse } from 'next/server';
import { serviceClient, utilisateurDepuisRequete, urlSite } from '../../../../lib/serveur';
import { creerFacture, paydunyaConfigure } from '../../../../lib/paydunya';

export const dynamic = 'force-dynamic';

const MESSAGES = {
  plan_introuvable: "Cette formule n'est plus disponible.",
  classe_requise: 'Choisis ta classe avant de continuer.',
  classe_non_proposee: "Cette formule n'est pas disponible pour cette classe.",
  plan_sans_classe: "Cette formule n'est pas encore configurée.",
};

export async function POST(request) {
  const user = await utilisateurDepuisRequete(request);
  if (!user) return NextResponse.json({ erreur: 'Connecte-toi pour continuer.' }, { status: 401 });
  if (!paydunyaConfigure()) {
    return NextResponse.json({ erreur: "Le paiement n'est pas encore activé. Réessaie bientôt." }, { status: 503 });
  }

  let corps;
  try { corps = await request.json(); } catch { return NextResponse.json({ erreur: 'Requête invalide.' }, { status: 400 }); }
  const plan = typeof corps?.plan === 'string' ? corps.plan : '';
  const niveau = typeof corps?.niveau === 'string' && corps.niveau ? corps.niveau : null;

  const db = serviceClient();
  // Le serveur lit le prix dans la base : le navigateur ne peut pas l'imposer.
  const { data: tx, error } = await db.rpc('creer_transaction', { p_user: user.id, p_plan: plan, p_niveau: niveau });
  if (error) {
    const msg = MESSAGES[error.message] || 'Impossible de préparer le paiement. Réessaie.';
    return NextResponse.json({ erreur: msg }, { status: 400 });
  }

  // Tentative répétée : on renvoie le même lien de paiement
  if (tx.checkout_url) return NextResponse.json({ url: tx.checkout_url, reference: tx.reference });

  const site = urlSite(request);
  try {
    const facture = await creerFacture({
      montant: tx.montant,
      description: `Abonnement ${tx.plan_nom} (${tx.duree_jours} jours)`,
      reference: tx.reference,
      urls: {
        callback: `${site}/api/paiement/webhook`,
        retour: `${site}/paiement/retour?ref=${encodeURIComponent(tx.reference)}`,
        annulation: `${site}/paiement/retour?ref=${encodeURIComponent(tx.reference)}`,
      },
      client: { nom: user.user_metadata?.nom_complet, email: user.email },
    });
    await db.from('transactions').update({ ref_prestataire: facture.token, checkout_url: facture.url }).eq('id', tx.id);
    return NextResponse.json({ url: facture.url, reference: tx.reference });
  } catch {
    await db.rpc('marquer_transaction', { p_reference: tx.reference, p_statut: 'echouee', p_motif: 'Création de la facture refusée' });
    return NextResponse.json({ erreur: 'Le service de paiement ne répond pas. Réessaie dans un instant.' }, { status: 502 });
  }
}
