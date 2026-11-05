export interface BillingSnapshot {
  unitId: string;
  unitNumber: string;
  billingPeriodId: string;
  periodLabel: string;
  baseAmount: number;       // COP, in centavos internally, displayed in pesos
  discountAmount: number;
  lateFeesAmount: number;
  totalDue: number;
  billingPhase: 'PRONTO_PAGO' | 'TARIFA_PLENA' | 'MORA';
  daysFromDueDate: number;
  dueDate: string;           // ISO string
  discountDeadline: string;
  prontoPagoRate: number;    // 0.05 = 5%
  moraRate: number;          // Monthly rate, e.g., 0.015 = 1.5%
  outstandingChargeIds: string[];
}
