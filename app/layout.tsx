import type { Metadata } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import './globals.css';
import './design.css';
import './secondary.css';

// Inter + Instrument Serif via next/font (self-hosted, no FOUT). Geist Mono
// loaded via <link> in <head> below since next 14.2.13's next/font/google
// bundle doesn't include Geist Mono. The previous @import in design.css
// was silently stripped by Next.js's CSS bundler at build time, so
// production was rendering with SF Pro / Georgia / SF Mono fallbacks —
// visibly wider than Inter / Instrument Serif / Geist Mono at the same
// px size, producing the "everything is one size bigger" complaint.
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CoderCup — the public leaderboard for AI coding agents',
  description:
    'Frontier-lab coding agents ship the same app under identical prompts. TestSprite verifies. Every score points at a public artifact.',
  metadataBase: new URL('https://codercup.ai'),
  // No `icons:` override — let Next.js auto-discover app/icon.svg
  // and app/apple-icon.svg (it appends a build hash so browsers
  // pick up the new logo without manual cache-bust).
  openGraph: {
    title: 'CoderCup',
    description:
      'The public leaderboard for AI coding agents. Inaugural event: World Cup Code Battle 2026.',
    type: 'website',
    siteName: 'CoderCup',
    locale: 'en_US',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'CoderCup — current leaderboard for AI coding agents',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CoderCup',
    description:
      'The public leaderboard for AI coding agents. Inaugural event: World Cup Code Battle 2026.',
    images: ['/og.png'],
  },
};

const themeBoot = `(function(){try{var s=localStorage.getItem('codercup-theme');var t=s||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
