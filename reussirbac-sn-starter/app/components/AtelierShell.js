'use client';

import Link from 'next/link';
import Icon from './Icon';
import MenuBurger from './MenuBurger';

// Cadre de l'Atelier d'entraînement : un espace sombre, volontairement différent de l'espace d'apprentissage
export default function AtelierShell({ titre, retour, children, droite = null }) {
  return (
    <div className="at-root">
      <header className="at-head">
        <MenuBurger className="mb-btn-barre at-menu" />
        <div className="at-head-titre">
          <span className="at-marque"><Icon name="timer" size={16} /> Atelier</span>
          {titre && <span className="at-head-sous">{titre}</span>}
        </div>
        {droite}
        {retour && <Link href={retour.href} className="at-retour">{retour.label}</Link>}
      </header>
      <main className="at-main">{children}</main>
    </div>
  );
}
