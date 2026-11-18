'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { horsLigneDisponible, lireChapitre, supprimerChapitre, telechargerChapitre, tailleLisible, VALIDITE_JOURS } from '../../lib/horsligne';
import Icon from './Icon';

// Bouton « Télécharger pour réviser sans connexion » de la page d'un chapitre.
export default function TelechargerChapitre({ chapitreId }) {
  const [etat, setEtat] = useState('verif'); // verif | cache | absent | encours | pret | erreur
  const [user, setUser] = useState(null);
  const [info, setInfo] = useState(null);
  const [prog, setProg] = useState({ fait: 0, total: 1, libelle: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let actif = true;
    (async () => {
      if (!(await horsLigneDisponible())) { if (actif) setEtat('cache'); return; }
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!actif) return;
      if (!u) { setEtat('cache'); return; } // il faut un compte : l'accès est revérifié avec lui
      setUser(u);
      const c = await lireChapitre(chapitreId).catch(() => null);
      if (!actif) return;
      if (c && c.user_id === u.id) { setInfo(c); setEtat('pret'); } else setEtat('absent');
    })();
    return () => { actif = false; };
  }, [chapitreId]);

  async function lancer() {
    if (!user) return;
    setMsg(''); setEtat('encours'); setProg({ fait: 0, total: 1, libelle: 'Préparation' });
    try {
      const c = await telechargerChapitre(supabase, chapitreId, user.id, setProg);
      setInfo(c); setEtat('pret');
    } catch (e) {
      setMsg(e && e.message ? e.message : 'Le téléchargement a échoué. Réessaie avec une meilleure connexion.');
      setEtat('erreur');
    }
  }

  async function retirer() {
    if (!window.confirm('Supprimer ce chapitre de ton téléphone ? Tu pourras le télécharger de nouveau.')) return;
    await supprimerChapitre(chapitreId).catch(() => {});
    setInfo(null); setEtat('absent');
  }

  if (etat === 'verif' || etat === 'cache') return null;
  const pct = Math.round((prog.fait / Math.max(1, prog.total)) * 100);

  return (
    <div className="dl-box">
      {(etat === 'absent' || etat === 'erreur') && (
        <>
          <button type="button" className="btn-light dl-btn" onClick={lancer}>
            <Icon name="download" size={16} /> Télécharger pour réviser sans connexion
          </button>
          {etat === 'absent' && <p className="dl-note">Cours, exercices, corrigés et quiz de ce chapitre restent sur ton téléphone pendant {VALIDITE_JOURS} jours. Fais-le avec le wifi.</p>}
          {msg && <p className="dl-erreur" role="alert">{msg}</p>}
        </>
      )}
      {etat === 'encours' && (
        <div role="status" aria-live="polite">
          <div className="dl-bar"><i style={{ width: `${pct}%` }} /></div>
          <p className="dl-note">Téléchargement… {pct} % · {prog.libelle}</p>
        </div>
      )}
      {etat === 'pret' && info && (
        <div className="dl-pret">
          <span><Icon name="check" size={15} /> Disponible sans connexion <small>({tailleLisible(info.taille)})</small></span>
          <span className="dl-actions">
            <Link href="/hors-ligne" className="dl-lien">Mes téléchargements</Link>
            <button type="button" className="dl-lien" onClick={retirer}>Supprimer</button>
          </span>
        </div>
      )}
    </div>
  );
}
