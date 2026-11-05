// Wiring for smokes: build services by hand (no Nest container, no Redis/Twilio).
import type { Queue } from 'bullmq';
import type { PrismaService } from './prisma/prisma.service';
import { NotificationsService } from './notifications/notifications.service';
import { TwilioService } from './integrations/twilio.service';
import { OperationsService } from './pqrs/operations.service';
import { RoutingService } from './pqrs/routing.service';
import { PqrsService } from './pqrs/pqrs.service';

export const fakeQueue = { add: async () => undefined } as unknown as Queue;

export function makePqrsService(ps: PrismaService, queue: Queue = fakeQueue): PqrsService {
  const notifier = new NotificationsService(ps, new TwilioService());
  return new PqrsService(ps, queue, queue, new OperationsService(ps), new RoutingService(ps), notifier);
}
