'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton, ErrorState } from '@/components/ui/states';

export const dynamic = 'force-dynamic';

interface Config {
  id: string;
  name: string;
  nit: string;
  address: string;
  city: string;
  department: string;
  totalUnits: number;
  moraRate: number;
  prontoPagoRate: number;
  parkingRatePerHour: number;
}

export default function ConfiguracionPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['configuracion'],
    queryFn: () => api.get<Config>('/configuracion'),
  });

  const [form, setForm] = useState<Config | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch('/configuracion', {
        name: form?.name,
        address: form?.address,
        city: form?.city,
        department: form?.department,
        // rates are entered as percentages for mora/pronto; convert back to fractions
        moraRate: form ? form.moraRate : undefined,
        prontoPagoRate: form ? form.prontoPagoRate : undefined,
        parkingRatePerHour: form ? form.parkingRatePerHour : undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configuracion'] }),
  });

  const cls =
    'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="mt-1 text-sm text-nexo-muted">Perfil del conjunto y tarifas.</p>
      </div>

      {isLoading || !form ? (
        <Card className="p-5">
          <Skeleton rows={6} />
        </Card>
      ) : isError ? (
        <ErrorState error={error} />
      ) : (
        <>
          <Card className="p-5">
            <h2 className="text-base font-semibold tracking-tight">Perfil</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Nombre</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={cls} />
              </div>
              <div>
                <label className="text-sm font-medium">NIT</label>
                <input value={form.nit} disabled className={`${cls} bg-nexo-bg text-nexo-muted`} />
              </div>
              <div>
                <label className="text-sm font-medium">Ciudad</label>
                <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={cls} />
              </div>
              <div>
                <label className="text-sm font-medium">Departamento</label>
                <input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className={cls}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Unidades</label>
                <input value={form.totalUnits} disabled className={`${cls} bg-nexo-bg text-nexo-muted`} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Dirección</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className={cls}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold tracking-tight">Tarifas</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-sm font-medium">Mora mensual</label>
                <input
                  type="number"
                  step="0.0001"
                  value={form.moraRate}
                  onChange={(e) => setForm({ ...form, moraRate: Number(e.target.value) })}
                  className={cls}
                />
                <p className="mt-1 text-xs text-nexo-muted">Fracción (0.015 = 1.5%)</p>
              </div>
              <div>
                <label className="text-sm font-medium">Pronto pago</label>
                <input
                  type="number"
                  step="0.0001"
                  value={form.prontoPagoRate}
                  onChange={(e) => setForm({ ...form, prontoPagoRate: Number(e.target.value) })}
                  className={cls}
                />
                <p className="mt-1 text-xs text-nexo-muted">Fracción (0.05 = 5%)</p>
              </div>
              <div>
                <label className="text-sm font-medium">Parqueadero / hora</label>
                <input
                  type="number"
                  step="100"
                  value={form.parkingRatePerHour}
                  onChange={(e) => setForm({ ...form, parkingRatePerHour: Number(e.target.value) })}
                  className={cls}
                />
                <p className="mt-1 text-xs text-nexo-muted">COP</p>
              </div>
            </div>
          </Card>

          <div className="flex items-center gap-3">
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar cambios'}
            </Button>
            {save.isSuccess ? <span className="text-sm text-green-600">Guardado ✓</span> : null}
            {save.isError ? <span className="text-sm text-red-600">{(save.error as Error).message}</span> : null}
          </div>
        </>
      )}
    </div>
  );
}
