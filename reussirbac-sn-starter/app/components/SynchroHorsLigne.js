'use client';

import { useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { envoyerAttente, revalider, viderTout, listerChapitres, listerAttente } from '../../lib/horsligne';

// Travail de fond du mode hors-ligne, à chaque ouverture et dès que le réseau revient :
// 1. envoie les scores faits sans connexion ; 2. revérifie que le compte peut toujours lire les chapitres téléchargés.
// À la déconnexion, tout ce qui est téléchargé est effacé du téléphone.
export default function SynchroHorsLigne() {
  useEffect(() => {
    let actif = true;
    async function synchro() {
      try {
        if (navigator.onLine === false) return;
        const [chs, att] = await Promise.all([listerChapitres(), listerAttente()]);
        if (!chs.length && !att.length) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!actif || !user) return;
        await envoyerAttente(supabase, user.id);
        await revalider(supabase, user.id);
      } catch (e) { /* silencieux : on réessaiera */ }
    }
    synchro();
    window.addEventListener('online', synchro);
    const { data: sub } = supabase.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_OUT') viderTout(); });
    return () => { actif = false; window.removeEventListener('online', synchro); sub?.subscription?.unsubscribe(); };
  }, []);
  return null;
}
