'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { cheminStockage } from '../../lib/media';
import { chargerPdfjs } from '../../lib/pdfjs';
import { detecterMarqueurs, analyserMiseEnPage, exercicesDepuisMarqueurs, assemblerPdf, trierMarqueurs, clamp01 } from '../../lib/decoupe';
import Icon from '../components/Icon';

const RENDU = 1000; // largeur de dessin d'une page (px)
const OUTILS = [
  { k: 'ex', l: 'Début d\'un exercice', court: 'Exercice', touche: 'E', couleur: '#1B2168' },
  { k: 'co', l: 'Début de sa correction', court: 'Correction', touche: 'C', couleur: '#1F9D55' },
  { k: 'x', l: 'Zone à ignorer', court: 'Ignorer', touche: 'X', couleur: '#8a8fb0' },
];
const COULEUR = { ex: '#1B2168', co: '#1F9D55', x: '#8a8fb0' };
const NOM = { ex: 'Exercice', co: 'Correction', x: 'Ignoré' };
let compteur = 0;
const avecId = (m) => ({ ...m, _id: m._id || `m${++compteur}` });
const nettoyer = (m) => { const { _id, auto, texte, ...r } = m; return r; };

async function urlSignee(url) {
  const chemin = cheminStockage(url);
  if (!chemin) return url;
  const { data } = await supabase.storage.from('ressources').createSignedUrl(chemin, 3600);
  return (data && data.signedUrl) || url;
}

// Positions des débuts de lignes de texte d'une page : sert à « aimanter » le trait pour qu'il tombe juste
// au-dessus d'une ligne, jamais au milieu d'un mot. Vide si la page est une image.
const cacheLignes = new WeakMap();
async function lignesDe(pdf, num) {
  let m = cacheLignes.get(pdf);
  if (!m) { m = new Map(); cacheLignes.set(pdf, m); }
  if (m.has(num)) return m.get(num);
  const page = await pdf.getPage(num);
  const { width: W, height: H } = page.getViewport({ scale: 1 });
  const txt = await page.getTextContent();
  const res = [];
  txt.items.forEach((it) => { if (it.str && it.str.trim()) res.push({ x: it.transform[4] / W, y: Math.round(((H - it.transform[5] - (it.height || 10) * 0.9) / H) * 1000) / 1000 }); });
  m.set(num, res);
  return res;
}
async function aimanter(pdf, num, y, col = 0, cols = 1) {
  try {
    const l = (await lignesDe(pdf, num)).filter((i) => cols === 1 || (col === 0 ? i.x < 0.5 : i.x >= 0.5));
    let best = null;
    for (const v of l) if (v.y <= y + 0.004 && (best == null || v.y > best)) best = v.y;
    if (best != null && y - best < 0.05) return clamp01(best - 0.006);
  } catch (e) { /* page image : on garde la position exacte */ }
  return clamp01(y - 0.004);
}

function Vue({ pdf, num, marqueurs, zoom, cols, haut, bas, onPoser, onDeplacer, onFinDeplacer, onDebutDeplacer, onRetirer, onNumero }) {
  const canvas = useRef(null);
  const zone = useRef(null);
  const drag = useRef(null);
  const [ratio, setRatio] = useState(1.414);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    let actif = true; setPret(false);
    (async () => {
      const page = await pdf.getPage(num);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: RENDU / v1.width });
      if (!actif || !canvas.current) return;
      setRatio(vp.height / vp.width);
      const cv = canvas.current;
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      if (actif) setPret(true);
    })();
    return () => { actif = false; };
  }, [pdf, num]);

  const yDe = (e) => { const r = zone.current.getBoundingClientRect(); return clamp01((e.clientY - r.top) / r.height); };
  const colDe = (e) => { if (cols !== 2) return 0; const r = zone.current.getBoundingClientRect(); return (e.clientX - r.left) / r.width < 0.5 ? 0 : 1; };

  return (
    <div className="dc-vue" style={{ maxWidth: `${Math.round(760 * zoom)}px` }}>
      <div className="dc-page" ref={zone} style={{ aspectRatio: `1 / ${ratio}` }}>
        <canvas ref={canvas} onClick={(e) => onPoser(yDe(e), colDe(e))} aria-label={`Page ${num}`} />
        {!pret && <span className="dc-charge">Chargement de la page...</span>}
        {haut > 0 && <div className="dc-rogne" style={{ top: 0, height: `${haut * 100}%` }}><span>En-tête ignoré</span></div>}
        {bas > 0 && <div className="dc-rogne" style={{ bottom: 0, height: `${bas * 100}%` }}><span>Pied de page ignoré</span></div>}
        {cols === 2 && <div className="dc-milieu" />}
        {marqueurs.map((m) => (
          <div key={m._id} className="dc-trait" style={{ top: `${m.y * 100}%`, borderColor: COULEUR[m.k], ...(cols === 2 ? { left: m.c ? '50%' : 0, width: '50%', right: 'auto' } : {}) }}>
            <div
              className="dc-puce" style={{ background: COULEUR[m.k] }}
              onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: m._id, moved: false }; onDebutDeplacer(); }}
              onPointerMove={(e) => { if (!drag.current) return; drag.current.moved = true; onDeplacer(m._id, yDe(e)); }}
              onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && d.moved) onFinDeplacer(m._id, yDe(e)); }}
              title="Glisse pour ajuster la position"
            >
              <span className="dc-grip" aria-hidden="true">⠿</span>
              <b>{m.k === 'x' ? 'Ignoré' : `${NOM[m.k]} ${m.n}`}</b>
              {m.k !== 'x' && (
                <>
                  <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => onNumero(m._id, -1)} aria-label="Numéro précédent">−</button>
                  <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => onNumero(m._id, 1)} aria-label="Numéro suivant">+</button>
                </>
              )}
              <button type="button" className="dc-x" onPointerDown={(e) => e.stopPropagation()} onClick={() => onRetirer(m._id)} aria-label="Retirer ce trait">×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DecoupeAdmin() {
  const [liste, setListe] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [res, setRes] = useState(null);
  const [docs, setDocs] = useState({ s: null, c: null, urls: {} });
  const [doc, setDoc] = useState('s');
  const [page, setPage] = useState({ s: 1, c: 1 });
  const [zoom, setZoom] = useState(1);
  const [mise, setMise] = useState({ s: { col: 1, haut: 0, bas: 0 }, c: { col: 1, haut: 0, bas: 0 } });
  const [marqueurs, setMarqueurs] = useState([]);
  const histo = useRef([]);
  const [meta, setMeta] = useState({});
  const [outil, setOutil] = useState('ex');
  const [numPerso, setNumPerso] = useState(null);
  const [msg, setMsg] = useState({ texte: '', erreur: false });
  const [occupe, setOccupe] = useState(false);
  const [apercu, setApercu] = useState({ s: null, c: null });
  const [modifie, setModifie] = useState(false);

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

  // ---- historique (annuler) ------------------------------------------------
  const changer = useCallback((fn, { historique = true } = {}) => {
    setMarqueurs((a) => {
      if (historique) { histo.current.push(a); if (histo.current.length > 60) histo.current.shift(); }
      return trierMarqueurs(fn(a));
    });
    setModifie(true);
  }, []);
  const annuler = useCallback(() => {
    const prev = histo.current.pop();
    if (prev) { setMarqueurs(prev); setModifie(true); }
  }, []);

  // ---- ouverture d'un PDF ---------------------------------------------------
  const ouvrir = useCallback(async (r) => {
    setRes(r); setMsg({ texte: '', erreur: false }); setApercu({ s: null, c: null }); setModifie(false);
    setDocs({ s: null, c: null, urls: {} }); setDoc('s'); setPage({ s: 1, c: 1 }); setNumPerso(null); setOutil('ex');
    histo.current = [];
    const sauve = ((r.decoupe && r.decoupe.marqueurs) || []).map(avecId);
    setMarqueurs(sauve);
    const miseSauvee = (r.decoupe && r.decoupe.mise) || null;
    setMise({ s: { col: 1, haut: 0, bas: 0 }, c: { col: 1, haut: 0, bas: 0 }, ...(miseSauvee || {}) });
    const { data: ex } = await supabase.from('exercices').select('numero, titre, difficulte, bareme, duree_min').eq('ressource_id', r.id);
    const m = {};
    (ex || []).forEach((e) => { m[e.numero] = { titre: e.titre || '', difficulte: e.difficulte || '', bareme: e.bareme || '', duree_min: e.duree_min || '' }; });
    setMeta(m);
    try {
      const pdfjs = await chargerPdfjs();
      const charger = async (url) => { const signe = await urlSignee(url); return { pdf: await pdfjs.getDocument({ url: signe }).promise, url: signe }; };
      const s = await charger(r.url_fichier);
      const c = r.url_corrige ? await charger(r.url_corrige) : null;
      setDocs({ s: s.pdf, c: c && c.pdf, urls: { s: s.url, c: c && c.url } });
      // Premier découpage : on devine la mise en page (colonnes, en-tête, pied) puis les exercices (PDF avec texte)
      let m2 = { s: { col: 1, haut: 0, bas: 0 }, c: { col: 1, haut: 0, bas: 0 }, ...(miseSauvee || {}) };
      if (!miseSauvee) {
        m2 = { s: await analyserMiseEnPage(s.pdf).catch(() => m2.s), c: c ? await analyserMiseEnPage(c.pdf).catch(() => m2.c) : m2.c };
        setMise(m2);
      }
      if (!sauve.length) {
        let trouves = await detecterMarqueurs(s.pdf, 's', m2.s);
        if (c) trouves = trouves.concat(await detecterMarqueurs(c.pdf, 'c', m2.c));
        if (trouves.length) {
          setMarqueurs(trierMarqueurs(trouves.map((x) => avecId(nettoyer(x)))));
          const nb = new Set(trouves.filter((x) => x.k === 'ex').map((x) => x.n)).size;
          setModifie(true);
          setMsg({ texte: `J'ai deviné ${nb} exercice${nb > 1 ? 's' : ''}${m2.s.col === 2 ? ', sur deux colonnes' : ''} en lisant le PDF. Vérifie chaque trait (tu peux le glisser ou le retirer), puis enregistre.`, erreur: false });
        } else {
          setMsg({ texte: 'Ce PDF est une image : je ne peux pas deviner les exercices. Touche la page à chaque début d\'exercice, puis de correction.', erreur: false });
        }
      }
    } catch (e) { setMsg({ texte: 'Impossible d\'ouvrir ce PDF.', erreur: true }); }
  }, []);

  const pages = useMemo(() => ({ s: docs.s ? docs.s.numPages : 0, c: docs.c ? docs.c.numPages : 0 }), [docs]);
  const exercices = useMemo(() => exercicesDepuisMarqueurs(marqueurs.map(nettoyer), pages, mise), [marqueurs, pages, mise]);

  // ---- numérotation automatique ----------------------------------------------
  const maxEx = useMemo(() => Math.max(0, ...marqueurs.filter((m) => m.k === 'ex').map((m) => m.n)), [marqueurs]);
  const sansCorrige = useMemo(() => {
    const avec = new Set(marqueurs.filter((m) => m.k === 'co').map((m) => m.n));
    return [...new Set(marqueurs.filter((m) => m.k === 'ex').map((m) => m.n))].filter((n) => !avec.has(n)).sort((a, b) => a - b);
  }, [marqueurs]);
  const numAuto = outil === 'ex' ? maxEx + 1 : outil === 'co' ? (sansCorrige[0] || maxEx || 1) : 0;
  const num = outil === 'x' ? 0 : (numPerso != null ? numPerso : numAuto);

  const d = docs[doc];
  const nbPages = d ? d.numPages : 0;
  const pageCourante = Math.min(Math.max(1, page[doc]), Math.max(1, nbPages));
  const allerPage = useCallback((p, dd) => setPage((a) => ({ ...a, [dd || doc]: Math.min(Math.max(1, p), (docs[dd || doc] || { numPages: 1 }).numPages) })), [doc, docs]);

  const cols = mise[doc] && mise[doc].col === 2 ? 2 : 1;
  const poser = async (y, col = 0) => {
    if (!d) return;
    const yy = await aimanter(d, pageCourante, y, col, cols);
    const n = outil === 'x' ? 0 : num;
    changer((a) => [...a, avecId({ d: doc, p: pageCourante, c: col, y: Math.round(yy * 10000) / 10000, k: outil, n })]);
    setNumPerso(null);
    // Après avoir posé tous les débuts, on passe tout seul aux corrections
    if (outil === 'ex') setMsg({ texte: '', erreur: false });
  };
  const retirer = (id) => changer((a) => a.filter((m) => m._id !== id));
  const renumeroter = (id, delta) => changer((a) => a.map((m) => (m._id === id ? { ...m, n: Math.min(200, Math.max(1, m.n + delta)) } : m)));
  const debutDeplacer = () => { histo.current.push(marqueurs); if (histo.current.length > 60) histo.current.shift(); };
  const deplacer = (id, y) => setMarqueurs((a) => a.map((m) => (m._id === id ? { ...m, y: Math.round(clamp01(y) * 10000) / 10000 } : m)));
  const finDeplacer = async (id, y) => {
    const m = marqueurs.find((x) => x._id === id);
    const yy = m && d && m.d === doc ? await aimanter(d, m.p, y, m.c || 0, cols) : clamp01(y);
    setMarqueurs((a) => trierMarqueurs(a.map((x) => (x._id === id ? { ...x, y: Math.round(yy * 10000) / 10000 } : x))));
    setModifie(true);
  };

  const detecter = async () => {
    if (!docs.s) return;
    setMsg({ texte: 'Lecture du texte du PDF...', erreur: false });
    let trouves = await detecterMarqueurs(docs.s, 's', mise.s);
    if (docs.c) trouves = trouves.concat(await detecterMarqueurs(docs.c, 'c', mise.c));
    if (!trouves.length) { setMsg({ texte: 'Aucun mot « Exercice » ou « Solution » lisible : ce PDF est probablement une image scannée. Pose les traits à la main.', erreur: true }); return; }
    changer(() => trouves.map((x) => avecId(nettoyer(x))));
    const nb = new Set(trouves.filter((m) => m.k === 'ex').map((m) => m.n)).size;
    setMsg({ texte: `${nb} exercice${nb > 1 ? 's' : ''} deviné${nb > 1 ? 's' : ''}. Vérifie les traits, ajuste si besoin, puis enregistre.`, erreur: false });
  };

  const voir = (n, kind) => {
    const m = marqueurs.find((x) => x.k === kind && x.n === n);
    if (!m) return;
    setDoc(m.d); allerPage(m.p, m.d);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---- raccourcis clavier -----------------------------------------------------
  useEffect(() => {
    if (!res) return undefined;
    const f = (e) => {
      const t = e.target;
      if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); annuler(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); allerPage(pageCourante + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); allerPage(pageCourante - 1); }
      else if (e.key.toLowerCase() === 'e') { setOutil('ex'); setNumPerso(null); }
      else if (e.key.toLowerCase() === 'c') { setOutil('co'); setNumPerso(null); }
      else if (e.key.toLowerCase() === 'x') { setOutil('x'); setNumPerso(null); }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [res, pageCourante, allerPage, annuler]);

  // ---- méta, aperçu, enregistrement ---------------------------------------------
  const majMeta = (n, champ, v) => setMeta((p) => ({ ...p, [n]: { ...(p[n] || {}), [champ]: v } }));
  const urlsPour = () => ({ s: docs.urls.s, c: docs.urls.c || docs.urls.s });

  const faireApercu = async (sens) => {
    setMsg({ texte: 'Assemblage de l\'aperçu...', erreur: false });
    try {
      const items = exercices
        .filter((e) => sens === 'segments' || e.segments_corrige)
        .map((e) => ({ titre: `Exercice ${e.numero}`, chapitre: res.chapitres?.nom, segments: sens === 'segments' ? e.segments : e.segments_corrige, urls: urlsPour() }));
      if (!items.length) { setMsg({ texte: sens === 'segments' ? 'Aucun exercice défini.' : 'Aucune correction définie.', erreur: true }); return; }
      const { octets } = await assemblerPdf(items, { titre: 'Apercu', couverture: sens === 'segments', etiquette: sens === 'segments' ? 'Partie' : 'Corrigé' });
      const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
      const cle = sens === 'segments' ? 's' : 'c';
      setApercu((a) => { if (a[cle]) URL.revokeObjectURL(a[cle]); return { ...a, [cle]: url }; });
      window.open(url, '_blank', 'noopener');
      setMsg({ texte: 'Aperçu ouvert dans un nouvel onglet.', erreur: false });
    } catch (e) { setMsg({ texte: e.message || 'Aperçu impossible.', erreur: true }); }
  };

  const enregistrer = async () => {
    if (!res) return;
    setOccupe(true); setMsg({ texte: '', erreur: false });
    const ent = (v, min, max) => { const x = parseInt(v, 10); return Number.isFinite(x) && x >= min && x <= max ? x : null; };
    const lignes = exercices.map((e) => {
      const m = meta[e.numero] || {};
      return {
        ressource_id: res.id, numero: e.numero, titre: (m.titre || '').trim().slice(0, 120) || null,
        segments: e.segments, segments_corrige: e.segments_corrige,
        difficulte: ent(m.difficulte, 1, 3), bareme: ent(m.bareme, 1, 40), duree_min: ent(m.duree_min, 5, 360),
      };
    });
    const garder = new Set(lignes.map((l) => l.numero));
    const { data: anciens } = await supabase.from('exercices').select('numero').eq('ressource_id', res.id);
    const aSupprimer = (anciens || []).map((a) => a.numero).filter((n) => !garder.has(n));
    let err = null;
    if (aSupprimer.length) ({ error: err } = await supabase.from('exercices').delete().eq('ressource_id', res.id).in('numero', aSupprimer));
    if (!err && lignes.length) ({ error: err } = await supabase.from('exercices').upsert(lignes, { onConflict: 'ressource_id,numero' }));
    const decoupe = marqueurs.length ? { version: 2, mise, marqueurs: marqueurs.map(nettoyer) } : null;
    if (!err) ({ error: err } = await supabase.from('ressources').update({ decoupe }).eq('id', res.id));
    setOccupe(false);
    if (err) {
      setMsg({ texte: /exercices|decoupe/.test(err.message) && /exist|column|relation|schema/.test(err.message) ? 'Lance d\'abord le script SQL 23 dans Supabase.' : `Erreur : ${err.message}`, erreur: true });
      return;
    }
    setModifie(false);
    setListe((l) => l.map((r) => (r.id === res.id ? { ...r, decoupe } : r)));
    setMsg({ texte: lignes.length ? `Enregistré : ${lignes.length} exercice${lignes.length > 1 ? 's' : ''}. Ils sont maintenant tirés un par un dans l'Atelier.` : 'Découpage retiré : ce PDF sera de nouveau tiré en entier.', erreur: false });
  };

  const fermer = () => {
    if (modifie && !window.confirm('Tu as des changements non enregistrés. Quitter quand même ?')) return;
    setRes(null); setDocs({ s: null, c: null, urls: {} }); setMsg({ texte: '', erreur: false });
  };

  // ---- avertissements -------------------------------------------------------------
  const alertes = useMemo(() => {
    const a = [];
    if (!exercices.length) return a;
    const nums = exercices.map((e) => e.numero);
    const manquants = [];
    for (let i = 1; i < Math.max(...nums); i++) if (!nums.includes(i)) manquants.push(i);
    if (manquants.length) a.push(`Numéro${manquants.length > 1 ? 's' : ''} manquant${manquants.length > 1 ? 's' : ''} : ${manquants.join(', ')}`);
    if (sansCorrige.length) a.push(`Sans correction : exercice${sansCorrige.length > 1 ? 's' : ''} ${sansCorrige.join(', ')}`);
    const orphelins = marqueurs.filter((m) => m.k === 'co' && !nums.includes(m.n)).map((m) => m.n);
    if (orphelins.length) a.push(`Correction sans exercice : ${[...new Set(orphelins)].join(', ')}`);
    return a;
  }, [exercices, marqueurs, sansCorrige]);

  // ======================== rendu ===================================================
  if (!res) {
    return (
      <div>
        <p className="dc-aide" style={{ marginBottom: 14 }}>
          Choisis un PDF d'exercices ou d'annale. L'Atelier pourra alors tirer les exercices un par un, avec leur corrigé.
        </p>
        {msg.texte && <p className={msg.erreur ? 'error-text' : 'success-text'} role="status">{msg.texte}</p>}
        <div className="field">
          <label htmlFor="dc-rech">Retrouver le PDF</label>
          <input id="dc-rech" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Titre, chapitre ou matière..." />
        </div>
        <div className="dc-liste" role="listbox" aria-label="PDF">
          {filtre.map((r) => (
            <button type="button" key={r.id} className="dc-item" onClick={() => ouvrir(r)}>
              <b>{r.titre}</b>
              <small>{r.chapitres?.matieres?.niveaux?.nom} · {r.chapitres?.matieres?.nom} · {r.chapitres?.nom}</small>
              {r.decoupe && <em>Découpé</em>}
            </button>
          ))}
          {!filtre.length && <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>Aucun PDF trouvé.</p>}
        </div>
      </div>
    );
  }

  const marqueursPage = marqueurs.filter((m) => m.d === doc && m.p === pageCourante);
  const pagesAvecTrait = new Set(marqueurs.filter((m) => m.d === doc).map((m) => m.p));
  const outilActif = OUTILS.find((o) => o.k === outil);

  return (
    <div className="dc-ws-wrap">
      <div className="dc-haut">
        <button type="button" className="btn-light" onClick={fermer}>← Changer de PDF</button>
        <div className="dc-titre">
          <b>{res.titre}</b>
          <small>{res.chapitres?.matieres?.niveaux?.nom} · {res.chapitres?.matieres?.nom} · {res.chapitres?.nom}</small>
        </div>
        {modifie && <span className="dc-modif">Non enregistré</span>}
      </div>
      {msg.texte && <p className={msg.erreur ? 'error-text' : 'success-text'} role="status">{msg.texte}</p>}

      <div className="dc-ws">
        <section className="dc-main" aria-label="Pages du PDF">
          <div className="dc-nav">
            {res.url_corrige && (
              <div className="segmented">
                <button type="button" className={doc === 's' ? 'active' : ''} onClick={() => setDoc('s')}>PDF du sujet</button>
                <button type="button" className={doc === 'c' ? 'active' : ''} onClick={() => setDoc('c')}>PDF du corrigé</button>
              </div>
            )}
            <div className="dc-pager">
              <button type="button" onClick={() => allerPage(pageCourante - 1)} disabled={pageCourante <= 1} aria-label="Page précédente">‹</button>
              <label>Page <input type="number" min="1" max={nbPages || 1} value={pageCourante} onChange={(e) => allerPage(parseInt(e.target.value, 10) || 1)} /> / {nbPages || '...'}</label>
              <button type="button" onClick={() => allerPage(pageCourante + 1)} disabled={pageCourante >= nbPages} aria-label="Page suivante">›</button>
            </div>
            <div className="dc-zoom">
              <button type="button" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))} aria-label="Réduire">−</button>
              <span>{Math.round(zoom * 100)} %</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.15).toFixed(2)))} aria-label="Agrandir">+</button>
            </div>
          </div>

          {!d && !msg.erreur && <p style={{ color: 'var(--ink-soft)' }}>Ouverture du PDF...</p>}
          {d && (
            <Vue
              key={`${res.id}-${doc}-${pageCourante}`} pdf={d} num={pageCourante} zoom={zoom} cols={cols} haut={(mise[doc] || {}).haut || 0} bas={(mise[doc] || {}).bas || 0} marqueurs={marqueursPage}
              onPoser={poser} onDeplacer={deplacer} onDebutDeplacer={debutDeplacer} onFinDeplacer={finDeplacer}
              onRetirer={retirer} onNumero={renumeroter}
            />
          )}

          {nbPages > 1 && (
            <div className="dc-grille" aria-label="Aller à une page">
              {Array.from({ length: nbPages }, (_, i) => i + 1).map((p) => (
                <button type="button" key={p} className={`${p === pageCourante ? 'on' : ''}${pagesAvecTrait.has(p) ? ' trait' : ''}`} onClick={() => allerPage(p)} aria-label={`Page ${p}`}>{p}</button>
              ))}
            </div>
          )}
        </section>

        <aside className="dc-side" aria-label="Outils de découpage">
          <div className="dc-outils" role="radiogroup" aria-label="Que veux-tu marquer ?">
            {OUTILS.map((o) => (
              <button type="button" key={o.k} role="radio" aria-checked={outil === o.k} className={outil === o.k ? 'on' : ''} style={{ '--c': o.couleur }} onClick={() => { setOutil(o.k); setNumPerso(null); }}>
                <i style={{ background: o.couleur }} /> <span>{o.l}</span> <kbd>{o.touche}</kbd>
              </button>
            ))}
          </div>

          <div className="dc-consigne" style={{ borderColor: outilActif.couleur }}>
            {outil === 'x'
              ? <p>Touche la page là où commence une zone à <b>ne pas copier</b> (titre, numéro de page, pub). Elle dure jusqu'au trait suivant.</p>
              : (
                <>
                  <p>Touche la page là où {outil === 'ex' ? <>l'<b>exercice</b></> : <>la <b>correction</b> de l'exercice</>} commence.</p>
                  <div className="dc-stepper">
                    <button type="button" onClick={() => setNumPerso(Math.max(1, num - 1))} aria-label="Numéro précédent">−</button>
                    <b>N° {num}</b>
                    <button type="button" onClick={() => setNumPerso(Math.min(200, num + 1))} aria-label="Numéro suivant">+</button>
                    <small>{numPerso == null ? 'automatique' : 'choisi par toi'}</small>
                  </div>
                </>
              )}
            <small className="dc-tip">Le trait se cale tout seul au-dessus de la ligne de texte la plus proche. Tu peux ensuite le glisser pour l'ajuster.</small>
          </div>

          <div className="dc-rapide">
            <button type="button" className="btn-light" onClick={detecter} disabled={!docs.s}>Deviner depuis le texte</button>
            <button type="button" className="btn-light" onClick={annuler} disabled={!histo.current.length && !modifie} title="Ctrl + Z">Annuler</button>
            <button type="button" className="btn-light btn-danger" onClick={() => { if (!marqueurs.length || window.confirm('Effacer tous les traits ?')) changer(() => []); }} disabled={!marqueurs.length}>Tout effacer</button>
          </div>

          <details className="dc-mise">
            <summary>Mise en page du PDF{cols === 2 ? ' · 2 colonnes' : ''}</summary>
            <div className="dc-mise-corps">
              <div className="segmented" role="radiogroup" aria-label="Colonnes">
                <button type="button" role="radio" aria-checked={cols === 1} className={cols === 1 ? 'active' : ''} onClick={() => setMise((m) => ({ ...m, [doc]: { ...m[doc], col: 1 } }))}>1 colonne</button>
                <button type="button" role="radio" aria-checked={cols === 2} className={cols === 2 ? 'active' : ''} onClick={() => setMise((m) => ({ ...m, [doc]: { ...m[doc], col: 2 } }))}>2 colonnes</button>
              </div>
              <label>En-tête ignoré : {Math.round(((mise[doc] || {}).haut || 0) * 100)} %
                <input type="range" min="0" max="15" step="0.5" value={Math.round(((mise[doc] || {}).haut || 0) * 1000) / 10} onChange={(e) => setMise((m) => ({ ...m, [doc]: { ...m[doc], haut: Number(e.target.value) / 100 } }))} />
              </label>
              <label>Pied de page ignoré : {Math.round(((mise[doc] || {}).bas || 0) * 100)} %
                <input type="range" min="0" max="15" step="0.5" value={Math.round(((mise[doc] || {}).bas || 0) * 1000) / 10} onChange={(e) => setMise((m) => ({ ...m, [doc]: { ...m[doc], bas: Number(e.target.value) / 100 } }))} />
              </label>
              <small>Pour un PDF en deux colonnes, lis d'abord la colonne de gauche, puis celle de droite : un exercice peut passer de l'une à l'autre. Les bandes grisées (titre répété, numéro de page) ne sont jamais copiées.</small>
            </div>
          </details>

          <h3 className="dc-liste-t">
            {exercices.length} exercice{exercices.length > 1 ? 's' : ''}
            <small>{exercices.filter((e) => e.segments_corrige).length} avec correction</small>
          </h3>
          {alertes.length > 0 && (
            <ul className="dc-alertes" role="status">{alertes.map((a) => <li key={a}>{a}</li>)}</ul>
          )}
          <div className="dc-exs">
            {exercices.map((e) => (
              <details className="dc-ex" key={e.numero}>
                <summary>
                  <b>Exercice {e.numero}</b>
                  <span className={e.segments_corrige ? 'ok' : 'pas'}>{e.segments_corrige ? 'Corrigé lié' : 'Sans corrigé'}</span>
                  <span className="dc-voir">
                    <button type="button" onClick={(ev) => { ev.preventDefault(); voir(e.numero, 'ex'); }}>Voir</button>
                    {e.segments_corrige && <button type="button" onClick={(ev) => { ev.preventDefault(); voir(e.numero, 'co'); }}>Correction</button>}
                  </span>
                </summary>
                <div className="dc-meta">
                  <input placeholder="Titre (facultatif)" value={(meta[e.numero] || {}).titre || ''} onChange={(ev) => majMeta(e.numero, 'titre', ev.target.value)} maxLength={120} />
                  <select value={(meta[e.numero] || {}).difficulte || ''} onChange={(ev) => majMeta(e.numero, 'difficulte', ev.target.value)} aria-label="Difficulté">
                    <option value="">Difficulté</option><option value="1">Accessible</option><option value="2">Abordable</option><option value="3">Exigeant</option>
                  </select>
                  <input type="number" min="1" max="40" placeholder="Barème (pts)" value={(meta[e.numero] || {}).bareme || ''} onChange={(ev) => majMeta(e.numero, 'bareme', ev.target.value)} aria-label="Barème en points" />
                  <input type="number" min="5" max="360" placeholder="Durée (min)" value={(meta[e.numero] || {}).duree_min || ''} onChange={(ev) => majMeta(e.numero, 'duree_min', ev.target.value)} aria-label="Durée en minutes" />
                </div>
              </details>
            ))}
            {!exercices.length && <p className="dc-vide">Aucun exercice pour l'instant. Touche la page au début du premier exercice.</p>}
          </div>

          <div className="dc-actions">
            <button type="button" className="btn-primary" onClick={enregistrer} disabled={occupe}>{occupe ? 'Enregistrement...' : exercices.length ? 'Enregistrer le découpage' : 'Retirer le découpage'}</button>
            <div className="dc-apercus">
              <button type="button" className="btn-light" onClick={() => faireApercu('segments')} disabled={!exercices.length}><Icon name="eye" size={15} /> Aperçu du sujet</button>
              <button type="button" className="btn-light" onClick={() => faireApercu('corrige')} disabled={!exercices.length}><Icon name="eye" size={15} /> Aperçu du corrigé</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
