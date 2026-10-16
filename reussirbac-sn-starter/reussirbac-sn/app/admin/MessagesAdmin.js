'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Icon from '../components/Icon';

function quand(d) {
  try { return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return d; }
}

export default function MessagesAdmin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seulementNonLus, setSeulementNonLus] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('messages_contact').select('*').order('cree_le', { ascending: false });
    if (error) setError(error.message.includes('messages_contact') ? "Les messages ne sont pas encore activés : lance le script SQL 09 dans Supabase." : error.message);
    setItems(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function basculerLu(m) {
    setBusyId(m.id);
    const { error } = await supabase.from('messages_contact').update({ lu: !m.lu }).eq('id', m.id);
    if (error) setError(error.message); else setItems((p) => p.map((x) => (x.id === m.id ? { ...x, lu: !m.lu } : x)));
    setBusyId(null);
  }

  async function supprimer(m) {
    if (!window.confirm(`Supprimer le message de ${m.nom} ?`)) return;
    setBusyId(m.id);
    const { error } = await supabase.from('messages_contact').delete().eq('id', m.id);
    if (error) setError(error.message); else setItems((p) => p.filter((x) => x.id !== m.id));
    setBusyId(null);
  }

  const nonLus = items.filter((m) => !m.lu).length;
  const visibles = seulementNonLus ? items.filter((m) => !m.lu) : items;

  return (
    <>
      <div className="admin-filters" style={{ alignItems: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)' }}>
          {items.length} message{items.length > 1 ? 's' : ''} · {nonLus} non lu{nonLus > 1 ? 's' : ''}
        </p>
        <label className="checkbox-row" style={{ margin: 0 }}>
          <input type="checkbox" checked={seulementNonLus} onChange={(e) => setSeulementNonLus(e.target.checked)} />
          Non lus seulement
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
      {loading && <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}
      {!loading && !error && visibles.length === 0 && (
        <div className="empty-box">{items.length === 0 ? 'Aucun message pour le moment.' : 'Tous les messages sont lus.'}</div>
      )}
      {visibles.map((m) => (
        <div className="item-card" key={m.id} style={m.lu ? { opacity: .75 } : { borderColor: 'var(--gold)' }}>
          <div className="item-top">
            <div style={{ minWidth: 0 }}>
              <p className="item-title"><Icon name="mail" size={15} /> {m.nom}</p>
              <div className="item-meta" style={{ overflowWrap: 'anywhere' }}>{m.email} · {quand(m.cree_le)}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="badge abonne">{m.sujet}</span>
              {!m.lu && <span className="badge publie">Nouveau</span>}
            </div>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.message}</p>
          <div className="item-actions">
            <a className="btn-dark" href={`mailto:${m.email}?subject=${encodeURIComponent('Re: ' + m.sujet)}`}>Répondre</a>
            <button className="btn-light" disabled={busyId === m.id} onClick={() => basculerLu(m)}>{m.lu ? 'Marquer non lu' : 'Marquer comme lu'}</button>
            <button className="btn-light btn-danger" disabled={busyId === m.id} onClick={() => supprimer(m)}>Supprimer</button>
          </div>
        </div>
      ))}
    </>
  );
}
