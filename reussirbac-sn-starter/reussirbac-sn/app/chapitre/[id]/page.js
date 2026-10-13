'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';
import { TABS, aPdf, aVideo, downloadUrl, youtubeId } from '../../../lib/media';
import { usePalier } from '../../../lib/usePalier';
import Topbar from '../../components/Topbar';
import Sidebar from '../../components/Sidebar';
import Icon from '../../components/Icon';

export default function ChapitrePage() {
  const { id } = useParams();
  const { palier, connecte } = usePalier();
  const [chapitre, setChapitre] = useState(null);
  const [verrouillees, setVerrouillees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tabKey, setTabKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [videoOnId, setVideoOnId] = useState(null); // vidéo dont le lecteur est chargé
  const [pdfOnId, setPdfOnId] = useState(null); // PDF dont le lecteur est chargé

  useEffect(() => {
    if (!id) return;
    async function load() {
      const { data, error } = await supabase
        .from('chapitres')
        .select('*, matieres(id, nom, niveaux(id, nom)), ressources(*)')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) setNotFound(true);
      else setChapitre(data);

      // Ressources réservées aux abonnés : on récupère leur titre (jamais leur lien)
      const { data: lock, error: errLock } = await supabase.rpc('ressources_verrouillees', { p_chapitre: id });
      if (!errLock && Array.isArray(lock)) setVerrouillees(lock);
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
  const premierNonVide = TABS.find((t) => parOnglet[t.key].length > 0)?.key || TABS[0].key;
  const activeTab = tabKey && TABS.some((t) => t.key === tabKey) ? tabKey : premierNonVide;
  const liste = parOnglet[activeTab];
  const selected = liste.find((r) => r.id === selectedId) || liste[0] || null;

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
  const videoId = aUneVideo && montreVideo ? youtubeId(selected.url_video) : null;
  const videoCharge = selected && videoOnId === selected.id;
  const pdfCharge = selected && pdfOnId === selected.id;
  // Passerelles entre les onglets quand le même contenu a les deux supports
  const autreVideo = !verrou && activeTab === 'cours' && selected && aVideo(selected) && aUneVideo;
  const autrePdf = !verrou && activeTab === 'video' && selected && aPdf(selected) && aUnPdf;
  const peutTelecharger = palier === 'premium';
  const ongletCourant = TABS.find((t) => t.key === activeTab);

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
            <a className="btn-dark" href={downloadUrl(selected.url_fichier, selected.titre)}>
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

          <div className="res-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={activeTab === t.key}
                className={activeTab === t.key ? 'active' : ''}
                onClick={() => { setTabKey(t.key); setSelectedId(null); }}
              >
                <Icon name={t.icon} size={17} />
                {t.label}
                <span className="count">{parOnglet[t.key].length}</span>
              </button>
            ))}
          </div>

          {liste.length === 0 && (
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
                  <Icon name={r.verrouille ? 'lock' : activeTab === 'video' ? 'play' : aPdf(r) ? 'file' : 'play'} size={15} />
                  {r.titre}
                </button>
              ))}
            </div>
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
                    onClick={() => setVideoOnId(selected.id)}
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
              {estPdf && pdfCharge && (
                <iframe className="pdf-frame" src={selected.url_fichier} title={selected.titre} />
              )}

              {!verrou && (
                <div className="viewer-actions">
                  {estPdf && !pdfCharge && (
                    <button className="btn-dark" onClick={() => setPdfOnId(selected.id)}>
                      <Icon name="bookOpen" size={16} /> Lire le PDF ici
                    </button>
                  )}
                  {estPdf && (
                    <a className="btn-light" href={selected.url_fichier} target="_blank" rel="noreferrer">
                      <Icon name="external" size={15} /> Ouvrir dans un nouvel onglet
                    </a>
                  )}
                  {estPdf && (peutTelecharger ? (
                    <a className="btn-light" href={downloadUrl(selected.url_fichier, selected.titre)}>
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
              {estPdf && pdfCharge && (
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
