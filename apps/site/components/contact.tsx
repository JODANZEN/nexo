"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Dict } from "@/content/es";
import type { Locale } from "@/lib/i18n";
import { leadUnits, validateLead, type Lead, type LeadErrors } from "@/lib/lead";
import type { PlanChoice } from "./pricing";

type Status = "idle" | "sending" | "sent" | "error";

const empty = {
  name: "",
  email: "",
  phone: "",
  org: "",
  type: "conjunto" as Lead["type"],
  units: "51-150" as Lead["units"],
  plan: "nose" as Lead["plan"],
  message: "",
  consent: false,
  website: "",
};

export default function Contact({
  t,
  pricing,
  lang,
  contactEmail,
}: {
  t: Dict["contact"];
  pricing: Dict["pricing"];
  lang: Locale;
  contactEmail?: string;
}) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<LeadErrors>({});
  const [status, setStatus] = useState<Status>("idle");

  // Prefill from the pricing table's "Solicitar" buttons.
  useEffect(() => {
    const onPlan = (e: Event) => {
      const { plan, range } = (e as CustomEvent<PlanChoice>).detail;
      setForm((f) => ({ ...f, plan, units: range }));
    };
    window.addEventListener("nexo:plan", onPlan);
    return () => window.removeEventListener("nexo:plan", onPlan);
  }, []);

  function set<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validateLead(form);
    const clean = Object.fromEntries(Object.entries(errs).filter(([, v]) => v)) as LeadErrors;
    setErrors(clean);
    if (Object.keys(clean).length) {
      const first = Object.keys(clean)[0];
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  const msg = (k: keyof LeadErrors) => {
    const code = errors[k];
    if (!code) return null;
    return (
      <p id={`e-${k}`} className="mt-1.5 text-sm text-[#B42318]">
        {code === "email" ? t.errors.email : code === "consent" ? t.errors.consent : t.errors.required}
      </p>
    );
  };

  const field =
    "mt-1.5 w-full rounded-xl border border-line bg-white px-4 py-3 text-navy placeholder:text-slate-light focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25";
  const bad = "border-[#B42318]";

  return (
    <section id="contacto" className="bg-mist">
      <div className="mx-auto grid max-w-page gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
        <div>
          <h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-[2.5rem]">{t.title}</h2>
          <p className="mt-5 max-w-[42ch] text-lg leading-relaxed text-slate">{t.lead}</p>
          {contactEmail && (
            <p className="mt-8 text-slate">
              {t.direct}{" "}
              <a href={`mailto:${contactEmail}`} className="font-medium text-navy underline decoration-teal underline-offset-4">
                {contactEmail}
              </a>
            </p>
          )}
        </div>

        <div className="rounded-[28px] bg-white p-6 sm:p-9">
          {status === "sent" ? (
            <div role="status" className="py-10">
              <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
                <circle cx="22" cy="22" r="22" fill="#D5F0EC" />
                <path d="M13 22.5l6 6 12-13" fill="none" stroke="#0B7F72" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="mt-5 text-2xl font-semibold">{t.success.title}</p>
              <p className="mt-2 text-slate">{t.success.body}</p>
            </div>
          ) : (
            <form noValidate onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="f-name" className="text-sm font-medium">{t.fields.name}</label>
                <input id="f-name" autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)}
                  aria-invalid={!!errors.name} aria-describedby={errors.name ? "e-name" : undefined}
                  className={`${field} ${errors.name ? bad : ""}`} />
                {msg("name")}
              </div>
              <div>
                <label htmlFor="f-org" className="text-sm font-medium">{t.fields.org}</label>
                <input id="f-org" autoComplete="organization" value={form.org} onChange={(e) => set("org", e.target.value)}
                  aria-invalid={!!errors.org} aria-describedby={errors.org ? "e-org" : undefined}
                  className={`${field} ${errors.org ? bad : ""}`} />
                {msg("org")}
              </div>
              <div>
                <label htmlFor="f-email" className="text-sm font-medium">{t.fields.email}</label>
                <input id="f-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                  aria-invalid={!!errors.email} aria-describedby={errors.email ? "e-email" : undefined}
                  className={`${field} ${errors.email ? bad : ""}`} />
                {msg("email")}
              </div>
              <div>
                <label htmlFor="f-phone" className="text-sm font-medium">{t.fields.phone}</label>
                <input id="f-phone" type="tel" autoComplete="tel" placeholder="+57" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                  aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "e-phone" : undefined}
                  className={`${field} ${errors.phone ? bad : ""}`} />
                {msg("phone")}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="f-type" className="text-sm font-medium">{t.fields.type}</label>
                <select id="f-type" value={form.type} onChange={(e) => set("type", e.target.value as Lead["type"])} className={field}>
                  {(Object.keys(t.fields.typeOptions) as Lead["type"][]).map((k) => (
                    <option key={k} value={k}>{t.fields.typeOptions[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-units" className="text-sm font-medium">{t.fields.units}</label>
                <select id="f-units" value={form.units} onChange={(e) => set("units", e.target.value as Lead["units"])} className={field}>
                  {leadUnits.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-plan" className="text-sm font-medium">{t.fields.plan}</label>
                <select id="f-plan" value={form.plan} onChange={(e) => set("plan", e.target.value as Lead["plan"])} className={field}>
                  <option value="basico">{pricing.plans.basico.name}</option>
                  <option value="pro">{pricing.plans.pro.name}</option>
                  <option value="premium">{pricing.plans.premium.name}</option>
                  <option value="nose">{t.fields.planUnsure}</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="f-message" className="text-sm font-medium">{t.fields.message}</label>
                <textarea id="f-message" rows={4} placeholder={t.fields.messagePlaceholder} value={form.message}
                  onChange={(e) => set("message", e.target.value)} className={`${field} resize-y`} />
              </div>

              {/* Honeypot */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="f-website">Website</label>
                <input id="f-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
              </div>

              <div className="sm:col-span-2">
                <label className="flex cursor-pointer gap-3 text-sm leading-snug text-slate">
                  <input id="f-consent" type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)}
                    aria-invalid={!!errors.consent} aria-describedby={errors.consent ? "e-consent" : undefined}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-teal" />
                  <span>{t.fields.consent}</span>
                </label>
                {msg("consent")}
              </div>

              <div className="sm:col-span-2">
                <button type="submit" disabled={status === "sending"}
                  className="w-full rounded-full bg-teal px-7 py-3.5 font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-60 sm:w-auto">
                  {status === "sending" ? t.sending : t.submit}
                </button>
                {status === "error" && (
                  <p role="alert" className="mt-3 text-sm text-[#B42318]">{t.errors.server}</p>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
