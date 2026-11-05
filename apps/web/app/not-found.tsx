// Custom 404. force-dynamic so it isn't statically prerendered — the root layout's
// ClerkProvider needs Clerk available at request time, not build time.
export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="mt-2 text-slate-500">Página no encontrada.</p>
    </div>
  );
}
