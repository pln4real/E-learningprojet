'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import AuthShell from '../components/AuthShell';

export default function MotDePasseOublie() {
  const [email, setEmail] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nouveau-mot-de-passe`,
    });
    setLoading(false);
    if (error) {
      setError(/rate limit/i.test(error.message)
        ? 'Trop de demandes. Réessaie dans quelques minutes.'
        : "Impossible d'envoyer l'e-mail pour le moment. Vérifie l'adresse et réessaie.");
      return;
    }
    setEnvoye(true);
  }

  return (
    <AuthShell
      titre="Mot de passe oublié"
      intro={envoye ? null : "Entre l'adresse e-mail de ton compte. Nous t'envoyons un lien pour choisir un nouveau mot de passe."}
      pied={<Link href="/login" style={{ color: 'var(--green)', fontWeight: 600 }}>Retour à la connexion</Link>}
    >
      {envoye ? (
        <>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 0 }}>
            Si un compte existe avec <strong>{email}</strong>, un e-mail vient de partir. Ouvre-le et clique sur le lien.
          </p>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 0 }}>
            Rien reçu après quelques minutes ? Regarde dans les courriers indésirables (spam).
          </p>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <p className="error-text">{error}</p>}
          <div className="field">
            <label>Adresse e-mail</label>
            <input type="email" placeholder="toi@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Envoi...' : 'Envoyer le lien'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
