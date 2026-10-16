'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { SITE } from '../../lib/site';
import Icon from '../components/Icon';

const SUJETS = ['Question sur un cours', 'Erreur à signaler', 'Compte ou connexion', 'Abonnement', 'Autre'];
const MAX = 2000;

export default function ContactForm() {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [sujet, setSujet] = useState(SUJETS[0]);
  const [message, setMessage] = useState('');
  const [piege, setPiege] = useState('');
  const [userId, setUserId] = useState(null);
  const [etat, setEtat] = useState('saisie'); // saisie | envoi | ok | erreur
  const [erreur, setErreur] = useState('');

  // Pré-remplit nom et e-mail pour un élève connecté
  useEffect(() => {
    let actif = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!actif || !user) return;
      setUserId(user.id);
      setEmail((e) => e || user.email || '');
      setNom((n) => n || user.user_metadata?.nom_complet || '');
    });
    return () => { actif = false; };
  }, []);

  async function envoyer(e) {
    e.preventDefault();
    setErreur('');
    if (nom.trim().length < 2) { setErreur('Entre ton prénom et ton nom.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErreur("Cette adresse e-mail n'est pas valide."); return; }
    if (message.trim().length < 10) { setErreur('Ton message est trop court (10 caractères minimum).'); return; }
    if (piege) { setEtat('ok'); return; } // champ invisible rempli : c'est un robot, on fait semblant

    setEtat('envoi');
    const { error } = await supabase.from('messages_contact').insert({
      nom: nom.trim(), email: email.trim(), sujet, message: message.trim(), user_id: userId,
    });
    if (error) { setEtat('erreur'); return; }
    setEtat('ok');
  }

  if (etat === 'ok') {
    return (
      <div className="ct-form ct-done" role="status">
        <span className="ct-ok"><Icon name="checkCircle" size={34} /></span>
        <h2 className="brand-font">Message envoyé</h2>
        <p>Merci {nom.trim().split(' ')[0] || ''}. Nous te répondons par e-mail à <b>{email}</b>.</p>
        <button type="button" className="btn-light" onClick={() => { setMessage(''); setPiege(''); setEtat('saisie'); }}>Envoyer un autre message</button>
      </div>
    );
  }

  return (
    <form className="ct-form" onSubmit={envoyer} noValidate>
      <div className="ct-row">
        <div className="field">
          <label htmlFor="ct-nom">Prénom et nom</label>
          <input id="ct-nom" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" maxLength={80} required />
        </div>
        <div className="field">
          <label htmlFor="ct-mail">Adresse e-mail</label>
          <input id="ct-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={120} required />
        </div>
      </div>

      <fieldset className="ct-sujets">
        <legend>Sujet</legend>
        <div>
          {SUJETS.map((s) => (
            <label key={s} className={sujet === s ? 'on' : ''}>
              <input type="radio" name="sujet" value={s} checked={sujet === s} onChange={() => setSujet(s)} />
              {s}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="ct-msg">Ton message</label>
        <textarea id="ct-msg" value={message} onChange={(e) => setMessage(e.target.value.slice(0, MAX))} rows={6} required />
        <span className="ct-count">{message.length} / {MAX}</span>
      </div>

      {/* Champ piège pour les robots : invisible pour les humains */}
      <input className="ct-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" name="site" value={piege} onChange={(e) => setPiege(e.target.value)} />

      {erreur && <p className="error-text" role="alert">{erreur}</p>}
      {etat === 'erreur' && (
        <p className="error-text" role="alert">
          Le message n'a pas pu être envoyé. Écris-nous directement à <a href={`mailto:${SITE.email}`} style={{ textDecoration: 'underline' }}>{SITE.email}</a>.
        </p>
      )}

      <button className="btn-primary" type="submit" disabled={etat === 'envoi'}>
        {etat === 'envoi' ? 'Envoi...' : 'Envoyer le message'}
      </button>
    </form>
  );
}
