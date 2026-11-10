'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: true,
            staleTime: 30_000,
            // Never retry client errors (403, 404, 429 rate limit); one retry for network/5xx.
            retry: (count, err) => {
              const status = (err as { status?: number })?.status;
              return !(status && status >= 400 && status < 500) && count < 1;
            },
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
