'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';
import Topbar from '../../components/Topbar';
import SubjectArt from '../../components/SubjectArt';
import ClassSwitcher from '../../components/ClassSwitcher';

export default function ClassePage() {
  const { id } = useParams();
  const [niveau, setNiveau] = useState(null);
  const [matieres, setMatieres] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      setLoading(true);
      const [n, m] = await Promise.all([
        supabase.from('niveaux').select('id, nom').eq('id', id).maybeSingle(),
        supabase.from('matieres').select('id, nom, chapitres(id, ressources(statut))').eq('niveau_id', id).order('ordre'),
      ]);
      setNiveau(n.data);
      setMatieres((m.data || []).map((x) => ({
        ...x,
        nb: (x.chapitres || []).filter((c) => (c.ressources || []).some((r) => r.statut === 'publie')).length,
      })));
      setLoading(false);
    }
    load();
  }, [id]);

  return (
    <>
      <Topbar crumbs={[{ label: niveau?.nom || 'Classe' }]} />
      <main className="wide-page">
        <div className="page-title-row">
          <h1 className="brand-font page-title">Matières en {niveau?.nom || '…'}</h1>
          <ClassSwitcher currentId={id} />
        </div>

        {loading && <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}
        {!loading && !niveau && <div className="empty-box">Cette classe n'existe pas.</div>}
        {!loading && niveau && matieres.length === 0 && <div className="empty-box">Les matières de cette classe arrivent bientôt.</div>}

        <div className="tiles">
          {matieres.map((m) => {
            const inner = (
              <>
                <SubjectArt nom={m.nom} />
                <div className="tile-body">
                  <span className="tile-name">{m.nom}</span>
                  <span className="tile-count">
                    {m.nb > 0 ? `${m.nb} chapitre${m.nb > 1 ? 's' : ''}` : 'Bientôt'}
                  </span>
                </div>
              </>
            );
            return m.nb > 0 ? (
              <Link key={m.id} href={`/matiere/${m.id}`} className="tile">{inner}</Link>
            ) : (
              <div key={m.id} className="tile soon" aria-disabled="true">{inner}</div>
            );
          })}
        </div>
      </main>
    </>
  );
}
