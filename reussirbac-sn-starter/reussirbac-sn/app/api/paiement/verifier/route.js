import { NextResponse } from 'next/server';
import { serviceClient, utilisateurDepuisRequete, estAdmin } from '../../../../lib/serveur';
import { traiterTransaction } from '../../../../lib/traiter-paiement';

export const dynamic = 'force-dynamic';

// Vérifie une transaction auprès du prestataire (page de retour, ou admin).
// L'élève ne peut vérifier que SES transactions.
export async function POST(request) {
  const user = await utilisateurDepuisRequete(request);
  if (!user) return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  let corps; try { corps = await request.json(); } catch { corps = {}; }
  const reference = typeof corps?.ref === 'string' ? corps.ref : '';

  const db = serviceClient();
  const { data: tx } = await db.from('transactions').select('user_id').eq('reference', reference).maybeSingle();
  if (!tx) return NextResponse.json({ erreur: 'Transaction introuvable.' }, { status: 404 });
  if (tx.user_id !== user.id && !(await estAdmin(user.id))) {
    return NextResponse.json({ erreur: 'Transaction introuvable.' }, { status: 404 });
  }
  const r = await traiterTransaction(reference);
  return NextResponse.json({ etat: r.etat });
}
