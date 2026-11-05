import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "../globals.css";
import { isLocale, locales } from "@/lib/i18n";
import { getDict } from "@/lib/dict";

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDict(lang);
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: { languages: { es: "/es", en: "/en" } },
    openGraph: { title: t.meta.title, description: t.meta.description, locale: lang === "es" ? "es_CO" : "en_US" },
  };
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <html lang={lang === "es" ? "es-CO" : "en"}>
      <body>{children}</body>
    </html>
  );
}
