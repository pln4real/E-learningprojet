'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// Palier de l'élève connecté : 'gratuit' | 'abonne' | 'premium'.
// Un visiteur non connecté (ou une base pas encore mise à jour) = 'gratuit'.
export function usePalier() {
  const [etat, setEtat] = useState({ palier: 'gratuit', connecte: false, pret: false });

  useEffect(() => {
    let actif = true;
    async function charger() {
      const { data: { user } } = await supabase.auth.getUser();
      let palier = 'gratuit';
      const { data, error } = await supabase.rpc('mon_palier');
      if (!error && typeof data === 'string') palier = data;
      if (actif) setEtat({ palier, connecte: !!user, pret: true });
    }
    charger();
    return () => { actif = false; };
  }, []);

  return etat;
}
