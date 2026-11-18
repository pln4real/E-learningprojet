'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { appeler } from '../../../lib/cercle';
import Topbar from '../../components/Topbar';
import Icon from '../../components/Icon';

const LETTRES = ['A', 'B', 'C', 'D'];

export default function DefiPage() {
  const { id } = useParams();
  const [etat, setEtat] = useState('chargement'); // chargement | jeu | resultat | erreur | deconnecte
  const [erreur, setErreur] = useState('');
  const [questions, setQuestions] = useState([]);
  const [i, setI] = useState(0);
  const [reponses, setReponses] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [fiche, setFiche] = useState(null);

  async function chargerFiche() {
    const r = await appeler('defis_etat');
    const d = Array.isArray(r.data) ? r.data.find((x) => x.id === id) : null;
    setFiche(d || null);
    return d;
  }

  useEffect(() => {
    let actif = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!actif) return;
      if (!user) { setEtat('deconnecte'); return; }
      const r = await appeler('defi_questions', { p_defi: id });
      if (!actif) return;
      if (r.erreur) {
        const d = await chargerFiche();
        setErreur(r.erreur);
        setEtat(d && (d.etat === 'attente' || d.etat === 'termine') ? 'resultat' : 'erreur');
        return;
      }
      setQuestions(r.data || []);
      setReponses(new Array((r.data || []).length).fill(null));
      setEtat('jeu');
    })();
    return () => { actif = false; };
  }, [id]);

  async function envoyer(rep) {
    setEnvoi(true);
    const r = await appeler('defi_repondre', { p_defi: id, p_reponses: rep.map((x) => (x === null ? -1 : x)) });
    setEnvoi(false);
    if (r.erreur) { setErreur(r.erreur); setEtat('erreur'); return; }
    setResultat({ ...r.data, mes: rep });
    await chargerFiche();
    setEtat('resultat');
  }

  const q = questions[i];
  const choix = reponses[i];
  const dernier = i === questions.length - 1;

  function choisir(idx) {
    setReponses((r) => r.map((x, k) => (k === i ? idx : x)));
  }
  function suivant() {
    if (dernier) envoyer(reponses); else setI(i + 1);
  }

  return (
    <>
      <Topbar crumbs={[{ label: 'Mon cercle', href: '/amis' }, { label: 'Défi' }]} />
      <main className="page cc-defi">
        {etat === 'chargement' && <p style={{ color: 'var(--ink-soft)' }}>Chargement du défi...</p>}

        {etat === 'deconnecte' && (
          <div className="empty-box"><p>Connecte-toi pour jouer ce défi.</p><Link href="/login" className="btn-dark">Connexion</Link></div>
        )}

        {etat === 'erreur' && (
          <div className="empty-box"><p>{erreur}</p><Link href="/amis" className="btn-dark">Retour à Mon cercle</Link></div>
        )}

        {etat === 'jeu' && q && (
          <div className="qz-card">
            <div className="qz-top">
              <span>Question {i + 1} sur {questions.length}</span>
              <span className="qz-bar"><i style={{ width: `${(i / questions.length) * 100}%` }} /></span>
            </div>
            <p className="cc-aide" style={{ margin: '0 0 6px' }}>Défi : la correction est donnée à la fin.</p>
            <h3 className="qz-q brand-font">{q.enonce}</h3>
            <div className="qz-options">
              {(Array.isArray(q.options) ? q.options : []).map((o, idx) => (
                <button key={idx} type="button" className={`qz-opt${choix === idx ? ' sel' : ''}`} onClick={() => choisir(idx)}>
                  <span className="qz-letter">{LETTRES[idx]}</span>
                  <span className="qz-text">{o}</span>
                  {choix === idx && <Icon name="check" size={18} />}
                </button>
              ))}
            </div>
            <button type="button" className="btn-dark qz-next" onClick={suivant} disabled={choix === null || choix === undefined || envoi}>
              {envoi ? 'Envoi...' : dernier ? 'Envoyer mes réponses' : 'Question suivante'}
            </button>
          </div>
        )}

        {etat === 'resultat' && (
          <div className="qz-card qz-result">
            {resultat && (
              <>
                <div className="qz-ring" style={{ '--p': Math.round((resultat.score / resultat.total) * 100) }}><span className="brand-font">{resultat.score}/{resultat.total}</span></div>
                <h3 className="brand-font">Tes réponses sont envoyées</h3>
              </>
            )}
            {!resultat && fiche && <h3 className="brand-font">{fiche.quiz_titre}</h3>}
            {fiche && fiche.etat === 'termine' && (
              <p><b>{fiche.gagnant === 'moi' ? 'Tu as gagné le défi.' : fiche.gagnant === 'lui' ? `${fiche.autre} remporte le défi.` : 'Égalité.'}</b>{' '}
                Toi : {fiche.mon_score}/{fiche.mon_total} · {fiche.autre} : {fiche.son_score}/{fiche.mon_total}</p>
            )}
            {fiche && fiche.etat === 'attente' && <p>En attente de {fiche.autre}. Tu verras le résultat dans « Mon cercle ».</p>}
            {!fiche && !resultat && <p>{erreur}</p>}
            {resultat && (
              <div className="cc-correction">
                <h3 className="cc-sous">Correction</h3>
                {questions.map((qq, k) => {
                  const bonne = resultat.bonnes[k]; const mien = resultat.mes[k];
                  const opts = Array.isArray(qq.options) ? qq.options : [];
                  return (
                    <div key={k} className={`cc-corr ${mien === bonne ? 'ok' : 'ko'}`}>
                      <b>{k + 1}. {qq.enonce}</b>
                      <span>{mien === bonne ? 'Bonne réponse' : `Ta réponse : ${mien >= 0 && opts[mien] !== undefined ? LETTRES[mien] + '. ' + opts[mien] : 'aucune'}`}</span>
                      {mien !== bonne && <span>Bonne réponse : {LETTRES[bonne]}. {opts[bonne]}</span>}
                    </div>
                  );
                })}
              </div>
            )}
            <Link href="/amis" className="btn-dark">Retour à Mon cercle</Link>
          </div>
        )}
      </main>
    </>
  );
}
