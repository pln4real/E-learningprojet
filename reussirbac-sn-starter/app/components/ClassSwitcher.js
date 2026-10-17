'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

// Petit sélecteur de classe : un seul champ, quelques pixels de haut.
export default function ClassSwitcher({ currentId, onDark = false }) {
  const router = useRouter();
  const [niveaux, setNiveaux] = useState([]);

  useEffect(() => {
    supabase.from('niveaux').select('id, nom').order('ordre').then(({ data }) => setNiveaux(data || []));
  }, []);

  return (
    <label className={`class-switch ${onDark ? 'on-dark' : ''}`}>
      <span className="sr-only">Changer de classe</span>
      <select value={currentId || ''} onChange={(e) => router.push(`/classe/${e.target.value}`)}>
        {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
      </select>
    </label>
  );
}
