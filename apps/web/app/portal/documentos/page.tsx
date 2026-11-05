'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, FileText, ExternalLink } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';

interface DocItem {
  documentId: string;
  title: string;
  fileSizeBytes: number;
  createdAt: string;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PortalDocumentos() {
  const api = useApi();
  const list = useQuery({ queryKey: ['documents'], queryFn: () => api.get<DocItem[]>('/documents') });
  const ver = useMutation({
    mutationFn: (docId: string) => api.get<{ url: string }>(`/documents/${docId}/url`),
    onSuccess: (res) => window.open(res.url, '_blank', 'noopener,noreferrer'),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Documentos</h1>

      <Card className="overflow-hidden">
        {list.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-nexo-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : list.isError ? (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error al cargar datos. {(list.error as Error).message}
          </div>
        ) : !list.data || list.data.length === 0 ? (
          <div className="p-8 text-center text-sm text-nexo-muted">Sin documentos aún.</div>
        ) : (
          <ul className="divide-y divide-nexo-border">
            {list.data.map((doc) => {
              const opening = ver.isPending && ver.variables === doc.documentId;
              return (
                <li key={doc.documentId}>
                  <button
                    onClick={() => ver.mutate(doc.documentId)}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-nexo-bg"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-nexo-bg text-nexo-navy">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{doc.title}</div>
                      <div className="text-xs text-nexo-muted">
                        {fmtBytes(doc.fileSizeBytes)} · {fmtDate(doc.createdAt)}
                      </div>
                    </div>
                    {opening ? (
                      <Loader2 className="h-4 w-4 animate-spin text-nexo-muted" />
                    ) : (
                      <ExternalLink className="h-4 w-4 text-nexo-teal" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {ver.isError ? (
          <p className="px-5 pb-4 text-sm text-red-600">{(ver.error as Error).message}</p>
        ) : null}
      </Card>
    </div>
  );
}
