'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import Icon from './Icon';

// Menu « burger » : accessible partout, sur téléphone comme sur ordinateur.
export default function MenuBurger({ className = '' }) {
  const [ouvert, setOuvert] = useState(false);
  const [niveaux, setNiveaux] = useState(null);
  const [connecte, setConnecte] = useState(false);
  const pathname = usePathname();
  const fermer = useRef(null);

  useEffect(() => { setOuvert(false); }, [pathname]);

  useEffect(() => {
    if (!ouvert) return;
    document.body.style.overflow = 'hidden';
    const touche = (e) => { if (e.key === 'Escape') setOuvert(false); };
    window.addEventListener('keydown', touche);
    fermer.current && fermer.current.focus();
    if (niveaux === null) {
      supabase.from('niveaux').select('id, nom').order('ordre').then(({ data }) => setNiveaux(data || []));
    }
    supabase.auth.getSession().then(({ data }) => setConnecte(!!data.session));
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', touche); };
  }, [ouvert, niveaux]);

  const actif = (href) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'));
  const lien = (href, label) => (
    <Link href={href} className={`mb-lien${actif(href) ? ' actif' : ''}`} onClick={() => setOuvert(false)}>{label}</Link>
  );

  return (
    <>
      <button type="button" className={`mb-btn ${className}`} onClick={() => setOuvert(true)} aria-label="Ouvrir le menu" aria-haspopup="dialog" aria-expanded={ouvert}>
        <Icon name="menu" size={22} />
      </button>
      {ouvert && typeof document !== 'undefined' && createPortal(
        <div className="mb-voile" role="dialog" aria-modal="true" aria-label="Menu principal">
          <button type="button" className="mb-fond" onClick={() => setOuvert(false)} aria-label="Fermer le menu" tabIndex={-1} />
          <nav className="mb-panneau">
            <div className="mb-tete">
              <span className="mb-logo">Réussir<b>Bac</b> SN</span>
              <button type="button" className="mb-fermer" ref={fermer} onClick={() => setOuvert(false)} aria-label="Fermer le menu"><Icon name="x" size={20} /></button>
            </div>

            {lien('/', 'Accueil')}

            <p className="mb-titre">Mes classes</p>
            {niveaux === null && <span className="mb-vide">Chargement...</span>}
            {niveaux && niveaux.length === 0 && <span className="mb-vide">Bientôt disponible</span>}
            {(niveaux || []).map((n) => lien(`/classe/${n.id}`, n.nom))}

            <p className="mb-titre">Outils</p>
            {lien('/bibliotheque', 'Bibliothèque')}
            {lien('/moyenne', 'Ma moyenne')}
            {lien('/tarifs', 'Tarifs et abonnements')}
            {lien('/contact', 'Nous contacter')}

            <div className="mb-compte">
              {connecte ? (
                <Link href="/profil" className="btn-dark" onClick={() => setOuvert(false)}>Mon profil</Link>
              ) : (
                <>
                  <Link href="/inscription" className="btn-dark" onClick={() => setOuvert(false)}>Créer un compte</Link>
                  <Link href="/login" className="btn-light" onClick={() => setOuvert(false)}>Connexion</Link>
                </>
              )}
            </div>
          </nav>
        </div>,
        document.body
      )}
    </>
  );
}
