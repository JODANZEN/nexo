'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useMemo } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Direct upload to a presigned R2 URL (storage, not our API — no auth header).
export async function putFileToPresignedUrl(url: string, file: File): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!res.ok) throw new ApiError(res.status, 'No se pudo subir el archivo');
}

/**
 * Typed API client bound to the current Clerk session. Attaches the JWT via
 * useAuth().getToken() and throws ApiError on any non-2xx response.
 * Keeps all fetch() calls out of components.
 */
export function useApi() {
  const { getToken } = useAuth();

  const request = useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getToken();
      // Let the browser set the multipart boundary for FormData uploads.
      const isForm = init?.body instanceof FormData;
      const res = await fetch(`${API_URL}/api${path}`, {
        ...init,
        headers: {
          ...(isForm ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new ApiError(res.status, body || res.statusText);
      }
      return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
    },
    [getToken],
  );

  // Authenticated binary GET (e.g. streamed PDFs). Throws ApiError with the
  // response body on non-2xx so callers can surface server error JSON.
  const getBlob = useCallback(
    async (path: string): Promise<Blob> => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new ApiError(res.status, body || res.statusText);
      }
      return res.blob();
    },
    [getToken],
  );

  return useMemo(
    () => ({
      get: <T>(path: string) => request<T>(path),
      getBlob,
      post: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'POST', body: body == null ? undefined : JSON.stringify(body) }),
      patch: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'PATCH', body: body == null ? undefined : JSON.stringify(body) }),
      del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
      upload: <T>(path: string, form: FormData) =>
        request<T>(path, { method: 'POST', body: form }),
    }),
    [request, getBlob],
  );
}
