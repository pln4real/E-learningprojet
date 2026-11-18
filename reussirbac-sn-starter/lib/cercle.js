import { supabase } from './supabaseClient';

const MESSAGES = {
  code_inconnu: "Ce code n'existe pas. Vérifie-le avec ton ami.",
  soi_meme: "C'est ton propre code.",
  deja_amis: 'Vous êtes déjà amis.',
  deja_envoye: 'Tu as déjà envoyé une invitation à cette personne.',
  impossible: "Impossible d'ajouter cette personne.",
  limite: 'Tu as atteint le nombre maximum d’amis (50).',
  pas_ami: 'Tu ne peux défier que tes amis.',
  quiz_indisponible: "Ce quiz n'est pas disponible.",
  trop_de_defis: 'Tu as déjà 10 défis en cours. Attends que certains soient terminés.',
  deja_joue: 'Tu as déjà répondu à ce défi.',
  defi_termine: 'Ce défi est terminé ou a expiré.',
  defi_introuvable: 'Défi introuvable.',
  quiz_reserve: 'Ce quiz est réservé aux abonnés.',
  pseudo_invalide: 'Le pseudo doit faire entre 2 et 30 caractères.',
  nom_invalide: 'Le nom doit faire entre 2 et 40 caractères.',
  cible_invalide: 'Choisis un total entre 100 et 5000 points.',
  amis_invalides: 'Choisis entre 1 et 5 amis.',
  trop_d_objectifs: 'Tu as déjà 3 objectifs en cours.',
  non_connecte: 'Connecte-toi pour continuer.',
  compte_suspendu: "Cette action n'est pas disponible pour le moment.",
};

export const SQL_MANQUANT = 'sql_manquant';

// Transforme une erreur Supabase en message lisible
export function messageErreur(error) {
  const m = String((error && error.message) || '');
  for (const k of Object.keys(MESSAGES)) if (m.includes(k)) return MESSAGES[k];
  if (/does not exist|Could not find the function|schema cache|404/i.test(m)) return SQL_MANQUANT;
  return 'Une erreur est survenue. Réessaie dans un instant.';
}

export async function appeler(nom, args) {
  const { data, error } = await supabase.rpc(nom, args || {});
  if (error) return { data: null, erreur: messageErreur(error) };
  return { data, erreur: '' };
}

export function lienInvitation(code) {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/amis?code=${encodeURIComponent(code)}`;
}

export function lienWhatsApp(code, pseudo) {
  const texte = `${pseudo ? pseudo + ' t’invite' : 'Je t’invite'} à réviser ensemble sur RéussirBac SN. Rejoins mon cercle : ${lienInvitation(code)}`;
  return `https://wa.me/?text=${encodeURIComponent(texte)}`;
}

export function tempsRelatif(iso) {
  if (!iso) return null;
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 5) return 'Actif maintenant';
  if (min < 60) return `Actif il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Actif il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? 'Actif hier' : `Actif il y a ${j} jours`;
}

export function resteAvantExpiration(iso) {
  const h = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3600000));
  return h >= 24 ? `${Math.floor(h / 24)} j ${h % 24} h` : `${h} h`;
}

export const CLE_CODE = 'rb-code-ami';
