'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Icon from './Icon';

const LETTRES = ['A', 'B', 'C', 'D'];

// Lecteur de quiz : une question à la fois, correction immédiate, score final.
export default function QuizPlayer({ quiz, connecte, userId, onResult }) {
  const [questions, setQuestions] = useState(null);
  const [erreur, setErreur] = useState('');
  const [i, setI] = useState(0);
  const [choix, setChoix] = useState(null);
  const [score, setScore] = useState(0);
  const [fini, setFini] = useState(false);
  const [enregistre, setEnregistre] = useState(false);

  useEffect(() => {
    let actif = true;
    setQuestions(null); setErreur(''); setI(0); setChoix(null); setScore(0); setFini(false); setEnregistre(false);
    supabase.from('quiz_questions').select('*').eq('quiz_id', quiz.id).order('ordre')
      .then(({ data, error }) => {
        if (!actif) return;
        if (error) setErreur("Impossible de charger les questions.");
        else setQuestions(data || []);
      });
    return () => { actif = false; };
  }, [quiz.id]);

  async function terminer(scoreFinal, total) {
    setFini(true);
    if (connecte && userId) {
      const { error } = await supabase.from('quiz_resultats').insert({ user_id: userId, quiz_id: quiz.id, score: scoreFinal, total });
      if (!error) { setEnregistre(true); onResult && onResult(quiz.id, scoreFinal, total); }
    }
  }

  function recommencer() { setI(0); setChoix(null); setScore(0); setFini(false); setEnregistre(false); }

  if (erreur) return <div className="empty-box">{erreur}</div>;
  if (!questions) return <p style={{ color: 'var(--ink-soft)' }}>Chargement du quiz...</p>;
  if (questions.length === 0) return <div className="empty-box">Ce quiz n'a pas encore de questions.</div>;

  const total = questions.length;

  if (fini) {
    const pct = Math.round((score / total) * 100);
    return (
      <div className="qz-card qz-result">
        <div className="qz-ring" style={{ '--p': pct }}><span className="brand-font">{score}/{total}</span></div>
        <h3 className="brand-font">{pct >= 80 ? 'Excellent travail' : pct >= 50 ? 'Bien joué, continue' : 'À retravailler'}</h3>
        <p>
          {pct >= 80 ? 'Tu maîtrises bien ce chapitre.' : pct >= 50 ? 'Relis les explications, puis retente le quiz.' : 'Reprends le cours, puis retente le quiz.'}
        </p>
        {!connecte && <p className="qz-hint">Crée un compte gratuit pour enregistrer tes scores.</p>}
        {enregistre && <p className="qz-hint"><Icon name="check" size={14} /> Score enregistré</p>}
        <button className="btn-dark" onClick={recommencer}><Icon name="refresh" size={16} /> Recommencer</button>
      </div>
    );
  }

  const q = questions[i];
  const options = Array.isArray(q.options) ? q.options : [];
  const repondu = choix !== null;
  const dernier = i === total - 1;

  function valider(idx) {
    if (repondu) return;
    setChoix(idx);
    if (idx === q.bonne_reponse) setScore((s) => s + 1);
  }

  function suivant() {
    if (dernier) terminer(score, total);
    else { setI(i + 1); setChoix(null); }
  }

  return (
    <div className="qz-card">
      <div className="qz-top">
        <span>Question {i + 1} sur {total}</span>
        <span className="qz-bar"><i style={{ width: `${((i + (repondu ? 1 : 0)) / total) * 100}%` }} /></span>
      </div>
      <h3 className="qz-q brand-font">{q.enonce}</h3>
      <div className="qz-options">
        {options.map((o, idx) => {
          let etat = '';
          if (repondu) {
            if (idx === q.bonne_reponse) etat = 'ok';
            else if (idx === choix) etat = 'ko';
            else etat = 'dim';
          }
          return (
            <button key={idx} type="button" className={`qz-opt ${etat}`} onClick={() => valider(idx)} disabled={repondu}>
              <span className="qz-letter">{LETTRES[idx]}</span>
              <span className="qz-text">{o}</span>
              {etat === 'ok' && <Icon name="check" size={18} />}
              {etat === 'ko' && <Icon name="x" size={18} />}
            </button>
          );
        })}
      </div>
      {repondu && (
        <div className={`qz-expl ${choix === q.bonne_reponse ? 'ok' : 'ko'}`}>
          <strong>{choix === q.bonne_reponse ? 'Bonne réponse.' : `Mauvaise réponse. La bonne était ${LETTRES[q.bonne_reponse]}.`}</strong>
          {q.explication && <p>{q.explication}</p>}
        </div>
      )}
      {repondu && (
        <button className="btn-dark qz-next" onClick={suivant}>
          {dernier ? 'Voir mon score' : 'Question suivante'}
        </button>
      )}
    </div>
  );
}
