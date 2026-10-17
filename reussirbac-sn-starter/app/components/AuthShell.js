import Link from 'next/link';

// Cadre simple et centré pour les pages de compte (mot de passe oublié, etc.)
export default function AuthShell({ titre, intro, children, pied }) {
  return (
    <div className="auth-center">
      <div className="auth-box">
        <Link className="lp-logo" href="/">Réussir<b>Bac</b> SN</Link>
        <h1 className="brand-font auth-title">{titre}</h1>
        {intro && <p className="auth-intro">{intro}</p>}
        <div className="card">{children}</div>
        {pied && <p className="auth-foot">{pied}</p>}
      </div>
    </div>
  );
}
