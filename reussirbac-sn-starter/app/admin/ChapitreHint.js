'use client';

import { cleChapitre } from '../../lib/texte';

// Indique si le nom saisi correspond à un chapitre existant ou en créera un nouveau.
export default function ChapitreHint({ nom, chapitres, matiereId }) {
  if (!matiereId || !nom.trim()) return null;
  const trouve = chapitres.find((c) => cleChapitre(c.nom) === cleChapitre(nom));
  return (
    <p style={{ fontSize: 12.5, margin: '8px 0 0', color: trouve ? '#145c3d' : 'var(--ink-soft)' }}>
      {trouve
        ? `Chapitre existant : le contenu sera ajouté dans « ${trouve.nom} ».`
        : "Nouveau chapitre : il sera créé à l'enregistrement."}
    </p>
  );
}
