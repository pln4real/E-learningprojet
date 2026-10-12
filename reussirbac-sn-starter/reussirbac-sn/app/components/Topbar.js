import Link from 'next/link';

// Barre du haut : fil d'Ariane (Accueil › Niveau › Matière › Chapitre)
// + une action optionnelle à droite (ex. bouton « Télécharger en PDF »).
// crumbs = [{ label: 'Terminale S2', href: '/classe/…' }, { label: 'Fonctions' }]
export default function Topbar({ crumbs = [], action = null }) {
  return (
    <div className="topbar">
      <nav className="breadcrumb" aria-label="Fil d'Ariane">
        <Link href="/" className="crumb-home" aria-label="Accueil">Accueil</Link>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} className="crumb-wrap">
              <span className="crumb-sep">›</span>
              {last || !c.href ? (
                <span className={last ? 'crumb-current' : 'crumb'}>{c.label}</span>
              ) : (
                <Link href={c.href} className="crumb">{c.label}</Link>
              )}
            </span>
          );
        })}
      </nav>
      {action}
    </div>
  );
}
