// Connecteur PayDunya (serveur uniquement). Les clés viennent des variables d'environnement du serveur.
import { createHash, timingSafeEqual } from 'crypto';

function base() {
  return process.env.PAYDUNYA_MODE === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1';
}

export function paydunyaConfigure() {
  return !!(process.env.PAYDUNYA_MASTER_KEY && process.env.PAYDUNYA_PRIVATE_KEY && process.env.PAYDUNYA_TOKEN);
}

function entetes() {
  return {
    'Content-Type': 'application/json',
    'PAYDUNYA-MASTER-KEY': process.env.PAYDUNYA_MASTER_KEY,
    'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY,
    'PAYDUNYA-TOKEN': process.env.PAYDUNYA_TOKEN,
  };
}

async function appeler(url, options) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), 15000);
  try {
    const rep = await fetch(url, { ...options, signal: ctrl.signal, cache: 'no-store' });
    return await rep.json();
  } finally { clearTimeout(minuteur); }
}

// Crée la facture de paiement. Le MONTANT vient de la transaction créée par le serveur.
export async function creerFacture({ montant, description, reference, urls, client }) {
  const corps = {
    invoice: {
      total_amount: montant,
      description,
      customer: { name: client?.nom || '', email: client?.email || '' },
    },
    store: { name: 'RéussirBac SN', tagline: 'Cours et annales BFEM et Bac' },
    custom_data: { reference },
    actions: { callback_url: urls.callback, return_url: urls.retour, cancel_url: urls.annulation },
  };
  const r = await appeler(`${base()}/checkout-invoice/create`, { method: 'POST', headers: entetes(), body: JSON.stringify(corps) });
  if (r?.response_code !== '00' || !r?.token) throw new Error('paydunya_creation_refusee');
  return { token: r.token, url: r.response_text };
}

// Interroge PayDunya pour connaître le statut RÉEL (source de vérité, jamais le navigateur).
export async function confirmerFacture(token) {
  const r = await appeler(`${base()}/checkout-invoice/confirm/${encodeURIComponent(token)}`, { method: 'GET', headers: entetes() });
  if (!r || r.response_code !== '00') return { trouve: false };
  return {
    trouve: true,
    statut: String(r.status || '').toLowerCase(),   // pending | completed | cancelled | canceled | failed
    montant: Number(r?.invoice?.total_amount),
    reference: r?.custom_data?.reference,
    token: r?.invoice?.token || token,
    mode: r.mode,
    hash: r.hash,
    raison: r.fail_reason || null,
  };
}

// Le hash envoyé par PayDunya est le SHA-512 de la clé maître (contrôle supplémentaire d'authenticité).
export function hashValide(hashRecu) {
  if (!hashRecu || !process.env.PAYDUNYA_MASTER_KEY) return false;
  const attendu = createHash('sha512').update(process.env.PAYDUNYA_MASTER_KEY).digest('hex');
  const a = Buffer.from(String(hashRecu).toLowerCase());
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}
