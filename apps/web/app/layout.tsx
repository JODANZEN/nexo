import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Poppins } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { esMX } from '@clerk/localizations';
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
