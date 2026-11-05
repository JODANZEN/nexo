'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Loader2, UploadCloud, FileText, ExternalLink } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DocItem {
  documentId: string;
  title: string;
  visibility: string;
  fileSizeBytes: number;
  createdAt: string;
}

const VISIBILITY: Record<string, { label: string; badge: string }> = {
  ADMIN_ONLY: { label: 'Solo admins', badge: 'bg-gray-100 text-gray-600' },
  UNIT_OWNER: { label: 'Propietario', badge: 'bg-blue-50 text-blue-700' },
  UNIT_OCCUPANT: { label: 'Residente de unidad', badge: 'bg-blue-50 text-blue-700' },
  ALL_RESIDENTS: { label: 'Todos los residentes', badge: 'bg-green-50 text-green-700' },
  PUBLIC: { label: 'Público', badge: 'bg-nexo-teal/15 text-nexo-teal' },
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DocumentosPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'ADMIN';

  const list = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get<DocItem[]>('/documents'),
  });

  // Open a document via a fresh presigned URL — the raw URL is never rendered.
  const ver = useMutation({
    mutationFn: (id: string) => api.get<{ url: string }>(`/documents/${id}/url`),
    onSuccess: (res) => window.open(res.url, '_blank', 'noopener,noreferrer'),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
        <p className="mt-1 text-sm text-nexo-muted">
          Documentos del conjunto, servidos por enlaces temporales (300 s).
        </p>
      </div>

      {isAdmin ? <UploadForm onUploaded={() => qc.invalidateQueries({ queryKey: ['documents'] })} /> : null}

      <Card className="overflow-hidden">
        {list.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-nexo-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando documentos…
          </div>
        ) : list.isError ? (
          <div className="p-10 text-center text-sm text-red-600">
            Error: {(list.error as Error).message}
          </div>
        ) : !list.data || list.data.length === 0 ? (
          <div className="p-10 text-center text-sm text-nexo-muted">No hay documentos.</div>
        ) : (
          <ul className="divide-y divide-nexo-border">
            {list.data.map((doc) => {
              const vis = VISIBILITY[doc.visibility] ?? { label: doc.visibility, badge: 'bg-gray-100 text-gray-600' };
              const opening = ver.isPending && ver.variables === doc.documentId;
              return (
                <li key={doc.documentId} className="flex items-center gap-4 px-5 py-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-nexo-bg text-nexo-navy">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{doc.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-nexo-muted">
                      <span className={cn('rounded-full px-2 py-0.5 font-medium', vis.badge)}>{vis.label}</span>
                      <span>{fmtBytes(doc.fileSizeBytes)}</span>
                      <span>·</span>
                      <span>{fmtDate(doc.createdAt)}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={opening}
                    onClick={() => ver.mutate(doc.documentId)}
                  >
                    {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    Ver
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {ver.isError ? (
          <p className="px-5 pb-4 text-sm text-red-600">
            No se pudo abrir el documento: {(ver.error as Error).message}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const api = useApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState('ADMIN_ONLY');
  const [dragging, setDragging] = useState(false);

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('file', file as File);
      form.append('title', title.trim());
      form.append('visibility', visibility);
      return api.upload('/documents/upload', form);
    },
    onSuccess: () => {
      setFile(null);
      setTitle('');
      setVisibility('ADMIN_ONLY');
      onUploaded();
    },
  });

  function pickFile(f: File | undefined) {
    if (f && f.type === 'application/pdf') setFile(f);
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold tracking-tight">Subir documento</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* Drag-and-drop PDF */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pickFile(e.dataTransfer.files[0]);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors',
            dragging ? 'border-nexo-teal bg-nexo-teal/5' : 'border-nexo-border hover:bg-nexo-bg',
          )}
        >
          <UploadCloud className="h-6 w-6 text-nexo-muted" />
          {file ? (
            <span className="font-medium text-nexo-text">{file.name}</span>
          ) : (
            <span className="text-nexo-muted">Arrastra un PDF aquí o haz clic para elegir</span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Reglamento PH 2026"
              className="mt-1 h-10 w-full rounded-lg border border-nexo-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Visibilidad</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-nexo-border bg-white px-2 text-sm"
            >
              {Object.entries(VISIBILITY).map(([value, v]) => (
                <option key={value} value={value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            className="w-full"
            disabled={!file || !title.trim() || upload.isPending}
            onClick={() => upload.mutate()}
          >
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Subir'}
          </Button>
          {upload.isError ? (
            <p className="text-xs text-red-600">{(upload.error as Error).message}</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
