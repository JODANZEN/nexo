import type { Dict } from "@/content/es";

export default function Modules({ t }: { t: Dict["modules"] }) {
  return (
    <section className="bg-mist">
      <div className="mx-auto grid max-w-page gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
        <div>
          <h2 className="max-w-[18ch] text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-[2.5rem] lg:sticky lg:top-28">
            {t.title}
          </h2>
        </div>
        <dl className="divide-y divide-navy/10 border-y border-navy/10">
          {t.items.map((m) => (
            <div key={m.name} className="grid gap-2 py-6 sm:grid-cols-[180px_1fr] sm:gap-8">
              <dt className="font-semibold">{m.name}</dt>
              <dd className="max-w-[56ch] leading-relaxed text-slate">{m.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
