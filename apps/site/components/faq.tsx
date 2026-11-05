import type { Dict } from "@/content/es";

export default function Faq({ t }: { t: Dict["faq"] }) {
  return (
    <section id="preguntas" className="bg-white">
      <div className="mx-auto grid max-w-page gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
        <h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-[2.5rem]">{t.title}</h2>
        <div className="divide-y divide-line border-y border-line">
          {t.items.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer items-start justify-between gap-6 text-lg font-medium">
                <span>{item.q}</span>
                <span
                  aria-hidden="true"
                  className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-slate transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-[62ch] leading-relaxed text-slate">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
