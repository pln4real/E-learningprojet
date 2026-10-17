'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import Topbar from '../components/Topbar';
import MonAbonnement from '../components/MonAbonnement';
import Icon from '../components/Icon';

const PALIERS = { gratuit: 'Gratuit', abonne: 'Abonné', premium: 'Premium' };

function dateFr(d) {
  try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return d; }
}

export default function ProfilPage() {
  const router = useRouter();
  const [etat, setEtat] = useState('chargement'); // chargement | ok | deconnecte
  const [user, setUser] = useState(null);
  const [profil, setProfil] = useState(null);
  const [palier, setPalier] = useState('gratuit');
  const [matieres, setMatieres] = useState([]);
  const [quiz, setQuiz] = useState([]);
  const [nom, setNom] = useState('');
  const [msgNom, setMsgNom] = useState(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msgPw, setMsgPw] = useState(null);

  useEffect(() => {
    let actif = true;
    async function charger() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (actif) setEtat('deconnecte'); return; }
      const [p, pal, prog, res, ress] = await Promise.all([
        supabase.from('profils').select('nom_complet, email, palier, palier_jusqu_au').eq('id', user.id).maybeSingle(),
        supabase.rpc('mon_palier'),
        supabase.from('progression_utilisateur').select('ressource_id').eq('user_id', user.id).eq('vu', true),
        supabase.from('quiz_resultats').select('quiz_id, score, total, fait_le, quiz(titre)').eq('user_id', user.id),
        supabase.from('ressources').select('id, chapitres(matieres(id, nom, niveaux(nom)))').eq('statut', 'publie'),
      ]);
      if (!actif) return;
      setUser(user);
      const prof = p.data || null;
      setProfil(prof);
      setNom(prof?.nom_complet || user.user_metadata?.nom_complet || '');
      if (typeof pal.data === 'string') setPalier(pal.data);

      const faits = new Set((prog.data || []).map((x) => x.ressource_id));
      const parMat = {};
      (ress.data || []).forEach((r) => {
        const m = r.chapitres?.matieres;
        if (!m) return;
        const e = parMat[m.id] || (parMat[m.id] = { id: m.id, nom: m.nom, niveau: m.niveaux?.nom, total: 0, faits: 0 });
        e.total += 1;
        if (faits.has(r.id)) e.faits += 1;
      });
      setMatieres(Object.values(parMat).filter((m) => m.faits > 0).sort((a, b) => b.faits - a.faits));

      const best = {};
      (res.data || []).forEach((r) => {
        const b = best[r.quiz_id];
        if (!b || r.score / r.total > b.score / b.total) best[r.quiz_id] = { ...r };
      });
      setQuiz(Object.values(best).sort((a, b) => new Date(b.fait_le) - new Date(a.fait_le)));
      setEtat('ok');
    }
    charger();
    return () => { actif = false; };
  }, []);

  async function enregistrerNom(e) {
    e.preventDefault();
    setMsgNom(null);
    if (nom.trim().length < 2) { setMsgNom({ erreur: true, t: 'Entre ton prénom et ton nom.' }); return; }
    const { error } = await supabase.rpc('modifier_mon_nom', { p_nom: nom });
    if (error) { setMsgNom({ erreur: true, t: 'Impossible de modifier le nom pour le moment.' }); return; }
    await supabase.auth.updateUser({ data: { nom_complet: nom.trim() } });
    setMsgNom({ t: 'Nom enregistré.' });
  }

  async function changerMdp(e) {
    e.preventDefault();
    setMsgPw(null);
    if (pw.length < 6) { setMsgPw({ erreur: true, t: 'Le mot de passe doit faire au moins 6 caractères.' }); return; }
    if (pw !== pw2) { setMsgPw({ erreur: true, t: 'Les deux mots de passe ne sont pas identiques.' }); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setMsgPw({ erreur: true, t: /same|different/i.test(error.message) ? "Choisis un mot de passe différent de l'ancien." : 'Impossible de changer le mot de passe.' });
      return;
    }
    setPw(''); setPw2('');
    setMsgPw({ t: 'Mot de passe modifié.' });
  }

  async function deconnexion() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (etat === 'chargement') {
    return <><Topbar crumbs={[{ label: 'Mon profil' }]} /><main className="profil-wrap"><p style={{ color: 'var(--ink-soft)' }}>Chargement...</p></main></>;
  }

  if (etat === 'deconnecte') {
    return (
      <>
        <Topbar crumbs={[{ label: 'Mon profil' }]} />
        <main className="profil-wrap">
          <div className="empty-box">
            Connecte-toi pour voir ton profil et ta progression.
            <div style={{ marginTop: 14, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/login" className="btn-dark">Connexion</Link>
              <Link href="/inscription" className="btn-light">Créer un compte</Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const email = profil?.email || user.email;
  const fin = palier !== 'gratuit' && profil?.palier_jusqu_au ? dateFr(profil.palier_jusqu_au) : null;
  const initiales = (nom || email || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      <Topbar crumbs={[{ label: 'Mon profil' }]} />
      <main className="profil-wrap">
        <div className="profil-head">
          <span className="avatar brand-font">{initiales}</span>
          <div style={{ minWidth: 0 }}>
            <h1 className="brand-font" style={{ margin: 0, fontSize: 'clamp(1.5rem,4vw,2rem)' }}>{nom || 'Mon profil'}</h1>
            <p style={{ margin: '2px 0 0', color: 'var(--ink-soft)', fontSize: 14, overflowWrap: 'anywhere' }}>{email}</p>
          </div>
        </div>

        <section className="card profil-card">
          <h2 className="brand-font">Mon abonnement</h2>
          <MonAbonnement userId={user.id} palier={palier} />
        </section>

        <section className="card profil-card">
          <h2 className="brand-font">Ma progression</h2>
          {matieres.length === 0 ? (
            <p className="profil-vide">Rien de terminé pour l'instant. Ouvre un cours : il sera coché automatiquement.</p>
          ) : matieres.map((m) => (
            <Link key={m.id} href={`/matiere/${m.id}`} className="profil-prog">
              <div className="top"><span>{m.nom}{m.niveau ? <em> · {m.niveau}</em> : null}</span><b>{m.faits} / {m.total}</b></div>
              <span className="bar"><i style={{ width: `${(m.faits / m.total) * 100}%` }} /></span>
            </Link>
          ))}
        </section>

        <section className="card profil-card">
          <h2 className="brand-font">Mes scores aux quiz</h2>
          {quiz.length === 0 ? (
            <p className="profil-vide">Aucun quiz terminé pour l'instant.</p>
          ) : quiz.map((q) => (
            <div key={q.quiz_id} className="profil-quiz">
              <span><Icon name="quiz" size={15} /> {q.quiz?.titre || 'Quiz'}</span>
              <b>{q.score}/{q.total}</b>
            </div>
          ))}
        </section>

        <section className="card profil-card">
          <h2 className="brand-font">Mes informations</h2>
          <form onSubmit={enregistrerNom}>
            <div className="field">
              <label>Prénom et nom</label>
              <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" />
            </div>
            {msgNom && <p className={msgNom.erreur ? 'error-text' : 'success-text'}>{msgNom.t}</p>}
            <button className="btn-dark" type="submit">Enregistrer</button>
          </form>
        </section>

        <section className="card profil-card">
          <h2 className="brand-font">Changer mon mot de passe</h2>
          <form onSubmit={changerMdp}>
            <div className="field">
              <label>Nouveau mot de passe</label>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="6 caractères minimum" autoComplete="new-password" />
            </div>
            <div className="field">
              <label>Confirme le mot de passe</label>
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </div>
            {msgPw && <p className={msgPw.erreur ? 'error-text' : 'success-text'}>{msgPw.t}</p>}
            <button className="btn-dark" type="submit">Modifier</button>
          </form>
        </section>

        <button className="btn-light" onClick={deconnexion} style={{ marginTop: 6 }}>Se déconnecter</button>
      </main>
    </>
  );
}
