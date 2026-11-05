'use client';

import { useQuery } from '@tanstack/react-query';
import { useUser, useClerk } from '@clerk/nextjs';
import { User, Phone, Mail, Home, LogOut } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Me {
  unitNumber: string | null;
}

export default function PortalPerfil() {
  const api = useApi();
  const { user } = useUser();
  const { signOut } = useClerk();

  // Profile identity comes from Clerk (always available); the unit number is the
  // only field we still need from our API, and it's optional.
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/users/me') });

  const name = user?.fullName ?? user?.firstName ?? '—';
  const email = user?.primaryEmailAddress?.emailAddress ?? '—';
  const phone = user?.primaryPhoneNumber?.phoneNumber ?? '—';
  const unitNumber = me.data?.unitNumber ?? null;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Perfil</h1>

      <Card className="p-5">
        <ul className="space-y-3">
          <Field icon={User} label="Nombre" value={name} />
          <Field icon={Mail} label="Email" value={email} />
          <Field icon={Phone} label="Teléfono" value={phone} />
          <Field
            icon={Home}
            label="Unidad"
            value={unitNumber ?? (me.isLoading ? '…' : 'No asignada')}
          />
        </ul>
      </Card>

      <Button
        variant="outline"
        className="w-full text-red-600"
        onClick={() => signOut({ redirectUrl: '/sign-in' })}
      >
        <LogOut className="h-4 w-4" /> Cerrar sesión
      </Button>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-nexo-bg text-nexo-navy">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="text-xs text-nexo-muted">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </li>
  );
}
