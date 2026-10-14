'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import AuthShell from '../components/AuthShell';

export default function NouveauMotDePasse() {
  const router = useRouter();
  const [pret, setPret] = useState(false);       // le lien de l'e-mail a été reconnu
  const [expire, setExpire] = useState(false);   // lien invalide ou expiré
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fait, setFait] = useState(false);

  useEffect(() => {
    // Supabase lit le lien de l'e-mail et ouvre une session de récupération
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPret(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setPret(true); });
    const t = setTimeout(() => setExpire(true), 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Le mot de passe doit faire au moins 6 caractères.'); return; }
    if (password !== confirm) { setError('Les deux mots de passe ne sont pas identiques.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(/same|different/i.test(error.message)
        ? "Choisis un mot de passe différent de l'ancien."
        : 'Impossible de changer le mot de passe. Demande un nouveau lien et réessaie.');
      return;
    }
    setFait(true);
    setTimeout(() => router.push('/'), 1800);
  }

  return (
    <AuthShell titre={fait ? 'Mot de passe changé' : 'Nouveau mot de passe'}>
      {fait && <p style={{ margin: 0, fontSize: 14.5 }}>C'est fait. Tu es connecté, nous t'emmenons à l'accueil.</p>}

      {!fait && pret && (
        <form onSubmit={handleSubmit}>
          {error && <p className="error-text">{error}</p>}
          <div className="field">
            <label>Nouveau mot de passe</label>
            <input type="password" placeholder="6 caractères minimum" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          </div>
          <div className="field">
            <label>Confirme le mot de passe</label>
            <input type="password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </form>
      )}

      {!fait && !pret && !expire && <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Vérification du lien...</p>}

      {!fait && !pret && expire && (
        <>
          <p style={{ marginTop: 0, fontSize: 14.5, lineHeight: 1.6 }}>
            Ce lien n'est plus valable (il a peut-être déjà servi ou expiré). Demande-en un nouveau.
          </p>
          <Link href="/mot-de-passe-oublie" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Demander un nouveau lien
          </Link>
        </>
      )}
    </AuthShell>
  );
}
