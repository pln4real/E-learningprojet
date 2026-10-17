'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { SITE } from '../../lib/site';
import Icon from './Icon';
import InstallButton from './InstallButton';

// Pied de page complet : classes et matières (liens réels, lus dans la base),
// pages utiles, aide, réseaux sociaux et mentions.
export default function SiteFooter() {
  const [niveaux, setNiveaux] = useState([]);

  useEffect(() => {
    let actif = true;
    supabase
      .from('niveaux')
      .select('id, nom, ordre, matieres(id, nom, ordre)')
      .order('ordre')
      .then(({ data }) => { if (actif && Array.isArray(data)) setNiveaux(data); });
    return () => { actif = false; };
  }, []);

  const reseaux = [
    SITE.instagram && { nom: 'Instagram', icone: 'instagram', url: SITE.instagram },
    SITE.tiktok && { nom: 'TikTok', icone: 'tiktok', url: SITE.tiktok },
    SITE.whatsapp && { nom: 'WhatsApp', icone: 'whatsapp', url: `https://wa.me/${SITE.whatsapp}` },
  ].filter(Boolean);

  return (
    <footer className="ft">
      <div className="ft-wrap">
        <div className="ft-top">
          <div>
            <Link className="ft-logo" href="/">Réussir<b>Bac</b> SN</Link>
            <p className="ft-pitch">Cours, exercices corrigés et annales pour réussir le BFEM et le Bac au Sénégal, sur ton téléphone.</p>
          </div>
          <Link className="lp-btn lp-btn-main" href="/inscription">Créer un compte gratuit</Link>
        </div>

        <div className="ft-grid">
          {niveaux.map((n) => (
            <nav key={n.id} className="ft-col" aria-label={n.nom}>
              <h3><Link href={`/classe/${n.id}`}>{n.nom}</Link></h3>
              <ul>
                {(n.matieres || []).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).map((m) => (
                  <li key={m.id}><Link href={`/matiere/${m.id}`}>{m.nom}</Link></li>
                ))}
              </ul>
            </nav>
          ))}

          <nav className="ft-col" aria-label="Découvrir">
            <h3>Découvrir</h3>
            <ul>
              <li><Link href="/tarifs">Tarifs</Link></li>
              <li><Link href="/moyenne">Calculer ma moyenne</Link></li>
              <li><Link href="/profil">Mon profil</Link></li>
              <li><Link href="/login">Connexion</Link></li>
            </ul>
          </nav>

          <nav className="ft-col" aria-label="Une question">
            <h3>Une question</h3>
            <ul>
              <li><Link href="/contact">Nous contacter</Link></li>
              <li><Link href="/conditions">Conditions d'utilisation</Link></li>
              <li><Link href="/confidentialite">Confidentialité</Link></li>
            </ul>
          </nav>
        </div>

        {reseaux.length > 0 && (
          <div className="ft-social">
            <span>Suis-nous</span>
            {reseaux.map((r) => (
              <a key={r.nom} href={r.url} target="_blank" rel="noopener noreferrer" aria-label={r.nom} title={r.nom}>
                <Icon name={r.icone} size={22} />
              </a>
            ))}
          </div>
        )}

        <div className="ft-bottom">
          <span>© {new Date().getFullYear()} {SITE.nom}. Fait au Sénégal.</span>
          <span className="ft-bottom-links">
            <Link href="/conditions">Conditions</Link>
            <Link href="/confidentialite">Confidentialité</Link>
            <InstallButton className="foot-install" />
          </span>
        </div>
      </div>
    </footer>
  );
}
