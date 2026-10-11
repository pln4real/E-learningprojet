'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { TYPES } from '../../lib/media';

export default function CataloguePage() {
  const [niveaux, setNiveaux] = useState([]);
  const [niveauId, setNiveauId] = useState(null);
  const [matieres, setMatieres] = useState([]);
  const [matiereId, setMatiereId] = useState(null);
  const [chapitres, setChapitres] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadNiveaux() {
      const { data } = await supabase.from('niveaux').select('*').order('ordre');
      setNiveaux(data || []);
      if (data && data.length) setNiveauId(data[0].id);
    }
    loadNiveaux();
  }, []);

  useEffect(() => {
    if (!niveauId) return;
    async function loadMatieres() {
      const { data } = await supabase.from('matieres').select('*').eq('niveau_id', niveauId).order('ordre');
      setMatieres(data || []);
      if (data && data.length) setMatiereId(data[0].id);
      else setMatiereId(null);
    }
    loadMatieres();
  }, [niveauId]);

  useEffect(() => {
    if (!matiereId) { setChapitres([]); setLoading(false); return; }
    async function loadChapitres() {
      setLoading(true);
      const { data } = await supabase
        .from('chapitres')
        .select('*, ressources(id, type, statut)')
        .eq('matiere_id', matiereId)
        .order('ordre')
        .order('nom');
      // On n'affiche que les chapitres qui ont au moins une ressource publiée
      const avecContenu = (data || [])
        .map((ch) => ({ ...ch, publiees: (ch.ressources || []).filter((r) => r.statut === 'publie') }))
        .filter((ch) => ch.publiees.length > 0);
      setChapitres(avecContenu);
      setLoading(false);
    }
    loadChapitres();
  }, [matiereId]);

  return (
    <main className="page">
      <div className="eyebrow">Catalogue</div>
      <h1 className="brand-font" style={{ fontSize: 27, margin: '6px 0 18px' }}>Mes cours</h1>

      <select className="niveau-select" value={niveauId || ''} onChange={(e) => setNiveauId(e.target.value)}>
        {niveaux.map((n) => (
          <option key={n.id} value={n.id}>{n.nom}</option>
        ))}
      </select>

      <div className="tabs">
        {matieres.map((m) => (
          <button key={m.id} className={m.id === matiereId ? 'active' : ''} onClick={() => setMatiereId(m.id)}>
            {m.nom}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}
      {!loading && chapitres.length === 0 && (
        <p style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: '30px 0' }}>
          Aucun contenu disponible pour l'instant.
        </p>
      )}

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
              return (
                <span className="chip" key={t.key}>
                  {t.icon} {n} {n > 1 ? t.plural.toLowerCase() : t.label.toLowerCase()}
                </span>
              );
            })}
          </div>
        </Link>
      ))}
    </main>
  );
}
