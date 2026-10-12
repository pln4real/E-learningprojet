'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { SubjectGlyph } from './SubjectArt';
import ClassSwitcher from './ClassSwitcher';

// Colonne de gauche : les autres matières de la classe, pour passer de l'une à l'autre.
export default function Sidebar({ niveauId, currentId }) {
  const [matieres, setMatieres] = useState([]);
  const [niveau, setNiveau] = useState(null);

  useEffect(() => {
    if (!niveauId) return;
    supabase.from('niveaux').select('id, nom').eq('id', niveauId).maybeSingle().then(({ data }) => setNiveau(data));
    supabase.from('matieres').select('id, nom').eq('niveau_id', niveauId).order('ordre').then(({ data }) => setMatieres(data || []));
  }, [niveauId]);

  return (
    <aside className="side" aria-label="Matières de la classe">
      <div className="side-head">
        <div className="side-title">{niveau?.nom || 'Classe'}</div>
        <ClassSwitcher currentId={niveauId} onDark />
      </div>
      <nav className="side-nav">
        {matieres.map((m) => (
          <Link key={m.id} href={`/matiere/${m.id}`} className={`side-item ${m.id === currentId ? 'active' : ''}`}>
            <SubjectGlyph nom={m.nom} size={26} />
            <span>{m.nom}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
