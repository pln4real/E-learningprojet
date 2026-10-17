import { NextResponse } from 'next/server';
import { serviceClient, utilisateurDepuisRequete, estAdmin } from '../../../../lib/serveur';
import { traiterTransaction } from '../../../../lib/traiter-paiement';

export const dynamic = 'force-dynamic';

// Réconciliation (admin) : revérifie auprès du prestataire toutes les transactions
// dont le statut est incertain (en attente depuis plus de 2 minutes, ou signalées).
export async function POST(request) {
  const user = await utilisateurDepuisRequete(request);
  if (!user || !(await estAdmin(user.id))) return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });

  const db = serviceClient();
  const limite = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: lignes } = await db.from('transactions').select('reference')
    .or(`and(statut.eq.en_attente,cree_le.lt.${limite}),and(a_verifier.eq.true,statut.neq.payee)`)
    .not('ref_prestataire', 'is', null).order('cree_le', { ascending: false }).limit(50);

  const bilan = { verifiees: 0, payees: 0, echouees: 0, anomalies: 0, incertaines: 0 };
  for (const l of lignes || []) {
    const r = await traiterTransaction(l.reference);
    bilan.verifiees++;
    if (r.etat === 'payee') bilan.payees++;
    else if (r.etat === 'echouee' || r.etat === 'annulee') bilan.echouees++;
    else if (r.etat === 'anomalie') bilan.anomalies++;
    else if (r.etat === 'incertain') bilan.incertaines++;
  }
  return NextResponse.json(bilan);
}
