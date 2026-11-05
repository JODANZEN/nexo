'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, Download, FileText, Upload } from 'lucide-react';
import { useApi, ApiError } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cop } from '@/lib/status-badges';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Phase = 'PRONTO_PAGO' | 'TARIFA_PLENA' | 'MORA';
interface Cuenta {
  unitNumber: string;
  residentName: string | null;
  periodLabel: string;
  baseAmount: number;
  paidAmount: number;
  outstanding: number;
  daysLate: number;
  phase: Phase;
}

const PHASE: Record<Phase, { row: string; label: string }> = {
  PRONTO_PAGO: { row: 'bg-green-50', label: 'Pronto pago' },
  TARIFA_PLENA: { row: 'bg-yellow-50', label: 'Al día' },
  MORA: { row: 'bg-red-50', label: 'Mora' },
};

const TABS = ['Cartera', 'Paz y Salvo', 'Conciliación'] as const;
type Tab = (typeof TABS)[number];

export default function ContabilidadPage() {
  const [tab, setTab] = useState<Tab>('Cartera');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Contabilidad</h1>

      <div className="flex gap-1 border-b border-nexo-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === t
                ? 'border-nexo-teal text-nexo-teal'
                : 'border-transparent text-nexo-muted hover:text-nexo-text',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Cartera' ? <CarteraTab /> : null}
      {tab === 'Paz y Salvo' ? <PazSalvoTab /> : null}
      {tab === 'Conciliación' ? <ConciliacionTab /> : null}
    </div>
  );
}

function CarteraTab() {
  const api = useApi();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cuentas-por-cobrar'],
    queryFn: () => api.get<Cuenta[]>('/contabilidad/cuentas-por-cobrar'),
  });

  function exportCsv() {
    const rows = data ?? [];
    const header = ['Unidad', 'Residente', 'Periodo', 'Cuota', 'Pagado', 'Pendiente', 'Dias mora', 'Estado'];
    const body = rows.map((r) =>
      [r.unitNumber, r.residentName ?? '', r.periodLabel, r.baseAmount, r.paidAmount, r.outstanding, r.daysLate, PHASE[r.phase].label]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [header.join(','), ...body].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cartera.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data || data.length === 0}>
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-nexo-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : isError ? (
          <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error al cargar datos. {(error as Error).message}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="p-8 text-center text-sm text-nexo-muted">Sin datos aún.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nexo-border text-left text-xs uppercase tracking-wide text-nexo-muted">
                <th className="px-4 py-3 font-medium">Unidad</th>
                <th className="px-4 py-3 font-medium">Residente</th>
                <th className="px-4 py-3 font-medium">Periodo</th>
                <th className="px-4 py-3 font-medium">Cuota</th>
                <th className="px-4 py-3 font-medium">Pagado</th>
                <th className="px-4 py-3 font-medium">Pendiente</th>
                <th className="px-4 py-3 font-medium">Días mora</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={`${r.unitNumber}-${i}`} className={cn('border-b border-nexo-border last:border-0', PHASE[r.phase].row)}>
                  <td className="px-4 py-3 font-medium">{r.unitNumber}</td>
                  <td className="px-4 py-3">{r.residentName ?? '—'}</td>
                  <td className="px-4 py-3 text-nexo-muted">{r.periodLabel}</td>
                  <td className="px-4 py-3">{cop(r.baseAmount)}</td>
                  <td className="px-4 py-3">{cop(r.paidAmount)}</td>
                  <td className="px-4 py-3 font-medium">{cop(r.outstanding)}</td>
                  <td className="px-4 py-3">{r.daysLate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

interface UnitRef {
  id: string;
  unit_number: string;
}

function PazSalvoTab() {
  const api = useApi();
  const [unitId, setUnitId] = useState('');
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<UnitRef[]>('/units') });

  const gen = useMutation({
    mutationFn: async () => {
      const blob = await api.getBlob(`/contabilidad/paz-y-salvo/${unitId}`);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
    },
  });

  let errorMsg: string | null = null;
  if (gen.isError) {
    const e = gen.error as ApiError;
    try {
      const parsed = JSON.parse(e.message) as { error?: string; totalDue?: number };
      errorMsg = parsed.error
        ? `${parsed.error}${parsed.totalDue != null ? ` (${cop(parsed.totalDue)})` : ''}`
        : e.message;
    } catch {
      errorMsg = e.message;
    }
  }

  return (
    <Card className="max-w-md p-5">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-nexo-teal" />
        <h2 className="text-base font-semibold tracking-tight">Generar Paz y Salvo</h2>
      </div>
      <p className="mt-2 text-sm text-nexo-muted">
        Selecciona una unidad. Solo se genera si la unidad está al día.
      </p>
      <select
        value={unitId}
        onChange={(e) => setUnitId(e.target.value)}
        className="mt-3 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal"
      >
        <option value="">Selecciona una unidad…</option>
        {(units.data ?? []).map((u) => (
          <option key={u.id} value={u.id}>
            {u.unit_number}
          </option>
        ))}
      </select>
      <Button
        variant="accent"
        className="mt-3 w-full"
        disabled={!unitId || gen.isPending}
        onClick={() => gen.mutate()}
      >
        {gen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generar PDF'}
      </Button>
      {errorMsg ? <p className="mt-2 text-sm text-red-600">{errorMsg}</p> : null}
    </Card>
  );
}

interface ConciliacionResult {
  matched: number;
  unmatched: number;
  rows: { date: string; description: string; amount: string; reference: string; matched: boolean }[];
}

function ConciliacionTab() {
  const api = useApi();
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('statement', file as File);
      return api.upload<ConciliacionResult>('/contabilidad/conciliacion', form);
    },
  });

  const res = upload.data;

  return (
    <div className="space-y-4">
      <Card className="max-w-lg p-5">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-nexo-teal" />
          <h2 className="text-base font-semibold tracking-tight">Conciliación bancaria</h2>
        </div>
        <p className="mt-2 text-sm text-nexo-muted">
          Sube un extracto en CSV con columnas: fecha, descripción, monto, referencia.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-3 block w-full text-sm text-nexo-muted file:mr-3 file:rounded-lg file:border-0 file:bg-nexo-teal file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-nexo-teal/90"
        />
        <Button
          variant="accent"
          className="mt-3 w-full"
          disabled={!file || upload.isPending}
          onClick={() => upload.mutate()}
        >
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Conciliar'}
        </Button>
        {upload.isError ? <p className="mt-2 text-sm text-red-600">{(upload.error as Error).message}</p> : null}
      </Card>

      {res ? (
        <Card className="overflow-hidden">
          <div className="flex gap-4 border-b border-nexo-border p-4 text-sm">
            <span className="font-medium text-green-700">Conciliados: {res.matched}</span>
            <span className="font-medium text-nexo-muted">Sin coincidencia: {res.unmatched}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nexo-border text-left text-xs uppercase tracking-wide text-nexo-muted">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Descripción</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Referencia</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {res.rows.map((r, i) => (
                <tr key={i} className="border-b border-nexo-border last:border-0">
                  <td className="px-4 py-3 text-nexo-muted">{r.date}</td>
                  <td className="px-4 py-3">{r.description}</td>
                  <td className="px-4 py-3">{r.amount}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.reference}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-medium',
                        r.matched ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {r.matched ? 'Conciliado' : 'Sin coincidencia'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
