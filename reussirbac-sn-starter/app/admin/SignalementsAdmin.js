'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Icon from '../components/Icon';

function quand(d) {
  try { return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return d; }
}

const FILTRES = [
  { id: 'nouveau', label: 'À traiter' },
  { id: 'traite', label: 'Traités' },
  { id: 'classe', label: 'Classés' },
  { id: 'tous', label: 'Tous' },
];

function nomAffiche(pseudo, nom) {
  if (pseudo && nom && pseudo !== nom) return `${pseudo} (${nom})`;
  return pseudo || nom || 'Élève inconnu';
}

function messageErreur(e) {
  const m = (e && e.message) || '';
  if (m.includes('admin_signalements') || m.includes('schema cache')) return "La modération n'est pas encore activée : lance le script SQL 20 dans Supabase.";
  if (m.includes('acces_refuse')) return 'Accès réservé aux administrateurs.';
  return m || 'Une erreur est survenue.';
}

export default function SignalementsAdmin() {
  const [filtre, setFiltre] = useState('nouveau');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error } = await supabase.rpc('admin_signalements', { p_statut: filtre });
    if (error) { setError(messageErreur(error)); setItems([]); } else setItems(data || []);
    setLoading(false);
  }, [filtre]);
  useEffect(() => { load(); }, [load]);

  async function changerStatut(s, statut) {
    setBusyId(s.id);
    const { error } = await supabase.rpc('admin_signalement_statut', { p_id: s.id, p_statut: statut });
    if (error) setError(messageErreur(error)); else await load();
    setBusyId(null);
  }

  async function suspendre(s) {
    const suspendre = !s.cible_suspendu;
    const nom = nomAffiche(s.cible_pseudo, s.cible_nom);
    const msg = suspendre
      ? `Suspendre ${nom} de Mon cercle ?\n\nSes amitiés seront coupées, ses défis en cours annulés, et il ne pourra plus ajouter d'amis. Son accès aux cours n'est pas touché.`
      : `Réactiver ${nom} dans Mon cercle ?`;
    if (!window.confirm(msg)) return;
    setBusyId(s.id);
    const { error } = await supabase.rpc('admin_cercle_suspendre', { p_user: s.cible_id, p_suspendre: suspendre });
    if (error) setError(messageErreur(error));
    else {
      if (suspendre && s.statut === 'nouveau') await supabase.rpc('admin_signalement_statut', { p_id: s.id, p_statut: 'traite' });
      await load();
    }
    setBusyId(null);
  }

  return (
    <>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
        Signalements envoyés par les élèves depuis Mon cercle. Suspendre un élève ne touche pas à son accès aux cours : cela le retire seulement du cercle (amis, défis, classement).
      </p>
      <div className="segmented" style={{ marginBottom: 14 }}>
        {FILTRES.map((f) => (
          <button key={f.id} type="button" className={filtre === f.id ? 'active' : ''} onClick={() => setFiltre(f.id)}>{f.label}</button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      {loading && <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}
      {!loading && !error && items.length === 0 && (
        <div className="empty-box">{filtre === 'nouveau' ? 'Aucun signalement à traiter.' : 'Aucun signalement dans cette liste.'}</div>
      )}
      {items.map((s) => (
        <div className="item-card" key={s.id} style={s.statut === 'nouveau' ? { borderColor: 'var(--gold)' } : { opacity: .85 }}>
          <div className="item-top">
            <div style={{ minWidth: 0 }}>
              <p className="item-title"><Icon name="shield" size={15} /> {nomAffiche(s.cible_pseudo, s.cible_nom)}</p>
              <div className="item-meta" style={{ overflowWrap: 'anywhere' }}>
                Signalé par {nomAffiche(s.auteur_pseudo, s.auteur_nom)} · {quand(s.cree_le)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {s.cible_suspendu && <span className="badge brouillon">Suspendu</span>}
              {s.cible_nb_signalements > 1 && <span className="badge abonne">{s.cible_nb_signalements} signalements</span>}
              {s.statut === 'nouveau' && <span className="badge publie">Nouveau</span>}
            </div>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {s.motif ? s.motif : <span style={{ color: 'var(--ink-soft)' }}>Aucun motif écrit.</span>}
          </p>
          <div className="item-actions">
            {s.statut === 'nouveau' ? (
              <>
                <button className="btn-dark" disabled={busyId === s.id} onClick={() => changerStatut(s, 'traite')}>Marquer traité</button>
                <button className="btn-light" disabled={busyId === s.id} onClick={() => changerStatut(s, 'classe')}>Classer sans suite</button>
              </>
            ) : (
              <button className="btn-light" disabled={busyId === s.id} onClick={() => changerStatut(s, 'nouveau')}>Remettre à traiter</button>
            )}
            <button className={`btn-light${s.cible_suspendu ? '' : ' btn-danger'}`} disabled={busyId === s.id} onClick={() => suspendre(s)}>
              {s.cible_suspendu ? 'Réactiver dans le cercle' : 'Suspendre du cercle'}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
