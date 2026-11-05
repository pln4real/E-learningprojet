'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import {
  chargerPdfjs, peutLireAbonnes, lireOctets, garderHorsLigne, lireHorsLigne, supprimerHorsLigne,
  toutHorsLigne, copieValide, horsLigneDisponible, memoPage, retenirPage, libelleCategorie,
} from '../../../lib/biblio';
import Topbar from '../../components/Topbar';
import Icon from '../../components/Icon';

function Lecteur() {
  const id = useSearchParams().get('id');
  const [etat, setEtat] = useState('chargement'); // chargement | lecture | verrouille | introuvable | deconnecte | erreur
  const [doc, setDoc] = useState(null);
  const [user, setUser] = useState(null);
  const [nbPages, setNbPages] = useState(0);
  const [pageCourante, setPageCourante] = useState(1);
  const [ratio, setRatio] = useState(1.41);
  const [favori, setFavori] = useState(false);
  const [abonne, setAbonne] = useState(false);
  const [local, setLocal] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [reprise, setReprise] = useState(0);
  const [info, setInfo] = useState('');

  const pdfRef = useRef(null);
  const octetsRef = useRef(null);
  const pagesRef = useRef([]);       // éléments .bl-page
  const rendues = useRef(new Set());
  const enCours = useRef(new Set());
  const zoneRef = useRef(null);
  const minuteur = useRef(null);
  const marque = useRef('');

  // ---------- Chargement du document ----------
  useEffect(() => {
    if (!id) { setEtat('introuvable'); return; }
    let actif = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (actif) setEtat('deconnecte'); return; }
      const u = session.user;
      setUser(u);
      marque.current = `${u.email || 'élève'}  ·  ${new Date().toLocaleDateString('fr-FR')}`;
      const online = navigator.onLine;
      let d = null; let droit = null; let copie = null;
      try { copie = (await toutHorsLigne(u.id)).find((e) => e.id === id) || null; } catch (e) {}
      if (online) {
        try {
          const r = await supabase.from('documents').select('*').eq('id', id).maybeSingle();
          d = r.data || null;
          if (!r.error && !d) { if (actif) setEtat('introuvable'); return; }
        } catch (e) {}
      }
      if (!d && copie) d = copie.meta;
      if (!d) { if (actif) setEtat(online ? 'erreur' : 'introuvable'); return; }
      setDoc(d);

      if (online) {
        const abo = await peutLireAbonnes();
        droit = d.acces === 'gratuit' ? true : abo;
        setAbonne(abo === true);
        const f = await supabase.from('favoris_documents').select('document_id').eq('document_id', id).eq('user_id', u.id).maybeSingle();
        if (actif) setFavori(!!f.data);
      } else {
        droit = d.acces === 'gratuit' ? true : copieValide(copie);
        setAbonne(true);
      }
      if (!actif) return;
      if (droit === false) { setEtat('verrouille'); return; }
      setLocal(!!copie);

      try {
        let octets = null;
        if (copie && copieValide(copie)) { try { octets = await lireHorsLigne(id); } catch (e) {} }
        if (!octets) octets = await lireOctets(d.chemin_fichier);
        if (!actif) return;
        octetsRef.current = octets;
        const pdfjs = await chargerPdfjs();
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(octets.slice(0)) }).promise;
        if (!actif) return;
        pdfRef.current = pdf;
        const p1 = await pdf.getPage(1);
        const v = p1.getViewport({ scale: 1 });
        setRatio(v.height / v.width);
        setNbPages(pdf.numPages);
        let depart = memoPage(id);
        if (online) {
          const l = await supabase.from('lecture_documents').select('page').eq('document_id', id).eq('user_id', u.id).maybeSingle();
          if (l.data?.page) depart = Math.max(depart, l.data.page);
        }
        if (depart > 1 && depart <= pdf.numPages) setReprise(depart);
        setEtat('lecture');
      } catch (e) {
        if (actif) setEtat('erreur');
      }
    })();
    return () => { actif = false; };
  }, [id]);

  // ---------- Dessin des pages (seulement celles qu'on voit) ----------
  const dessiner = useCallback(async (n) => {
    const pdf = pdfRef.current;
    const hote = pagesRef.current[n - 1];
    if (!pdf || !hote || rendues.current.has(n) || enCours.current.has(n)) return;
    enCours.current.add(n);
    try {
      const page = await pdf.getPage(n);
      const largeurCss = hote.clientWidth || 360;
      const v1 = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const echelle = (largeurCss / v1.width) * dpr;
      const vp = page.getViewport({ scale: echelle });
      let canvas = hote.querySelector('canvas');
      if (!canvas) { canvas = document.createElement('canvas'); hote.appendChild(canvas); }
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      // Filigrane gravé dans l'image : l'adresse de l'élève, en diagonale, sur toute la page
      ctx.save();
      ctx.globalAlpha = 0.07; ctx.fillStyle = '#12142F';
      ctx.font = `700 ${Math.round(canvas.width / 22)}px sans-serif`;
      ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(-Math.PI / 7);
      const pas = canvas.width / 5;
      for (let y = -canvas.height; y < canvas.height; y += pas) {
        for (let x = -canvas.width * 1.2; x < canvas.width * 1.2; x += canvas.width * 0.9) ctx.fillText(marque.current, x + (Math.round(y / pas) % 2 ? canvas.width * 0.4 : 0), y);
      }
      ctx.restore();
      rendues.current.add(n);
      hote.dataset.ok = '1';
    } catch (e) { /* page ignorée */ }
    enCours.current.delete(n);
  }, []);

  const liberer = useCallback((n) => {
    const hote = pagesRef.current[n - 1];
    const canvas = hote && hote.querySelector('canvas');
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    rendues.current.delete(n);
    if (hote) delete hote.dataset.ok;
  }, []);

  useEffect(() => {
    if (etat !== 'lecture' || !nbPages) return;
    const visibles = new Set();
    const obsDessin = new IntersectionObserver((entrees) => {
      entrees.forEach((en) => {
        const n = Number(en.target.dataset.n);
        if (en.isIntersecting) dessiner(n); else if (rendues.current.has(n)) liberer(n);
      });
    }, { rootMargin: '700px 0px' });
    const obsCourante = new IntersectionObserver((entrees) => {
      entrees.forEach((en) => {
        const n = Number(en.target.dataset.n);
        if (en.isIntersecting) visibles.add(n); else visibles.delete(n);
      });
      if (visibles.size) setPageCourante(Math.min(...visibles));
    }, { threshold: 0.35 });
    pagesRef.current.forEach((el) => { if (el) { obsDessin.observe(el); obsCourante.observe(el); } });
    return () => { obsDessin.disconnect(); obsCourante.disconnect(); };
  }, [etat, nbPages, dessiner, liberer]);

  // Redessine si la largeur change (rotation du téléphone)
  useEffect(() => {
    if (etat !== 'lecture') return;
    let largeur = zoneRef.current?.clientWidth;
    const f = () => {
      const l = zoneRef.current?.clientWidth;
      if (l && Math.abs(l - largeur) > 20) { largeur = l; [...rendues.current].forEach((n) => { liberer(n); dessiner(n); }); }
    };
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [etat, dessiner, liberer]);

  // Reprise à la dernière page lue
  useEffect(() => {
    if (etat === 'lecture' && reprise > 1) {
      const t = setTimeout(() => pagesRef.current[reprise - 1]?.scrollIntoView({ block: 'start' }), 150);
      return () => clearTimeout(t);
    }
  }, [etat, reprise]);

  // Enregistre la page lue (sans attendre : 1,5 s après l'arrêt du défilement)
  useEffect(() => {
    if (etat !== 'lecture' || !user || !id) return;
    retenirPage(id, pageCourante);
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => {
      if (navigator.onLine) {
        supabase.from('lecture_documents').upsert({ user_id: user.id, document_id: id, page: pageCourante, maj_le: new Date().toISOString() }, { onConflict: 'user_id,document_id' }).then(() => {});
      }
    }, 1500);
    return () => clearTimeout(minuteur.current);
  }, [pageCourante, etat, user, id]);

  // ---------- Protection : pas de clic droit, pas de sauvegarde/impression ----------
  useEffect(() => {
    const touche = (e) => {
      const k = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'u', 'c', 'a'].includes(k)) e.preventDefault();
    };
    const avantImpression = () => document.documentElement.classList.add('bl-impression');
    const apresImpression = () => document.documentElement.classList.remove('bl-impression');
    window.addEventListener('keydown', touche);
    window.addEventListener('beforeprint', avantImpression);
    window.addEventListener('afterprint', apresImpression);
    return () => {
      window.removeEventListener('keydown', touche);
      window.removeEventListener('beforeprint', avantImpression);
      window.removeEventListener('afterprint', apresImpression);
    };
  }, []);

  // ---------- Actions ----------
  async function basculerFavori() {
    if (!user || !navigator.onLine) return;
    const est = favori;
    setFavori(!est);
    const { error } = est
      ? await supabase.from('favoris_documents').delete().eq('document_id', id).eq('user_id', user.id)
      : await supabase.from('favoris_documents').insert({ document_id: id, user_id: user.id });
    if (error) { setFavori(est); setInfo('Impossible de modifier les favoris.'); return; }
    if (est && local) { await supprimerHorsLigne(id); setLocal(false); }
  }

  async function basculerHorsLigne() {
    if (!user || !doc) return;
    if (local) { await supprimerHorsLigne(id); setLocal(false); setInfo('Copie hors ligne retirée.'); return; }
    if (!navigator.onLine) return;
    setOccupe(true); setInfo('');
    try {
      if (!favori) {
        const { error } = await supabase.from('favoris_documents').insert({ document_id: id, user_id: user.id });
        if (!error) setFavori(true);
      }
      let couv = null;
      if (doc.chemin_couverture) {
        const r = await supabase.storage.from('bibliotheque').createSignedUrl(doc.chemin_couverture, 120);
        couv = r.data?.signedUrl || null;
      }
      await garderHorsLigne(doc, octetsRef.current || (await lireOctets(doc.chemin_fichier)), couv, user.id);
      setLocal(true);
      setInfo('Disponible hors ligne sur cet appareil.');
    } catch (e) { setInfo('Le téléchargement hors ligne a échoué.'); }
    setOccupe(false);
  }

  function aller(e) {
    e.preventDefault();
    const n = Number(new FormData(e.currentTarget).get('p'));
    if (n >= 1 && n <= nbPages) pagesRef.current[n - 1]?.scrollIntoView({ block: 'start' });
  }

  const crumbs = [{ label: 'Bibliothèque', href: '/bibliotheque' }, { label: doc?.titre || '…' }];

  return (
    <>
      <Topbar crumbs={crumbs} />
      <main className="bl-root">
        {etat === 'chargement' && <p className="bl-msg">Ouverture du document...</p>}
        {etat === 'deconnecte' && (
          <div className="empty-box"><p>Connecte-toi pour lire ce document.</p><Link className="btn-dark" href="/login">Se connecter</Link></div>
        )}
        {etat === 'introuvable' && <div className="empty-box">Ce document n'existe pas ou n'est pas disponible hors ligne.</div>}
        {etat === 'erreur' && <div className="empty-box">Impossible d'ouvrir ce document pour le moment. Vérifie ta connexion et réessaie.</div>}
        {etat === 'verrouille' && (
          <div className="empty-box">
            <p style={{ margin: '0 0 12px' }}><Icon name="lock" size={16} /> Ce document est réservé aux abonnés.</p>
            <Link className="btn-dark" href="/tarifs">Voir les formules</Link>
          </div>
        )}

        {etat === 'lecture' && doc && (
          <>
            <div className="bl-barre">
              <div className="bl-titre">
                <b>{doc.titre}</b>
                <span>{[libelleCategorie(doc.categorie), doc.auteur].filter(Boolean).join(' · ')}</span>
              </div>
              <form className="bl-page-nav" onSubmit={aller}>
                <input name="p" type="number" inputMode="numeric" min="1" max={nbPages} placeholder={String(pageCourante)} aria-label="Aller à la page" />
                <span>/ {nbPages}</span>
              </form>
              <div className="bl-outils">
                {navigator.onLine && (
                  <button type="button" className={`bib-ico${favori ? ' on' : ''}`} onClick={basculerFavori} aria-pressed={favori}
                    aria-label={favori ? 'Retirer des favoris' : 'Ajouter aux favoris'} title={favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                    <Icon name="heart" size={17} className={favori ? 'plein' : ''} />
                  </button>
                )}
                {abonne && horsLigneDisponible() && (
                  <button type="button" className={`bib-ico${local ? ' on' : ''}`} onClick={basculerHorsLigne} disabled={occupe || (!navigator.onLine && !local)}
                    aria-label={local ? 'Retirer la copie hors ligne' : 'Garder hors ligne'} title={local ? 'Disponible hors ligne (toucher pour retirer)' : 'Garder hors ligne (abonnés)'}>
                    <Icon name={occupe ? 'refresh' : local ? 'checkCircle' : 'download'} size={17} />
                  </button>
                )}
              </div>
            </div>
            {info && <p className="bl-info" role="status">{info}</p>}
            {reprise > 1 && pageCourante <= 1 && <p className="bl-info">Reprise à la page {reprise}.</p>}

            <div
              className="bl-pages"
              ref={zoneRef}
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
              onCopy={(e) => e.preventDefault()}
            >
              {Array.from({ length: nbPages }, (_, i) => (
                <div key={i} className="bl-page" data-n={i + 1} ref={(el) => { pagesRef.current[i] = el; }} style={{ aspectRatio: `1 / ${ratio}` }} />
              ))}
            </div>
            <p className="bl-pied">Lecture protégée : ce document ne peut pas être téléchargé ni imprimé. Il est marqué à ton adresse e-mail.</p>
          </>
        )}
      </main>
      <style>{`@media print { html, body { display: none !important; } }`}</style>
    </>
  );
}

export default function LirePage() {
  return <Suspense fallback={<p className="bl-msg">Chargement...</p>}><Lecteur /></Suspense>;
}
