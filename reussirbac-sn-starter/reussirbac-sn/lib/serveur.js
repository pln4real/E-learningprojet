// Utilitaires RÉSERVÉS AU SERVEUR (routes /api). Ne jamais importer dans un composant client.
import { createClient } from '@supabase/supabase-js';

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY; // variable SERVEUR (sans NEXT_PUBLIC_)
  if (!url || !cle) throw new Error('config_supabase_serveur_manquante');
  return createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Identifie l'élève à partir du jeton envoyé par le navigateur (jamais de confiance aveugle :
// Supabase vérifie la signature du jeton).
export async function utilisateurDepuisRequete(request) {
  const h = request.headers.get('authorization') || '';
  const jeton = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!jeton) return null;
  const { data, error } = await serviceClient().auth.getUser(jeton);
  if (error || !data?.user) return null;
  return data.user;
}

export async function estAdmin(userId) {
  const { data } = await serviceClient().from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  return !!data;
}

export function urlSite(request) {
  const configuree = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuree) return configuree.replace(/\/$/, '');
  return new URL(request.url).origin;
}
