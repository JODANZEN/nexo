import { SignIn } from '@clerk/nextjs';
import { NexoLogo } from '@/components/nexo-logo';

export const dynamic = 'force-dynamic';

// Sign-in and sign-up on one screen: invited residents and staff just type their
// phone, get an SMS code, and their invitation links the account automatically.
export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-nexo-bg px-4 py-10">
      <div className="text-nexo-navy">
        <NexoLogo />
      </div>
      <p className="mt-3 text-center text-sm text-nexo-muted">Entra con tu celular. Te enviamos un código por SMS.</p>
      <div className="mt-6">
        <SignIn withSignUp fallbackRedirectUrl="/" />
      </div>
    </div>
  );
}
