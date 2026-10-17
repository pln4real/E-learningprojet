import Link from 'next/link';
import { SITE } from '../../lib/site';

// Mise en page commune des pages légales et de contact.
export default function LegalLayout({ titre, children }) {
  return (
    <div className="lp">
      <header className="lp-wrap lp-nav">
        <Link className="lp-logo" href="/">Réussir<b>Bac</b> SN</Link>
        <nav className="lp-nav-links"><Link href="/login">Connexion</Link></nav>
      </header>
      <main className="legal">
        <h1 className="brand-font">{titre}</h1>
        <p className="legal-date">Dernière mise à jour : {SITE.miseAJour}</p>
        {children}
      </main>
      <footer className="lp-footer">
        <div className="lp-wrap">
          <span>{SITE.nom}</span>
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
