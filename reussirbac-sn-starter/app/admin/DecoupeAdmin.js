'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { cheminStockage } from '../../lib/media';
import { chargerPdfjs } from '../../lib/pdfjs';
import { detecterMarqueurs, exercicesDepuisMarqueurs, assemblerPdf, trierMarqueurs } from '../../lib/decoupe';
import Icon from '../components/Icon';

const LARGEUR = 720; // largeur de dessin d'une page (px)
const OUTILS = [
  { k: 'ex', l: 'Début d\'un exercice' },
  { k: 'co', l: 'Début de sa correction' },
  { k: 'x', l: 'Zone à ignorer' },
];
const COULEUR = { ex: '#1B2168', co: '#1F9D55', x: '#8a8fb0' };

async function urlSignee(url) {
  const chemin = cheminStockage(url);
  if (!chemin) return url;
  const { data } = await supabase.storage.from('ressources').createSignedUrl(chemin, 3600);
  return (data && data.signedUrl) || url;
}

function Page({ pdf, num, marqueurs, d, onPoser, onRetirer }) {
  const ref = useRef(null);
  const [ratio, setRatio] = useState(1.414);
  useEffect(() => {
    let actif = true;
    (async () => {
      const page = await pdf.getPage(num);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: LARGEUR / v1.width });
      if (!actif || !ref.current) return;
      setRatio(vp.height / vp.width);
      const canvas = ref.current;
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    })();
    return () => { actif = false; };
  }, [pdf, num]);

  const clic = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onPoser(num, (e.clientY - r.top) / r.height);
  };
  return (
    <div className="dc-page" style={{ aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={ref} onClick={clic} aria-label={`Page ${num}`} />
      <span className="dc-num">Page {num}</span>
      {marqueurs.filter((m) => m.d === d && m.p === num).map((m, i) => (
        <div key={i} className="dc-trait" style={{ top: `${m.y * 100}%`, borderColor: COULEUR[m.k] }}>
          <button type="button" style={{ background: COULEUR[m.k] }} onClick={() => onRetirer(m)} title="Retirer ce trait">
            {m.k === 'ex' ? `Exercice ${m.n}` : m.k === 'co' ? `Correction ${m.n}` : 'Ignoré'} ×
          </button>
        </div>
      ))}
    </div>
  );
}

export default function DecoupeAdmin() {
  const [liste, setListe] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [res, setRes] = useState(null);
  const [docs, setDocs] = useState({ s: null, c: null, urls: {} });
  const [doc, setDoc] = useState('s');
  const [marqueurs, setMarqueurs] = useState([]);
  const [meta, setMeta] = useState({}); // numero -> { titre, difficulte, bareme, duree_min }
  const [outil, setOutil] = useState('ex');
  const [num, setNum] = useState(1);
  const [msg, setMsg] = useState({ texte: '', erreur: false });
  const [occupe, setOccupe] = useState(false);
  const [apercu, setApercu] = useState({ s: null, c: null });

  useEffect(() => {
    supabase.from('ressources')
      .select('id, titre, type, url_fichier, url_corrige, decoupe, chapitres(nom, matieres(nom, niveaux(nom)))')
      .in('type', ['exercice', 'annale']).not('url_fichier', 'is', null)
      .order('cree_le', { ascending: false }).limit(300)
      .then(({ data, error }) => {
        if (error) setMsg({ texte: 'Lance d\'abord le script SQL 23 dans Supabase (Atelier par exercice).', erreur: true });
        setListe(data || []);
      });
  }, []);

  const filtre = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return liste.filter((r) => !q || `${r.titre} ${r.chapitres?.nom} ${r.chapitres?.matieres?.nom}`.toLowerCase().includes(q)).slice(0, 60);
  }, [liste, recherche]);

  const ouvrir = useCallback(async (r) => {
    setRes(r); setMsg({ texte: '', erreur: false }); setApercu({ s: null, c: null });
    setDocs({ s: null, c: null, urls: {} }); setDoc('s');
    setMarqueurs((r.decoupe && r.decoupe.marqueurs) || []);
    const { data: ex } = await supabase.from('exercices').select('numero, titre, difficulte, bareme, duree_min').eq('ressource_id', r.id);
    const m = {};
    (ex || []).forEach((e) => { m[e.numero] = { titre: e.titre || '', difficulte: e.difficulte || '', bareme: e.bareme || '', duree_min: e.duree_min || '' }; });
    setMeta(m);
    const pdfjs = await chargerPdfjs();
    const charger = async (url) => {
      const signe = await urlSignee(url);
      const pdf = await pdfjs.getDocument({ url: signe }).promise;
      return { pdf, url: signe };
    };
    try {
      const s = await charger(r.url_fichier);
      const c = r.url_corrige ? await charger(r.url_corrige) : null;
      setDocs({ s: s.pdf, c: c && c.pdf, urls: { s: s.url, c: c && c.url } });
    } catch (e) { setMsg({ texte: 'Impossible d\'ouvrir ce PDF.', erreur: true }); }
  }, []);

  const pages = useMemo(() => ({ s: docs.s ? docs.s.numPages : 0, c: docs.c ? docs.c.numPages : 0 }), [docs]);
  const exercices = useMemo(() => exercicesDepuisMarqueurs(marqueurs, pages), [marqueurs, pages]);

  const poser = (p, y) => {
    const m = { d: doc, p, y: Math.round(Math.min(0.995, Math.max(0, y - 0.004)) * 10000) / 10000, k: outil, n: outil === 'x' ? 0 : Number(num) || 1 };
    setMarqueurs((a) => trierMarqueurs([...a, m]));
    if (outil === 'ex') setNum((Number(num) || 1) + 1);
  };
  const retirer = (m) => setMarqueurs((a) => a.filter((x) => x !== m));

  const detecter = async () => {
    if (!docs.s) return;
    setMsg({ texte: 'Lecture du texte du PDF...', erreur: false });
    let trouves = await detecterMarqueurs(docs.s, 's');
    if (docs.c) trouves = trouves.concat(await detecterMarqueurs(docs.c, 'c'));
    if (!trouves.length) { setMsg({ texte: 'Aucun mot « Exercice » ou « Solution » lisible : ce PDF est probablement une image scannée. Pose les traits à la main.', erreur: true }); return; }
    setMarqueurs(trierMarqueurs(trouves.map(({ auto, texte, ...m }) => m)));
    const nb = new Set(trouves.filter((m) => m.k === 'ex').map((m) => m.n)).size;
    setNum(Math.max(0, ...trouves.filter((m) => m.k === 'ex').map((m) => m.n)) + 1);
    setMsg({ texte: `${trouves.length} trait${trouves.length > 1 ? 's' : ''} proposé${trouves.length > 1 ? 's' : ''} (${nb} exercice${nb > 1 ? 's' : ''}). Vérifie-les, retire ou ajoute ce qu'il faut, puis enregistre.`, erreur: false });
  };

  const majMeta = (n, champ, v) => setMeta((p) => ({ ...p, [n]: { ...(p[n] || {}), [champ]: v } }));

  const urlsPour = (cle) => ({ s: docs.urls.s, c: docs.urls.c || docs.urls.s, ...(cle || {}) });

  const faireApercu = async (sens) => {
    setMsg({ texte: 'Assemblage de l\'aperçu...', erreur: false });
    try {
      const items = exercices
        .filter((e) => sens === 'segments' || e.segments_corrige)
        .map((e) => ({ titre: `Exercice ${e.numero}`, chapitre: res.chapitres?.nom, segments: sens === 'segments' ? e.segments : e.segments_corrige, urls: urlsPour() }));
      if (!items.length) { setMsg({ texte: sens === 'segments' ? 'Aucun exercice défini.' : 'Aucune correction définie.', erreur: true }); return; }
      const { octets } = await assemblerPdf(items, { titre: 'Apercu', couverture: sens === 'segments', etiquette: sens === 'segments' ? 'Partie' : 'Corrigé' });
      const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
      setApercu((a) => { if (a[sens === 'segments' ? 's' : 'c']) URL.revokeObjectURL(a[sens === 'segments' ? 's' : 'c']); return { ...a, [sens === 'segments' ? 's' : 'c']: url }; });
      setMsg({ texte: 'Aperçu prêt.', erreur: false });
    } catch (e) { setMsg({ texte: e.message || 'Aperçu impossible.', erreur: true }); }
  };

  const enregistrer = async () => {
    if (!res) return;
    setOccupe(true); setMsg({ texte: '', erreur: false });
    const num = (v, min, max) => { const x = parseInt(v, 10); return Number.isFinite(x) && x >= min && x <= max ? x : null; };
    const lignes = exercices.map((e) => {
      const m = meta[e.numero] || {};
      return {
        ressource_id: res.id, numero: e.numero, titre: (m.titre || '').trim().slice(0, 120) || null,
        segments: e.segments, segments_corrige: e.segments_corrige,
        difficulte: num(m.difficulte, 1, 3), bareme: num(m.bareme, 1, 40), duree_min: num(m.duree_min, 5, 360),
      };
    });
    const garder = new Set(lignes.map((l) => l.numero));
    const { data: anciens } = await supabase.from('exercices').select('numero').eq('ressource_id', res.id);
    const aSupprimer = (anciens || []).map((a) => a.numero).filter((n) => !garder.has(n));
    let err = null;
    if (aSupprimer.length) ({ error: err } = await supabase.from('exercices').delete().eq('ressource_id', res.id).in('numero', aSupprimer));
    if (!err && lignes.length) ({ error: err } = await supabase.from('exercices').upsert(lignes, { onConflict: 'ressource_id,numero' }));
    if (!err) ({ error: err } = await supabase.from('ressources').update({ decoupe: marqueurs.length ? { version: 1, marqueurs } : null }).eq('id', res.id));
    setOccupe(false);
    if (err) {
      setMsg({ texte: /exercices|decoupe/.test(err.message) && /exist|column|relation|schema/.test(err.message) ? 'Lance d\'abord le script SQL 23 dans Supabase.' : `Erreur : ${err.message}`, erreur: true });
      return;
    }
    setListe((l) => l.map((r) => (r.id === res.id ? { ...r, decoupe: marqueurs.length ? { version: 1, marqueurs } : null } : r)));
    setMsg({ texte: lignes.length ? `Enregistré : ${lignes.length} exercice${lignes.length > 1 ? 's' : ''}. Ils sont maintenant tirés un par un dans l'Atelier.` : 'Découpage retiré : ce PDF sera de nouveau tiré en entier.', erreur: false });
  };

  const d = docs[doc];
  const sansCorrige = exercices.filter((e) => !e.segments_corrige).length;

  return (
    <div>
      <p className="at-aide" style={{ color: 'var(--ink-soft)', marginBottom: 14 }}>
        Choisis un PDF d'exercices ou d'annale. Pose un trait au début de chaque exercice et de chaque correction : l'Atelier tirera les exercices un par un, avec leur corrigé.
      </p>

      {msg.texte && <p className={msg.erreur ? 'error-text' : 'success-text'} role="status">{msg.texte}</p>}

      <div className="field">
        <label>Retrouver le PDF</label>
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Titre, chapitre ou matière..." />
      </div>
      <div className="dc-liste" role="listbox" aria-label="PDF">
        {filtre.map((r) => (
          <button type="button" key={r.id} className={`dc-item${res && res.id === r.id ? ' on' : ''}`} onClick={() => ouvrir(r)}>
            <b>{r.titre}</b>
            <small>{r.chapitres?.matieres?.niveaux?.nom} · {r.chapitres?.matieres?.nom} · {r.chapitres?.nom}</small>
            {r.decoupe && <em>Découpé</em>}
          </button>
        ))}
        {!filtre.length && <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>Aucun PDF trouvé.</p>}
      </div>

      {res && (
        <div className="dc-zone">
          <h2 className="brand-font" style={{ fontSize: 20, margin: '20px 0 10px' }}>{res.titre}</h2>

          <div className="dc-barre">
            {res.url_corrige && (
              <div className="segmented">
                <button type="button" className={doc === 's' ? 'active' : ''} onClick={() => setDoc('s')}>PDF du sujet</button>
                <button type="button" className={doc === 'c' ? 'active' : ''} onClick={() => setDoc('c')}>PDF du corrigé</button>
              </div>
            )}
            <div className="segmented">
              {OUTILS.map((o) => (
                <button type="button" key={o.k} className={outil === o.k ? 'active' : ''} onClick={() => setOutil(o.k)}>{o.l}</button>
              ))}
            </div>
            {outil !== 'x' && (
              <label className="dc-num-champ">N°
                <input type="number" min="1" max="200" value={num} onChange={(e) => setNum(e.target.value)} />
              </label>
            )}
            <button type="button" className="btn-light" onClick={detecter} disabled={!docs.s}>Détecter automatiquement</button>
            <button type="button" className="btn-light btn-danger" onClick={() => setMarqueurs([])} disabled={!marqueurs.length}>Tout effacer</button>
          </div>
          <p className="dc-aide">
            {outil === 'ex' && <>Touche la page à l'endroit où <b>l'exercice {num}</b> commence.</>}
            {outil === 'co' && <>Touche la page à l'endroit où la <b>correction de l'exercice {num}</b> commence (même PDF ou PDF du corrigé).</>}
            {outil === 'x' && <>Touche la page à l'endroit où commence une zone à <b>ne pas copier</b> (titre, numéro de page, publicité...). Elle dure jusqu'au trait suivant.</>}
            {' '}Chaque zone dure jusqu'au trait suivant.
          </p>

          {!d && !msg.erreur && <p style={{ color: 'var(--ink-soft)' }}>Ouverture du PDF...</p>}
          <div className="dc-pages">
            {d && Array.from({ length: d.numPages }, (_, i) => (
              <Page key={`${doc}-${i + 1}-${res.id}`} pdf={d} num={i + 1} d={doc} marqueurs={marqueurs} onPoser={poser} onRetirer={retirer} />
            ))}
          </div>

          <h3 className="brand-font" style={{ fontSize: 17, margin: '22px 0 10px' }}>
            {exercices.length} exercice{exercices.length > 1 ? 's' : ''} défini{exercices.length > 1 ? 's' : ''}
            {exercices.length > 0 && sansCorrige > 0 && <small style={{ color: 'var(--danger)', fontWeight: 500 }}> · {sansCorrige} sans correction</small>}
          </h3>
          {exercices.map((e) => (
            <div className="dc-ex" key={e.numero}>
              <b>Exercice {e.numero}</b>
              <span className={e.segments_corrige ? 'ok' : 'pas'}>{e.segments_corrige ? 'Corrigé lié' : 'Sans corrigé'}</span>
              <input placeholder="Titre (facultatif)" value={(meta[e.numero] || {}).titre || ''} onChange={(ev) => majMeta(e.numero, 'titre', ev.target.value)} maxLength={120} />
              <select value={(meta[e.numero] || {}).difficulte || ''} onChange={(ev) => majMeta(e.numero, 'difficulte', ev.target.value)} aria-label="Difficulté">
                <option value="">Difficulté</option><option value="1">Accessible</option><option value="2">Abordable</option><option value="3">Exigeant</option>
              </select>
              <input type="number" min="1" max="40" placeholder="Barème" value={(meta[e.numero] || {}).bareme || ''} onChange={(ev) => majMeta(e.numero, 'bareme', ev.target.value)} aria-label="Barème en points" />
              <input type="number" min="5" max="360" placeholder="Durée (min)" value={(meta[e.numero] || {}).duree_min || ''} onChange={(ev) => majMeta(e.numero, 'duree_min', ev.target.value)} aria-label="Durée en minutes" />
            </div>
          ))}

          <div className="dc-actions">
            <button type="button" className="btn-primary" onClick={enregistrer} disabled={occupe}>{occupe ? 'Enregistrement...' : exercices.length ? 'Enregistrer le découpage' : 'Retirer le découpage'}</button>
            <button type="button" className="btn-light" onClick={() => faireApercu('segments')} disabled={!exercices.length}><Icon name="eye" size={15} /> Aperçu du sujet</button>
            <button type="button" className="btn-light" onClick={() => faireApercu('corrige')} disabled={!exercices.length}><Icon name="eye" size={15} /> Aperçu du corrigé</button>
          </div>
          {(apercu.s || apercu.c) && (
            <p className="dc-aide">
              {apercu.s && <a href={apercu.s} target="_blank" rel="noopener noreferrer">Ouvrir l'aperçu du sujet</a>}
              {apercu.s && apercu.c && ' · '}
              {apercu.c && <a href={apercu.c} target="_blank" rel="noopener noreferrer">Ouvrir l'aperçu du corrigé</a>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
