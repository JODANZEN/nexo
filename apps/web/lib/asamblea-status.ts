export const ASAMBLEA_STATUS: Record<string, { label: string; badge: string }> = {
  SCHEDULED: { label: 'Programada', badge: 'bg-blue-50 text-blue-700' },
  QUORUM_OPEN: { label: 'Quórum abierto', badge: 'bg-nexo-teal/15 text-nexo-teal' },
  IN_PROGRESS: { label: 'En curso', badge: 'bg-yellow-50 text-yellow-700' },
  VOTING_CLOSED: { label: 'Votación cerrada', badge: 'bg-gray-100 text-gray-600' },
  COMPLETED: { label: 'Completada', badge: 'bg-green-50 text-green-700' },
  CANCELLED: { label: 'Cancelada', badge: 'bg-red-50 text-red-700' },
};
