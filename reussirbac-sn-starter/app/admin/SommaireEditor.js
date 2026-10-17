'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { cheminStockage } from '../../lib/media';
import { extraireSommaire } from '../../lib/sommaire';
import Icon from '../components/Icon';

// Charge pdf.js seulement quand l'admin en a besoin (jamais chez les élèves).
async function chargerPdfjs() {
  const pdfjs = await import('pdfjs-dist/build/pdf');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  return pdfjs;
}

export default function SommaireEditor({ file, urlExistante, value, onChange }) {
  const [etat, setEtat] = useState('');   // '' | 'lecture' | 'trouve' | 'vide' | 'erreur'
  const dernier = useRef(null);

  async function detecter(buffer) {
    setEtat('lecture');
    try {
      const pdfjs = await chargerPdfjs();
      const liste = await extraireSommaire(pdfjs, buffer);
      onChange(liste);
      setEtat(liste.length ? 'trouve' : 'vide');
    } catch (e) {
      setEtat('erreur');
    }
  }

  // Nouveau fichier choisi : détection automatique
  useEffect(() => {
    if (!file || dernier.current === file) return;
    dernier.current = file;
    if (file.type !== 'application/pdf') return;
    file.arrayBuffer().then(detecter).catch(() => setEtat('erreur'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  async function redetecterExistant() {
    const chemin = cheminStockage(urlExistante);
    if (!chemin) { setEtat('erreur'); return; }
    setEtat('lecture');
    try {
      const { data, error } = await supabase.storage.from('ressources').createSignedUrl(chemin, 300);
      const rep = await fetch(error ? urlExistante : data.signedUrl);
      await detecter(await rep.arrayBuffer());
    } catch (e) { setEtat('erreur'); }
  }

  const maj = (i, champ, v) => onChange(value.map((x, k) => (k === i ? { ...x, [champ]: v } : x)));
  const retirer = (i) => onChange(value.filter((_, k) => k !== i));
  const ajouter = () => onChange([...value, { titre: '', page: 1, niveau: 0 }]);

  return (
    <div className="field sm-ed">
      <label><Icon name="list" size={14} /> Sommaire du cours (détecté automatiquement)</label>
      {etat === 'lecture' && <p className="sm-note">Lecture du PDF...</p>}
      {etat === 'trouve' && <p className="sm-note ok">{value.length} sections détectées. Corrige ou supprime ce qui est faux.</p>}
      {etat === 'vide' && <p className="sm-note">Aucun titre détecté : le cours s'affichera sans sommaire. Pour de meilleurs résultats, exporte ton PDF depuis Word ou Google Docs avec des titres (styles « Titre 1 », « Titre 2 »).</p>}
      {etat === 'erreur' && <p className="sm-note bad">Impossible de lire ce PDF pour détecter le sommaire. Tu peux l'enregistrer quand même ou saisir les sections à la main.</p>}
      {etat === '' && value.length === 0 && <p className="sm-note">Choisis un PDF : les titres seront détectés tout seuls.</p>}

      {value.map((s, i) => (
        <div className="sm-row" key={i}>
          <input value={s.titre} onChange={(e) => maj(i, 'titre', e.target.value)} aria-label="Titre de la section" maxLength={120} />
          <input type="number" min="1" value={s.page} onChange={(e) => maj(i, 'page', Math.max(1, Number(e.target.value) || 1))} aria-label="Page" />
          <button type="button" className="btn-light" onClick={() => retirer(i)} aria-label="Retirer cette section"><Icon name="x" size={14} /></button>
        </div>
      ))}
      <div className="sm-actions">
        <button type="button" className="btn-light" onClick={ajouter}><Icon name="plus" size={14} /> Ajouter une section</button>
        {urlExistante && !file && <button type="button" className="btn-light" onClick={redetecterExistant}><Icon name="refresh" size={14} /> Détecter à nouveau</button>}
      </div>
    </div>
  );
}
