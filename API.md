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

El token se obtiene al hacer login exitoso (`/api/auth/login` o `/api/auth/google`).

---

## Roles y estados de cuenta

### Roles
| Rol | Descripción |
|-----|-------------|
| `user` | Rol por defecto. Puede crear facturas y listarlas. |
| `admin` | Acceso total. Gestiona usuarios, casas y facturas. |

### Estados de cuenta (usuario)
| Estado | Descripción |
|--------|-------------|
| `pending` | Recién registrado. No puede iniciar sesión. |
| `active` | Activado por un admin. Puede iniciar sesión. |
| `suspended` | Suspendido por un admin. No puede iniciar sesión. |

> Todo usuario recién creado tiene `role: "user"` y `status: "pending"`. Un admin debe activarlo antes de que pueda hacer login.

---

## Modelos

### User
```
_id           String (ObjectId)
name          String  — requerido
email         String  — único, requerido
password      String  — solo para authProvider "local"
avatar        String  — URL de foto (viene de Google)
role          "user" | "admin"         — default: "user"
status        "pending" | "active" | "suspended"  — default: "pending"
authProvider  "local" | "google"       — default: "local"
activatedBy   ObjectId → User          — quién activó la cuenta
activatedAt   Date                     — cuándo fue activada
createdAt     Date
updatedAt     Date
```

### Casa
```
_id                 String (ObjectId)
bloque              String  — requerido
numeroCasa          String  — requerido
codigo              String  — virtual: bloque + numeroCasa (ej: "G12"), solo lectura
propietario         String  — requerido
tipoDocumento       String  — requerido (ej: "CC", "NIT", "CE")
numeroDocumento     String  — requerido
contactoPropietario String  — opcional
correo              String  — opcional
direccion           String  — opcional
activa              Boolean — default: true
createdAt           Date
updatedAt           Date
```
> `bloque` + `numeroCasa` son únicos en conjunto. No pueden existir dos casas con el mismo bloque y número.
> Las casas nunca se borran físicamente. Al "eliminar" una casa se desactiva (`activa: false`) para preservar el historial de facturas.

### Factura
```
_id            String (ObjectId)
numeroRecibo   String  — único, requerido
valor          Number  — requerido, >= 0
fecha          Date    — requerido (ISO 8601: "YYYY-MM-DD")
casa           ObjectId → Casa   — requerido
descripcion    String  — requerido (ej: "Administración mayo 2026")
nombrePagador  String  — requerido
metodoPago     "efectivo" | "digital"    — requerido
estado         "por_aprobar" | "aprobado" | "rechazado"  — default: "por_aprobar"
creadoPor      ObjectId → User   — se asigna automáticamente del token JWT
aprobadoPor    ObjectId → User   — lo asigna el admin al aprobar
aprobadoEn     Date              — lo asigna el admin al aprobar
anulado        Boolean           — default: false
anuladoPor     ObjectId → User   — lo asigna el admin al anular
anuladoEn      Date              — lo asigna el admin al anular
createdAt      Date
updatedAt      Date
```
> El campo `estado` no puede modificarse directamente con PUT. Solo cambia mediante los endpoints `/aprobar` y `/rechazar`.

---

## Endpoints

### Auth — `/api/auth`

#### POST `/api/auth/register`
Registra un nuevo usuario. La cuenta queda en `status: "pending"` y no puede iniciar sesión hasta que un admin la active.

**Auth requerida:** No

**Body:**
```json
{
  "name": "Juan Pérez",
  "email": "juan@email.com",
  "password": "min6caracteres"
}
```

**Respuesta 201:**
```json
{
  "message": "Account created successfully. Wait for an admin to activate your account before logging in.",
  "user": { ...userData }
}
```

---

#### POST `/api/auth/login`
Inicia sesión con email y contraseña. Solo funciona si `status: "active"`.

**Auth requerida:** No

**Body:**
```json
{
  "email": "juan@email.com",
  "password": "mipassword"
}
```

**Respuesta 200:**
```json
{
  "token": "<JWT>",
  "user": { ...userData }
}
```

**Respuesta 403** (cuenta no activa):
```json
{
  "message": "Account not active. Contact an administrator to activate your account.",
  "status": "pending"
}
```

---

#### POST `/api/auth/google`
Inicia sesión o registra un usuario con Google. Recibe el `idToken` obtenido desde el SDK de Google Sign-In en Android.

**Auth requerida:** No

**Body:**
```json
{
  "idToken": "<Google ID Token>"
}
```

**Respuesta 200** (login exitoso):
```json
{
  "token": "<JWT>",
  "user": { ...userData }
}
```

**Respuesta 201** (cuenta nueva creada, queda pendiente):
```json
{
  "message": "Account created. Wait for an admin to activate it before logging in.",
  "user": { ...userData }
}
```

**Respuesta 403** (cuenta no activa):
```json
{
  "message": "Account not active. Contact an administrator.",
  "status": "pending"
}
```

---

#### GET `/api/auth/me`
Retorna los datos del usuario autenticado.

**Auth requerida:** Sí (cualquier rol activo)

**Respuesta 200:**
```json
{
  "user": { ...userData }
}
```

---

### Usuarios — `/api/users` _(solo admin)_

#### GET `/api/users`
Lista todos los usuarios con paginación y filtros opcionales.

**Query params:**
| Param | Valores | Descripción |
|-------|---------|-------------|
| `status` | `pending` \| `active` \| `suspended` | Filtrar por estado |
| `role` | `user` \| `admin` | Filtrar por rol |
| `page` | número | Página (default: 1) |
| `limit` | número | Resultados por página (default: 20) |

**Respuesta 200:**
```json
{
  "total": 50,
  "page": 1,
  "pages": 3,
  "users": [ ...userData ]
}
```

---

#### GET `/api/users/:id`
Obtiene un usuario por ID.

**Respuesta 200:**
```json
{
  "user": { ...userData }
}
```

---

#### PATCH `/api/users/:id/activate`
Activa la cuenta de un usuario (`status: "pending"` o `"suspended"` → `"active"`).

**Respuesta 200:**
```json
{
  "message": "User activated successfully",
  "user": { ...userData }
}
```

---

#### PATCH `/api/users/:id/suspend`
Suspende la cuenta de un usuario (`status` → `"suspended"`). No se puede suspender a uno mismo.

**Respuesta 200:**
```json
{
  "message": "User suspended successfully",
  "user": { ...userData }
}
```

---

#### PATCH `/api/users/:id/role`
Cambia el rol de un usuario. No se puede cambiar el propio rol.

**Body:**
```json
{
  "role": "admin"
}
```

**Respuesta 200:**
```json
{
  "message": "Role updated successfully",
  "user": { ...userData }
}
```

---

### Casas — `/api/casas` _(solo admin)_

#### GET `/api/casas`
Lista casas con paginación. Por defecto solo muestra casas activas.

**Query params:**
| Param | Valores | Descripción |
|-------|---------|-------------|
| `bloque` | String | Filtrar por bloque |
| `activa` | `true` \| `false` | Default: `true`. Pasar `false` para ver casas desactivadas |
| `page` | número | Página (default: 1) |
| `limit` | número | Resultados por página (default: 20) |

**Respuesta 200:**
```json
{
  "total": 100,
  "page": 1,
  "pages": 5,
  "casas": [ ...casaData ]
}
```

---

#### GET `/api/casas/:id`
Obtiene una casa por ID.

**Respuesta 200:**
```json
{
  "casa": { ...casaData }
}
```

---

#### POST `/api/casas`
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
  "direccion": "Calle 123"
}
```
> `contactoPropietario`, `correo` y `direccion` son opcionales.

**Respuesta 201:**
```json
{
  "message": "Casa creada exitosamente",
  "casa": { ...casaData }
}
```

---

#### POST `/api/casas/bulk`
Crea múltiples casas en un solo request. Las duplicadas se omiten y se continúa con las demás.

**Body:**
```json
{
  "casas": [
    {
      "bloque": "A",
      "numeroCasa": "101",
      "propietario": "Juan Pérez",
      "tipoDocumento": "CC",
      "numeroDocumento": "12345678"
    },
    {
      "bloque": "A",
      "numeroCasa": "102",
      "propietario": "María López",
      "tipoDocumento": "CC",
      "numeroDocumento": "87654321"
    }
  ]
}
```

**Respuesta 201** (todas insertadas):
```json
{
  "message": "2 casa(s) creada(s) exitosamente",
  "casas": [ ...casaData ]
}
```

**Respuesta 207** (inserción parcial con duplicados):
```json
{
  "message": "1 casa(s) creada(s), 1 duplicada(s) omitida(s)",
  "insertadas": [ ...casaData ],
  "duplicados": [ ...casaData ]
}
```

---

#### PUT `/api/casas/:id`
Actualiza una casa. Todos los campos son opcionales.

**Body:** cualquier combinación de campos del modelo Casa.

**Respuesta 200:**
```json
{
  "message": "Casa actualizada exitosamente",
  "casa": { ...casaData }
}
```

---

#### PATCH `/api/casas/:id/desactivar`
Desactiva una casa (soft delete). El documento se conserva en base de datos para mantener el historial de facturas.

**Respuesta 200:**
```json
{
  "message": "Casa desactivada exitosamente",
  "casa": { ...casaData }
}
```

---

#### PATCH `/api/casas/:id/activar`
Reactiva una casa previamente desactivada.

**Respuesta 200:**
```json
{
  "message": "Casa activada exitosamente",
  "casa": { ...casaData }
}
```

---

### Facturas — `/api/facturas`

#### GET `/api/facturas`
Lista todas las facturas. Accesible por `user` y `admin`.

**Query params:**
| Param | Valores | Descripción |
|-------|---------|-------------|
| `estado` | `por_aprobar` \| `aprobado` \| `rechazado` | Filtrar por estado |
| `casa` | ObjectId | Filtrar por casa |
| `page` | número | Página (default: 1) |
| `limit` | número | Resultados por página (default: 20) |

**Respuesta 200:**
```json
{
  "total": 80,
  "page": 1,
  "pages": 4,
  "facturas": [
    {
      "_id": "...",
      "numeroRecibo": "REC-001",
      "valor": 150000,
      "fecha": "2026-05-01T00:00:00.000Z",
      "casa": {
        "_id": "...",
        "bloque": "G",
        "numeroCasa": "12",
        "codigo": "G12"
      },
      "descripcion": "Administración mayo 2026",
      "nombrePagador": "Juan Pérez",
      "estado": "por_aprobar",
      "creadoPor": { "_id": "...", "name": "...", "email": "...", "role": "user" },
      "aprobadoPor": null,
      "aprobadoEn": null
    }
  ]
}
```

---

#### GET `/api/facturas/buscar`
Busca facturas aplicando filtros. Accesible por `user` y `admin`.

**Reglas:**
- `desde` es **obligatorio**
- `bloque` o `codigo` son **obligatorios** (al menos uno). Si se envían los dos, `codigo` tiene prioridad.
- Retorna todas las facturas desde `desde` hasta la fecha actual.

**Query params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `desde` | `YYYY-MM-DD` | **Obligatorio.** Fecha de inicio del rango |
| `bloque` | String | Busca todas las casas del bloque (ej: `G`) |
| `codigo` | String | Busca la casa exacta por código (ej: `G12`) |
| `page` | número | Página (default: 1) |
| `limit` | número | Resultados por página (default: 20) |

**Ejemplos de uso:**
```
GET /api/facturas/buscar?desde=2026-01-01&codigo=G12
GET /api/facturas/buscar?desde=2026-01-01&bloque=G
GET /api/facturas/buscar?desde=2026-01-01&bloque=G&page=2
```

**Respuesta 200:**
```json
{
  "total": 12,
  "page": 1,
  "pages": 1,
  "facturas": [ ...facturaData ]
}
```

**Respuesta 400** (faltan parámetros):
```json
{ "message": "El parámetro \"desde\" es obligatorio" }
{ "message": "Debes enviar al menos \"bloque\" o \"codigo\" (ej: G12)" }
```

**Respuesta 404** (ninguna casa coincide):
```json
{ "message": "No se encontraron casas con los parámetros indicados" }
```

---

#### GET `/api/facturas/buscar/exportar`
Genera y descarga un archivo Excel con los mismos resultados de `/buscar`. Solo `admin`.

**Query params:** idénticos a `/buscar` (`desde`, `bloque` o `codigo`). No tiene paginación — exporta todos los resultados.

**Ejemplos de uso:**
```
GET /api/facturas/buscar/exportar?desde=2026-01-01&codigo=G12
GET /api/facturas/buscar/exportar?desde=2026-01-01&bloque=G
```

**Respuesta:** archivo `.xlsx` descargable con las columnas:
`N° Recibo`, `Fecha`, `Casa`, `Descripción`, `Nombre Pagador`, `Método de Pago`, `Valor`, `Estado`, `Anulado`, `Creado Por`, `Aprobado Por`, `Aprobado En`, `Anulado Por`, `Anulado En`

El nombre del archivo generado sigue el patrón:
```
facturas_G12_desde_2026-01-01_al_2026-05-05.xlsx
```

> En Flutter: usa `dio` para descargar el archivo y `path_provider` + `open_file` para guardarlo y abrirlo.

---

#### GET `/api/facturas/:id`
Obtiene una factura por ID. Solo `admin`.

**Respuesta 200:**
```json
{
  "factura": { ...facturaData }
}
```

---

#### POST `/api/facturas`
Crea una factura. Accesible por `user` y `admin`. Siempre queda en `estado: "por_aprobar"`. El campo `creadoPor` se asigna automáticamente del token.

**Body:**
```json
{
  "numeroRecibo": "REC-001",
  "valor": 150000,
  "fecha": "2026-05-01",
  "casa": "<ObjectId de la casa>",
  "descripcion": "Administración mayo 2026",
  "nombrePagador": "Juan Pérez",
  "metodoPago": "efectivo"
}
```

**Respuesta 201:**
```json
{
  "message": "Factura creada exitosamente",
  "factura": { ...facturaData }
}
```

---

#### POST `/api/facturas/bulk`
Crea múltiples facturas. Solo `admin`. Los números de recibo duplicados se omiten.

**Body:**
```json
{
  "facturas": [
    {
      "numeroRecibo": "REC-001",
      "valor": 150000,
      "fecha": "2026-05-01",
      "casa": "<ObjectId>",
      "descripcion": "Administración mayo 2026",
      "nombrePagador": "Juan Pérez"
    }
  ]
}
```

---

#### PUT `/api/facturas/:id`
Actualiza datos de una factura. Solo `admin`. No permite modificar `estado`, `creadoPor`, `aprobadoPor` ni `aprobadoEn`.

**Body:** cualquier combinación de campos editables.

**Respuesta 200:**
```json
{
  "message": "Factura actualizada exitosamente",
  "factura": { ...facturaData }
}
```

---

#### PATCH `/api/facturas/:id/aprobar`
Aprueba una factura. Solo `admin`. Registra quién aprobó y cuándo.

**Respuesta 200:**
```json
{
  "message": "Factura aprobada exitosamente",
  "factura": { ...facturaData }
}
```

---

#### PATCH `/api/facturas/:id/rechazar`
Rechaza una factura. Solo `admin`.

**Respuesta 200:**
```json
{
  "message": "Factura rechazada",
  "factura": { ...facturaData }
}
```

---

#### PATCH `/api/facturas/:id/anular`
Anula una factura. Solo `admin`. Registra quién anuló y cuándo. Una factura anulada no puede anularse de nuevo.

**Respuesta 200:**
```json
{
  "message": "Factura anulada exitosamente",
  "factura": { ...facturaData }
}
```

---

## Códigos de error comunes

| Código | Significado |
|--------|-------------|
| `400` | Datos inválidos o faltantes en el body |
| `401` | Token ausente, inválido o expirado |
| `403` | Sin permisos (rol insuficiente o cuenta inactiva) |
| `404` | Recurso no encontrado |
| `409` | Conflicto — registro duplicado (email, numeroRecibo, bloque+numeroCasa) |
| `500` | Error interno del servidor |
