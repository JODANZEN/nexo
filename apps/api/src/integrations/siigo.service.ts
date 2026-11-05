import { Injectable, Logger } from '@nestjs/common';

/**
 * Siigo (Colombian accounting) — auth is implemented; document push is a stub
 * pending City U's discovery answers. Real push needs per-company catalog ids
 * (document types, payment methods, taxes, cost centers) fetched from their
 * Siigo config, plus a rate-limited BullMQ queue (100 req/min prod). Auth: token
 * is a 24h JWT; every call also needs the Partner-Id header.
 * Docs: https://developers.siigo.com/docs/siigoapi
 */
@Injectable()
export class SiigoService {
  private readonly logger = new Logger(SiigoService.name);

  get configured(): boolean {
    return !!(process.env.SIIGO_USERNAME && process.env.SIIGO_ACCESS_KEY && process.env.SIIGO_PARTNER_ID);
  }

  // POST /auth → { access_token } (valid 24h). ponytail: cache in Redis with a
  // proactive refresh once this goes live.
  async token(): Promise<string | null> {
    if (!this.configured) return null;
    try {
      const res = await fetch('https://api.siigo.com/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Partner-Id': process.env.SIIGO_PARTNER_ID! },
        body: JSON.stringify({ username: process.env.SIIGO_USERNAME, access_key: process.env.SIIGO_ACCESS_KEY }),
      });
      if (!res.ok) {
        this.logger.warn(`Siigo auth failed (${res.status})`);
        return null;
      }
      const body = (await res.json()) as { access_token?: string };
      return body.access_token ?? null;
    } catch (err) {
      this.logger.warn(`Siigo auth error: ${String(err)}`);
      return null;
    }
  }

  // TODO(discovery): pushInvoice(charge) → POST /v1/invoices, pushReceipt(payment)
  // → POST /v1/vouchers, upsertTercero(resident) → POST /v1/customers, using the
  // conjunto's mapped catalog ids. Blocked on client Siigo credentials + config.
}
