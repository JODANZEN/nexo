import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioService } from '../integrations/twilio.service';

export interface NotifyInput {
  conjuntoId: string;
  userId: string; // recipient (users.id)
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  link?: string;
  /** Text for SMS/WhatsApp/email only — never persisted (e.g. one-time links). */
  deliveryText?: string;
}

/**
 * Persisted in-app notifications + best-effort multi-channel delivery.
 * Channel-agnostic: callers use notifyUser / notifyUnitResidents and never touch
 * providers. Email = Resend (graceful when unconfigured). WhatsApp/SMS are stubs
 * until the Twilio account + Meta templates land (Phase 17 external step).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twilio: TwilioService,
  ) {}

  // ── Sending ────────────────────────────────────────────────────────────────

  async notifyUser(input: NotifyInput): Promise<void> {
    await this.prisma.db.notification.create({
      data: {
        conjunto_id: input.conjuntoId,
        user_id: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        link: input.link ?? null,
      },
    });
    // Off-thread channel delivery — never blocks or throws into the caller.
    const user = await this.prisma.db.user.findUnique({
      where: { id: input.userId },
      select: { email: true, phone: true },
    });
    void this.deliver(user, input);
  }

  // Notify every active occupant of a unit (looks up conjunto + residents).
  async notifyUnitResidents(
    unitId: string,
    base: Omit<NotifyInput, 'conjuntoId' | 'userId'>,
  ): Promise<void> {
    const unit = await this.prisma.db.unit.findUnique({
      where: { id: unitId },
      select: {
        conjunto_id: true,
        occupancies: { where: { ended_at: null }, select: { user_id: true } },
      },
    });
    if (!unit) return;
    for (const occ of unit.occupancies) {
      await this.notifyUser({ conjuntoId: unit.conjunto_id, userId: occ.user_id, ...base });
    }
  }

  private async deliver(
    user: { email: string | null; phone: string | null } | null,
    input: NotifyInput,
  ): Promise<void> {
    try {
      await this.sendEmail(user?.email, input.title, input.deliveryText ?? input.body ?? input.title);
      // WhatsApp (primary) + SMS (fallback) via Twilio. No-op until configured.
      if (user?.phone) {
        const extra = input.deliveryText ?? input.body;
        const text = extra ? `${input.title}\n${extra}` : input.title;
        await this.twilio.send(user.phone, text);
      }
    } catch (err) {
      this.logger.warn(`Notification delivery failed: ${String(err)}`);
    }
  }

  private async sendEmail(to: string | null | undefined, subject: string, html: string): Promise<void> {
    const key = process.env.RESEND_API_KEY;
    if (!key || !to) return; // graceful no-op until configured
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? 'Nexo <onboarding@resend.dev>',
        to,
        subject,
        // Titles/bodies carry user text (ticket titles…) — escape, keep line breaks.
        html: `<p>${escapeHtml(html).replace(/\n/g, '<br>')}</p>`,
      }),
    });
    if (!res.ok) this.logger.warn(`Resend email failed (${res.status})`);
  }

  // ── In-app feed ──────────────────────────────────────────────────────────────

  private async resolveUserRowId(authUserId: string): Promise<string> {
    const u = await this.prisma.db.user.findUnique({
      where: { external_auth_id: authUserId },
      select: { id: true },
    });
    if (!u) throw new NotFoundException('User not provisioned');
    return u.id;
  }

  async list(authUserId: string) {
    const userId = await this.resolveUserRowId(authUserId);
    return this.prisma.db.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 30,
    });
  }

  async unreadCount(authUserId: string) {
    const userId = await this.resolveUserRowId(authUserId);
    const count = await this.prisma.db.notification.count({
      where: { user_id: userId, read_at: null },
    });
    return { count };
  }

  async markRead(authUserId: string, id: string) {
    const userId = await this.resolveUserRowId(authUserId);
    await this.prisma.db.notification.updateMany({
      where: { id, user_id: userId, read_at: null },
      data: { read_at: new Date() },
    });
    return { id, read: true };
  }

  async markAllRead(authUserId: string) {
    const userId = await this.resolveUserRowId(authUserId);
    const r = await this.prisma.db.notification.updateMany({
      where: { user_id: userId, read_at: null },
      data: { read_at: new Date() },
    });
    return { updated: r.count };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
