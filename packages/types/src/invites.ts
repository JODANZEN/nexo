/**
 * Invitation message — one source of truth for the text the API sends by
 * SMS/WhatsApp and the text the dashboard offers to share by hand (wa.me / copy).
 */
export const INVITE_RESEND_COOLDOWN_MINUTES = 10;

/** `{origin}/sign-in` without a double slash. Empty origin → empty string. */
export function inviteSignInUrl(origin: string | null | undefined): string {
  const base = (origin ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}/sign-in` : '';
}

export function inviteMessage(conjuntoName: string, signInUrl: string): string {
  const name = conjuntoName.trim() || 'Tu residencia';
  return `${name}: te invitaron a Nexo. Entra con este celular aquí: ${signInUrl}`;
}

/** Manual share link: https://wa.me/<phone digits>?text=<message>. */
export function inviteWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
