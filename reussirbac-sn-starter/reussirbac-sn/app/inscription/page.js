'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

function traduire(message) {
  const m = (message || '').toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) return 'Un compte existe déjà avec cet e-mail. Connecte-toi plutôt.';
  if (m.includes('password') && m.includes('characters')) return 'Le mot de passe est trop court (6 caractères minimum).';
  if (m.includes('invalid') && m.includes('email')) return "Cette adresse e-mail n'est pas valide.";
  if (m.includes('rate limit')) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  return message;
}

export default function InscriptionPage() {
  const router = useRouter();
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [aConfirmer, setAConfirmer] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (nom.trim().length < 2) { setError('Entre ton prénom et ton nom.'); return; }
    if (password.length < 6) { setError('Le mot de passe doit faire au moins 6 caractères.'); return; }
    if (password !== confirm) { setError('Les deux mots de passe ne sont pas identiques.'); return; }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { nom_complet: nom.trim() } },
    });
    setLoading(false);

    if (error) { setError(traduire(error.message)); return; }
    // Si la confirmation par e-mail est activée dans Supabase, il n'y a pas encore de session
    if (data.session) router.push('/');
    else setAConfirmer(true);
  }

  return (
    <div className="login-screen">
      <div className="login-brand">
        <div>
          <div className="login-logo">
            <div className="login-logo-mark">S2</div>
            <span className="brand-font" style={{ fontSize: 18 }}>RéussirBac&nbsp;SN</span>
          </div>
          <h1 className="brand-font">
            Crée ton compte et prépare ton <em>BFEM</em> ou ton <em>Bac</em>.
          </h1>
          <p>Cours, exercices et annales alignés au programme officiel, pensés pour ton téléphone.</p>
        </div>
      </div>

      <div className="login-form-side">
        <div className="login-panel">
          <div className="eyebrow">Inscription</div>
          <h2 className="brand-font" style={{ fontSize: 26, margin: '6px 0 6px' }}>
            {aConfirmer ? 'Vérifie ta boîte mail' : 'Crée ton compte'}
          </h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 22 }}>
            {aConfirmer ? 'Une dernière étape avant de commencer.' : "C'est gratuit et ça prend une minute."}
          </p>

          <div className="card">
            {aConfirmer ? (
              <>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 0 }}>
                  Nous avons envoyé un lien de confirmation à <strong>{email}</strong>. Ouvre ce message, clique sur le lien, puis reviens te connecter.
                </p>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  Rien reçu ? Regarde dans les courriers indésirables (spam).
                </p>
                <Link href="/login" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                  Aller à la connexion
                </Link>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && <p className="error-text">{error}</p>}
                <div className="field">
                  <label>Prénom et nom</label>
                  <input type="text" placeholder="Awa Diop" value={nom} onChange={(e) => setNom(e.target.value)} required autoComplete="name" />
                </div>
                <div className="field">
                  <label>Adresse e-mail</label>
                  <input type="email" placeholder="toi@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div className="field">
                  <label>Mot de passe</label>
                  <input type="password" placeholder="6 caractères minimum" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
                </div>
                <div className="field">
                  <label>Confirme le mot de passe</label>
                  <input type="password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
                </div>
                <button className="btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Création...' : 'Créer mon compte'}
                </button>
              </form>
            )}
          </div>

          {!aConfirmer && (
            <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--ink-soft)', marginTop: 16 }}>
              Tu as déjà un compte ? <Link href="/login" style={{ color: 'var(--green)', fontWeight: 600 }}>Connecte-toi</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
