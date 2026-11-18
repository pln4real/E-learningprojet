'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';
import { signerRessources, cheminStockage } from '../../../lib/media';
import { assemblerPdf, dureeDe, baremeDe, formatDuree, formatChrono, DIFFICULTES } from '../../../lib/atelier';
import AtelierShell from '../../components/AtelierShell';
import PdfPages from '../../components/PdfPages';
import Icon from '../../components/Icon';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAREME_DEFAUT = 4;

const ETATS = [
  { k: 'reussi', l: 'Réussi' },
  { k: 'a_revoir', l: 'À revoir' },
  { k: 'rate', l: 'Raté' },
];

function lireSession(cle) { try { return JSON.parse(localStorage.getItem(cle) || 'null'); } catch (e) { return null; } }
function ecrireSession(cle, v) { try { if (v) localStorage.setItem(cle, JSON.stringify(v)); else localStorage.removeItem(cle); } catch (e) { /* facultatif */ } }

function Fiche({ r }) {
  const d = r.difficulte ? DIFFICULTES[r.difficulte] : null;
  return (
    <div className="at-fiche">
      <span><small>Durée conseillée</small><b>{formatDuree(dureeDe(r))}</b></span>
      <span><small>Barème</small><b>{baremeDe(r) ? `${baremeDe(r)} pts` : 'Non précisé'}</b></span>
      <span><small>Difficulté</small><b>{d ? (
        <><i className={`at-niv n${r.difficulte}`} aria-hidden="true"><u /><u /><u /></i>{d}</>
      ) : 'Non précisée'}</b></span>
      <span><small>Calculatrice</small><b>{r.calculatrice === 'autorisee' ? 'Autorisée' : r.calculatrice === 'interdite' ? 'Interdite' : 'Non précisé'}</b></span>
    </div>
  );
}

function Contenu() {
  const params = useSearchParams();
  const ids = useMemo(() => (params.get('r') || '').split(',').filter((x) => UUID.test(x)).slice(0, 8), [params]);
  const cle = 'atelier-session-' + ids.join('_');

  const [etat, setEtat] = useState('chargement'); // chargement | deconnecte | vide | pret
  const [items, setItems] = useState([]);
  const [manquants, setManquants] = useState(0);
  const [phase, setPhase] = useState('apercu'); // apercu | travail | fini
  const [mode, setMode] = useState('chrono'); // chrono | libre
  const [debut, setDebut] = useState(null);
  const [duree, setDuree] = useState(null); // secondes passées, une fois fini
  const [maintenant, setMaintenant] = useState(Date.now());
  const [pdfUrl, setPdfUrl] = useState(null);
  const [assemblage, setAssemblage] = useState('');
  const [erreur, setErreur] = useState('');
  const [evals, setEvals] = useState({}); // id -> { etat, note }
  const [favoris, setFavoris] = useState(() => new Set());
  const [corrige, setCorrige] = useState({}); // id -> { url | null | 'absent' | 'erreur' }
  const [ouvert, setOuvert] = useState(null);
  const [revoirSujet, setRevoirSujet] = useState(false);
  const [copie, setCopie] = useState(false);
  const timers = useRef({});

  const totalSec = useMemo(() => items.reduce((s, r) => s + dureeDe(r) * 60, 0), [items]);
  const totalPts = useMemo(() => items.reduce((s, r) => s + (baremeDe(r) || BAREME_DEFAUT), 0), [items]);

  // Chargement
  useEffect(() => {
    if (!ids.length) { setEtat('vide'); return; }
    let actif = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!actif) return;
      if (!user) { setEtat('deconnecte'); return; }
      const { data, error } = await supabase.from('ressources')
        .select('id, chapitre_id, type, titre, url_fichier, url_corrige, duree_min, bareme, difficulte, calculatrice, chapitres(nom, matieres(nom, niveaux(nom)))')
        .in('id', ids).eq('statut', 'publie');
      if (!actif) return;
      if (error || !data || !data.length) { setEtat('vide'); return; }
      const ordre = new Map(ids.map((x, i) => [x, i]));
      const tries = data.filter((r) => r.url_fichier).sort((a, b) => ordre.get(a.id) - ordre.get(b.id));
      if (!tries.length) { setEtat('vide'); return; }
      const signes = await signerRessources(supabase, tries);
      if (!actif) return;
      setItems(signes); setManquants(ids.length - signes.length);
      const [ev, fav] = await Promise.all([
        supabase.from('atelier_evaluations').select('ressource_id, etat, note').in('ressource_id', ids),
        supabase.from('atelier_favoris').select('ressource_id').in('ressource_id', ids),
      ]);
      if (!actif) return;
      const e = {};
      (ev.data || []).forEach((x) => { e[x.ressource_id] = { etat: x.etat, note: x.note }; });
      setEvals(e);
      setFavoris(new Set((fav.data || []).map((x) => x.ressource_id)));
      const s = lireSession(cle);
      if (s && s.phase) { setPhase(s.phase); setMode(s.mode || 'chrono'); setDebut(s.debut || null); setDuree(s.duree || null); }
      setEtat('pret');
    })();
    return () => { actif = false; };
  }, [ids, cle]);

  // Assemble le PDF du sujet (au démarrage, ou à la reprise après un rechargement)
  const assembler = useCallback(async (liste) => {
    setErreur(''); setAssemblage('Assemblage du sujet...');
    try {
      const mat = liste[0]?.chapitres?.matieres;
      const { octets } = await assemblerPdf(
        liste.map((r) => ({ titre: r.titre, chapitre: r.chapitres?.nom, url: r.url_fichier_vue || r.url_fichier })),
        { titre: liste.length > 1 ? `Sujet d'entrainement - ${liste.length} exercices` : "Sujet d'entrainement", sousTitre: [mat?.nom, mat?.niveaux?.nom].filter(Boolean).join(' - ') },
      );
      const url = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
      setPdfUrl((ancien) => { if (ancien) URL.revokeObjectURL(ancien); return url; });
      setAssemblage('');
      return true;
    } catch (e) {
      setAssemblage('');
      setErreur(e && e.message ? e.message : "Le sujet n'a pas pu être assemblé. Réessaie.");
      return false;
    }
  }, []);

  useEffect(() => {
    if (etat === 'pret' && phase !== 'apercu' && !pdfUrl && !assemblage && !erreur) assembler(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat, phase]);

  // Chrono
  useEffect(() => {
    if (phase !== 'travail') return;
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  async function demarrer(m) {
    const ok = await assembler(items);
    if (!ok) return;
    const d = Date.now();
    setMode(m); setDebut(d); setMaintenant(d); setPhase('travail'); setDuree(null);
    ecrireSession(cle, { phase: 'travail', mode: m, debut: d });
  }
  function terminer() {
    const sec = debut ? Math.round((Date.now() - debut) / 1000) : null;
    setDuree(sec); setPhase('fini');
    ecrireSession(cle, { phase: 'fini', mode, debut, duree: sec });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function recommencer() {
    ecrireSession(cle, null);
    setPhase('apercu'); setDebut(null); setDuree(null); setOuvert(null); setRevoirSujet(false);
    setPdfUrl((a) => { if (a) URL.revokeObjectURL(a); return null; });
  }

  const reste = debut ? totalSec - Math.floor((maintenant - debut) / 1000) : totalSec;
  const depasse = reste < 0;

  // Suivi : auto-évaluation, note simulée, favoris
  function sauverEval(id, patch) {
    const nouveau = { ...(evals[id] || {}), ...patch };
    setEvals((p) => ({ ...p, [id]: nouveau }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const r = items.find((x) => x.id === id);
      await supabase.from('atelier_evaluations').upsert({
        user_id: user.id, ressource_id: id, etat: nouveau.etat || null,
        note: nouveau.note == null ? null : nouveau.note, bareme: r ? (baremeDe(r) || BAREME_DEFAUT) : null, maj: new Date().toISOString(),
      });
    }, patch.note !== undefined ? 500 : 0);
  }
  async function basculerFavori(id) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const on = favoris.has(id);
    setFavoris((p) => { const n = new Set(p); if (on) n.delete(id); else n.add(id); return n; });
    if (on) await supabase.from('atelier_favoris').delete().eq('ressource_id', id).eq('user_id', user.id);
    else await supabase.from('atelier_favoris').upsert({ user_id: user.id, ressource_id: id });
  }

  // Corrigé : lien temporaire demandé seulement quand l'élève le réclame
  async function afficherCorrige(r) {
    if (ouvert === r.id) { setOuvert(null); return; }
    setOuvert(r.id);
    if (corrige[r.id]) return;
    const chemin = cheminStockage(r.url_corrige);
    if (!chemin) { setCorrige((p) => ({ ...p, [r.id]: 'absent' })); return; }
    const { data, error } = await supabase.storage.from('ressources').createSignedUrl(chemin, 3600);
    setCorrige((p) => ({ ...p, [r.id]: error || !data?.signedUrl ? 'erreur' : { url: data.signedUrl } }));
  }

  const lien = typeof window !== 'undefined' ? `${window.location.origin}/atelier/sujet?r=${ids.join(',')}` : '';
  async function partager() {
    const texte = 'Voici un sujet d\'entraînement sur RéussirBac SN. Il faut un compte (gratuit) pour y accéder.';
    try {
      if (navigator.share) { await navigator.share({ title: 'Sujet d\'entraînement', text: texte, url: lien }); return; }
    } catch (e) { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(texte + ' ' + lien)}`, '_blank', 'noopener');
  }
  async function copierLien() {
    try { await navigator.clipboard.writeText(lien); setCopie(true); setTimeout(() => setCopie(false), 2000); } catch (e) { /* ignoré */ }
  }

  const noteTotale = items.reduce((s, r) => s + (evals[r.id]?.note || 0), 0);
  const sur20 = totalPts ? (noteTotale / totalPts) * 20 : 0;

  if (etat === 'chargement') return <AtelierShell><p className="at-muted">Chargement...</p></AtelierShell>;
  if (etat === 'deconnecte') {
    return (
      <AtelierShell retour={{ href: '/', label: 'Accueil' }}>
        <section className="at-carte at-bloque">
          <span className="at-pastille"><Icon name="lock" size={22} /></span>
          <h1 className="at-titre">Un compte est nécessaire</h1>
          <p className="at-muted">L'Atelier d'entraînement est réservé aux élèves connectés. Crée ton compte gratuit pour ouvrir ce sujet.</p>
          <div className="at-actions">
            <Link href="/inscription" className="at-btn at-btn-hib">Créer mon compte gratuit</Link>
            <Link href="/login" className="at-btn">Me connecter</Link>
          </div>
        </section>
      </AtelierShell>
    );
  }
  if (etat === 'vide') {
    return (
      <AtelierShell retour={{ href: '/atelier', label: 'Atelier' }}>
        <section className="at-carte at-bloque">
          <h1 className="at-titre">Sujet introuvable</h1>
          <p className="at-muted">Ce sujet n'existe plus ou n'est pas ouvert à ton compte (certains sujets sont réservés aux abonnés).</p>
          <div className="at-actions"><Link href="/atelier" className="at-btn at-btn-hib">Générer un autre sujet</Link></div>
        </section>
      </AtelierShell>
    );
  }

  const barre = phase === 'travail' && (
    <div className={`at-chrono${mode === 'chrono' && depasse ? ' depasse' : ''}`} role="timer" aria-live="off">
      <Icon name="timer" size={16} />
      {mode === 'chrono' ? <b>{depasse ? '+' : ''}{formatChrono(Math.abs(reste))}</b> : <b>{formatChrono((maintenant - (debut || maintenant)) / 1000)}</b>}
      <small>{mode === 'chrono' ? (depasse ? 'Temps dépassé' : 'Temps restant') : 'Sans limite'}</small>
    </div>
  );

  return (
    <AtelierShell titre={phase === 'fini' ? 'Correction' : 'Ton sujet'} retour={{ href: '/atelier', label: 'Atelier' }} droite={barre || null}>
      <p className="at-fil">{items.length} exercice{items.length > 1 ? 's' : ''} · {formatDuree(totalSec / 60)} · {totalPts} pts</p>

      {manquants > 0 && <p className="at-note"><Icon name="lock" size={14} /> {manquants} sujet{manquants > 1 ? 's' : ''} de ce lien ne sont pas accessibles avec ton compte.</p>}

      {phase === 'apercu' && (
        <>
          <section className="at-carte at-chrono-carte">
            <span className="at-pastille"><Icon name="timer" size={22} /></span>
            <div>
              <h2 className="at-titre2">S'entraîner en conditions réelles</h2>
              <p className="at-muted">Chrono de {formatDuree(totalSec / 60)}, puis le corrigé. Pas de pause : comme le jour de l'examen.</p>
            </div>
          </section>
          {erreur && <p className="at-erreur" role="alert">{erreur}</p>}
          {assemblage && <p className="at-muted" role="status">{assemblage}</p>}
          <div className="at-actions at-col">
            <button type="button" className="at-btn at-btn-hib at-gros" onClick={() => demarrer('chrono')} disabled={!!assemblage}>
              <Icon name="timer" size={18} /> Démarrer le chrono
            </button>
            <button type="button" className="at-btn" onClick={() => demarrer('libre')} disabled={!!assemblage}>Travailler sans chrono</button>
          </div>
          <p className="at-essai"><Icon name="eye" size={14} /> Essaie d'abord : le corrigé sera toujours là quand tu auras fini.</p>
        </>
      )}

      {phase !== 'travail' && <h2 className="at-section">Au programme</h2>}
      {phase !== 'travail' && items.map((r, i) => (
        <article className="at-carte at-sujet" key={r.id}>
          <div className="at-sujet-tete">
            <div>
              <small className="at-kicker">{r.type === 'annale' ? 'Annale' : 'Exercice'} · {r.chapitres?.matieres?.nom}</small>
              <h3 className="at-titre3">{i + 1}. {r.titre}</h3>
              <p className="at-muted at-petit">{r.chapitres?.nom}</p>
            </div>
            <button type="button" className={`at-icone${favoris.has(r.id) ? ' on' : ''}`} onClick={() => basculerFavori(r.id)} aria-pressed={favoris.has(r.id)} aria-label={favoris.has(r.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
              <Icon name="star" size={18} />
            </button>
          </div>
          <Fiche r={r} />

          {phase === 'fini' && (
            <div className="at-suivi-ex">
              <button type="button" className="at-corrige" onClick={() => afficherCorrige(r)} aria-expanded={ouvert === r.id}>
                <Icon name="eye" size={16} /> {ouvert === r.id ? 'Masquer le corrigé' : 'Afficher le corrigé'}
              </button>
              {ouvert === r.id && (
                <div className="at-corrige-zone">
                  {!corrige[r.id] && <p className="at-muted">Chargement du corrigé...</p>}
                  {corrige[r.id] === 'absent' && <p className="at-muted">Le corrigé de ce sujet n'est pas encore disponible.</p>}
                  {corrige[r.id] === 'erreur' && <p className="at-erreur">Le corrigé n'a pas pu être ouvert. Réessaie dans un instant.</p>}
                  {corrige[r.id] && corrige[r.id].url && <div className="at-pdf"><PdfPages url={corrige[r.id].url} titre={'Corrigé : ' + r.titre} secours={corrige[r.id].url} /></div>}
                </div>
              )}

              <p className="at-label">Je m'évalue</p>
              <div className="at-evals" role="group" aria-label="Auto-évaluation">
                {ETATS.map((e) => (
                  <button key={e.k} type="button" aria-pressed={evals[r.id]?.etat === e.k} className={`at-eval ${e.k}${evals[r.id]?.etat === e.k ? ' on' : ''}`} onClick={() => sauverEval(r.id, { etat: evals[r.id]?.etat === e.k ? null : e.k })}>
                    {e.l}
                  </button>
                ))}
              </div>
              <label className="at-curseur">
                <span>Simuler ma note : <b>{(evals[r.id]?.note ?? 0)} / {baremeDe(r) || BAREME_DEFAUT} pts</b>{!baremeDe(r) && <small> (barème estimé)</small>}</span>
                <input type="range" min="0" max={baremeDe(r) || BAREME_DEFAUT} step="0.5" value={evals[r.id]?.note ?? 0} onChange={(e) => sauverEval(r.id, { note: Number(e.target.value) })} />
              </label>
            </div>
          )}
        </article>
      ))}

      {phase === 'travail' && (
        <>
          {assemblage && <p className="at-muted" role="status">{assemblage}</p>}
          {erreur && <p className="at-erreur" role="alert">{erreur} <button type="button" className="at-lien" onClick={() => assembler(items)}>Réessayer</button></p>}
          {pdfUrl && <div className="at-pdf"><PdfPages url={pdfUrl} titre="Sujet d'entraînement" secours={pdfUrl} /></div>}
          <div className="at-actions at-col">
            {pdfUrl && <a className="at-btn" href={pdfUrl} download="sujet-entrainement.pdf"><Icon name="download" size={16} /> Télécharger le sujet (PDF)</a>}
            <button type="button" className="at-btn at-btn-hib at-gros" onClick={terminer}><Icon name="checkCircle" size={18} /> J'ai terminé, voir le corrigé</button>
          </div>
        </>
      )}

      {phase === 'fini' && (
        <>
          <section className="at-carte at-note-totale">
            <h2 className="at-titre2">Ma note simulée</h2>
            <p className="at-grand"><b>{noteTotale % 1 === 0 ? noteTotale : noteTotale.toFixed(1)}</b> / {totalPts} pts <span>→ <b>{sur20.toFixed(1).replace('.', ',')}</b> / 20</span></p>
            {duree != null && <p className="at-muted at-petit">Temps passé : {formatChrono(duree)}{mode === 'chrono' ? ` sur ${formatChrono(totalSec)} prévus` : ''}.</p>}
          </section>
          <div className="at-actions at-col">
            <button type="button" className="at-btn" onClick={() => { setRevoirSujet((v) => !v); if (!pdfUrl) assembler(items); }}>
              <Icon name="file" size={16} /> {revoirSujet ? 'Masquer le sujet' : 'Revoir le sujet'}
            </button>
            {revoirSujet && pdfUrl && <div className="at-pdf"><PdfPages url={pdfUrl} titre="Sujet d'entraînement" secours={pdfUrl} /></div>}
            <button type="button" className="at-btn" onClick={partager}><Icon name="share" size={16} /> Partager ce sujet</button>
            <button type="button" className="at-btn" onClick={copierLien}><Icon name="copy" size={16} /> {copie ? 'Lien copié' : 'Copier le lien'}</button>
            <button type="button" className="at-btn" onClick={recommencer}><Icon name="refresh" size={16} /> Refaire ce sujet</button>
            <Link href="/atelier" className="at-btn at-btn-hib"><Icon name="shuffle" size={16} /> Générer un autre sujet</Link>
          </div>
          <p className="at-muted at-petit">Un ami doit avoir un compte (gratuit) pour ouvrir le lien.</p>
        </>
      )}
    </AtelierShell>
  );
}

export default function SujetPage() {
  return <Suspense fallback={<AtelierShell><p className="at-muted">Chargement...</p></AtelierShell>}><Contenu /></Suspense>;
}
