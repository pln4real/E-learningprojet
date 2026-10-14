'use client';

import { useEffect, useState } from 'react';
import Icon from './Icon';

// Bouton « Installer l'application » : visible seulement quand le navigateur le permet.
export default function InstallButton({ className = 'btn-light' }) {
  const [evt, setEvt] = useState(null);
  const [installe, setInstalle] = useState(false);

  useEffect(() => {
    const avant = (e) => { e.preventDefault(); setEvt(e); };
    const fait = () => { setInstalle(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', avant);
    window.addEventListener('appinstalled', fait);
    return () => { window.removeEventListener('beforeinstallprompt', avant); window.removeEventListener('appinstalled', fait); };
  }, []);

  if (!evt || installe) return null;
  return (
    <button type="button" className={`${className} install-btn`} onClick={async () => { evt.prompt(); await evt.userChoice; setEvt(null); }}>
      <Icon name="install" size={16} /> Installer l'application
    </button>
  );
}
