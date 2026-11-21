'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';

// « Tout ce que tu peux faire » : une vitrine des fonctions, un onglet par fonction.
// Chaque panneau montre une vraie maquette de l'écran, en 3 étapes simples.
const FONCTIONS = [
  {
    id: 'atelier', nom: 'Atelier', icone: 'timer', href: '/atelier', cta: 'Ouvrir l\'Atelier',
    titre: 'Génère un sujet, comme le jour du Bac',
    texte: 'Choisis tes chapitres : l\'Atelier tire des exercices et des annales, lance un chronomètre, puis te donne le corrigé.',
    etapes: [
      ['Choisis', 'Ta matière et les chapitres à réviser, ou tout le programme.'],
      ['Compose', 'Le chrono démarre. Tu travailles sur le sujet, sans voir le corrigé.'],
      ['Corrige-toi', 'Tu ouvres le corrigé exercice par exercice et tu notes : réussi, à revoir, raté.'],
    ],
  },
  {
    id: 'cercle', nom: 'Mon cercle', icone: 'users', href: '/amis', cta: 'Rejoindre mon cercle',
    titre: 'Révise avec tes amis, par défis',
    texte: 'Ajoute tes camarades, lance-leur un défi sur un quiz et vois qui gagne. Chaque bonne réponse rapporte des points.',
    etapes: [
      ['Invite', 'Ajoute un ami avec son nom ou envoie-lui ton lien.'],
      ['Défie', 'Choisis un quiz. Vous répondez aux mêmes questions.'],
      ['Compare', 'Le classement de la semaine montre qui a le plus travaillé.'],
    ],
  },
  {
    id: 'biblio', nom: 'Bibliothèque', icone: 'library', href: '/bibliotheque', cta: 'Parcourir la bibliothèque',
    titre: 'Des documents utiles, au-delà des cours',
    texte: 'Méthodes, guides d\'orientation, ouvrages et documents de culture générale, classés et faciles à retrouver.',
    etapes: [
      ['Cherche', 'Tape un mot ou choisis une catégorie.'],
      ['Ouvre', 'Le document se lit dans la page, à ton rythme.'],
      ['Reprends', 'Tu retrouves là où tu t\'étais arrêté.'],
    ],
  },
  {
    id: 'moyenne', nom: 'Ma moyenne', icone: 'check', href: '/moyenne', cta: 'Calculer ma moyenne',
    titre: 'Calcule ta moyenne en quelques touches',
    texte: 'Entre tes notes, les coefficients sont déjà là. Tu vois ta moyenne de suite et ce qu\'il te manque pour viser plus haut.',
    etapes: [
      ['Choisis', 'Ta série : S2, L2 ou ta classe de 3e.'],
      ['Saisis', 'Tes notes, matière par matière.'],
      ['Découvre', 'Ta moyenne s\'affiche tout de suite.'],
    ],
  },
  {
    id: 'hors', nom: 'Hors connexion', icone: 'download', href: '/inscription', cta: 'Créer mon compte',
    titre: 'Un cours gardé, même sans internet',
    texte: 'Enregistre un chapitre quand tu as du réseau. Tu le relis ensuite dans le bus, au village, sans forfait.',
    etapes: [
      ['Enregistre', 'Touche « Garder hors connexion » sur un chapitre.'],
      ['Coupe', 'Plus besoin de réseau : le contenu reste dans l\'application.'],
      ['Révise', 'Tout est là, même sans connexion. Tes résultats se synchronisent au retour du réseau.'],
    ],
  },
];

const AUSSI = [
  ['quiz', 'Quiz corrigés', 'La bonne réponse et l\'explication juste après ton choix.'],
  ['archive', 'Annales corrigées', 'Les sujets des années passées avec leur corrigé.'],
  ['flame', 'Ta série de jours', 'Révise un peu chaque jour et garde ta flamme allumée.'],
  ['install', 'Installable', 'Ajoute le site à ton écran d\'accueil comme une vraie application.'],
];

function Maquette({ id }) {
  if (id === 'atelier') {
    return (
      <div className="fx-mock" aria-hidden="true">
        <div className="fx-win">
          <div className="fx-bar"><span>Ton sujet</span><b className="fx-chrono"><Icon name="timer" size={14} /> 01:14:32</b></div>
          <div className="fx-chips"><i className="on">Nombres complexes</i><i className="on">Suites</i><i>Probabilités</i></div>
          <ul className="fx-list">
            <li><span className="fx-n">1</span><span>Exercice · Nombres complexes</span><em>4 pts</em></li>
            <li><span className="fx-n">2</span><span>Annale · Suites numériques</span><em>6 pts</em></li>
            <li><span className="fx-n">3</span><span>Exercice · Suites</span><em>4 pts</em></li>
          </ul>
          <div className="fx-eval"><span className="ok"><Icon name="check" size={13} /> Réussi</span><span>À revoir</span><span>Raté</span></div>
        </div>
      </div>
    );
  }
  if (id === 'cercle') {
    return (
      <div className="fx-mock" aria-hidden="true">
        <div className="fx-win">
          <div className="fx-bar"><span>Classement de la semaine</span><b><Icon name="trophy" size={14} /></b></div>
          <ul className="fx-rank">
            <li><span className="fx-pos g">1</span><span className="fx-av">A</span><span>Awa</span><em>420 pts</em></li>
            <li className="me"><span className="fx-pos">2</span><span className="fx-av">T</span><span>Toi</span><em>385 pts</em></li>
            <li><span className="fx-pos">3</span><span className="fx-av">M</span><span>Moussa</span><em>310 pts</em></li>
          </ul>
          <div className="fx-defi">
            <div><b>Défi · Nombres complexes</b><small>Awa te défie : elle a eu 8 / 10</small></div>
            <span className="fx-btn">Relever</span>
          </div>
        </div>
      </div>
    );
  }
  if (id === 'biblio') {
    return (
      <div className="fx-mock" aria-hidden="true">
        <div className="fx-win">
          <div className="fx-search"><Icon name="search" size={14} /> Chercher un document</div>
          <div className="fx-chips"><i className="on">Méthodes</i><i>Orientation</i><i>Culture</i></div>
          <div className="fx-docs">
            <div><span className="fx-cover c1"><Icon name="book" size={20} /></span><b>Réussir sa dissertation</b><small>Méthode</small></div>
            <div><span className="fx-cover c2"><Icon name="library" size={20} /></span><b>Choisir son orientation</b><small>Guide</small></div>
            <div><span className="fx-cover c3"><Icon name="file" size={20} /></span><b>Fiches de culture générale</b><small>Culture</small></div>
          </div>
        </div>
      </div>
    );
  }
  if (id === 'moyenne') {
    return (
      <div className="fx-mock" aria-hidden="true">
        <div className="fx-win">
          <div className="fx-bar"><span>Terminale S2</span><b>Exemple</b></div>
          <ul className="fx-notes">
            <li><span>Mathématiques</span><small>coef. 5</small><em>14</em></li>
            <li><span>Sciences physiques</span><small>coef. 5</small><em>12</em></li>
            <li><span>SVT</span><small>coef. 2</small><em>13</em></li>
          </ul>
          <div className="fx-moy"><span>Ta moyenne</span><b>13,1<small> / 20</small></b></div>
          <span className="fx-barre"><i style={{ width: '65%' }} /></span>
        </div>
      </div>
    );
  }
  return (
    <div className="fx-mock" aria-hidden="true">
      <div className="fx-win">
        <div className="fx-bar"><span>Nombres complexes</span><b className="fx-off"><Icon name="check" size={13} /> Gardé</b></div>
        <ul className="fx-list">
          <li><span className="fx-n"><Icon name="file" size={14} /></span><span>Cours complet</span><em>2,1 Mo</em></li>
          <li><span className="fx-n"><Icon name="file" size={14} /></span><span>Exercices corrigés</span><em>1,4 Mo</em></li>
          <li><span className="fx-n"><Icon name="file" size={14} /></span><span>Fiche de résumé</span><em>0,6 Mo</em></li>
        </ul>
        <div className="fx-nonet"><Icon name="download" size={14} /> Pas de connexion : tout est disponible</div>
      </div>
    </div>
  );
}

export default function Fonctions() {
  const [actif, setActif] = useState('atelier');
  const refs = useRef({});
  const f = FONCTIONS.find((x) => x.id === actif) || FONCTIONS[0];

  const clavier = (e) => {
    const i = FONCTIONS.findIndex((x) => x.id === actif);
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % FONCTIONS.length;
    if (e.key === 'ArrowLeft') j = (i - 1 + FONCTIONS.length) % FONCTIONS.length;
    if (j == null) return;
    e.preventDefault();
    setActif(FONCTIONS[j].id);
    refs.current[FONCTIONS[j].id]?.focus();
  };

  return (
    <section className="fx" id="fonctions" aria-labelledby="fx-titre">
      <div className="lp-wrap">
        <p className="fx-kicker">Tout ce que tu peux faire</p>
        <h2 className="lp-big" id="fx-titre">Bien plus que des cours.</h2>
        <p className="lp-sub">Révise, t'entraîne, te compare et suis ta moyenne au même endroit. Touche une fonction pour voir comment elle marche.</p>

        <div className="fx-tabs" role="tablist" aria-label="Fonctions" onKeyDown={clavier}>
          {FONCTIONS.map((x) => (
            <button
              key={x.id} ref={(el) => { refs.current[x.id] = el; }} type="button" role="tab" id={`fx-t-${x.id}`}
              aria-selected={actif === x.id} aria-controls="fx-panneau" tabIndex={actif === x.id ? 0 : -1}
              className={actif === x.id ? 'on' : ''} onClick={() => setActif(x.id)}
            >
              <Icon name={x.icone} size={17} /> {x.nom}
            </button>
          ))}
        </div>

        <div className="fx-panel" id="fx-panneau" role="tabpanel" aria-labelledby={`fx-t-${actif}`}>
          <div className="fx-stage"><Maquette id={actif} /></div>
          <div className="fx-text">
            <h3>{f.titre}</h3>
            <p>{f.texte}</p>
            <ol className="fx-steps">
              {f.etapes.map(([t, d], i) => (
                <li key={t}><span>{i + 1}</span><div><b>{t}</b><small>{d}</small></div></li>
              ))}
            </ol>
            <Link className="lp-btn lp-btn-main" href={f.href}>{f.cta}</Link>
          </div>
        </div>

        <h3 className="fx-aussi-t">Et aussi</h3>
        <div className="fx-aussi">
          {AUSSI.map(([ic, t, d]) => (
            <div key={t}><span><Icon name={ic} size={19} /></span><b>{t}</b><small>{d}</small></div>
          ))}
        </div>
      </div>
    </section>
  );
}
