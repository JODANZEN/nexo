import type { Dict } from "@/content/es";

export default function Personas({ t }: { t: Dict["personas"] }) {
  return (
    <section id="producto" className="border-t border-line bg-white">
      <div className="mx-auto max-w-page px-4 py-20 sm:px-6 lg:py-28">
        <h2 className="max-w-[24ch] text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-[2.5rem]">
          {t.title}
        </h2>
        <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-slate">{t.lead}</p>

        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
          {t.items.map((p, i) => (
            <div key={p.name} className={i === 0 ? "md:pr-8" : i === 1 ? "md:px-8" : "md:pl-8"}>
              <h3 className="text-xl font-semibold">{p.name}</h3>
              <ul className="mt-5 space-y-3.5">
                {p.points.map((pt) => (
                  <li key={pt} className="flex gap-3 text-[0.98rem] leading-snug text-slate">
                    <svg className="mt-[3px] shrink-0" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3 8.5l3 3 7-7" fill="none" stroke="#0E9F8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
