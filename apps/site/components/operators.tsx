import type { Dict } from "@/content/es";

export default function Operators({ t }: { t: Dict["operators"] }) {
  const k = t.ticket;
  const events = [
    { time: "09:12", label: k.stages.open, kind: "run" as const },
    { time: "11:40", label: k.stages.paused, kind: "pause" as const, note: k.paused },
    { time: "+24 h", label: k.nudge, kind: "nudge" as const },
    { time: "10:05", label: k.stages.resumed, kind: "run" as const },
  ];

  return (
    <section id="operadores" className="bg-navy text-white">
      <div className="mx-auto grid max-w-page gap-14 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-28">
        <div>
          <p className="font-medium text-[#5FD3C3]">{t.kicker}</p>
          <h2 className="mt-4 max-w-[22ch] text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-[2.5rem]">
            {t.title}
          </h2>
          <p className="mt-6 max-w-[58ch] text-lg leading-relaxed text-white/75">{t.lead}</p>

          <dl className="mt-10 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {t.points.map((p) => (
              <div key={p.name}>
                <dt className="font-semibold">{p.name}</dt>
                <dd className="mt-1.5 text-[0.95rem] leading-relaxed text-white/65">{p.body}</dd>
              </div>
            ))}
          </dl>

          <a
            href="#contacto"
            className="mt-11 inline-block rounded-full bg-teal px-7 py-3.5 font-semibold text-white transition-colors hover:bg-teal-dark"
          >
            {t.cta}
          </a>
        </div>

        {/* Ticket with a paused SLA clock */}
        <div className="rounded-[28px] bg-white p-6 text-navy sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-light">{k.id}</p>
              <p className="mt-1 text-lg font-semibold leading-snug">{k.title}</p>
            </div>
            <span className="shrink-0 rounded-full bg-mist px-3 py-1 text-xs font-medium text-slate">{k.target}</span>
          </div>

          <ol className="mt-7 space-y-0">
            {events.map((e, i) => (
              <li key={i} className="relative grid grid-cols-[56px_20px_1fr] gap-3 pb-6 last:pb-0">
                <span className="tabular pt-0.5 text-sm text-slate-light">{e.time}</span>
                <span className="relative flex justify-center">
                  {i < events.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-4 h-[calc(100%+4px)] w-[2px] ${
                        e.kind === "pause" || e.kind === "nudge"
                          ? "bg-[repeating-linear-gradient(to_bottom,#8597A8_0_4px,transparent_4px_8px)]"
                          : "bg-teal"
                      }`}
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className={`relative mt-1 h-3 w-3 rounded-full ${
                      e.kind === "run" ? "bg-teal" : e.kind === "pause" ? "border-2 border-slate-light bg-white" : "bg-marigold"
                    }`}
                  />
                </span>
                <span className="text-[0.95rem] leading-snug">
                  {e.label}
                  {e.note && (
                    <span className="mt-1.5 block w-fit rounded-full bg-mist px-2.5 py-0.5 text-xs font-medium text-slate">
                      {e.note}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-8 border-t border-line pt-5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="tabular font-medium">{k.elapsed}</span>
              <span className="tabular text-slate-light">70 %</span>
            </div>
            <div className="relative mt-2.5 h-2.5 rounded-full bg-mist">
              <div className="h-full w-[52%] rounded-full bg-teal" />
              <span aria-hidden="true" className="absolute -top-1 left-[70%] h-[18px] w-[2px] bg-slate-light" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
