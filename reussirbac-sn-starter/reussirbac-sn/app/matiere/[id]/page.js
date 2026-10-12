'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';
import { TYPES } from '../../../lib/media';
import Topbar from '../../components/Topbar';
import Sidebar from '../../components/Sidebar';
import { SubjectGlyph } from '../../components/SubjectArt';

export default function MatierePage() {
  const { id } = useParams();
  const [matiere, setMatiere] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('matieres')
      .select('id, nom, niveaux(id, nom), chapitres(id, nom, ordre, ressources(id, type, statut))')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => { setMatiere(data); setLoading(false); });
  }, [id]);

  const niveau = matiere?.niveaux;
  const chapitres = (matiere?.chapitres || [])
    .map((c) => ({ ...c, publiees: (c.ressources || []).filter((r) => r.statut === 'publie') }))
    .filter((c) => c.publiees.length > 0)
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom));

  return (
    <>
      <Topbar crumbs={[
        { label: niveau?.nom || 'Classe', href: niveau ? `/classe/${niveau.id}` : undefined },
        { label: matiere?.nom || 'Matière' },
      ]} />
      <div className="with-side">
        <Sidebar niveauId={niveau?.id} currentId={id} />
        <main className="side-main">
          {loading && <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}
          {!loading && !matiere && <div className="empty-box">Cette matière n'existe pas.</div>}
          {matiere && (
            <>
              <div className="subject-head">
                <SubjectGlyph nom={matiere.nom} size={44} />
                <div>
                  <h1 className="brand-font page-title" style={{ margin: 0 }}>{matiere.nom}</h1>
                  <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)', fontSize: 15 }}>{niveau?.nom}</p>
                </div>
              </div>
              {chapitres.length === 0 && <div className="empty-box">Les chapitres de cette matière arrivent bientôt.</div>}
              {chapitres.map((ch) => (
                <Link key={ch.id} href={`/chapitre/${ch.id}`} className="chapter-link">
                  <div className="row">
                    <span className="name">{ch.nom}</span>
                    <span className="chev">›</span>
                  </div>
                  <div className="chips">
                    {TYPES.map((t) => {
                      const n = ch.publiees.filter((r) => r.type === t.key).length;
                      if (!n) return null;
                      return <span className="chip" key={t.key}>{t.icon} {n} {n > 1 ? t.plural.toLowerCase() : t.label.toLowerCase()}</span>;
                    })}
                  </div>
                </Link>
              ))}
            </>
          )}
        </main>
      </div>
    </>
  );
}
