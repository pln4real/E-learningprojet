'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SiteShell from '../../components/SiteShell';
import Icon from '../../components/Icon';
import { verifierPaiement } from '../../../lib/abonnement';

const MAX_ESSAIS = 8;

// Cette page NE prouve PAS le paiement : elle demande au serveur de vérifier auprès du prestataire.
export default function RetourPaiement() {
  const [etat, setEtat] = useState('verification'); // verification | payee | en_attente | echouee | annulee | anomalie | introuvable | non_connecte | reseau
  const [ref, setRef] = useState('');
  const essais = useRef(0);

  async function lancer(reference) {
    setEtat('verification');
    essais.current = 0;
    while (essais.current < MAX_ESSAIS) {
      const r = await verifierPaiement(reference);
      if (['payee', 'echouee', 'annulee', 'anomalie', 'introuvable', 'non_connecte', 'remboursee'].includes(r.etat)) { setEtat(r.etat); return; }
      essais.current += 1;
      await new Promise((ok) => setTimeout(ok, 3000));
    }
    setEtat('en_attente');
  }

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('ref') || '';
    setRef(r);
    if (!r) { setEtat('introuvable'); return; }
    lancer(r);
  }, []);

  const contenus = {
    verification: { icone: 'refresh', titre: 'Vérification du paiement...', texte: 'Nous confirmons ton paiement auprès de l’opérateur. Ne ferme pas cette page.', cls: 'wait' },
    payee: { icone: 'checkCircle', titre: 'Paiement confirmé', texte: 'Ton abonnement est actif. Bonne révision !', cls: 'ok' },
    en_attente: { icone: 'refresh', titre: 'Paiement en attente de confirmation', texte: 'Nous n’avons pas encore reçu la confirmation. Si tu as bien payé, cela peut prendre quelques minutes. Ne paie pas une deuxième fois.', cls: 'wait' },
    echouee: { icone: 'x', titre: 'Paiement non confirmé', texte: 'Le paiement n’a pas été confirmé. Si tu as été débité, contacte le support avant de recommencer.', cls: 'bad' },
    annulee: { icone: 'x', titre: 'Paiement annulé', texte: 'Tu as annulé le paiement. Rien n’a été débité. Tu peux choisir une formule à nouveau.', cls: 'bad' },
    anomalie: { icone: 'x', titre: 'Vérification nécessaire', texte: 'Nous devons vérifier cette transaction à la main. Contacte le support avec ta référence : nous réglons le problème.', cls: 'bad' },
    introuvable: { icone: 'x', titre: 'Transaction introuvable', texte: 'Nous ne retrouvons pas ce paiement. Ouvre la page Mon profil pour voir ton abonnement.', cls: 'bad' },
    non_connecte: { icone: 'lock', titre: 'Connecte-toi pour continuer', texte: 'Connecte-toi avec le compte utilisé pour le paiement afin de voir son statut.', cls: 'wait' },
    reseau: { icone: 'wifiOff', titre: 'Problème de connexion', texte: 'Vérifie ton réseau puis réessaie.', cls: 'wait' },
    remboursee: { icone: 'x', titre: 'Paiement remboursé', texte: 'Cette transaction a été remboursée.', cls: 'bad' },
  };
  const c = contenus[etat] || contenus.en_attente;

  return (
    <SiteShell>
      <main className="lp-wrap ab-retour">
        <div className={`ab-result ${c.cls}`} role="status" aria-live="polite">
          <span className="ab-result-ic"><Icon name={c.icone} size={34} /></span>
          <h1 className="brand-font">{c.titre}</h1>
          <p>{c.texte}</p>
          {ref && etat !== 'introuvable' && <p className="ab-ref">Référence : {ref}</p>}
          <div className="ab-result-actions">
            {etat === 'payee' && <Link className="btn-primary" href="/">Accéder aux cours</Link>}
            {etat === 'en_attente' && <button className="btn-dark" onClick={() => lancer(ref)}>Vérifier à nouveau</button>}
            {(etat === 'echouee' || etat === 'annulee' || etat === 'anomalie') && <Link className="btn-dark" href="/tarifs">Voir les formules</Link>}
            {(etat === 'echouee' || etat === 'anomalie' || etat === 'en_attente') && <Link className="btn-light" href="/contact">Contacter le support</Link>}
            {etat === 'non_connecte' && <Link className="btn-dark" href="/login">Se connecter</Link>}
            {(etat === 'introuvable' || etat === 'payee') && <Link className="btn-light" href="/profil">Mon profil</Link>}
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
