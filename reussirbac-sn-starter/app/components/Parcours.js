'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

const ETAPES = [
  { icon: 'mail', titre: 'Crée ton compte', texte: "C'est gratuit et ça prend une minute." },
  { icon: 'book', titre: 'Choisis ta classe', texte: '3e, Terminale S2 ou Terminale L2.' },
  { icon: 'checkCircle', titre: 'Révise et progresse', texte: 'Cours, exercices, quiz. Ta progression se coche toute seule.' },
];

// Parcours en 3 étapes : la ligne se dessine quand la section entre à l'écran.
export default function Parcours() {
  const ref = useRef(null);
  const [arme, setArme] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduit || !('IntersectionObserver' in window)) return; // tout reste affiché, sans animation
    setArme(true);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <section className="lp-band" aria-labelledby="parcours-titre">
      <div className="lp-wrap">
        <h2 className="lp-big" id="parcours-titre">Comment ça marche.</h2>
        <p className="lp-sub">Trois étapes, et tu révises.</p>
        <ol ref={ref} className={`parcours ${arme ? 'armed' : ''} ${visible ? 'on' : ''}`}>
          <span className="parcours-line" aria-hidden="true"><i /></span>
          {ETAPES.map((e, i) => (
            <li key={e.titre} style={{ '--i': i }}>
              <span className="p-dot"><Icon name={e.icon} size={22} /></span>
              <span className="p-num">0{i + 1}</span>
              <h3 className="brand-font">{e.titre}</h3>
              <p>{e.texte}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
