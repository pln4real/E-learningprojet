import Link from 'next/link';
import Icon from '../components/Icon';

export const metadata = { title: 'Hors ligne · RéussirBac SN' };

export default function HorsLignePage() {
  return (
    <main className="auth-center">
      <div className="card" style={{ maxWidth: 440, textAlign: 'center' }}>
        <span className="lock-badge" style={{ margin: '0 auto 14px' }}><Icon name="wifiOff" size={22} /></span>
        <h1 className="brand-font" style={{ fontSize: 24, margin: '0 0 8px' }}>Tu es hors connexion</h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14.5, lineHeight: 1.6, margin: '0 0 18px' }}>
          Les cours ont besoin d'internet pour s'afficher. Reconnecte-toi pour continuer.
          En attendant, tu peux calculer ta moyenne : cette page fonctionne sans connexion.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/moyenne" className="btn-dark">Calculer ma moyenne</Link>
          <Link href="/" className="btn-light">Réessayer</Link>
        </div>
      </div>
    </main>
  );
}
