export const TYPE_LABEL: Record<string, string> = {
  MOVE_IN: 'Entrada',
  MOVE_OUT: 'Salida',
  ROUTINE: 'Rutina',
};

export const STATUS: Record<string, { label: string; badge: string }> = {
  DRAFT: { label: 'Borrador', badge: 'bg-gray-100 text-gray-600' },
  SUBMITTED: { label: 'Enviada', badge: 'bg-blue-50 text-blue-700' },
  ADMIN_REVIEWED: { label: 'Revisada', badge: 'bg-green-50 text-green-700' },
};

export const CONDITIONS = ['BUENO', 'REGULAR', 'MALO', 'NO_APLICA'] as const;
export const CONDITION_LABEL: Record<string, string> = {
  BUENO: 'Bueno',
  REGULAR: 'Regular',
  MALO: 'Malo',
  NO_APLICA: 'No aplica',
};
