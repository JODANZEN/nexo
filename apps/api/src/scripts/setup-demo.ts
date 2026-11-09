// Demo account for sales demos (City U and similar operators).
//
// Creates ONE separate conjunto ("Residencia Demo Nexo", nit DEMO-NEXO) with staff,
// residents (as phone invites), ticket history, operations config, routing rules and
// preventive-maintenance plans. It never touches any other conjunto and never deletes:
// if the demo already exists it prints the logins and exits.
//
//   npm run build -w @nexo/api && node --env-file=.env apps/api/dist/scripts/setup-demo.js
//
// Logins (Clerk development instance test numbers — SMS code is always 424242).
// Each account is claimed by phone on its first sign-in, so no Clerk API writes here.
import { Decimal } from 'decimal.js';
import { prisma, PqrCategory, PqrPriority, PqrScope, PqrStatus } from '@nexo/database';

export const DEMO_NIT = 'DEMO-NEXO';
const H = 3_600_000;
const D = 24 * H;

export const DEMO_LOGINS = [
  { key: 'admin', phone: '+12015550150', name: 'Administración Demo', role: 'ADMIN' as const },
  { key: 'tecnico', phone: '+12015550151', name: 'Carlos Pérez', role: 'STAFF' as const, team: 'Mantenimiento' },
  { key: 'residente', phone: '+12015550152', name: 'Laura Gómez', role: 'RESIDENT' as const, unit: '1204' },
  { key: 'porteria', phone: '+12015550153', name: 'Portería Demo', role: 'GUARD' as const },
  { key: 'aseo', phone: '+12015550154', name: 'Diana Ruiz', role: 'STAFF' as const, team: 'Aseo y zonas comunes' },
  { key: 'res805', phone: '+12015550155', name: 'Andrés Ruiz', role: 'RESIDENT' as const, unit: '805' },
  { key: 'res1512', phone: '+12015550156', name: 'Valentina Ortiz', role: 'RESIDENT' as const, unit: '1512' },
  { key: 'res310', phone: '+12015550157', name: 'Mateo Castro', role: 'RESIDENT' as const, unit: '310' },
];

// Same rule as docs/demo/habitaciones-cali-demo.csv (floors 2–16 × 20 rooms = 300).
export function demoRoom(floor: number, n: number) {
  const unitNumber = `${floor}${String(n).padStart(2, '0')}`;
  const doble = n % 5 === 0; // 1 in 5 rooms is a double
  return { unitNumber, floor, type: doble ? 'Doble' : 'Sencilla', fee: doble ? '1650000' : '1250000' };
}

async function main(): Promise<void> {
  const existing = await prisma.conjunto.findUnique({ where: { nit: DEMO_NIT } });
  if (existing) {
    console.log(`Demo ya existe (${existing.id}) — no se cambió nada.`);
    printLogins();
    await prisma.$disconnect();
    return;
  }

  const now = Date.now();
  const cj = await prisma.conjunto.create({
    data: {
      name: 'Residencia Demo Nexo',
      nit: DEMO_NIT,
      address: 'Cra. 100 # 11-60',
      city: 'Cali',
      department: 'Valle del Cauca',
      total_units: 0,
      plan: 'PREMIUM',
      sla_config: {
        P1: { firstResponse: 0.5, resolution: 4, businessHours: false },
        P2: { firstResponse: 2, resolution: 8, businessHours: true },
        P3: { firstResponse: 4, resolution: 24, businessHours: true },
        P4: { firstResponse: 8, resolution: 72, businessHours: true },
      },
      business_hours: { days: [1, 2, 3, 4, 5, 6], start: '07:00', end: '19:00', holidays: [], nationalHolidays: true },
    },
  });

  // Room types + the five rooms the ticket history needs (the 300-room CSV is
  // imported live during the demo: "295 creadas, 5 sin cambios").
  const types = {
    Sencilla: await prisma.roomType.create({ data: { conjunto_id: cj.id, name: 'Sencilla', base_fee: new Decimal('1250000') } }),
    Doble: await prisma.roomType.create({ data: { conjunto_id: cj.id, name: 'Doble', base_fee: new Decimal('1650000') } }),
  };
  const units: Record<string, string> = {};
  for (const [floor, n] of [[12, 4], [8, 5], [15, 12], [3, 10], [10, 18]] as const) {
    const r = demoRoom(floor, n);
    const u = await prisma.unit.create({
      data: {
        conjunto_id: cj.id,
        unit_number: r.unitNumber,
        floor: r.floor,
        room_type_id: types[r.type as keyof typeof types].id,
        monthly_fee: new Decimal(r.fee),
        coeficiente: new Decimal(0),
      },
    });
    units[r.unitNumber] = u.id;
  }
  await prisma.conjunto.update({ where: { id: cj.id }, data: { total_units: Object.keys(units).length } });

  // People = pending phone invites (external_auth_id null), claimed on first sign-in.
  const users: Record<string, string> = {};
  for (const l of DEMO_LOGINS) {
    const u = await prisma.user.create({
      data: {
        conjunto_id: cj.id,
        phone: l.phone,
        full_name: l.name,
        role: l.role,
        team: 'team' in l ? l.team : null,
      },
    });
    users[l.key] = u.id;
    if ('unit' in l && l.unit) {
      await prisma.unitOccupancy.create({
        data: { unit_id: units[l.unit], user_id: u.id, occupancy_type: 'TENANT', started_at: new Date(now - 60 * D) },
      });
    }
  }

  // Routing: maintenance → Carlos; common areas (any category) → Diana.
  await prisma.pqrRoutingRule.createMany({
    data: [
      { conjunto_id: cj.id, name: 'Mantenimiento', category: PqrCategory.MAINTENANCE, assignee_ids: [users.tecnico], sort_order: 10 },
      { conjunto_id: cj.id, name: 'Zonas comunes', scope: PqrScope.FACILITY, assignee_ids: [users.aseo, users.tecnico], sort_order: 20 },
      { conjunto_id: cj.id, name: 'Todo lo demás', assignee_ids: [users.admin], sort_order: 90 },
    ],
  });

  // Ticket history (last two weeks) so dashboards and Reportes aren't empty.
  type T = {
    title: string; description: string; unit?: string; by: string; to: string; category: PqrCategory;
    priority: PqrPriority; scope: PqrScope; status: PqrStatus; ageH: number; firstH?: number; resolvedH?: number;
    breached?: boolean; comments?: Array<[string, string, boolean?]>;
  };
  const tickets: T[] = [
    { title: 'La ducha no tiene presión', description: 'Desde ayer sale muy poca agua en la ducha.', unit: '805', by: 'res805', to: 'tecnico',
      category: 'MAINTENANCE', priority: 'P3', scope: 'IN_UNIT', status: 'RESOLVED', ageH: 9 * 24, firstH: 0.6, resolvedH: 19,
      comments: [['tecnico', 'Voy mañana a las 9 am, ¿te sirve?'], ['res805', 'Sí, perfecto'], ['tecnico', 'Cambié el regulador. Quedó bien.']] },
    { title: 'Wifi intermitente en el piso 15', description: 'Se cae cada 10 minutos en todo el piso.', unit: '1512', by: 'res1512', to: 'aseo',
      category: 'OTHER', priority: 'P2', scope: 'FACILITY', status: 'RESOLVED', ageH: 6 * 24, firstH: 0.4, resolvedH: 5,
      comments: [['aseo', 'Reiniciamos el access point del piso 15 y escalamos al proveedor.']] },
    { title: 'La cerradura de la habitación no abre', description: 'La tarjeta no funciona, estoy afuera.', unit: '310', by: 'res310', to: 'tecnico',
      category: 'SECURITY', priority: 'P1', scope: 'IN_UNIT', status: 'CLOSED', ageH: 4 * 24, firstH: 0.1, resolvedH: 1.2 },
    { title: 'Ruido en la habitación de al lado después de las 11 pm', description: 'Música alta varias noches.', unit: '1018', by: 'admin', to: 'admin',
      category: 'NOISE', priority: 'P4', scope: 'IN_UNIT', status: 'RESOLVED', ageH: 3 * 24, firstH: 3, resolvedH: 26 },
    { title: 'Lavadora 2 del piso 6 dañada', description: 'No centrifuga, deja la ropa empapada.', by: 'res805', to: 'aseo',
      category: 'MAINTENANCE', priority: 'P3', scope: 'FACILITY', status: 'IN_REVIEW', ageH: 5 * 24, firstH: 2, breached: true,
      comments: [['aseo', 'Pedimos el repuesto al proveedor, llega esta semana.', true]] },
    { title: 'Bombillo fundido en la escalera del piso 9', description: 'Está muy oscuro de noche.', by: 'porteria', to: 'tecnico',
      category: 'MAINTENANCE', priority: 'P3', scope: 'FACILITY', status: 'IN_REVIEW', ageH: 20, firstH: 1 },
    { title: 'El aire acondicionado hace ruido', description: 'Suena fuerte cuando arranca.', unit: '805', by: 'res805', to: 'tecnico',
      category: 'MAINTENANCE', priority: 'P3', scope: 'IN_UNIT', status: 'AWAITING_RESIDENT', ageH: 26, firstH: 0.8,
      comments: [['tecnico', '¿Cuándo podemos entrar a revisarlo?']] },
  ];
  for (const t of tickets) {
    const created = new Date(now - t.ageH * H);
    const resolvedAt = t.resolvedH != null ? new Date(created.getTime() + t.resolvedH * H) : null;
    const target = { P1: [0.5, 4], P2: [2, 8], P3: [4, 24], P4: [8, 72] }[t.priority];
    const pqr = await prisma.pqr.create({
      data: {
        conjunto_id: cj.id,
        unit_id: t.unit ? units[t.unit] ?? null : null,
        submitted_by_id: users[t.by],
        assigned_to_id: users[t.to],
        category: t.category,
        priority: t.priority,
        scope: t.scope,
        status: t.status,
        title: t.title,
        description: t.description,
        created_at: created,
        first_responded_at: t.firstH != null ? new Date(created.getTime() + t.firstH * H) : null,
        first_response_due_at: new Date(created.getTime() + target[0] * H * 2),
        resolution_due_at: new Date(created.getTime() + (t.breached ? 30 : target[1] * 2) * H),
        resolved_at: resolvedAt,
        awaiting_since: t.status === 'AWAITING_RESIDENT' ? new Date(now - 3 * H) : null,
        sla_breached: !!t.breached,
        escalation_level: t.breached ? 3 : 0,
      },
    });
    let at = created.getTime();
    for (const [who, body, internal] of t.comments ?? []) {
      at += 0.7 * H;
      await prisma.pqrComment.create({
        data: { pqr_id: pqr.id, author_id: users[who], body, is_internal: !!internal, created_at: new Date(at) },
      });
    }
  }

  // Preventive maintenance.
  const day = (d: number) => new Date(Math.floor((now + d * D) / D) * D + 13 * H); // 08:00 COT
  await prisma.maintenancePlan.createMany({
    data: [
      { conjunto_id: cj.id, title: 'Limpieza de tanques de agua', interval_unit: 'MONTH', interval_count: 6, next_due_at: day(20),
        lead_days: 3, priority: 'P3', scope: 'FACILITY', assigned_to_id: users.tecnico, created_by_id: users.admin,
        description: 'Coordinar corte de agua con recepción y avisar a residentes con 48 h.' },
      { conjunto_id: cj.id, title: 'Revisión de extintores', interval_unit: 'MONTH', interval_count: 12, next_due_at: day(45),
        priority: 'P3', scope: 'FACILITY', created_by_id: users.admin },
      { conjunto_id: cj.id, title: 'Cambio de filtros de aire acondicionado', interval_unit: 'MONTH', interval_count: 1, next_due_at: day(2),
        priority: 'P4', scope: 'FACILITY', assigned_to_id: users.tecnico, created_by_id: users.admin },
    ],
  });

  await prisma.announcement.create({
    data: {
      conjunto_id: cj.id,
      title: 'Bienvenidos a la nueva app de la residencia',
      body: 'Desde aquí puedes reportar daños, autorizar el ingreso del personal a tu habitación y ver tus anuncios.',
      pinned: true,
      created_by_id: users.admin,
    },
  });

  console.log(`Demo creada: ${cj.id}`);
  printLogins();
  await prisma.$disconnect();
}

function printLogins(): void {
  console.log('\nIngresos (código SMS 424242):');
  for (const l of DEMO_LOGINS.slice(0, 4)) {
    console.log(`  ${l.key.padEnd(10)} ${l.phone}  ${l.name}`);
  }
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
