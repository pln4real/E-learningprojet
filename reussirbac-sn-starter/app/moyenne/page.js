'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Topbar from '../components/Topbar';
import Icon from '../components/Icon';

// Coefficients proposés au départ : à ajuster selon l'établissement (modifiables, de 1 à 8).
const SERIES = {
  s2: {
    label: 'Terminale S2',
    matieres: [['Mathématiques', 5], ['Physique-Chimie', 4], ['SVT', 3], ['Français', 3], ['Philosophie', 2], ['Anglais', 2], ['Histoire-Géographie', 2], ['EPS', 1]],
  },
  l2: {
    label: 'Terminale L2',
    matieres: [['Français', 4], ['Philosophie', 4], ['Histoire-Géographie', 3], ['Anglais', 3], ['Mathématiques', 2], ['SVT', 2], ['Physique-Chimie', 2], ['EPS', 1]],
  },
  troisieme: {
    label: '3e (BFEM)',
    matieres: [['Mathématiques', 2], ['Français', 2], ['Physique-Chimie', 2], ['SVT', 2], ['Histoire-Géographie', 2], ['Anglais', 2], ['EPS', 1]],
  },
};
const CLE = 'moyenne-bulletin-v1';

let compteur = 0;
const nouvelleLigne = (nom = '', coef = 2, note = '') => ({ id: ++compteur, nom, coef, note });
const depart = (cle) => SERIES[cle].matieres.map(([n, c]) => nouvelleLigne(n, c, ''));

export default function MoyennePage() {
  const [serie, setSerie] = useState('s2');
  const [lignes, setLignes] = useState(() => depart('s2'));
  const [pret, setPret] = useState(false);

  // Reprend les notes saisies lors de la dernière visite (aussi hors ligne)
  useEffect(() => {
    try {
      const brut = localStorage.getItem(CLE);
      if (brut) {
        const d = JSON.parse(brut);
        if (SERIES[d.serie] && Array.isArray(d.lignes) && d.lignes.length) {
          setSerie(d.serie);
          setLignes(d.lignes.map((l) => nouvelleLigne(l.nom, l.coef, l.note)));
        }
      }
    } catch (e) { /* stockage indisponible : on repart de zéro */ }
    setPret(true);
  }, []);

  useEffect(() => {
    if (!pret) return;
    try { localStorage.setItem(CLE, JSON.stringify({ serie, lignes })); } catch (e) { /* ignoré */ }
  }, [serie, lignes, pret]);

  function choisirSerie(cle) {
    setSerie(cle);
    setLignes(depart(cle));
  }
  const maj = (id, champ, v) => setLignes((prev) => prev.map((l) => (l.id === id ? { ...l, [champ]: v } : l)));
  const retirer = (id) => setLignes((prev) => prev.filter((l) => l.id !== id));

  let points = 0, total = 0, remplies = 0;
  lignes.forEach((l) => {
    const note = parseFloat(String(l.note).replace(',', '.'));
    const coef = parseFloat(l.coef);
    if (!isNaN(note) && !isNaN(coef) && coef > 0) {
      points += Math.min(20, Math.max(0, note)) * coef;
      total += coef;
      remplies += 1;
    }
  });
  const moyenne = total > 0 ? points / total : null;

  return (
    <>
      <Topbar crumbs={[{ label: 'Calculer ma moyenne' }]} />
      <main className="calc-page">
        <h1 className="brand-font page-title">Calcule ta moyenne de bulletin</h1>
        <p className="calc-lead">
          Entre tes notes. La moyenne pondérée se met à jour toute seule, et tes notes sont gardées sur cet appareil, même hors connexion.
        </p>

        <div className="segmented" role="group" aria-label="Classe" style={{ marginBottom: 18 }}>
          {Object.entries(SERIES).map(([cle, s]) => (
            <button key={cle} type="button" className={serie === cle ? 'active' : ''} onClick={() => choisirSerie(cle)}>{s.label}</button>
          ))}
        </div>

        <div className="calc-card">
          <div className="calc-row calc-head">
            <span>Matière</span><span>Note /20</span><span>Coef.</span><span />
          </div>
          {lignes.map((l) => (
            <div className="calc-row" key={l.id}>
              <input
                type="text" value={l.nom} placeholder="Matière" aria-label="Nom de la matière"
                onChange={(e) => maj(l.id, 'nom', e.target.value)} className="calc-nom"
              />
              <input
                type="number" inputMode="decimal" min="0" max="20" step="0.25" value={l.note} placeholder="–"
                aria-label={`Note de ${l.nom || 'la matière'}`} onChange={(e) => maj(l.id, 'note', e.target.value)} className="calc-num"
              />
              <input
                type="number" inputMode="numeric" min="1" max="8" step="1" value={l.coef}
                aria-label={`Coefficient de ${l.nom || 'la matière'}`}
                onChange={(e) => maj(l.id, 'coef', Math.min(8, Math.max(1, Number(e.target.value) || 1)))} className="calc-num"
              />
              <button type="button" className="calc-x" aria-label={`Retirer ${l.nom || 'la matière'}`} onClick={() => retirer(l.id)}>×</button>
            </div>
          ))}
          <div className="calc-actions">
            <button type="button" className="btn-light" onClick={() => setLignes((p) => [...p, nouvelleLigne('', 2, '')])}>+ Ajouter une matière</button>
            <button type="button" className="btn-light" onClick={() => choisirSerie(serie)}>Tout remettre à zéro</button>
          </div>
        </div>

        <div className="calc-result" aria-live="polite">
          <div>
            <div className="calc-result-label">Ta moyenne</div>
            <div className="calc-result-sub">{remplies > 0 ? `${remplies} matière${remplies > 1 ? 's' : ''} prise${remplies > 1 ? 's' : ''} en compte` : 'Entre au moins une note'}</div>
          </div>
          <div className="calc-result-value">{moyenne === null ? '–' : moyenne.toFixed(2).replace('.', ',')}<small>/20</small></div>
        </div>

        <p className="calc-note">
          Les coefficients de départ sont indicatifs (de 1 à 8) : ajuste-les selon ceux de ton établissement. Moyenne = somme des (note × coefficient) divisée par la somme des coefficients.
        </p>
        <Link href="/" className="btn-dark" style={{ marginTop: 6 }}><Icon name="book" size={16} /> Retour aux cours</Link>
      </main>
    </>
  );
}
