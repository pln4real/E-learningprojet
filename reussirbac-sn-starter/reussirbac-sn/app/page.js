'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import Icon from './components/Icon';

const DEMO = {
  cours: { items: [['Cours complet : forme algébrique', 'PDF'], ['Vidéo : module et argument', 'Vidéo'], ['Fiche de révision', 'PDF']], foot: 'Un cours se lit dans la page, sans rien télécharger.' },
  exos: { items: [1, 2, 3, 4, 5].map((n) => [`Exercice ${n}`, 'Gratuit']).concat([6, 7, 8].map((n) => [`Exercice ${n}`, 'Abonnés'])), foot: 'Les exercices 6 et suivants sont réservés aux abonnés.' },
  annales: { items: [['Bac S2 2024, sujet 1', 'PDF'], ['Bac S2 2023, sujet 1', 'PDF'], ['Bac S2 2022, sujet 1', 'PDF']], foot: 'Les corrigés suivent chaque sujet.' },
};
const TAB_LABELS = { cours: 'Cours', exos: 'Exercices', annales: 'Annales' };

export default function Accueil() {
  const [niveaux, setNiveaux] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('cours');

  useEffect(() => {
    supabase
      .from('niveaux')
      .select('id, nom, ordre, matieres(nom, ordre)')
      .order('ordre')
      .then(({ data }) => { setNiveaux(data || []); setLoading(false); });
  }, []);

  return (
    <div className="lp">
      <header className="lp-wrap lp-nav">
        <Link className="lp-logo" href="/">Réussir<b>Bac</b> SN</Link>
        <nav className="lp-nav-links" aria-label="Navigation principale">
          <a className="hide-s" href="#niveaux">Classes</a>
          <Link href="/login">Connexion</Link>
          <Link className="lp-btn lp-btn-main" href="/inscription"><span className="long">Créer un compte</span><span className="short">S'inscrire</span></Link>
        </nav>
      </header>

      <main>
        <div className="lp-wrap lp-hero">
          <div>
            <h1>Ton programme du Sénégal, clair et léger.</h1>
            <p className="lp-lead">Cours, exercices corrigés et annales pour le BFEM et le Bac, séries S2 et L2. Pensé pour ton téléphone et les connexions lentes.</p>
            <div className="lp-cta">
              <Link className="lp-btn lp-btn-main" href="/inscription">Créer mon compte gratuit</Link>
              <a className="lp-btn lp-btn-line" href="#niveaux">Voir les cours</a>
            </div>
          </div>

          <div className="lp-cloth">
            <div className="lp-sheet" aria-label="Exemple de page de cours">
              <div className="lp-crumbs">Terminale S2 / Mathématiques / <b>Nombres complexes</b></div>
              <h2>Nombres complexes</h2>
              <div className="lp-tabs" role="tablist">
                {Object.keys(DEMO).map((k) => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{TAB_LABELS[k]}</button>
                ))}
              </div>
              <ul className="lp-items">
                {DEMO[tab].items.map(([t, tag]) => {
                  const locked = tag === 'Abonnés';
                  return (
                    <li key={t} className={locked ? 'locked' : ''}>
                      <span className="lp-item-name">{locked && <Icon name="lock" size={15} />}{t}</span>
                      <span className="lp-tag">{tag}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="lp-foot">{DEMO[tab].foot}</div>
            </div>
          </div>
        </div>

        <section className="lp-band" id="niveaux">
          <div className="lp-wrap">
            <h2 className="lp-big">Choisis ta classe.</h2>
            <p className="lp-sub">Les programmes officiels, chapitre par chapitre. D'autres classes arrivent après le lancement.</p>
            <div className="lp-levels">
              {loading && <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}
              {niveaux.map((n) => (
                <Link key={n.id} className="lp-level" href={`/classe/${n.id}`}>
                  <span className="lp-lname">{n.nom}</span>
                  <span className="lp-lsub">
                    {(n.matieres || []).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map((m) => m.nom).join(', ')}
                  </span>
                  <span className="lp-go">Ouvrir</span>
                </Link>
              ))}
              {!loading && (
                <div className="lp-level lp-soon">
                  <span className="lp-lname">Et après ?</span>
                  <span className="lp-lsub">De la 6e à la Terminale, une classe à la fois.</span>
                  <span />
                </div>
              )}
            </div>
          </div>
        </section>

        <section>
          <div className="lp-wrap lp-two">
            <div>
              <h2 className="lp-big">Fait pour les connexions lentes.</h2>
              <p className="lp-sub" style={{ marginBottom: 0 }}>Chaque page charge d'abord l'essentiel. Le reste attend que tu en aies besoin.</p>
            </div>
            <ul className="lp-facts">
              <li><strong>La vidéo démarre sur ton appui</strong><span>Tu vois l'aperçu tout de suite. Les données ne sont utilisées que si tu lances la lecture.</span></li>
              <li><strong>Le PDF se lit dans la page</strong><span>Tu le lis sans quitter le cours, ou tu le télécharges.</span></li>
              <li><strong>Un chapitre, tout au même endroit</strong><span>Cours, exercices et annales d'un même chapitre, à un onglet d'écart.</span></li>
            </ul>
          </div>
        </section>

        <section className="lp-band">
          <div className="lp-wrap">
            <h2 className="lp-big">Commence par un chapitre.</h2>
            <p className="lp-sub">Le compte est gratuit. Les premiers exercices de chaque série sont ouverts à tous.</p>
            <Link className="lp-btn lp-btn-main" href="/inscription">Créer mon compte gratuit</Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <span>RéussirBac SN. Cours et annales pour le BFEM et le Bac au Sénégal.</span>
          <Link href="/login">Connexion</Link>
        </div>
      </footer>
    </div>
  );
}
