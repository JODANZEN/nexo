import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales } from "./lib/i18n";

// Send "/" (and any path without a locale) to /es or /en.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return;

  const accept = request.headers.get("accept-language") ?? "";
  const prefersEnglish = /^en\b/i.test(accept.trim());
  const locale = prefersEnglish ? "en" : defaultLocale;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip API routes, Next internals and files with an extension.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
