import es from "@/content/es";
import en from "@/content/en";
import type { Dict } from "@/content/es";
import type { Locale } from "./i18n";

const dicts: Record<Locale, Dict> = { es, en };

export function getDict(locale: Locale): Dict {
  return dicts[locale];
}
