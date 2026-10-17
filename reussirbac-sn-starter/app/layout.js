import './globals.css';
import RegisterSW from './components/RegisterSW';

export const metadata = {
  title: 'RéussirBac SN',
  description: "Prépare ton BFEM et ton Bac, où que tu sois au Sénégal.",
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'RéussirBac', statusBarStyle: 'default' },
};

export const viewport = { themeColor: '#1B2168' };

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Instrument+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}<RegisterSW /></body>
    </html>
  );
}
