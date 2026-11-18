'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Icon from './Icon';

// Bouton « Inviter un ami à réviser ce chapitre » : ouvre WhatsApp avec le lien du chapitre
// et, si l'élève est connecté, son lien d'invitation au cercle.
export default function InviterRevision({ nom }) {
  const [occupe, setOccupe] = useState(false);

  async function inviter() {
    setOccupe(true);
    let code = '';
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.rpc('amis_assurer_profil');
        if (data && data.code) code = data.code;
      }
    } catch (e) { /* le lien du chapitre suffit */ }
    const base = window.location.origin;
    let texte = `Révisons ensemble « ${nom} » sur RéussirBac SN : ${window.location.href}`;
    if (code) texte += `\nRejoins mon cercle pour qu’on se lance des défis : ${base}/amis?code=${encodeURIComponent(code)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, '_blank', 'noopener,noreferrer');
    setOccupe(false);
  }

  return (
    <button type="button" className="btn-light" onClick={inviter} disabled={occupe} style={{ margin: '-8px 0 18px' }}>
      <Icon name="whatsapp" size={16} /> Inviter un ami à réviser ce chapitre
    </button>
  );
}
