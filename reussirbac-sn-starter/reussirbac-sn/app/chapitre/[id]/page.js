
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';
import { TYPES, downloadUrl, youtubeId } from '../../../lib/media';
import Topbar from '../../components/Topbar';

export default function ChapitrePage() {
  const { id } = useParams();
  const [chapitre, setChapitre] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tabKey, setTabKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [playingId, setPlayingId] = useState(null); // ressource dont le lecteur est chargé

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
              <Link href="/catalogue" className="btn-dark">Retour au catalogue</Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Les élèves ne voient que les ressources publiées
  const publiees = (chapitre.ressources || [])
    .filter((r) => r.statut === 'publie')
    .sort((a, b) => new Date(a.cree_le) - new Date(b.cree_le));

  const parType = {};
  TYPES.forEach((t) => { parType[t.key] = publiees.filter((r) => r.type === t.key); });

  // Onglet actif : celui choisi, sinon le premier qui contient quelque chose
  const premierNonVide = TYPES.find((t) => parType[t.key].length > 0)?.key || TYPES[0].key;
  const activeTab = tabKey && TYPES.some((t) => t.key === tabKey) ? tabKey : premierNonVide;
  const liste = parType[activeTab];
  const selected = liste.find((r) => r.id === selectedId) || liste[0] || null;

  const niveau = chapitre.matieres?.niveaux;
  const matiere = chapitre.matieres;
  const estPdf = selected?.source === 'pdf' && selected?.url_fichier;
  const videoId = selected?.source === 'video' ? youtubeId(selected.url_video) : null;
  const lecteurCharge = selected && playingId === selected.id;

  return (
    <>
      <Topbar
        crumbs={[
          { label: niveau?.nom || 'Niveau', href: '/catalogue' },
          { label: matiere?.nom || 'Matière', href: '/catalogue' },
          { label: chapitre.nom },
        ]}
        action={
          estPdf ? (
            <a className="btn-dark" href={downloadUrl(selected.url_fichier, selected.titre)}>
              ⬇ Télécharger en PDF
            </a>
          ) : null
        }
      />

      <main className="course-page">
        <div className="tag-row">
          {niveau && <span className="tag">{niveau.nom}</span>}
          {matiere && <span className="tag gold">{matiere.nom}</span>}
        </div>
        <h1 className="brand-font" style={{ fontSize: 29, lineHeight: 1.2, margin: '0 0 20px' }}>
          {chapitre.nom}
        </h1>

        <div className="res-tabs" role="tablist">
          {TYPES.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              className={activeTab === t.key ? 'active' : ''}
              onClick={() => { setTabKey(t.key); setSelectedId(null); }}
            >
              <span className="ic">{t.icon}</span>
              {t.plural}
              <span className="count">{parType[t.key].length}</span>
            </button>
          ))}
        </div>

        {liste.length === 0 && (
          <div className="empty-box">
            Pas encore de {TYPES.find((t) => t.key === activeTab).plural.toLowerCase()} pour ce chapitre.
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
                {r.source === 'pdf' ? '📄' : '🎥'} {r.titre}
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

            {/* ---- Vidéo YouTube : chargée au clic pour économiser les données ---- */}
            {selected.source === 'video' && videoId && (
              lecteurCharge ? (
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
                  onClick={() => setPlayingId(selected.id)}
                  style={{ border: 0, padding: 0, cursor: 'pointer', display: 'block', width: '100%' }}
                  aria-label="Lire la vidéo"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                  />
                  <span
                    style={{
                      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                      width: 68, height: 68, borderRadius: '50%', background: 'rgba(15,34,28,0.85)',
                      color: '#fff', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    ▶
                  </span>
                </button>
              )
            )}
            {selected.source === 'video' && !videoId && (
              <p className="viewer-note" style={{ paddingTop: 4 }}>
                Le lien de cette vidéo n'est pas reconnu comme un lien YouTube. Utilise le bouton ci-dessous pour l'ouvrir.
              </p>
            )}

            {/* ---- PDF : lisible dans la page, chargé au clic ---- */}
            {estPdf && lecteurCharge && (
              <iframe className="pdf-frame" src={selected.url_fichier} title={selected.titre} />
            )}

            <div className="viewer-actions">
              {estPdf && !lecteurCharge && (
                <button className="btn-dark" onClick={() => setPlayingId(selected.id)}>📖 Lire le PDF ici</button>
              )}
              {estPdf && (
                <>
                  <a className="btn-light" href={selected.url_fichier} target="_blank" rel="noreferrer">
                    Ouvrir dans un nouvel onglet
                  </a>
                  <a className="btn-light" href={downloadUrl(selected.url_fichier, selected.titre)}>
                    Télécharger
                  </a>
                </>
              )}
              {selected.source === 'video' && (
                <a className="btn-light" href={selected.url_video} target="_blank" rel="noreferrer">
                  Ouvrir sur YouTube
                </a>
              )}
            </div>
            {estPdf && lecteurCharge && (
              <p className="viewer-note">
                Si le PDF ne s'affiche pas bien sur ton téléphone, utilise « Ouvrir dans un nouvel onglet » ou « Télécharger ».
              </p>
            )}
          </div>
        )}
      </main>
    </>
  );
}
