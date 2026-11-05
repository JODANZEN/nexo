import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { LAZY_WORKER_OPTS } from '../queue/worker-options';
import { NotificationsService } from './notifications.service';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'abierta',
  IN_REVIEW: 'en revisión',
  AWAITING_RESIDENT: 'a la espera de tu respuesta',
  RESOLVED: 'resuelta',
  CLOSED: 'cerrada',
};

export const NOTIFICATIONS_QUEUE = 'notifications';
export const PQR_STATUS_CHANGED = 'pqr-status-changed';
export const VISITOR_ARRIVED = 'visitor-arrived';

export interface PqrStatusChangedPayload {
  pqrId: string;
  unitId: string | null;
  fromStatus: string;
  toStatus: string;
  title: string;
}

export interface VisitorArrivedPayload {
  unitId: string;
  visitorName: string;
  via: 'QR' | 'WALK_IN';
}

@Processor(NOTIFICATIONS_QUEUE, LAZY_WORKER_OPTS)
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === PQR_STATUS_CHANGED) {
      const { pqrId, unitId, toStatus, title } = job.data as PqrStatusChangedPayload;
      if (!unitId) return;
      await this.notifications.notifyUnitResidents(unitId, {
        type: 'pqr.status',
        title: `Tu solicitud "${title}" está ${STATUS_LABEL[toStatus] ?? toStatus.toLowerCase()}`,
        entityType: 'Pqr',
        entityId: pqrId,
        link: `/portal/solicitudes/${pqrId}`,
      });
    } else if (job.name === VISITOR_ARRIVED) {
      const { unitId, visitorName } = job.data as VisitorArrivedPayload;
      await this.notifications.notifyUnitResidents(unitId, {
        type: 'visitor.arrived',
        title: `${visitorName} llegó a portería`,
        entityType: 'VisitorLog',
        link: '/portal/visitas',
      });
    }
  }
}
