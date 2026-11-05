"use client";

import { useState } from "react";
import type { Dict } from "@/content/es";
import { formatCOP, monthlyPrice, ranges, type PlanId, type RangeId } from "@/lib/pricing";

const planOrder: PlanId[] = ["basico", "pro", "premium"];

export type PlanChoice = { plan: PlanId; range: RangeId };

export default function Pricing({ t }: { t: Dict["pricing"] }) {
  const [range, setRange] = useState<RangeId>("51-150");
  const [annual, setAnnual] = useState(false);

  function choose(plan: PlanId) {
    window.dispatchEvent(new CustomEvent<PlanChoice>("nexo:plan", { detail: { plan, range } }));
    document.getElementById("contacto")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section id="precios" className="bg-white">
      <div className="mx-auto max-w-page px-4 py-20 sm:px-6 lg:py-28">
        <h2 className="max-w-[22ch] text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-[2.5rem]">
          {t.title}
        </h2>
        <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-slate">{t.lead}</p>

        <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <fieldset>
            <legend className="mb-2.5 text-sm font-medium text-slate">{t.unitsLabel}</legend>
            <div className="flex flex-wrap gap-1 rounded-2xl bg-mist p-1">
              {ranges.map((r) => (
                <label key={r.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name="units"
                    value={r.id}
                    checked={range === r.id}
                    onChange={() => setRange(r.id)}
                    className="peer sr-only"
                  />
                  <span className="tabular block rounded-xl px-4 py-2 text-sm text-slate transition-colors peer-checked:bg-navy peer-checked:font-semibold peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-teal">
                    {r.id}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2.5 text-sm font-medium text-slate">{t.billingLabel}</legend>
            <div className="inline-flex gap-1 rounded-2xl bg-mist p-1">
              {[
                { v: false, label: t.monthly },
                { v: true, label: t.annual },
              ].map((o) => (
                <label key={String(o.v)} className="cursor-pointer">
                  <input
                    type="radio"
                    name="billing"
                    checked={annual === o.v}
                    onChange={() => setAnnual(o.v)}
                    className="peer sr-only"
                  />
                  <span className="block rounded-xl px-4 py-2 text-sm text-slate transition-colors peer-checked:bg-white peer-checked:font-semibold peer-checked:text-navy peer-checked:shadow-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-teal">
                    {o.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3 lg:items-stretch">
          {planOrder.map((id, i) => {
            const plan = t.plans[id];
            const price = monthlyPrice(range, id, annual);
            const featured = id === "pro";
            const prev = i > 0 ? t.plans[planOrder[i - 1]].name : null;
            return (
              <article
                key={id}
                className={
                  featured
                    ? "relative flex flex-col rounded-[28px] bg-navy p-7 text-white lg:-my-4 lg:py-11"
                    : "flex flex-col rounded-[22px] border border-line p-7"
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold">{plan.name}</h3>
                  {featured && (
                    <span className="rounded-full bg-teal px-3 py-1 text-xs font-semibold text-white">{t.popular}</span>
                  )}
                </div>
                <p className={`mt-2 text-sm leading-snug ${featured ? "text-white/70" : "text-slate"}`}>{plan.summary}</p>

                <div className="mt-7 min-h-[84px]" aria-live="polite">
                  {price === null ? (
                    <>
                      <p className="text-[2.1rem] font-semibold tracking-tight">{t.custom}</p>
                      <p className={`mt-1 text-sm ${featured ? "text-white/60" : "text-slate-light"}`}>{t.customNote}</p>
                    </>
                  ) : (
                    <>
                      <p className="tabular text-[2.1rem] font-semibold tracking-tight">
                        {formatCOP(price)}
                        <span className={`ml-1 text-base font-normal ${featured ? "text-white/60" : "text-slate-light"}`}>
                          {t.perMonth}
                        </span>
                      </p>
                      <p className={`mt-1 text-sm ${featured ? "text-white/60" : "text-slate-light"}`}>
                        {annual ? t.billedAnnually : t.billedMonthly}
                      </p>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => choose(id)}
                  className={
                    featured
                      ? "mt-6 rounded-full bg-teal py-3 font-semibold text-white transition-colors hover:bg-teal-dark"
                      : "mt-6 rounded-full border border-navy/20 py-3 font-semibold text-navy transition-colors hover:border-navy"
                  }
                >
                  {t.choose} {plan.name}
                </button>

                <div className={`mt-7 border-t pt-6 ${featured ? "border-white/15" : "border-line"}`}>
                  {prev && (
                    <p className={`mb-3 text-sm font-medium ${featured ? "text-white/80" : "text-navy"}`}>
                      {t.includesPrev.replace("{plan}", prev)}
                    </p>
                  )}
                  <ul className="space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className={`flex gap-2.5 text-sm leading-snug ${featured ? "text-white/85" : "text-slate"}`}>
                        <svg className="mt-[2px] shrink-0" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M3 8.5l3 3 7-7" fill="none" stroke={featured ? "#5FD3C3" : "#0E9F8E"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>

        <p className="mt-10 text-sm text-slate-light">{t.fine}</p>
      </div>
    </section>
  );
}
