'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/nextjs';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NexoLogo } from '@/components/nexo-logo';

const fieldCls =
  'mt-1 h-10 w-full rounded-lg border border-nexo-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

export default function OnboardingPage() {
  const api = useApi();
  const { getToken } = useAuth();
  const [mode, setMode] = useState<'checking' | 'wizard' | 'no-invite'>('checking');
  const [step, setStep] = useState<1 | 2>(1);
  const [conjuntoId, setConjuntoId] = useState<string | null>(null);
  const ran = useRef(false);

  // Refresh the token so the new publicMetadata (conjuntoId) lands in the cookie,
  // then hard-navigate so middleware re-evaluates with the fresh claims.
  async function finish() {
    await getToken({ skipCache: true });
    window.location.assign('/dashboard');
  }

  // On mount, try to claim a pending resident invite (matched by verified phone).
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    api
      .post('/users/provision', {})
      .then(() => finish())
      .catch(async () => {
        // No pending invite for this phone. Only the Nexo team may create conjuntos;
        // everyone else needs an invite from their administración.
        const can = await api
          .get<{ allowed: boolean }>('/conjuntos/can-create')
          .catch(() => ({ allowed: false }));
        setMode(can.allowed ? 'wizard' : 'no-invite');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mode === 'checking') {
    return (
      <Centered>
        <Loader2 className="h-5 w-5 animate-spin text-nexo-navy" />
        <p className="text-sm text-nexo-muted">Configurando tu cuenta…</p>
      </Centered>
    );
  }

  if (mode === 'no-invite') return <NoInvite />;

  return (
    <Centered>
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center text-nexo-navy">
          <NexoLogo />
        </div>
        {step === 1 ? (
          <ConjuntoStep
            onCreated={(id) => {
              setConjuntoId(id);
              setStep(2);
            }}
          />
        ) : (
          <ProfileStep conjuntoId={conjuntoId!} onDone={finish} />
        )}
      </div>
    </Centered>
  );
}

function ConjuntoStep({ onCreated }: { onCreated: (id: string) => void }) {
  const api = useApi();
  const [f, setF] = useState({ name: '', nit: '', address: '', city: '', totalUnits: '' });
  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/conjuntos', {
        name: f.name.trim(),
        nit: f.nit.trim(),
        address: f.address.trim(),
        city: f.city.trim(),
        totalUnits: Number(f.totalUnits) || 0,
      }),
    onSuccess: (c) => onCreated(c.id),
  });

  return (
    <Card className="p-6">
      <h1 className="text-lg font-bold tracking-tight">Crea tu conjunto</h1>
      <p className="mt-1 text-sm text-nexo-muted">Paso 1 de 2</p>
      <div className="mt-4 space-y-3">
        {(
          [
            ['name', 'Nombre del conjunto'],
            ['nit', 'NIT'],
            ['address', 'Dirección'],
            ['city', 'Ciudad'],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="text-sm font-medium">{label}</label>
            <input
              value={f[key]}
              onChange={(e) => setF({ ...f, [key]: e.target.value })}
              className={fieldCls}
            />
          </div>
        ))}
        <div>
          <label className="text-sm font-medium">Total de unidades</label>
          <input
            type="number"
            min={0}
            value={f.totalUnits}
            onChange={(e) => setF({ ...f, totalUnits: e.target.value })}
            className={fieldCls}
          />
        </div>
        <Button
          className="w-full"
          disabled={!f.name.trim() || !f.nit.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continuar'}
        </Button>
        {create.isError ? <p className="text-xs text-red-600">{(create.error as Error).message}</p> : null}
      </div>
    </Card>
  );
}

function ProfileStep({ conjuntoId, onDone }: { conjuntoId: string; onDone: () => void }) {
  const api = useApi();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const provision = useMutation({
    mutationFn: () => api.post('/users/provision', { conjuntoId, fullName: fullName.trim(), phone: phone.trim() }),
    onSuccess: onDone,
  });

  return (
    <Card className="p-6">
      <h1 className="text-lg font-bold tracking-tight">Confirma tu perfil</h1>
      <p className="mt-1 text-sm text-nexo-muted">Paso 2 de 2 — Administrador</p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="text-sm font-medium">Nombre completo</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label className="text-sm font-medium">Teléfono</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57..." className={fieldCls} />
        </div>
        <Button
          className="w-full"
          disabled={!fullName.trim() || provision.isPending}
          onClick={() => provision.mutate()}
        >
          {provision.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Finalizar'}
        </Button>
        {provision.isError ? <p className="text-xs text-red-600">{(provision.error as Error).message}</p> : null}
      </div>
    </Card>
  );
}

function NoInvite() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const phone = user?.primaryPhoneNumber?.phoneNumber;
  return (
    <Centered>
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center text-nexo-navy">
          <NexoLogo />
        </div>
        <Card className="p-6">
          <h1 className="text-lg font-bold tracking-tight">Aún no tienes una invitación</h1>
          <p className="mt-2 text-sm text-nexo-muted">
            Pídele a la administración de tu conjunto o residencia que te invite con este número
            {phone ? (
              <>
                : <b className="text-nexo-text">{phone}</b>
              </>
            ) : null}
            . Cuando lo haga, vuelve a entrar y tu cuenta se conecta sola.
          </p>
          <Button className="mt-5 w-full" variant="outline" onClick={() => signOut({ redirectUrl: '/' })}>
            Salir
          </Button>
        </Card>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-nexo-bg p-4">
      {children}
    </div>
  );
}
