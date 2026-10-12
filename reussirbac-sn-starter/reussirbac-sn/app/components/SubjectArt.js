import { subjectKey, subjectColor } from '../../lib/subjects';

// Pictogrammes dessinés pour l'application (viewBox 64x64, trait uniforme).
const GLYPHS = {
  maths: <><rect x="14" y="8" width="36" height="48" rx="6" /><rect x="20" y="14" width="24" height="10" rx="2" /><g fill="currentColor" stroke="none"><circle cx="23" cy="34" r="2.6" /><circle cx="32" cy="34" r="2.6" /><circle cx="41" cy="34" r="2.6" /><circle cx="23" cy="44" r="2.6" /><circle cx="32" cy="44" r="2.6" /><circle cx="41" cy="44" r="2.6" /></g></>,
  francais: <><path d="M50 10C32 12 20 24 18 44l-4 8" /><path d="M18 44c16 0 28-12 32-34" /><path d="M24 38l14-14" /></>,
  physique: <><path d="M26 8h12" /><path d="M28 8v16L14 50a4 4 0 0 0 3.5 6h29a4 4 0 0 0 3.5-6L36 24V8" /><path d="M20 40h24" /></>,
  svt: <><path d="M12 52C12 28 28 12 52 12c0 24-16 40-40 40z" /><path d="M12 52l24-24" /></>,
  histoire: <><path d="M8 24L32 10l24 14z" /><path d="M16 28v22M27 28v22M37 28v22M48 28v22M10 54h44" /></>,
  geo: <><circle cx="32" cy="32" r="22" /><ellipse cx="32" cy="32" rx="10" ry="22" /><path d="M10 32h44M14 20h36M14 44h36" /></>,
  histgeo: <><path d="M10 14l14-4 16 6 14-4v36l-14 4-16-6-14 4z" /><path d="M24 10v36M40 16v36" /></>,
  philo: <><path d="M32 8a16 16 0 0 0-8 30v6h16v-6A16 16 0 0 0 32 8z" /><path d="M26 52h12M28 58h8" /></>,
  anglais: <><path d="M10 12h44v30H30l-12 10V42h-8z" /><path d="M20 22h24M20 31h14" /></>,
  eps: <><circle cx="32" cy="32" r="22" /><path d="M32 10v44M10 32h44M16 16c8 8 8 24 0 32M48 16c-8 8-8 24 0 32" /></>,
  emc: <><path d="M32 10v40M20 52h24M12 22h40" /><path d="M12 22L5 36h14zM52 22l-7 14h14z" /></>,
  info: <><rect x="8" y="12" width="48" height="32" rx="3" /><path d="M24 56h16M32 44v12M22 24l-6 6 6 6M42 24l6 6-6 6" /></>,
  defaut: <><path d="M10 12h20a6 6 0 0 1 6 6v36a6 6 0 0 0-6-6H10z" /><path d="M54 12H34a6 6 0 0 0-6 6v36a6 6 0 0 1 6-6h20z" /></>,
};

export function SubjectGlyph({ nom, size = 28 }) {
  const key = subjectKey(nom);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: subjectColor(nom) }}>
      {GLYPHS[key]}
    </svg>
  );
}

// Haut de tuile : formes abstraites teintées + pictogramme.
export default function SubjectArt({ nom }) {
  const c = subjectColor(nom);
  return (
    <div className="tile-art" style={{ background: c + '1F' }}>
      <svg viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice" className="tile-shapes" aria-hidden="true">
        <circle cx="30" cy="20" r="34" fill={c} fillOpacity=".14" />
        <circle cx="178" cy="92" r="42" fill={c} fillOpacity=".16" />
        <rect x="128" y="-14" width="44" height="44" rx="12" transform="rotate(24 150 8)" fill={c} fillOpacity=".12" />
      </svg>
      <div className="tile-glyph"><SubjectGlyph nom={nom} size={58} /></div>
    </div>
  );
}
