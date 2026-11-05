import type { Dict } from "@/content/es";
import Logo from "./logo";

export default function Footer({ t, nav }: { t: Dict["footer"]; nav: Dict["nav"] }) {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-navy-deep text-white">
      <div className="mx-auto flex max-w-page flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <Logo inverted />
          <p className="mt-3 max-w-[40ch] text-sm text-white/60">{t.tagline}</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70" aria-label="Footer">
          <a href="#producto" className="hover:text-white">{nav.product}</a>
          <a href="#precios" className="hover:text-white">{nav.pricing}</a>
          <a href="#operadores" className="hover:text-white">{nav.operators}</a>
          <a href="#contacto" className="hover:text-white">{nav.demo}</a>
        </nav>
      </div>
      <div className="mx-auto max-w-page px-4 pb-10 text-xs text-white/40 sm:px-6">
        © {year} Nexo. {t.rights}
      </div>
    </footer>
  );
}
