# Demo de ventas — Residencia Demo Nexo

Cuenta separada (nit `DEMO-NEXO`) para mostrar el flujo de solicitudes. No toca datos de clientes.

**Crear (una sola vez):** `npm run build -w @nexo/api && node --env-file=.env apps/api/dist/scripts/setup-demo.js`
Si ya existe, el script no cambia nada y solo imprime los ingresos.

**Ingresos** (números de prueba de Clerk, código SMS `424242`):

| Rol | Celular | Persona |
|---|---|---|
| Administración | +1 201 555 0150 | Administración Demo |
| Técnico (`/tareas`) | +1 201 555 0151 | Carlos Pérez |
| Residente hab. 1204 | +1 201 555 0152 | Laura Gómez |
| Portería | +1 201 555 0153 | Portería Demo |

**Archivo para importar en vivo:** `habitaciones-cali-demo.csv` (300 habitaciones, 2 tipos) → "295 creadas, 5 sin cambios".

**Flujo (≈15 min):** importar habitaciones → Operación (tiempos + reglas) → residente reporta "No hay agua caliente" →
se asigna sola a Carlos → Carlos "Empezar" → pide ingreso (el reloj se pausa) → Laura autoriza → portería registra
el ingreso → Carlos resuelve → admin ve historial y Reportes → Mantenimiento "Ejecutar ya".
