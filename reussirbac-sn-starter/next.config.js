/** @type {import('next').NextConfig} */

// En-têtes de sécurité envoyés avec chaque page.
// CSP = liste blanche des sources autorisées : même si une faille permettait d'injecter du code,
// le navigateur refuserait de le charger depuis un site non prévu.
let supabaseHote = '';
try { supabaseHote = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin; } catch (e) { /* non configuré */ }
const supabase = ['https://*.supabase.co', supabaseHote].filter(Boolean).join(' ');
const supabaseWs = 'wss://*.supabase.co';
const dev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  // Next.js injecte de petits scripts en ligne : 'unsafe-inline' est nécessaire sans système de nonce.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${supabase} https://i.ytimg.com`,
  `connect-src 'self' blob: data: ${supabase} ${supabaseWs}${dev ? ' ws://localhost:*' : ''}`,
  `frame-src 'self' blob: ${supabase} https://www.youtube-nocookie.com`,
  `media-src 'self' blob: ${supabase}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",      // personne ne peut afficher le site dans un cadre (anti-clickjacking)
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securite = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // ne pas annoncer la technologie utilisée
  async headers() {
    return [
      { source: '/:path*', headers: securite },
      // Le service worker doit toujours être revérifié (sinon une mise à jour peut rester bloquée)
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
      // Réponses des routes de paiement : jamais mises en cache
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

module.exports = nextConfig;
