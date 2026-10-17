'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import Icon from '../components/Icon';
import { prendreSuite } from '../../lib/abonnement';

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState('email');
  const [step, setStep] = useState('form');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handlePhoneSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const fullPhone = '+221' + phone.replace(/\s/g, '');
    const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
    setLoading(false);
    if (error) {
      setError("La connexion par numéro de téléphone n'est pas encore disponible. Utilise ton adresse e-mail.");
      setMethod('email');
      return;
    }
    setStep('otp');
  }

  async function handleOtpSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const fullPhone = '+221' + phone.replace(/\s/g, '');
    const { error } = await supabase.auth.verifyOtp({ phone: fullPhone, token: otp, type: 'sms' });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push(prendreSuite());
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push(prendreSuite());
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
            Prépare ton <em>BFEM</em> et ton <em>Bac</em>, où que tu sois au Sénégal.
          </h1>
          <p>Cours, exercices corrigés et annales alignés au programme officiel — accessibles même hors connexion.</p>
        </div>
      </div>

      <div className="login-form-side">
        <div className="login-panel">
          <div className="eyebrow">Bienvenue</div>
          <h2 className="brand-font" style={{ fontSize: 26, margin: '6px 0 6px' }}>
            {method === 'phone' && step === 'otp' ? 'Entre le code reçu' : 'Connecte-toi'}
          </h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 22 }}>
            Accède à tes cours, exercices et annales.
          </p>

          <div className="card">
            {error && <p className="error-text">{error}</p>}

            {step === 'form' && (
              <>
                <div className="pill-toggle" style={{ marginBottom: 18 }}>
                  <button className={method === 'phone' ? 'active' : ''} onClick={() => setMethod('phone')} type="button">
                    <Icon name="phone" size={16} /> Numéro
                  </button>
                  <button className={method === 'email' ? 'active' : ''} onClick={() => setMethod('email')} type="button">
                    <Icon name="mail" size={16} /> E-mail
                  </button>
                </div>

                {method === 'phone' ? (
                  <form onSubmit={handlePhoneSubmit}>
                    <div className="field">
                      <label>Numéro de téléphone</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: '0 0 68px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)' }}>
                          +221
                        </div>
                        <input type="tel" placeholder="77 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                      </div>
                    </div>
                    <button className="btn-primary" type="submit" disabled={loading}>
                      {loading ? 'Envoi...' : 'Recevoir le code de confirmation'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleEmailSubmit}>
                    <div className="field">
                      <label>Adresse e-mail</label>
                      <input type="email" placeholder="toi@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div className="field">
                      <label>Mot de passe</label>
                      <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    <p style={{ margin: '-4px 0 14px', textAlign: 'right', fontSize: 13 }}>
                      <Link href="/mot-de-passe-oublie" style={{ color: 'var(--green)', fontWeight: 600 }}>Mot de passe oublié ?</Link>
                    </p>
                    <button className="btn-primary" type="submit" disabled={loading}>
                      {loading ? 'Connexion...' : 'Se connecter'}
                    </button>
                  </form>
                )}
              </>
            )}

            {step === 'otp' && (
              <form onSubmit={handleOtpSubmit}>
                <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 0 }}>
                  Code envoyé par SMS au +221 {phone}
                </p>
                <div className="field">
                  <input type="text" placeholder="1234" value={otp} onChange={(e) => setOtp(e.target.value)} required style={{ textAlign: 'center', fontSize: 20, letterSpacing: 6 }} />
                </div>
                <button className="btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Vérification...' : 'Confirmer'}
                </button>
              </form>
            )}
          </div>

          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--ink-soft)', marginTop: 16 }}>
            Pas encore de compte ? <Link href="/inscription" style={{ color: 'var(--green)', fontWeight: 600 }}>Inscris-toi</Link>
          </p>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>
            <Icon name="shield" size={15} /> Tes données restent privées et sécurisées
          </p>
        </div>
      </div>
    </div>
  );
}
