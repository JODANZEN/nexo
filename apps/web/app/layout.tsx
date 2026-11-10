import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Poppins } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { esMX } from '@clerk/localizations';
import { NEXO_NAVY } from '@/lib/brand';
import { Providers } from './providers';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Nexo — Administración PH',
  description: 'Todo lo que tu propiedad necesita, en una sola plataforma',
  applicationName: 'Nexo',
  manifest: '/manifest.webmanifest',
  // Home-screen install on iPhone (Safari ignores most of the manifest).
  appleWebApp: { capable: true, title: 'Nexo', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // Next only emits `mobile-web-app-capable`; older iOS still wants the Apple-prefixed tag.
  other: { 'apple-mobile-web-app-capable': 'yes' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: NEXO_NAVY,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Spanish + in-app sign-in (not Clerk's hosted English page). One screen for
    // sign-in and sign-up: invited residents just type their phone.
    <ClerkProvider localization={esMX} signInUrl="/sign-in" signUpUrl="/sign-in">
      <html lang="es" className={poppins.variable}>
        <body className="font-sans">
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
