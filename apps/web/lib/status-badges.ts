export const PQR_STATUS: Record<string, { label: string; badge: string }> = {
  OPEN: { label: 'Abierta', badge: 'bg-blue-50 text-blue-700' },
  IN_REVIEW: { label: 'En revisión', badge: 'bg-yellow-50 text-yellow-700' },
  AWAITING_RESIDENT: { label: 'Espera residente', badge: 'bg-purple-50 text-purple-700' },
  RESOLVED: { label: 'Resuelta', badge: 'bg-green-50 text-green-700' },
  CLOSED: { label: 'Cerrada', badge: 'bg-gray-100 text-gray-600' },
};

export const PAYMENT_STATUS: Record<string, { label: string; badge: string }> = {
  PENDING: { label: 'Pendiente', badge: 'bg-yellow-50 text-yellow-700' },
  PROCESSING: { label: 'Procesando', badge: 'bg-blue-50 text-blue-700' },
  PAID: { label: 'Pagado', badge: 'bg-green-50 text-green-700' },
  FAILED: { label: 'Fallido', badge: 'bg-red-50 text-red-700' },
  REFUNDED: { label: 'Reembolsado', badge: 'bg-gray-100 text-gray-600' },
};

export const BILLING_PHASE: Record<string, { label: string; badge: string }> = {
  PRONTO_PAGO: { label: 'Pronto pago', badge: 'bg-green-50 text-green-700' },
  TARIFA_PLENA: { label: 'Al día', badge: 'bg-yellow-50 text-yellow-700' },
  MORA: { label: 'En mora', badge: 'bg-red-50 text-red-700' },
};

export const PQR_CATEGORY: Record<string, string> = {
  NOISE: 'Ruido',
  MAINTENANCE: 'Mantenimiento',
  SECURITY: 'Seguridad',
  FINANCIAL: 'Financiero',
  COEXISTENCE: 'Convivencia',
  OTHER: 'Otro',
};

export function cop(n: number): string {
  return `$ ${n.toLocaleString('es-CO')}`;
}
