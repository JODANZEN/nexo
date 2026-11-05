"use client";

import { useState } from "react";
import Logo from "./logo";
import type { Dict } from "@/content/es";
import type { Locale } from "@/lib/i18n";

export default function Header({ t, lang, appUrl }: { t: Dict["nav"]; lang: Locale; appUrl: string }) {
  const [open, setOpen] = useState(false);
  const other = lang === "es" ? "en" : "es";
  const links = [
    { href: "#producto", label: t.product },
    { href: "#precios", label: t.pricing },
    { href: "#operadores", label: t.operators },
    { href: "#preguntas", label: t.faq },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-page items-center justify-between px-4 sm:px-6">
        <a href={`/${lang}`} aria-label="Nexo" className="shrink-0">
          <Logo />
        </a>

        <nav className="hidden items-center gap-7 text-[0.95rem] text-slate lg:flex" aria-label="Principal">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-navy">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <a href={`/${other}`} hrefLang={other} aria-label={t.switchLabel} className="text-sm text-slate hover:text-navy">
            {t.switchTo}
          </a>
          <a href={appUrl} className="text-sm font-medium text-navy hover:text-teal-dark">
            {t.signIn}
          </a>
          <a
            href="#contacto"
            className="rounded-full bg-teal px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-dark"
          >
            {t.demo}
          </a>
        </div>

        <button
          type="button"
          className="rounded-lg px-3 py-2 text-sm font-medium text-navy lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t.close : t.menu}
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" className="border-t border-line bg-white px-4 pb-6 pt-2 lg:hidden" aria-label="Móvil">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block py-3 text-lg text-navy">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-4">
            <a href={`/${other}`} hrefLang={other} className="text-slate">{t.switchTo}</a>
            <a href={appUrl} className="font-medium text-navy">{t.signIn}</a>
          </div>
          <a
            href="#contacto"
            onClick={() => setOpen(false)}
            className="mt-5 block rounded-full bg-teal px-5 py-3 text-center font-semibold text-white"
          >
            {t.demo}
          </a>
        </nav>
      )}
    </header>
  );
}
