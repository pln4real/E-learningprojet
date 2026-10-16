import Link from 'next/link';
import { SITE } from '../../lib/site';

// En-tête et pied de page des pages publiques (contact, etc.).
export default function SiteShell({ children }) {
  return (
    <div className="lp">
      <header className="lp-wrap lp-nav">
        <Link className="lp-logo" href="/">Réussir<b>Bac</b> SN</Link>
        <nav className="lp-nav-links" aria-label="Navigation principale">
          <Link href="/moyenne" className="hide-s">Ma moyenne</Link>
          <Link href="/login">Connexion</Link>
          <Link className="lp-btn lp-btn-main" href="/inscription"><span className="long">Créer un compte</span><span className="short">S'inscrire</span></Link>
        </nav>
      </header>
      {children}
      <footer className="lp-footer">
        <div className="lp-wrap">
          <span>{SITE.nom}. Cours et annales pour le BFEM et le Bac au Sénégal.</span>
          <span className="foot-links">
            <Link href="/conditions">Conditions</Link>
            <Link href="/confidentialite">Confidentialité</Link>
            <Link href="/contact">Contact</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
