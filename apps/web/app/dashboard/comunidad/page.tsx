'use client';

import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/states';

export const dynamic = 'force-dynamic';

interface Resident {
  id: string;
  name: string;
  phone: string;
  role: string;
  unitNumber: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  RESIDENT: 'Residente',
  GUARD: 'Portería',
  REVISOR_FISCAL: 'Revisor fiscal',
  SUPER_ADMIN: 'Super admin',
};

export default function ComunidadPage() {
  const api = useApi();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['comunidad', 'directory'],
    queryFn: () => api.get<Resident[]>('/comunidad/directory'),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comunidad</h1>
        <p className="mt-1 text-sm text-nexo-muted">Directorio de residentes y miembros del conjunto.</p>
      </div>

      {isLoading ? (
        <Card className="p-5">
          <Skeleton rows={5} />
        </Card>
      ) : isError ? (
        <ErrorState error={error} />
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState icon={<Users className="h-8 w-8 text-nexo-faint" />}>Sin miembros aún.</EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nexo-border text-left text-xs uppercase tracking-wide text-nexo-muted">
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 font-medium">Unidad</th>
                <th className="px-5 py-3 font-medium">Teléfono</th>
                <th className="px-5 py-3 font-medium">Rol</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-b border-nexo-border last:border-0">
                  <td className="px-5 py-3 font-medium">{r.name}</td>
                  <td className="px-5 py-3 text-nexo-muted">{r.unitNumber ?? '—'}</td>
                  <td className="px-5 py-3 text-nexo-muted">{r.phone || '—'}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-nexo-bg px-2.5 py-0.5 text-xs font-medium text-nexo-navy">
                      {ROLE_LABEL[r.role] ?? r.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
