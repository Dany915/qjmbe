# API Reference — qjmbe Backend

Backend REST para la administración de un conjunto residencial.
**Stack:** Node.js + Express + MongoDB (Mongoose) + JWT

---

## Base URL

```
http://localhost:4000
```

---

## Autenticación

Todos los endpoints protegidos requieren el header:

```
Authorization: Bearer <token>
```

El token se obtiene al hacer login exitoso. La duración se configura con `JWT_EXPIRES_IN` en el `.env` (ej: `7d`, `8h`, `30m`).

---

## Roles y estados de cuenta

### Roles
| Rol | Descripción |
|-----|-------------|
| `user` | Rol por defecto. Puede crear facturas y consultar su estado de cuenta. |
| `admin` | Acceso total. Gestiona usuarios, casas, tarifas, cargos y facturas. |

### Estados de cuenta (usuario)
| Estado | Descripción |
|--------|-------------|
| `pending` | Recién registrado. No puede iniciar sesión. |
| `active` | Activado por un admin. Puede iniciar sesión. |
| `suspended` | Suspendido por un admin. No puede iniciar sesión. |

> Todo usuario recién creado tiene `role: "user"` y `status: "pending"`. Un admin debe activarlo antes de que pueda hacer login.

---

## Códigos de error comunes

| Código | Significado |
|--------|-------------|
| `400` | Datos inválidos o faltantes en el body |
| `401` | Token ausente, inválido o expirado |
| `403` | Sin permisos (rol insuficiente, cuenta inactiva, o recurso inmutable) |
| `404` | Recurso no encontrado |
| `409` | Conflicto — registro duplicado |
| `500` | Error interno del servidor |

---

## Auth — `/api/auth`

### POST `/api/auth/register`
Registra una cuenta local. Queda en `status: "pending"` hasta que un admin la active.

**Auth requerida:** No

**Body:**
```json
{
  "name": "Juan Pérez",
  "email": "juan@email.com",
  "password": "min6caracteres"
}
```

**Respuestas**
- `201` — cuenta creada, espera activación
- `409` — email ya registrado

---

### POST `/api/auth/login`
Inicia sesión con email y contraseña. Solo funciona si `status: "active"`.

**Auth requerida:** No

**Body:**
```json
{
  "email": "juan@email.com",
  "password": "mipassword"
}
```

**Respuestas**
- `200` — `{ token, user }`
- `401` — credenciales inválidas
- `403` — cuenta no activa (`{ message, status }`)

---

### POST `/api/auth/google`
Inicia sesión con Google (Android). Envía el `idToken` obtenido del SDK de Google Sign-In. Guarda el avatar del perfil de Google automáticamente.

**Auth requerida:** No

**Body:**
```json
{
  "idToken": "<Google ID Token>"
}
```

**Respuestas**
- `200` — `{ token, user }` — cuenta existente y activa
- `201` — cuenta creada, espera activación del admin
- `403` — cuenta no activa
- `401` — token de Google inválido

---

### GET `/api/auth/me` 🔒
Retorna los datos del usuario autenticado.

**Respuesta `200`:** `{ user }`

---

## Usuarios — `/api/users` 🔒 Admin

### GET `/api/users`
Lista todos los usuarios con paginación.

**Query params:** `status`, `role`, `page` (default: 1), `limit` (default: 20)

**Respuesta `200`:** `{ total, page, pages, users }`

---

### GET `/api/users/:id`
Obtiene un usuario por ID.

**Respuesta `200`:** `{ user }`

---

### PATCH `/api/users/:id/activate`
Activa una cuenta `pending` o `suspended`.

**Respuesta `200`:** `{ message, user }`

---

### PATCH `/api/users/:id/suspend`
Suspende una cuenta. No se puede suspender a uno mismo.

**Respuesta `200`:** `{ message, user }`

---

### PATCH `/api/users/:id/role`
Cambia el rol de un usuario. No se puede cambiar el propio rol.

**Body:** `{ "role": "admin" }`

**Respuesta `200`:** `{ message, user }`

---

## Casas — `/api/casas` 🔒

### GET `/api/casas` — Admin + User
Lista casas con paginación. Por defecto solo muestra casas activas.

**Query params:** `bloque`, `activa` (default: `true`), `page`, `limit`

**Respuesta `200`:** `{ total, page, pages, casas }`

---

### GET `/api/casas/:id` — Admin + User
Obtiene una casa por ID.

**Respuesta `200`:** `{ casa }`

El campo virtual `codigo` es solo lectura: concatena `bloque + numeroCasa` (ej: `"G12"`).

---

### POST `/api/casas` — Admin
Crea una casa.

**Body:**
```json
{
  "bloque": "G",
  "numeroCasa": "12",
  "propietario": "Juan Pérez",
  "tipoDocumento": "CC",
  "numeroDocumento": "12345678",
  "contactoPropietario": "3001234567",
  "correo": "juan@email.com",
  "direccion": "Calle 123",
  "parqueadero": false
}
```

> `contactoPropietario`, `correo`, `direccion` y `parqueadero` son opcionales. `parqueadero: true` indica que la casa tiene vehículo adicional y se le generará cargo mensual de parqueadero.

**Respuestas**
- `201` — `{ message, casa }`
- `409` — bloque + numeroCasa ya existe

---

### POST `/api/casas/bulk` — Admin
Crea múltiples casas en lote. Los duplicados se omiten.

**Body:** `{ "casas": [ ...mismos campos que POST /casas... ] }`

**Respuestas**
- `201` — todas creadas
- `207` — inserción parcial: `{ message, insertadas, duplicados }`

---

### PUT `/api/casas/:id` — Admin
Actualiza una casa. Todos los campos son opcionales.

**Respuesta `200`:** `{ message, casa }`

---

### PATCH `/api/casas/:id/desactivar` — Admin
Desactiva una casa (soft delete). Las casas inactivas no reciben cargos mensuales.

**Respuesta `200`:** `{ message, casa }`

---

### PATCH `/api/casas/:id/activar` — Admin
Reactiva una casa previamente desactivada.

**Respuesta `200`:** `{ message, casa }`

---

## Tarifas — `/api/tarifas` 🔒 Admin

La tarifa define los valores vigentes para un año. Se crea como `provisional` (generalmente con el valor del año anterior) y se marca como `definitiva` cuando la junta aprueba el valor final. Al definirla, el sistema ajusta automáticamente los cargos pendientes y genera retroactivos para las casas que ya pagaron a la tarifa provisional.

### GET `/api/tarifas`
Lista todas las tarifas ordenadas por año descendente.

**Respuesta `200`:** `{ tarifas }`

---

### GET `/api/tarifas/:año`
Obtiene la tarifa de un año específico.

**Ejemplo:** `GET /api/tarifas/2026` — el parámetro es el valor de `anio`

**Respuesta `200`:** `{ tarifa }`

---

### POST `/api/tarifas`
Crea la tarifa de un año. El estado inicia en `provisional`.

**Body:**
```json
{
  "anio": 2026,
  "cuotaAdministracion": 200000,
  "multaMora": 10000,
  "diasGracia": 10,
  "parqueadero": 50000
}
```

> `diasGracia` es el día del mes hasta el cual se puede pagar sin mora (default: 10). `parqueadero` es el cargo mensual para casas con vehículo adicional.

**Respuestas**
- `201` — `{ message, tarifa }`
- `409` — ya existe tarifa para ese año

---

### PATCH `/api/tarifas/:id/definir`
Marca la tarifa como `definitiva` con los valores finales aprobados por la junta.

**Efectos automáticos:**
- Cargos de administración **pendientes** vinculados a esta tarifa se actualizan al nuevo monto.
- Cargos de administración **pagados** generan un cargo de tipo `retroactivo` por la diferencia por cada casa.

**Body:**
```json
{
  "cuotaAdministracion": 210000,
  "multaMora": 10000,
  "diasGracia": 10,
  "parqueadero": 50000
}
```

> Solo `cuotaAdministracion` es obligatorio. Los demás campos son opcionales y solo se actualizan si se envían.

**Respuesta `200`:**
```json
{
  "message": "Tarifa definida exitosamente",
  "tarifa": { ... },
  "retroactivosCreados": 45
}
```

**Respuestas de error**
- `400` — la tarifa ya está definida
- `404` — tarifa no encontrada

---

## Cargos — `/api/cargos` 🔒

Los cargos representan lo que cada casa debe pagar. Son la base del estado de cuenta y el requisito para crear facturas. Una factura solo puede crearse si la casa tiene cargos pendientes.

**Tipos:** `administracion` | `mora` | `parqueadero` | `retroactivo` | `extraordinario`

**Estados:** `pendiente` | `pagado` | `vencido`

### Ciclo de vida de un cargo
```
pendiente → (factura creada) → pendiente con factura reservada
         → (factura aprobada) → pagado
         → (factura rechazada) → pendiente (liberado)
         → (factura anulada) → pendiente (revertido)
         → (mora aplicada) → vencido
```

---

### GET `/api/cargos` — Admin
Lista cargos con filtros opcionales y paginación.

**Query params:** `casa`, `tipo`, `estado`, `periodo` (YYYY-MM), `page` (default: 1), `limit` (default: 20)

**Respuesta `200`:** `{ total, page, pages, cargos }`

---

### GET `/api/cargos/casa/:casaId/estado-cuenta` — Admin + User
Retorna el estado de cuenta completo de una casa agrupado por estado.

**Respuesta `200`:**
```json
{
  "casa": { ... },
  "resumen": {
    "totalPendiente": 210000,
    "totalVencido": 10000,
    "totalPagado": 840000,
    "alDia": false
  },
  "cargos": {
    "pendientes": [ ... ],
    "vencidos": [ ... ],
    "pagados": [ ... ]
  }
}
```

> `alDia: true` solo cuando no hay cargos pendientes ni vencidos.

---

### POST `/api/cargos/generar-mensual` — Admin
Genera los cargos de administración y parqueadero para todas las casas activas de un mes. Si una casa ya tiene el cargo del mes se omite (idempotente).

**Body:**
```json
{ "periodo": "2026-05" }
```

**Respuesta `201`:**
```json
{
  "message": "Cargos generados para 2026-05",
  "casas": 50,
  "creados": 58,
  "omitidos": 0
}
```

> La fecha de vencimiento se calcula automáticamente con el `diasGracia` de la tarifa del año correspondiente.

---

### POST `/api/cargos/aplicar-mora` — Admin
Aplica multa por mora a todas las casas con cargo de administración aún pendiente para el periodo indicado. Marca esos cargos de administración como `vencido`.

Ejecutar después del día de gracia definido en la tarifa.

**Body:**
```json
{ "periodo": "2026-05" }
```

**Respuesta `200`:**
```json
{
  "message": "Mora aplicada para 2026-05",
  "aplicadas": 8,
  "omitidas": 2
}
```

> `omitidas` son casas que ya tenían un cargo de mora para ese periodo.

---

### POST `/api/cargos/extraordinario` — Admin
Crea una cuota extraordinaria para todas las casas activas (ej. pavimentación, mantenimiento urgente).

**Body:**
```json
{
  "descripcion": "Pavimentación zona común",
  "monto": 150000,
  "vencimiento": "2026-06-30"
}
```

**Respuesta `201`:**
```json
{
  "message": "Cuota extraordinaria creada para 50 casa(s)",
  "casas": 50
}
```

---

## Facturas — `/api/facturas` 🔒

Las facturas registran los pagos físicos. Para crear una factura la casa debe tener cargos pendientes. La factura vincula los cargos que cubre, los reserva mientras está `por_aprobar`, y los marca como pagados al aprobarse.

**Estados:** `por_aprobar` | `aprobado` | `rechazado`

### Reglas de edición y eliminación
| Estado | ¿Editable? | ¿Eliminable? | ¿Quién? |
|--------|-----------|-------------|---------|
| `por_aprobar` + no anulada | Sí (excepto `numeroRecibo`) | Sí | Editar: user + admin / Eliminar: solo admin |
| `aprobado` | No | No | — |
| `rechazado` | No | No | — |
| `anulado: true` | No | No | — |

---

### GET `/api/facturas` — Admin + User
Lista facturas con filtros opcionales y paginación.

**Query params:** `estado`, `casa`, `page` (default: 1), `limit` (default: 20)

**Respuesta `200`:** `{ total, page, pages, facturas }`

---

### GET `/api/facturas/buscar` — Admin + User
Busca facturas por rango de fechas y casa. `desde` y (`bloque` o `codigo`) son obligatorios.

**Query params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `desde` | `YYYY-MM-DD` | **Obligatorio.** Fecha de inicio |
| `bloque` | String | Busca todas las casas del bloque (ej: `G`) |
| `codigo` | String | Busca la casa exacta (ej: `G12`). Tiene prioridad sobre `bloque` |
| `page` | número | Default: 1 |
| `limit` | número | Default: 20 |

**Respuesta `200`:** `{ total, page, pages, facturas }`

---

### GET `/api/facturas/buscar/exportar` — Admin
Exporta las facturas filtradas a un archivo Excel `.xlsx`. Mismos parámetros que `/buscar` sin paginación.

**Respuesta:** archivo descargable con nombre:
```
facturas_G12_desde_2026-01-01_al_2026-05-08.xlsx
```

---

### GET `/api/facturas/:id` — Admin
Obtiene una factura por ID con todos los campos populados.

**Respuesta `200`:** `{ factura }`

---

### POST `/api/facturas` — Admin + User
Crea una factura vinculada a cargos pendientes de la casa. Los cargos quedan reservados hasta que la factura sea aprobada o rechazada.

**Body:**
```json
{
  "numeroRecibo": "001-2026",
  "valor": 220000,
  "fecha": "2026-05-08",
  "casa": "<casaId>",
  "descripcion": "Pago administración y mora mayo 2026",
  "nombrePagador": "Carlos Ruiz",
  "metodoPago": "efectivo",
  "cargos": ["<cargoId1>", "<cargoId2>"]
}
```

> `cargos` es un array con los IDs de los cargos pendientes que cubre este pago. Deben pertenecer a la misma casa, estar en estado `pendiente` y no tener otra factura vinculada.

**Respuestas**
- `201` — `{ message, factura }`
- `400` — cargos no válidos, no pertenecen a la casa, o ya están pagados
- `409` — número de recibo duplicado, o cargo ya tiene factura pendiente de aprobación

---

### POST `/api/facturas/bulk` — Admin
Crea múltiples facturas en lote. Uso para importación de datos históricos. No requiere `cargos`.

**Body:**
```json
{
  "facturas": [
    {
      "numeroRecibo": "001-2025",
      "valor": 200000,
      "fecha": "2025-03-01",
      "casa": "<casaId>",
      "descripcion": "Administración marzo 2025",
      "nombrePagador": "Juan Pérez",
      "metodoPago": "efectivo"
    }
  ]
}
```

**Respuestas**
- `201` — todas creadas
- `207` — inserción parcial: `{ message, insertadas, duplicados }`

---

### PUT `/api/facturas/:id` — Admin + User
Edita los campos de una factura. Solo funciona si está en `por_aprobar` y no está anulada.

- `numeroRecibo` nunca puede modificarse.
- Campos editables: `valor`, `fecha`, `casa`, `descripcion`, `nombrePagador`, `metodoPago`.

**Respuestas**
- `200` — `{ message, factura }`
- `403` — factura no editable (ya aprobada, rechazada o anulada)

---

### DELETE `/api/facturas/:id` — Admin
Elimina permanentemente una factura con número de recibo mal digitado. Solo funciona si está en `por_aprobar` y no está anulada. El recibo físico con ese número queda como anulado en papel.

**Respuestas**
- `200` — `{ message }`
- `403` — factura no eliminable

---

### PATCH `/api/facturas/:id/aprobar` — Admin
Aprueba la factura. Marca automáticamente los cargos vinculados como `pagado` y registra `aprobadoPor` y `aprobadoEn`.

**Respuesta `200`:** `{ message, factura }`

---

### PATCH `/api/facturas/:id/rechazar` — Admin
Rechaza la factura. Libera los cargos vinculados para que puedan ser usados en una nueva factura.

**Respuesta `200`:** `{ message, factura }`

---

### PATCH `/api/facturas/:id/anular` — Admin
Anula la factura (recibo físico inválido con consecutivo quemado). Revierte los cargos vinculados a `pendiente`, reactivando la deuda. Una factura anulada no puede modificarse ni anularse de nuevo.

**Respuesta `200`:** `{ message, factura }`

---

## Flujo operativo mensual

```
1. Inicio de año (primera vez)
   └─ POST /api/tarifas
      { año, cuotaAdministracion, multaMora, diasGracia, parqueadero }
      estado queda en "provisional"

2. Inicio de cada mes
   └─ POST /api/cargos/generar-mensual
      { periodo: "YYYY-MM" }
      Genera administración + parqueadero para todas las casas activas

3. Día 11 (o el día siguiente al diasGracia de la tarifa)
   └─ POST /api/cargos/aplicar-mora
      { periodo: "YYYY-MM" }
      Aplica mora a las casas que no han pagado

4. Cuando la junta define la tarifa final del año
   └─ PATCH /api/tarifas/:id/definir
      { cuotaAdministracion: valorFinal, ... }
      Actualiza cargos pendientes y genera retroactivos automáticamente

5. Cuando se necesita un cobro especial
   └─ POST /api/cargos/extraordinario
      { descripcion, monto, vencimiento }

6. Cuando un residente paga
   a. GET /api/cargos/casa/:casaId/estado-cuenta   → ver cargos pendientes
   b. POST /api/facturas                            → crear factura vinculando los cargos
   c. PATCH /api/facturas/:id/aprobar               → aprobar y marcar cargos como pagados
```
