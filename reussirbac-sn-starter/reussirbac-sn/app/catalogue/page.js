'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

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
        .select('*, ressources(*)')
        .eq('matiere_id', matiereId)
        .order('ordre');
      setChapitres(data || []);
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
        <div key={ch.id} className="chapter-card">
          <strong style={{ fontSize: 15 }}>{ch.nom}</strong>
          <div className="meta">
            {ch.ressources.length} ressource{ch.ressources.length > 1 ? 's' : ''}
          </div>
          {ch.ressources.map((r) => (
            <div key={r.id} className="resource-row">
              <span>{r.source === 'pdf' ? '📄' : '🎥'} {r.titre}</span>
              <a href={r.source === 'pdf' ? r.url_fichier : r.url_video} target="_blank" rel="noreferrer">
                Ouvrir
              </a>
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}
