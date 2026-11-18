'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import {
  ajouterAttente, estExpire, lireFichier, listerChapitres, revalider, supprimerChapitre, tailleLisible, envoyerAttente,
} from '../../lib/horsligne';
import { TYPES } from '../../lib/media';
import { DIFFICULTES, formatDuree } from '../../lib/atelier';
import PdfPages from '../components/PdfPages';
import QuizPlayer from '../components/QuizPlayer';
import Icon from '../components/Icon';

function dateCourte(t) {
  try { return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }); } catch (e) { return ''; }
}

export default function HorsLigneApp() {
  const [enLigne, setEnLigne] = useState(true);
  const [chapitres, setChapitres] = useState(null);
  const [ouvert, setOuvert] = useState(null); // chapitre ouvert
  const [onglet, setOnglet] = useState(null);
  const [doc, setDoc] = useState(null); // { res, corrige:boolean, url }
  const [quizId, setQuizId] = useState(null);
  const [erreur, setErreur] = useState('');
  const urlRef = useRef(null);

  const recharger = useCallback(async () => {
    try { setChapitres(await listerChapitres()); } catch (e) { setChapitres([]); }
  }, []);

  useEffect(() => {
    setEnLigne(navigator.onLine !== false);
    const on = () => setEnLigne(true);
    const off = () => setEnLigne(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // À l'ouverture : liste, puis (si réseau) revérification de l'abonnement et envoi des scores en attente
  useEffect(() => {
    let actif = true;
    (async () => {
      await recharger();
      if (navigator.onLine === false) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !actif) return;
        await envoyerAttente(supabase, user.id);
        await revalider(supabase, user.id);
        if (actif) await recharger();
      } catch (e) { /* hors réseau : on garde ce qu'on a */ }
    })();
    return () => { actif = false; };
  }, [recharger]);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  function fermerDoc() {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setDoc(null);
  }

  async function ouvrirDoc(chap, res, corrige) {
    setErreur(''); fermerDoc();
    try {
      const blob = await lireFichier(`${chap.id}/${res.id}/${corrige ? 'corrige' : 'sujet'}`);
      if (!blob) { setErreur("Ce fichier n'est plus sur ton téléphone. Retélécharge le chapitre."); return; }
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setDoc({ res, corrige, url });
    } catch (e) { setErreur("Impossible d'ouvrir ce fichier."); }
  }

  async function retirer(c) {
    if (!window.confirm(`Supprimer « ${c.nom} » de ton téléphone ?`)) return;
    await supprimerChapitre(c.id).catch(() => {});
    if (ouvert && ouvert.id === c.id) { setOuvert(null); fermerDoc(); }
    recharger();
  }

  const entete = (
    <header className="hl-head">
      <Link href="/" className="hl-logo brand-font">Réussir<span>Bac</span> SN</Link>
      <span className={`hl-etat ${enLigne ? 'on' : 'off'}`}>
        <Icon name={enLigne ? 'check' : 'wifiOff'} size={14} /> {enLigne ? 'Connecté' : 'Hors connexion'}
      </span>
    </header>
  );

  if (chapitres === null) return <>{entete}<main className="hl-main"><p className="hl-muted">Chargement...</p></main></>;

  // ---------- Aucun téléchargement ----------
  if (!chapitres.length) {
    return (
      <>
        {entete}
        <main className="hl-main">
          <div className="card hl-vide">
            <span className="lock-badge" style={{ margin: '0 auto 14px' }}><Icon name={enLigne ? 'download' : 'wifiOff'} size={22} /></span>
            <h1 className="brand-font">{enLigne ? 'Aucun chapitre téléchargé' : 'Tu es hors connexion'}</h1>
            <p className="hl-muted">
              {enLigne
                ? "Ouvre un chapitre et touche « Télécharger pour réviser sans connexion ». Tu pourras ensuite le lire sans internet, même avec une connexion très lente."
                : "Tu n'as encore rien téléchargé. Reconnecte-toi pour continuer. En attendant, tu peux calculer ta moyenne : cette page fonctionne sans connexion."}
            </p>
            <div className="hl-actions">
              <Link href="/moyenne" className="btn-dark">Calculer ma moyenne</Link>
              <Link href="/" className="btn-light">{enLigne ? 'Retour à l\'accueil' : 'Réessayer'}</Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ---------- Un chapitre ouvert ----------
  if (ouvert) {
    const chap = chapitres.find((c) => c.id === ouvert.id) || ouvert;
    const expire = estExpire(chap);
    const types = TYPES.filter((t) => chap.ressources.some((r) => r.type === t.key));
    const onglets = [...types.map((t) => ({ key: t.key, label: t.plural })), ...(chap.quiz.length ? [{ key: 'quiz', label: 'Quiz' }] : [])];
    const actif = onglet && onglets.some((o) => o.key === onglet) ? onglet : onglets[0]?.key;
    const liste = chap.ressources.filter((r) => r.type === actif);
    const quiz = chap.quiz.find((q) => q.id === quizId) || chap.quiz[0];

    return (
      <>
        {entete}
        <main className="hl-main">
          <button type="button" className="hl-retour" onClick={() => { setOuvert(null); fermerDoc(); setQuizId(null); }}>
            <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} /> Mes téléchargements
          </button>
          <p className="hl-kicker">{chap.niveau} · {chap.matiere}</p>
          <h1 className="hl-titre brand-font">{chap.nom}</h1>

          {expire ? (
            <div className="card hl-vide">
              <span className="lock-badge" style={{ margin: '0 auto 14px' }}><Icon name="lock" size={22} /></span>
              <h2 className="brand-font" style={{ fontSize: 20, margin: '0 0 8px' }}>Téléchargement à renouveler</h2>
              <p className="hl-muted">Pour protéger le contenu des abonnés, il faut te reconnecter à internet au moins une fois tous les 14 jours. Ouvre l'application avec du réseau : ton chapitre se réactive tout seul si ton abonnement est toujours valable.</p>
            </div>
          ) : (
            <>
              <div className="hl-onglets" role="tablist">
                {onglets.map((o) => (
                  <button key={o.key} type="button" role="tab" aria-selected={actif === o.key} className={actif === o.key ? 'on' : ''} onClick={() => { setOnglet(o.key); fermerDoc(); }}>
                    {o.label}
                  </button>
                ))}
              </div>
              {erreur && <p className="dl-erreur" role="alert">{erreur}</p>}

              {actif === 'quiz' ? (
                <>
                  <div className="hl-liste">
                    {chap.quiz.map((q) => (
                      <button key={q.id} type="button" className={`hl-item${quiz && quiz.id === q.id ? ' on' : ''}`} onClick={() => setQuizId(q.id)}>
                        <b>{q.titre}</b><small>{q.questions.length} questions</small>
                      </button>
                    ))}
                  </div>
                  {quiz && (
                    <QuizPlayer key={quiz.id} quiz={quiz} questionsLocales={quiz.questions} connecte userId={chap.user_id}
                      enAttente={(qid, score, total) => ajouterAttente({ user_id: chap.user_id, quiz_id: qid, score, total })} />
                  )}
                </>
              ) : (
                <>
                  <div className="hl-liste">
                    {liste.map((r) => (
                      <div key={r.id} className={`hl-item${doc && doc.res.id === r.id ? ' on' : ''}`}>
                        <button type="button" className="hl-item-main" onClick={() => ouvrirDoc(chap, r, false)}>
                          <b>{r.titre}</b>
                          <small>
                            {[r.duree_min ? formatDuree(r.duree_min) : null, r.bareme ? `${r.bareme} pts` : null, r.difficulte ? DIFFICULTES[r.difficulte] : null,
                              r.calculatrice === 'autorisee' ? 'Calculatrice autorisée' : r.calculatrice === 'interdite' ? 'Sans calculatrice' : null].filter(Boolean).join(' · ')}
                          </small>
                        </button>
                        {r.corrige && (
                          <button type="button" className="hl-corrige" onClick={() => ouvrirDoc(chap, r, true)}>
                            <Icon name="eye" size={14} /> Corrigé
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {doc && (
                    <section className="hl-lecteur">
                      <div className="hl-lecteur-tete">
                        <b>{doc.corrige ? 'Corrigé : ' : ''}{doc.res.titre}</b>
                        <button type="button" className="hl-fermer" onClick={fermerDoc} aria-label="Fermer le document"><Icon name="x" size={16} /></button>
                      </div>
                      {doc.res.image && !doc.corrige
                        ? <img src={doc.url} alt={doc.res.titre} style={{ width: '100%', display: 'block' }} />
                        : <PdfPages key={doc.url} url={doc.url} titre={doc.res.titre} secours={doc.url} />}
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </>
    );
  }

  // ---------- Liste des téléchargements ----------
  return (
    <>
      {entete}
      <main className="hl-main">
        <h1 className="hl-titre brand-font">Mes téléchargements</h1>
        <p className="hl-muted">
          {enLigne
            ? 'Ces chapitres sont sur ton téléphone. Ils se renouvellent tout seuls chaque fois que tu ouvres l\'application avec du réseau.'
            : 'Tu es hors connexion : tout ce qui est ici reste lisible.'}
        </p>
        <div className="hl-chapitres">
          {chapitres.map((c) => {
            const expire = estExpire(c);
            return (
              <article key={c.id} className="hl-chap">
                <button type="button" className="hl-chap-main" onClick={() => { setOuvert(c); setOnglet(null); setQuizId(null); setErreur(''); }}>
                  <small>{c.niveau} · {c.matiere}</small>
                  <b>{c.nom}</b>
                  <span>
                    {tailleLisible(c.taille)} · {expire ? 'à renouveler' : `valable jusqu'au ${dateCourte(c.valide_jusqu)}`}
                  </span>
                </button>
                <button type="button" className="hl-suppr" onClick={() => retirer(c)} aria-label={`Supprimer ${c.nom}`}><Icon name="trash" size={16} /></button>
              </article>
            );
          })}
        </div>
        <div className="hl-actions" style={{ marginTop: 18 }}>
          <Link href="/" className="btn-light">Accueil</Link>
          <Link href="/moyenne" className="btn-light">Ma moyenne</Link>
        </div>
      </main>
    </>
  );
}
