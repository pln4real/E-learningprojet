import Link from 'next/link';
import SiteFooter from './SiteFooter';

// En-tête et pied de page des pages publiques (contact, etc.).
export default function SiteShell({ children }) {
  return (
    <div className="lp">
      <header className="lp-wrap lp-nav">
        <Link className="lp-logo" href="/">Réussir<b>Bac</b> SN</Link>
        <nav className="lp-nav-links" aria-label="Navigation principale">
          <Link href="/tarifs" className="hide-s">Tarifs</Link>
          <Link href="/moyenne" className="hide-s">Ma moyenne</Link>
          <Link href="/login">Connexion</Link>
          <Link className="lp-btn lp-btn-main" href="/inscription"><span className="long">Créer un compte</span><span className="short">S'inscrire</span></Link>
        </nav>
      </header>
      {children}
      <SiteFooter />
    </div>
  );
}
