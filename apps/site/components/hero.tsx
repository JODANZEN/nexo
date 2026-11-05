import type { Dict } from "@/content/es";
import FakeQr from "./qr";

export default function Hero({ t, phone }: { t: Dict["hero"]; phone: Dict["phone"] }) {
  return (
    <section className="relative overflow-hidden">
      {/* Mist panel the phone sits on, running off the right edge */}
      <div
        aria-hidden="true"
        className="absolute inset-y-10 right-0 hidden w-[44%] rounded-l-[48px] bg-mist lg:block"
      />
      <div className="relative mx-auto grid max-w-page items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pb-28 lg:pt-20">
        <div>
          <h1 className="max-w-[15ch] text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[3.4rem] lg:text-[4rem]">
            {t.title}
          </h1>
          <p className="mt-7 max-w-[52ch] text-lg leading-relaxed text-slate">{t.lead}</p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a
              href="#contacto"
              className="rounded-full bg-teal px-7 py-3.5 font-semibold text-white transition-colors hover:bg-teal-dark"
            >
              {t.primary}
            </a>
            <a
              href="#precios"
              className="rounded-full px-5 py-3.5 font-medium text-navy underline decoration-line decoration-2 underline-offset-[6px] hover:decoration-teal"
            >
              {t.secondary}
            </a>
          </div>
          <p className="mt-8 text-sm text-slate-light">{t.note}</p>
        </div>

        <div className="relative mx-auto w-full max-w-[360px] lg:mr-6">
          <Phone t={phone} />
        </div>
      </div>
    </section>
  );
}

function Phone({ t }: { t: Dict["phone"] }) {
  return (
    <div className="relative">
      <div className="anim-settle rounded-[38px] border border-navy/10 bg-white p-3 shadow-[0_30px_60px_-30px_rgba(15,42,68,0.45)]">
        <div className="rounded-[28px] bg-white px-5 pb-6 pt-5">
          <div className="flex items-center justify-between text-xs text-slate-light">
            <span>{t.unit}</span>
            <span className="h-2 w-2 rounded-full bg-teal" aria-hidden="true" />
          </div>
          <p className="mt-3 text-lg font-semibold">{t.greeting}</p>

          {/* The bill */}
          <div className="mt-4 rounded-2xl bg-navy p-5 text-white">
            <p className="text-sm text-white/70">{t.feeLabel}</p>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <span className="text-sm text-white/60">{t.fullRate}</span>
              <span className="tabular text-sm text-white/60 line-through decoration-white/40">{t.fullAmount}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-sm">{t.earlyLabel}</span>
              <span className="tabular text-[1.9rem] font-semibold tracking-tight">{t.earlyAmount}</span>
            </div>
            <p className="mt-1 text-right text-xs text-white/60">{t.earlyUntil}</p>
            <p className="anim-stamp mt-4 inline-block rounded-full bg-marigold px-3 py-1 text-xs font-semibold text-navy">
              {t.saving}
            </p>
            <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
              <span className="rounded-xl bg-teal py-2.5 text-center text-sm font-semibold">{t.payPse}</span>
              <span className="rounded-xl bg-white/10 px-4 py-2.5 text-center text-sm font-medium">{t.payNequi}</span>
            </div>
          </div>

          {/* A PQR */}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
            <span className="text-sm">{t.pqrTitle}</span>
            <span className="shrink-0 rounded-full bg-teal-light px-2.5 py-1 text-xs font-medium text-teal-dark">
              {t.pqrStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Visitor pass, overlapping the phone */}
      <div className="anim-settle-late absolute -bottom-24 -left-6 hidden w-[230px] rounded-2xl border border-navy/10 bg-white p-4 shadow-[0_20px_40px_-24px_rgba(15,42,68,0.5)] sm:block lg:-left-24">
        <div className="flex gap-3">
          <FakeQr size={64} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t.visitTitle}</p>
            <p className="mt-1 text-xs leading-snug text-slate">{t.visitWho}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-light">{t.visitHint}</p>
      </div>
    </div>
  );
}
