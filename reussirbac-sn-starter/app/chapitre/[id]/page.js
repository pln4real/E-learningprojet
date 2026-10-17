'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';
import { lienPage } from '../../../lib/sommaire';
import { TABS, aPdf, aVideo, downloadUrl, youtubeId, signerRessources, estImageUrl } from '../../../lib/media';
import { usePalier } from '../../../lib/usePalier';
import { useProgression } from '../../../lib/useProgression';
import QuizPlayer from '../../components/QuizPlayer';
import Topbar from '../../components/Topbar';
import Sidebar from '../../components/Sidebar';
import Icon from '../../components/Icon';

export default function ChapitrePage() {
  const { id } = useParams();
  const { palier, connecte } = usePalier();
  const prog = useProgression();
  const [quizList, setQuizList] = useState([]);
  const [quizId, setQuizId] = useState(null);
  const [chapitre, setChapitre] = useState(null);
  const [verrouillees, setVerrouillees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tabKey, setTabKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [videoOnId, setVideoOnId] = useState(null); // vidéo dont le lecteur est chargé
  const [pdfOnId, setPdfOnId] = useState(null); // PDF dont le lecteur est chargé
  const [pdfNav, setPdfNav] = useState({ id: null, page: 1 }); // page du PDF demandée par le sommaire
  const [sommaireOuvert, setSommaireOuvert] = useState(false); // panneau du sommaire (téléphone)

  useEffect(() => {
    if (!id) return;
    async function load() {
      const { data, error } = await supabase
        .from('chapitres')
        .select('*, matieres(id, nom, niveaux(id, nom)), ressources(*)')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) setNotFound(true);
      else setChapitre({ ...data, ressources: await signerRessources(supabase, data.ressources) });

      // Ressources réservées aux abonnés : on récupère leur titre (jamais leur lien)
      const { data: lock, error: errLock } = await supabase.rpc('ressources_verrouillees', { p_chapitre: id });
      if (!errLock && Array.isArray(lock)) setVerrouillees(lock);
      // Quiz du chapitre (silencieux si le script SQL 06 n'est pas encore lancé)
      const { data: qz, error: errQz } = await supabase
        .from('quiz').select('id, titre, description, acces, statut, cree_le').eq('chapitre_id', id);
      let quizzes = !errQz && Array.isArray(qz) ? qz.filter((q) => q.statut === 'publie') : [];
      const { data: qzLock, error: errQzLock } = await supabase.rpc('quiz_verrouilles', { p_chapitre: id });
      if (!errQzLock && Array.isArray(qzLock)) {
        const deja = new Set(quizzes.map((q) => q.id));
        quizzes = [...quizzes, ...qzLock.filter((q) => !deja.has(q.id)).map((q) => ({ ...q, verrouille: true }))];
      }
      quizzes.sort((a, b) => new Date(a.cree_le) - new Date(b.cree_le));
      setQuizList(quizzes);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return <main className="course-page"><p style={{ color: 'var(--ink-soft)' }}>Chargement...</p></main>;
  }

  if (notFound || !chapitre) {
    return (
      <>
        <Topbar crumbs={[{ label: 'Chapitre introuvable' }]} />
        <main className="course-page">
          <div className="empty-box">
            Ce chapitre n'existe pas ou n'est plus disponible.
            <div style={{ marginTop: 14 }}>
              <Link href="/" className="btn-dark">Retour à l'accueil</Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Ressources lisibles (publiées) + ressources verrouillées (titre seulement)
  const lisibles = (chapitre.ressources || []).filter((r) => r.statut === 'publie');
  const idsLisibles = new Set(lisibles.map((r) => r.id));
  const toutes = [
    ...lisibles,
    ...verrouillees.filter((r) => !idsLisibles.has(r.id)).map((r) => ({ ...r, verrouille: true })),
  ].sort((a, b) => new Date(a.cree_le) - new Date(b.cree_le));

  const parOnglet = {};
  TABS.forEach((t) => { parOnglet[t.key] = toutes.filter(t.match); });

  // Onglet actif : celui choisi, sinon le premier qui contient quelque chose
  const tousOngletsPossibles = quizList.length > 0 ? [...TABS, { key: 'quiz', label: 'Quiz', icon: 'quiz' }] : TABS;
  parOnglet.quiz = quizList;
  // On n'affiche que les onglets qui contiennent quelque chose (sinon, le premier, vide)
  const garde = tousOngletsPossibles.filter((t) => parOnglet[t.key].length > 0);
  const tousOnglets = garde.length > 0 ? garde : [TABS[0]];
  const premierNonVide = tousOnglets.find((t) => parOnglet[t.key].length > 0)?.key || TABS[0].key;
  const activeTab = tabKey && tousOnglets.some((t) => t.key === tabKey) ? tabKey : premierNonVide;
  const estQuiz = activeTab === 'quiz';
  const liste = estQuiz ? [] : parOnglet[activeTab];
  const selected = liste.find((r) => r.id === selectedId) || liste[0] || null;
  const quizCourant = estQuiz ? (quizList.find((q) => q.id === quizId) || quizList[0]) : null;
  const termine = selected && prog.faits.has(selected.id);
  const nbLisibles = lisibles.length;
  const nbFaits = lisibles.filter((r) => prog.faits.has(r.id)).length;

  const niveau = chapitre.matieres?.niveaux;
  const matiere = chapitre.matieres;
  const verrou = !!selected?.verrouille;
  // Un contenu peut avoir un PDF et une vidéo. L'onglet « Cours » montre le PDF,
  // l'onglet « Vidéo » la vidéo, les exercices et annales montrent les deux.
  const montrePdf = activeTab !== 'video';
  const montreVideo = activeTab !== 'cours';
  const aUnPdf = !!selected && !verrou && !!selected.url_fichier;
  const aUneVideo = !!selected && !verrou && !!selected.url_video;
  const estPdf = aUnPdf && montrePdf;
  const estImage = estPdf && estImageUrl(selected.url_fichier);
  const sommaire = estPdf && !estImage && selected.type === 'cours' && Array.isArray(selected.sommaire) && selected.sommaire.length >= 2 ? selected.sommaire : null;
  const pageCourante = pdfNav.id === selected?.id ? pdfNav.page : 1;
  const lienVue = selected ? lienPage(selected.url_fichier_vue || selected.url_fichier, pageCourante) : null;
  const videoId = aUneVideo && montreVideo ? youtubeId(selected.url_video) : null;
  const videoCharge = selected && videoOnId === selected.id;
  const pdfCharge = selected && pdfOnId === selected.id;
  // Passerelles entre les onglets quand le même contenu a les deux supports
  const autreVideo = !verrou && activeTab === 'cours' && selected && aVideo(selected) && aUneVideo;
  const autrePdf = !verrou && activeTab === 'video' && selected && aPdf(selected) && aUnPdf;
  const peutTelecharger = palier === 'premium';
  const ongletCourant = tousOnglets.find((t) => t.key === activeTab);

  // Liste cliquable du sommaire (colonne fixe sur grand écran, panneau sur téléphone)
  function listeSommaire(ferme) {
    return (
      <ol>
        {sommaire.map((sec, i) => (
          <li key={i} className={`${sec.niveau === 1 ? 'sous' : ''}${pdfCharge && pageCourante === sec.page && pdfNav.id === selected.id && pdfNav.titre === sec.titre ? ' actif' : ''}`}>
            <button
              type="button"
              onClick={() => {
                setPdfOnId(selected.id);
                setPdfNav({ id: selected.id, page: sec.page, titre: sec.titre });
                prog.marquer(selected.id, true);
                if (ferme) setSommaireOuvert(false);
                setTimeout(() => {
                  const f = document.querySelector('.pdf-frame');
                  if (f && f.getBoundingClientRect().top < 0) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 80);
              }}
            >
              <span>{sec.titre}</span><span className="pg">p. {sec.page}</span>
            </button>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <>
      <Topbar
        crumbs={[
          { label: niveau?.nom || 'Niveau', href: niveau ? `/classe/${niveau.id}` : '/' },
          { label: matiere?.nom || 'Matière', href: matiere ? `/matiere/${matiere.id}` : '/' },
          { label: chapitre.nom },
        ]}
        action={
          estPdf && peutTelecharger ? (
            <a className="btn-dark" href={selected.url_fichier_tel || downloadUrl(selected.url_fichier, selected.titre)}>
              <Icon name="download" size={16} /> Télécharger en PDF
            </a>
          ) : null
        }
      />

      <div className="with-side">
        <Sidebar niveauId={niveau?.id} currentId={matiere?.id} />
        <main className="course-page side-main">
          <div className="tag-row">
            {niveau && <span className="tag">{niveau.nom}</span>}
            {matiere && <span className="tag gold">{matiere.nom}</span>}
          </div>
          <h1 className="brand-font" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', lineHeight: 1.05, margin: '0 0 22px', fontWeight: 800 }}>
            {chapitre.nom}
          </h1>

          {prog.connecte && nbLisibles > 0 && (
            <div className="prog-line">
              <span>{nbFaits} / {nbLisibles} terminé{nbFaits > 1 ? 's' : ''}</span>
              <span className="bar"><i style={{ width: `${(nbFaits / nbLisibles) * 100}%` }} /></span>
            </div>
          )}

          <div className="res-tabs" role="tablist">
            {tousOnglets.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={activeTab === t.key}
                className={activeTab === t.key ? 'active' : ''}
                onClick={() => { setTabKey(t.key); setSelectedId(null); setQuizId(null); }}
              >
                <Icon name={t.icon} size={17} />
                {t.label}
                <span className="count">{parOnglet[t.key].length}</span>
              </button>
            ))}
          </div>

          {!estQuiz && liste.length === 0 && (
            <div className="empty-box">
              Rien dans « {ongletCourant.label} » pour ce chapitre pour l'instant.
            </div>
          )}

          {liste.length > 1 && (
            <div className="res-list">
              {liste.map((r) => (
                <button
                  key={r.id}
                  className={`res-chip ${selected?.id === r.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(r.id)}
                >
                  {prog.faits.has(r.id)
                    ? <Icon name="checkCircle" size={15} className="done-ic" />
                    : <Icon name={r.verrouille ? 'lock' : activeTab === 'video' ? 'play' : aPdf(r) ? 'file' : 'play'} size={15} />}
                  {r.titre}
                </button>
              ))}
            </div>
          )}

          {estQuiz && (
            <>
              {quizList.length > 1 && (
                <div className="res-list">
                  {quizList.map((q) => (
                    <button key={q.id} className={`res-chip ${quizCourant?.id === q.id ? 'active' : ''}`} onClick={() => setQuizId(q.id)}>
                      {q.verrouille
                        ? <Icon name="lock" size={15} />
                        : prog.scores[q.id] ? <Icon name="checkCircle" size={15} className="done-ic" /> : <Icon name="quiz" size={15} />}
                      {q.titre}
                    </button>
                  ))}
                </div>
              )}
              {quizCourant && (
                <div className="viewer">
                  <div className="viewer-head">
                    <h2 className="brand-font">{quizCourant.titre}</h2>
                    {quizCourant.description && <p>{quizCourant.description}</p>}
                    {prog.scores[quizCourant.id] && (
                      <p>Meilleur score : {prog.scores[quizCourant.id].score}/{prog.scores[quizCourant.id].total}</p>
                    )}
                  </div>
                  {quizCourant.verrouille ? (
                    <div className="lock-panel">
                      <span className="lock-badge"><Icon name="lock" size={22} /></span>
                      <h3 className="brand-font">Réservé aux abonnés</h3>
                      {connecte ? (
                        <p>Les abonnements ouvrent bientôt. Ce quiz sera alors disponible avec ton compte.</p>
                      ) : (
                        <>
                          <p>Crée un compte gratuit pour accéder aux quiz ouverts à tous.</p>
                          <div className="lock-actions">
                            <Link href="/inscription" className="btn-dark">Créer un compte</Link>
                            <Link href="/login" className="btn-light">Connexion</Link>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: '0 18px 20px' }}>
                      <QuizPlayer quiz={quizCourant} connecte={prog.connecte} userId={prog.userId} onResult={prog.noterQuiz} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {selected && (
            <div className="viewer">
              <div className="viewer-head">
                <h2 className="brand-font">{selected.titre}</h2>
                {selected.description && <p>{selected.description}</p>}
              </div>

              {/* ---- Ressource réservée aux abonnés ---- */}
              {verrou && (
                <div className="lock-panel">
                  <span className="lock-badge"><Icon name="lock" size={22} /></span>
                  <h3 className="brand-font">Réservé aux abonnés</h3>
                  {connecte ? (
                    <p>Les abonnements ouvrent bientôt. Cette ressource sera alors disponible avec ton compte.</p>
                  ) : (
                    <>
                      <p>Crée un compte gratuit pour suivre les cours ouverts à tous. Les abonnements arrivent bientôt.</p>
                      <div className="lock-actions">
                        <Link href="/inscription" className="btn-dark">Créer un compte</Link>
                        <Link href="/login" className="btn-light">Connexion</Link>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ---- Vidéo YouTube : chargée au clic pour économiser les données ---- */}
              {!verrou && montreVideo && aUneVideo && videoId && (
                videoCharge ? (
                  <div className="video-frame">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
                      title={selected.titre}
                      allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="video-frame"
                    onClick={() => { setVideoOnId(selected.id); prog.marquer(selected.id, true); }}
                    style={{ border: 0, padding: 0, cursor: 'pointer', display: 'block', width: '100%' }}
                    aria-label="Lire la vidéo"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                    />
                    <span className="play-btn"><Icon name="play" size={34} /></span>
                  </button>
                )
              )}
              {!verrou && montreVideo && aUneVideo && !videoId && (
                <p className="viewer-note" style={{ paddingTop: 4 }}>
                  Le lien de cette vidéo n'est pas reconnu comme un lien YouTube. Utilise le bouton ci-dessous pour l'ouvrir.
                </p>
              )}

              {/* ---- PDF : lisible dans la page, chargé au clic ---- */}
              <div className={`lecteur${sommaire ? ' avec-sommaire' : ''}`}>
                <div className="lecteur-main">
                  {estImage && (
                    <img
                      className="fiche-img"
                      src={selected.url_fichier_vue || selected.url_fichier}
                      alt={selected.titre}
                      onLoad={() => { if (!prog.faits.has(selected.id)) prog.marquer(selected.id, true); }}
                    />
                  )}
                  {estPdf && !estImage && pdfCharge && (
                    <iframe key={`${selected.id}-${pageCourante}`} className="pdf-frame" src={lienVue} title={selected.titre} />
                  )}
                  {sommaire && !pdfCharge && (
                    <div className="pdf-attente">
                      <Icon name="bookOpen" size={26} />
                      <p>Le cours se charge à la demande pour économiser tes données.</p>
                      <button className="btn-dark" onClick={() => { setPdfOnId(selected.id); prog.marquer(selected.id, true); }}>
                        Lire le cours ici
                      </button>
                    </div>
                  )}
                </div>
                {sommaire && (
                  <aside className="sommaire-col">
                    <nav className="sommaire" aria-label="Sommaire du cours">
                      <h3 className="brand-font">Sommaire</h3>
                      {listeSommaire()}
                    </nav>
                  </aside>
                )}
              </div>

              {sommaire && (
                <>
                  <button type="button" className="sommaire-fab" onClick={() => setSommaireOuvert(true)} aria-haspopup="dialog">
                    <Icon name="list" size={18} /> Sommaire
                  </button>
                  {sommaireOuvert && (
                    <div className="sommaire-sheet" role="dialog" aria-modal="true" aria-label="Sommaire du cours">
                      <button type="button" className="sommaire-fond" onClick={() => setSommaireOuvert(false)} aria-label="Fermer le sommaire" />
                      <div className="sommaire-panneau">
                        <div className="sommaire-entete">
                          <h3 className="brand-font">Sommaire</h3>
                          <button type="button" className="btn-light" onClick={() => setSommaireOuvert(false)}>Fermer</button>
                        </div>
                        <nav className="sommaire" aria-label="Sommaire du cours">{listeSommaire(true)}</nav>
                      </div>
                    </div>
                  )}
                </>
              )}

              {!verrou && (
                <div className="viewer-actions">
                  {estPdf && !estImage && !pdfCharge && (
                    <button className="btn-dark" onClick={() => { setPdfOnId(selected.id); prog.marquer(selected.id, true); }}>
                      <Icon name="bookOpen" size={16} /> Lire le PDF ici
                    </button>
                  )}
                  {estPdf && (
                    <a className="btn-light" href={lienVue} target="_blank" rel="noreferrer">
                      <Icon name="external" size={15} /> Ouvrir dans un nouvel onglet
                    </a>
                  )}
                  {estPdf && (peutTelecharger ? (
                    <a className="btn-light" href={selected.url_fichier_tel || downloadUrl(selected.url_fichier, selected.titre)}>
                      <Icon name="download" size={15} /> Télécharger
                    </a>
                  ) : (
                    <span className="btn-light btn-locked" title="Le téléchargement est réservé à l'abonnement Premium">
                      <Icon name="lock" size={15} /> Télécharger (Premium)
                    </span>
                  ))}
                  {montreVideo && aUneVideo && (
                    <a className="btn-light" href={selected.url_video} target="_blank" rel="noreferrer">
                      <Icon name="external" size={15} /> Ouvrir sur YouTube
                    </a>
                  )}
                  {prog.connecte && (
                    <button className={`btn-light ${termine ? 'btn-done' : ''}`} onClick={() => prog.marquer(selected.id, !termine)}>
                      <Icon name={termine ? 'checkCircle' : 'circle'} size={15} /> {termine ? 'Terminé' : 'Marquer comme terminé'}
                    </button>
                  )}
                  {autreVideo && (
                    <button className="btn-light" onClick={() => { setTabKey('video'); setSelectedId(selected.id); }}>
                      <Icon name="play" size={15} /> Voir la vidéo de ce cours
                    </button>
                  )}
                  {autrePdf && (
                    <button className="btn-light" onClick={() => { setTabKey('cours'); setSelectedId(selected.id); }}>
                      <Icon name="file" size={15} /> Lire le support PDF
                    </button>
                  )}
                </div>
              )}
              {estPdf && !estImage && pdfCharge && (
                <p className="viewer-note">
                  Si le PDF ne s'affiche pas bien sur ton téléphone, utilise « Ouvrir dans un nouvel onglet ».
                </p>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
