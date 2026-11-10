import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { throttlerOptions } from './security/throttling';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { bullConnection } from './queue/bull-connection';
import { HealthController } from './health/health.controller';
import { MeController } from './me/me.controller';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
import { FeatureGuard } from './auth/feature.guard';
import { DocumentsModule } from './documents/documents.module';
import { BillingModule } from './billing/billing.module';
import { PaymentsModule } from './payments/payments.module';
import { PqrsModule } from './pqrs/pqrs.module';
import { InspectionsModule } from './inspections/inspections.module';
import { VisitorsModule } from './visitors/visitors.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { AsambleasModule } from './asambleas/asambleas.module';
import { ClerkModule } from './clerk/clerk.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ParkingModule } from './parking/parking.module';
import { ContabilidadModule } from './contabilidad/contabilidad.module';
import { IrisModule } from './iris/iris.module';
import { ComunidadModule } from './comunidad/comunidad.module';
import { ReservasModule } from './reservas/reservas.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { AnunciosModule } from './anuncios/anuncios.module';
import { ReportesModule } from './reportes/reportes.module';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { RoomTypesModule } from './room-types/room-types.module';
import { TraceabilityModule } from './traceability/traceability.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    BullModule.forRoot({ connection: bullConnection() }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot(throttlerOptions),
    IntegrationsModule,
    ClerkModule,
    PrismaModule,
    DocumentsModule,
    BillingModule,
    PaymentsModule,
    PqrsModule,
    InspectionsModule,
    VisitorsModule,
    DeliveriesModule,
    AsambleasModule,
    OnboardingModule,
    ParkingModule,
    ContabilidadModule,
    IrisModule,
    ComunidadModule,
    ReservasModule,
    ProveedoresModule,
    AnunciosModule,
    ReportesModule,
    ConfiguracionModule,
    RoomTypesModule,
    TraceabilityModule,
  ],
  controllers: [HealthController, MeController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    ClerkAuthGuard,
    FeatureGuard,
  ],
})
export class AppModule {}
