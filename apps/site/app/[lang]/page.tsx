import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getDict } from "@/lib/dict";
import Header from "@/components/header";
import Hero from "@/components/hero";
import Personas from "@/components/personas";
import Modules from "@/components/modules";
import Pricing from "@/components/pricing";
import Operators from "@/components/operators";
import Faq from "@/components/faq";
import Contact from "@/components/contact";
import Footer from "@/components/footer";

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDict(lang);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexo-psi-brown.vercel.app";
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  return (
    <>
      <Header t={t.nav} lang={lang} appUrl={appUrl} />
      <main>
        <Hero t={t.hero} phone={t.phone} />
        <Personas t={t.personas} />
        <Modules t={t.modules} />
        <Pricing t={t.pricing} />
        <Operators t={t.operators} />
        <Faq t={t.faq} />
        <Contact t={t.contact} pricing={t.pricing} lang={lang} contactEmail={contactEmail} />
      </main>
      <Footer t={t.footer} nav={t.nav} />
    </>
  );
}
