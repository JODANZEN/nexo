/**
 * Normalize a phone number to E.164 so invites match the number Clerk verified
 * by SMS (Clerk stores E.164, e.g. +573001234567). Colombian mobile numbers typed
 * without the country code ("300 123 4567") get +57.
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith('3')) return `+57${digits}`; // CO mobile
  if (digits.length === 12 && digits.startsWith('57')) return `+${digits}`;
  return `+${digits}`;
}
