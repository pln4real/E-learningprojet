'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { chargerPdfjs } from '../../lib/pdfjs';

// Lecteur PDF qui montre TOUTES les pages l'une sous l'autre (comme une page web) :
// les téléphones n'affichent que la 1re page d'un PDF dans un cadre, ce lecteur règle ça.
// - cible = { page, n } : fait défiler jusqu'à cette page (n change à chaque clic sur le sommaire)
// - onPage(n) : page actuellement lue (pour surligner le sommaire)
// - secours : adresse du PDF à afficher dans un cadre si la lecture directe échoue
export default function PdfPages({ url, titre, cible, onPage, onPret, secours }) {
  const [etat, setEtat] = useState('chargement'); // chargement | pret | erreur
  const [ratios, setRatios] = useState([]);
  const [progres, setProgres] = useState('');
  const pdfRef = useRef(null);
  const pagesRef = useRef([]);
  const rendues = useRef(new Set());
  const enCours = useRef(new Set());
  const zoneRef = useRef(null);
  const dernierePage = useRef(0);

  useEffect(() => {
    let actif = true;
    setEtat('chargement'); setRatios([]);
    (async () => {
      try {
        const rep = await fetch(url);
        if (!rep.ok) throw new Error('http ' + rep.status);
        const octets = await rep.arrayBuffer();
        const pdfjs = await chargerPdfjs();
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(octets) }).promise;
        if (!actif) return;
        pdfRef.current = pdf;
        // Hauteur exacte de chaque page, avant d'afficher : le défilement vers un titre tombe juste
        const liste = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const pg = await pdf.getPage(i);
          const v = pg.getViewport({ scale: 1 });
          liste.push(v.height / v.width);
          if (!actif) return;
          if (i % 25 === 0) setProgres(`${i} / ${pdf.numPages} pages`);
        }
        setRatios(liste);
        setEtat('pret');
        onPret && onPret(pdf.numPages);
      } catch (e) {
        if (actif) setEtat('erreur');
      }
    })();
    return () => { actif = false; try { pdfRef.current?.destroy(); } catch (e) {} pdfRef.current = null; rendues.current = new Set(); enCours.current = new Set(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

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
      const vp = page.getViewport({ scale: (largeurCss / v1.width) * dpr });
      let canvas = hote.querySelector('canvas');
      if (!canvas) { canvas = document.createElement('canvas'); hote.appendChild(canvas); }
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
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

  // Dessine seulement les pages proches de l'écran (économise la mémoire du téléphone)
  useEffect(() => {
    if (etat !== 'pret') return;
    const visibles = new Set();
    const obsDessin = new IntersectionObserver((entrees) => {
      entrees.forEach((en) => {
        const n = Number(en.target.dataset.n);
        if (en.isIntersecting) dessiner(n); else if (rendues.current.has(n)) liberer(n);
      });
    }, { rootMargin: '900px 0px' });
    const obsCourante = new IntersectionObserver((entrees) => {
      entrees.forEach((en) => {
        const n = Number(en.target.dataset.n);
        if (en.isIntersecting) visibles.add(n); else visibles.delete(n);
      });
      if (visibles.size) {
        const p = Math.min(...visibles);
        if (p !== dernierePage.current) { dernierePage.current = p; onPage && onPage(p); }
      }
    }, { threshold: 0.2 });
    pagesRef.current.forEach((el) => { if (el) { obsDessin.observe(el); obsCourante.observe(el); } });
    return () => { obsDessin.disconnect(); obsCourante.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat, ratios, dessiner, liberer]);

  // Redessine si la largeur change (rotation du téléphone)
  useEffect(() => {
    if (etat !== 'pret') return;
    let largeur = zoneRef.current?.clientWidth;
    const f = () => {
      const l = zoneRef.current?.clientWidth;
      if (l && Math.abs(l - largeur) > 20) { largeur = l; [...rendues.current].forEach((n) => { liberer(n); dessiner(n); }); }
    };
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [etat, dessiner, liberer]);

  // Clic sur un titre du sommaire : on glisse jusqu'à la page
  useEffect(() => {
    if (etat !== 'pret' || !cible || !cible.page) return;
    const el = pagesRef.current[Math.min(Math.max(cible.page, 1), ratios.length) - 1];
    if (!el) return;
    const t = setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat, cible && cible.n]);

  if (etat === 'erreur') {
    return secours
      ? <iframe className="pdf-frame" src={secours} title={titre} />
      : <p className="viewer-note">Ce PDF n'a pas pu être affiché. Utilise « Ouvrir dans un nouvel onglet ».</p>;
  }
  if (etat === 'chargement') {
    return (
      <div className="pp-attente" role="status">
        <span className="pp-spin" aria-hidden="true" />
        <p>Chargement du cours...{progres ? ` ${progres}` : ''}</p>
      </div>
    );
  }
  return (
    <div className="pp-zone" ref={zoneRef} aria-label={titre}>
      {ratios.map((r, i) => (
        <div key={i} className="pp-page" data-n={i + 1} ref={(el) => { pagesRef.current[i] = el; }} style={{ aspectRatio: `1 / ${r}` }} />
      ))}
    </div>
  );
}
