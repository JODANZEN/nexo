import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Poppins } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
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
    <ClerkProvider>
      <html lang="es" className={poppins.variable}>
        <body className="font-sans">
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
