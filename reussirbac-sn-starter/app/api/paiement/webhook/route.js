import { NextResponse } from 'next/server';
import { serviceClient } from '../../../../lib/serveur';
import { hashValide } from '../../../../lib/paydunya';
import { traiterTransaction } from '../../../../lib/traiter-paiement';

export const dynamic = 'force-dynamic';

// Notification (IPN) de PayDunya : formulaire "data[...]".
// On n'utilise la notification QUE pour savoir quelle transaction vérifier ;
// l'activation passe toujours par une vérification directe auprès de PayDunya.
export async function POST(request) {
  try {
    const form = await request.formData();
    const champ = (nom) => { const v = form.get(nom); return typeof v === 'string' ? v : null; };
    const hash = champ('data[hash]');
    const token = champ('data[invoice][token]');
    if (!hashValide(hash) || !token) return NextResponse.json({ ok: false }, { status: 400 }); // notification invalide : rejetée

    const { data: tx } = await serviceClient().from('transactions').select('reference').eq('ref_prestataire', token).maybeSingle();
    if (!tx) return NextResponse.json({ ok: false }, { status: 404 });

    const r = await traiterTransaction(tx.reference);
    // Statut incertain (réseau) : on répond une erreur pour que PayDunya réessaie
    if (r.etat === 'incertain') return NextResponse.json({ ok: false }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
