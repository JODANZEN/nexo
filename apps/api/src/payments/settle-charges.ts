import type { Prisma } from '@nexo/database';

/**
 * When a payment for a unit's full balance is approved, mark every charge that was
 * outstanding when the payment was created as fully paid (paid_amount = total_amount).
 *
 * Why not `paid_amount += payment.amount` on one charge (the old behaviour):
 *  - a pronto-pago payment is LESS than total_amount (the discount), so the charge
 *    stayed "unpaid" by the discount and fell into mora next month — a resident who
 *    paid early ended up owing late fees;
 *  - a balance spanning several months was credited entirely to the first charge,
 *    so the other months still showed as owed (double billing).
 * The amount actually collected (incl. discount or mora) is kept on the Payment row.
 */
export async function settleChargesForPayment(
  tx: Prisma.TransactionClient,
  unitId: string,
  paymentCreatedAt: Date,
): Promise<number> {
  const charges = await tx.charge.findMany({
    where: { unit_id: unitId, created_at: { lte: paymentCreatedAt } },
    select: { id: true, total_amount: true, paid_amount: true },
  });
  let settled = 0;
  for (const c of charges) {
    if (c.paid_amount.lessThan(c.total_amount)) {
      await tx.charge.update({ where: { id: c.id }, data: { paid_amount: c.total_amount } });
      settled += 1;
    }
  }
  return settled;
}
