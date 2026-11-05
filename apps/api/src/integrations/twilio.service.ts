import { Injectable, Logger } from '@nestjs/common';

/**
 * Twilio WhatsApp (primary) + SMS (fallback) sender. Graceful no-op until
 * TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN are set — so the notifier works with or
 * without it. WhatsApp business-initiated messages need Meta-approved templates;
 * that approval is a client-side step (City U owns the number).
 */
@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);

  get configured(): boolean {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  }

  // Try WhatsApp first, fall back to SMS. Returns silently if unconfigured.
  async send(to: string, body: string): Promise<void> {
    if (!this.configured || !to) return;
    const wa = process.env.TWILIO_WHATSAPP_FROM;
    if (wa && (await this.post(`whatsapp:${wa}`, `whatsapp:${to}`, body))) return;
    const sms = process.env.TWILIO_SMS_FROM;
    if (sms) await this.post(sms, to, body);
  }

  private async post(from: string, to: string, body: string): Promise<boolean> {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams({ From: from, To: to, Body: body });
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!res.ok) {
        this.logger.warn(`Twilio send failed (${res.status})`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Twilio error: ${String(err)}`);
      return false;
    }
  }
}
