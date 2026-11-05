'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Upload, X } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export interface UnitRow {
  unitNumber: string;
  tower?: string;
  floor?: string;
  roomType?: string;
  monthlyFee?: string;
  coeficiente?: string;
}
interface ImportResult {
  row: number;
  unitNumber: string;
  status: 'created' | 'updated' | 'unchanged' | 'error';
  reason?: string;
}

const fieldCls =
  'mt-1 h-10 w-full rounded-lg border border-nexo-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

function apiMessage(err: unknown): string {
  const raw = (err as Error)?.message ?? 'Error';
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    return Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message ?? raw;
  } catch {
    return raw;
  }
}

const HEADER_KEYS: Record<keyof UnitRow, RegExp> = {
  unitNumber: /^(unidad|apto|apartamento|habitaci[oó]n|cuarto|room|n[uú]mero|unit)/i,
  tower: /^(torre|bloque|edificio|tower)/i,
  floor: /^(piso|nivel|floor)/i,
  roomType: /^(tipo|type|categor)/i,
  monthlyFee: /^(cuota|valor|tarifa|canon|precio|fee)/i,
  coeficiente: /^(coef)/i,
};
const DEFAULT_ORDER: (keyof UnitRow)[] = ['unitNumber', 'tower', 'floor', 'roomType', 'monthlyFee', 'coeficiente'];

function splitLine(line: string): string[] {
  const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  // Quoted cells may contain the separator ("1.250.000,00").
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** CSV / Excel paste → rows. Header row optional; recognised by column names in Spanish. */
export function parseUnitsCsv(text: string): UnitRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  let order = DEFAULT_ORDER;
  const first = splitLine(lines[0]);
  const mapped = first.map((h) => (Object.keys(HEADER_KEYS) as (keyof UnitRow)[]).find((k) => HEADER_KEYS[k].test(h)));
  if (mapped.includes('unitNumber')) {
    order = mapped as (keyof UnitRow)[];
    lines.shift();
  }
  return lines
    .map((line) => {
      const cols = splitLine(line);
      const row: UnitRow = { unitNumber: '' };
      order.forEach((key, i) => {
        if (key && cols[i]) row[key] = cols[i];
      });
      return row;
    })
    .filter((r) => r.unitNumber);
}

const CHUNK = 300;

export function ImportUnitsDialog({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const rows = useMemo(() => parseUnitsCsv(text), [text]);
  const types = useMemo(() => new Set(rows.map((r) => r.roomType?.trim().toLowerCase()).filter(Boolean)).size, [rows]);

  const send = useMutation({
    mutationFn: async () => {
      const all: ImportResult[] = [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        setProgress(`${Math.min(i + CHUNK, rows.length)} de ${rows.length}…`);
        const res = await api.post<{ results: ImportResult[] }>('/units/bulk', { rows: rows.slice(i, i + CHUNK) });
        all.push(...res.results.map((r) => ({ ...r, row: r.row + i })));
      }
      return all;
    },
    onSettled: () => {
      setProgress(null);
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['room-types'] });
    },
  });
  const results = send.data;
  const count = (s: ImportResult['status']) => results?.filter((r) => r.status === s).length ?? 0;

  return (
    <Dialog open onClose={onClose} title="Importar unidades / habitaciones">
      {!results ? (
        <div className="space-y-3">
          <p className="text-sm text-nexo-muted">
            Pega desde Excel o sube un CSV. Columnas: <b>unidad, torre, piso, tipo, cuota, coeficiente</b> (solo la
            unidad es obligatoria). Si una unidad ya existe, se actualiza. Los tipos que no existan se crean.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={'unidad,torre,piso,tipo,cuota\n101,A,1,Sencilla,1.250.000\n102,A,1,Doble,1.650.000'}
            className="w-full rounded-lg border border-nexo-border bg-white p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-nexo-teal"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-nexo-teal">
            <Upload className="h-4 w-4" /> Subir archivo .csv
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setText(await f.text());
              }}
            />
          </label>
          {rows.length ? (
            <p className="text-xs text-nexo-muted">
              {rows.length} fila{rows.length === 1 ? '' : 's'} detectada{rows.length === 1 ? '' : 's'}
              {types ? ` · ${types} tipo${types === 1 ? '' : 's'} de habitación` : ''}
            </p>
          ) : null}
          <Button variant="accent" className="w-full" disabled={!rows.length || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {send.isPending ? `Importando ${progress ?? ''}` : rows.length ? `Importar ${rows.length}` : 'Importar'}
          </Button>
          {send.isError ? <p className="text-xs text-red-600">{apiMessage(send.error)}</p> : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            <b>{count('created')}</b> creadas · <b>{count('updated')}</b> actualizadas · <b>{count('unchanged')}</b> sin
            cambios · <b>{count('error')}</b> con error
          </p>
          {count('error') ? (
            <ul className="max-h-60 divide-y divide-nexo-border overflow-auto rounded-lg border border-nexo-border text-xs">
              {results
                .filter((r) => r.status === 'error')
                .map((r) => (
                  <li key={r.row} className="flex justify-between gap-2 px-3 py-2">
                    <span>
                      Fila {r.row}: {r.unitNumber || '—'}
                    </span>
                    <span className="text-red-600">{r.reason}</span>
                  </li>
                ))}
            </ul>
          ) : null}
          <Button className="w-full" onClick={onClose}>
            <X className="h-4 w-4" /> Cerrar
          </Button>
        </div>
      )}
    </Dialog>
  );
}

export interface EditableUnit {
  id: string;
  unit_number: string;
  tower: string | null;
  floor: number | null;
  monthly_fee: number;
  coeficiente: number;
}

/** Create (no `unit`) or edit a single unit. */
export function UnitDialog({ unit, onClose }: { unit?: EditableUnit; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [unitNumber, setUnitNumber] = useState(unit?.unit_number ?? '');
  const [tower, setTower] = useState(unit?.tower ?? '');
  const [floor, setFloor] = useState(unit?.floor != null ? String(unit.floor) : '');
  const [fee, setFee] = useState(unit ? String(unit.monthly_fee) : '');
  const [coef, setCoef] = useState(unit ? String(unit.coeficiente) : '');

  const save = useMutation({
    mutationFn: () => {
      const body = {
        unitNumber: unitNumber.trim(),
        tower: tower.trim() || null,
        floor: floor.trim() || null,
        monthlyFee: fee.trim() || undefined,
        coeficiente: coef.trim() || undefined,
      };
      return unit ? api.patch(`/units/${unit.id}`, body) : api.post('/units', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      onClose();
    },
  });

  return (
    <Dialog open onClose={onClose} title={unit ? `Editar unidad ${unit.unit_number}` : 'Agregar unidad'}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-1 block text-sm font-medium">
            Número
            <input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="1204" className={fieldCls} />
          </label>
          <label className="block text-sm font-medium">
            Torre
            <input value={tower} onChange={(e) => setTower(e.target.value)} placeholder="A" className={fieldCls} />
          </label>
          <label className="block text-sm font-medium">
            Piso
            <input value={floor} onChange={(e) => setFloor(e.target.value)} inputMode="numeric" className={fieldCls} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium">
            Cuota mensual
            <input value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Del tipo de habitación" inputMode="decimal" className={fieldCls} />
          </label>
          <label className="block text-sm font-medium">
            Coeficiente
            <input value={coef} onChange={(e) => setCoef(e.target.value)} placeholder="0" inputMode="decimal" className={fieldCls} />
          </label>
        </div>
        <Button variant="accent" className="w-full" disabled={!unitNumber.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {unit ? 'Guardar' : 'Agregar'}
        </Button>
        {save.isError ? <p className="text-xs text-red-600">{apiMessage(save.error)}</p> : null}
      </div>
    </Dialog>
  );
}
