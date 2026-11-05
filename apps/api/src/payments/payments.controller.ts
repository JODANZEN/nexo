import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { assertUnitAccess } from '../auth/unit-access';
import {
  PaymentsService,
  type GeneratePaymentLinkDto,
  type PaymentLinkResult,
  type EnrollRecurringDto,
} from './payments.service';
import { PAYMENTS_QUEUE, RECONCILE_WOMPI } from './wompi-reconcile.processor';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
    @InjectQueue(PAYMENTS_QUEUE) private readonly paymentsQueue: Queue,
  ) {}

  // Payment history — residents see their unit, admins see the conjunto.
  @Get()
  @UseGuards(ClerkAuthGuard)
  list(@CurrentUser() user: AuthUser) {
    return this.payments.listForUser(user);
  }

  // Resident pays their own unit; ADMIN may generate for any.
  @Post('links/generate')
  @UseGuards(ClerkAuthGuard)
  async generateLink(
    @Body() dto: GeneratePaymentLinkDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PaymentLinkResult> {
    await assertUnitAccess(this.prisma, user, dto.unitId);
    return this.payments.generatePaymentLink(dto);
  }

  // ── 9.1 Recurring payment mandate ──────────────────────────────────────────

  @Post('recurring/enroll')
  @UseGuards(ClerkAuthGuard)
  async enrollRecurring(@Body() dto: EnrollRecurringDto, @CurrentUser() user: AuthUser) {
    await this.assertOwnsUnit(user, dto.unitId);
    return this.payments.enrollRecurring(dto);
  }

  @Get('recurring/status')
  @UseGuards(ClerkAuthGuard)
  async recurringStatus(@Query('unitId') unitId: string, @CurrentUser() user: AuthUser) {
    if (!unitId) throw new BadRequestException('unitId is required');
    await this.assertOwnsUnit(user, unitId);
    return this.payments.getRecurringStatus(unitId);
  }

  @Delete('recurring/cancel')
  @UseGuards(ClerkAuthGuard)
  async cancelRecurring(@Query('unitId') unitId: string, @CurrentUser() user: AuthUser) {
    const target = unitId || user.unitId;
    if (!target) throw new BadRequestException('unitId is required');
    await this.assertOwnsUnit(user, target);
    return this.payments.cancelRecurring(target);
  }

  // Residents may only act on their own unit; ADMIN on any unit in THEIR conjunto.
  private async assertOwnsUnit(user: AuthUser, unitId: string): Promise<void> {
    await assertUnitAccess(this.prisma, user, unitId);
  }

  // PUBLIC — no ClerkAuthGuard. Checksum-verified (Wompi event signature), then
  // enqueued. Returns 200 immediately (Wompi has a ~5s timeout); reconciliation
  // runs in the processor.
  @Post('wompi/webhook')
  @HttpCode(200)
  async handleWompiWebhook(
    @Headers('x-event-checksum') headerChecksum: string | undefined,
    @Body() body: unknown,
  ): Promise<{ received: boolean }> {
    if (!this.payments.verifyWompiEvent(body, headerChecksum)) {
      throw new BadRequestException('Invalid signature');
    }
    // Only transaction updates carry a payment result; ack anything else.
    if ((body as { event?: string }).event !== 'transaction.updated') {
      return { received: true };
    }
    await this.paymentsQueue.add(RECONCILE_WOMPI, body, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    });
    return { received: true };
  }
}
