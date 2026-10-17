'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { fcfa, dateFr, joursRestants, STATUTS_TX, libellePortee, chargerMonAbonnement } from '../../lib/abonnement';

export default function MonAbonnement({ userId, palier }) {
  const [etat, setEtat] = useState(null);
  const [niveaux, setNiveaux] = useState([]);

  useEffect(() => {
    let actif = true;
    (async () => {
      const [e, { data: n }] = await Promise.all([chargerMonAbonnement(userId), supabase.from('niveaux').select('id, nom')]);
      if (!actif) return;
      setEtat(e); setNiveaux(n || []);
    })();
    return () => { actif = false; };
  }, [userId]);

  if (!etat) return <p className="profil-vide">Chargement...</p>;

  const prix = (a) => etat.transactions.find((t) => t.id === a.transaction_id)?.montant;
  const dernierExpire = etat.expires[0];
  const manuel = palier !== 'gratuit' && etat.actifs.length === 0;

  return (
    <>
      {etat.actifs.map((a) => {
        const j = joursRestants(a.fin);
        return (
          <div key={a.id} className={`mab-plan${j <= 7 ? ' bientot' : ''}`}>
            <div className="mab-top">
              <b className="brand-font">{a.plan_nom}</b>
              <span className="badge publie">Actif</span>
            </div>
            <p className="mab-msg">
              {j <= 7
                ? 'Ton abonnement expire bientôt. Renouvelle-le pour continuer à accéder aux cours Premium.'
                : `Ton abonnement est actif jusqu'au ${dateFr(a.fin)}.`}
            </p>
            <dl className="mab-dl">
              <div><dt>Classe</dt><dd>{libellePortee(a.niveaux_ids, niveaux)}</dd></div>
              <div><dt>Début</dt><dd>{dateFr(a.debut)}</dd></div>
              <div><dt>Fin</dt><dd>{dateFr(a.fin)}</dd></div>
              <div><dt>Jours restants</dt><dd>{j}</dd></div>
              {prix(a) ? <div><dt>Prix payé</dt><dd>{fcfa(prix(a))}</dd></div> : null}
            </dl>
          </div>
        );
      })}
      {etat.avenir.map((a) => (
        <p key={a.id} className="mab-msg">À venir : <b>{a.plan_nom}</b> ({libellePortee(a.niveaux_ids, niveaux)}), du {dateFr(a.debut)} au {dateFr(a.fin)}.</p>
      ))}
      {etat.actifs.length === 0 && manuel && (
        <p className="mab-msg">Accès complet activé par l'équipe. {palier === 'premium' ? 'Téléchargement des PDF inclus.' : ''}</p>
      )}
      {etat.actifs.length === 0 && !manuel && (
        <p className="mab-msg">
          {dernierExpire
            ? `Ton abonnement ${dernierExpire.plan_nom} a expiré le ${dateFr(dernierExpire.fin)}.`
            : 'Tu as accès aux contenus gratuits. Un abonnement ouvre tous les cours, exercices, annales et quiz de ta classe.'}
        </p>
      )}
      {etat.enAttente && <p className="mab-msg attente">Ton paiement est en attente de confirmation. Ne paie pas une deuxième fois : <Link href={`/paiement/retour?ref=${etat.enAttente.reference}`}>vérifier maintenant</Link>.</p>}
      {etat.echec && !etat.enAttente && <p className="mab-msg echec">Le paiement n'a pas été confirmé. Si tu as été débité, <Link href="/contact">contacte le support</Link> avant de recommencer.</p>}

      <Link href="/tarifs" className={etat.actifs.length ? 'btn-light' : 'btn-dark'} style={{ marginTop: 12 }}>
        {etat.actifs.length ? 'Renouveler mon abonnement' : 'Voir les formules'}
      </Link>

      {etat.transactions.length > 0 && (
        <div className="mab-histo">
          <h3>Historique des paiements</h3>
          {etat.transactions.map((t) => (
            <div key={t.id} className="mab-ligne">
              <div>
                <b>{t.plan_nom}</b>
                <span>{dateFr(t.cree_le)} · {t.reference}</span>
              </div>
              <div className="mab-droite">
                <b>{fcfa(t.montant)}</b>
                <span className={`mab-st ${t.statut}`}>{STATUTS_TX[t.statut] || t.statut}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
