# Implementación de BildyApp — Explicación paso a paso

Este documento describe, en orden de implementación, cada decisión técnica tomada para construir el módulo de gestión de usuarios de BildyApp.

---

## Paso 1: `package.json` — Configuración del proyecto

```json
"type": "module"
```

Activar ESM obliga a usar `import`/`export` en lugar de `require`/`module.exports` (T1). El script de desarrollo usa `--watch` (recarga automática sin nodemon) y `--env-file=.env` (carga variables de entorno sin `dotenv`) — ambas son características nativas de Node.js 22+.

**Dependencias instaladas:**

| Paquete | Para qué sirve |
|---------|---------------|
| `express` (v5) | Framework HTTP |
| `mongoose` | ODM para MongoDB |
| `bcryptjs` | Hash de contraseñas |
| `jsonwebtoken` | Generar y verificar JWT |
| `zod` | Validación y transformación de datos |
| `multer` | Subida de archivos multipart/form-data |
| `helmet` | Cabeceras HTTP de seguridad |
| `express-rate-limit` | Limitación de tasa de peticiones |
| `express-mongo-sanitize` | Sanitización contra inyección NoSQL |

---

## Paso 2: `src/utils/AppError.js` — Clase de error personalizada

```js
export class AppError extends Error {
  constructor(message, statusCode) { ... }
  static badRequest(message) { ... }
  static unauthorized(message) { ... }
  // ...
}
```

**Por qué:** En lugar de lanzar errores genéricos, `AppError` encapsula el código HTTP y un flag `isOperational`. Esto permite al middleware centralizado distinguir entre errores esperados (validación, auth) y errores inesperados (bugs).

Los métodos estáticos factoría (`AppError.conflict(...)`, `AppError.unauthorized(...)`) son azúcar sintáctico que evita escribir `new AppError('msg', 409)` en cada controller.

---

## Paso 3: `src/models/company.model.js` — Modelo Company

```js
cif: { type: String, unique: true, sparse: true }
```

**Por qué `sparse: true`:** El index único en `cif` con `sparse: true` permite que varios documentos tengan `cif: undefined` sin violar la unicidad. Si se usara solo `unique: true`, solo un documento podría tener `cif` sin valor.

```js
owner: { type: ObjectId, ref: 'User', required: true }
```

La referencia al `User` propietario permite usar `populate()` en el futuro para obtener los datos del admin.

---

## Paso 4: `src/models/user.model.js` — Modelo User

### Indexes

```js
email: { unique: true }    // el más crítico: login y registro
status: { index: true }    // filtros por 'pending' / 'verified'
company: { index: true }   // queries de usuarios por compañía
role: { index: true }      // filtros por rol
```

Los indexes aceleran las consultas frecuentes (T5). Sin ellos, MongoDB haría un `COLLSCAN` (escaneo completo de colección) en cada query.

### Virtual `fullName`

```js
userSchema.virtual('fullName').get(function () {
  return `${this.name} ${this.lastName}`;
});
```

Un virtual es un campo calculado que **no se persiste en MongoDB**. Se define en el schema pero se calcula en tiempo de ejecución. Para que aparezca en las respuestas JSON hay que activarlo:

```js
toJSON: { virtuals: true }
```

### `password: { select: false }`

Por defecto, la contraseña **no se incluye** en los resultados de las queries. Para obtenerla (en login y cambio de contraseña) hay que pedirla explícitamente con `.select('+password')`.

---

## Paso 5: `src/models/refreshToken.model.js` — Modelo RefreshToken

```js
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

**TTL Index:** MongoDB elimina automáticamente los documentos cuya fecha `expiresAt` ha pasado. Esto gestiona la limpieza de tokens expirados sin necesitar un cron job manual.

La estrategia elegida es **almacenar los refresh tokens en base de datos** (en lugar de solo en JWT) para poder invalidarlos explícitamente en el logout o cuando se rotan.

---

## Paso 6: `src/services/notification.service.js` — EventEmitter

```js
class NotificationService extends EventEmitter {
  constructor() {
    super();
    this._registerListeners();
  }
}
export const notificationService = new NotificationService();
```

**Por qué EventEmitter (T2):** El patrón observer desacopla la lógica de negocio de los efectos secundarios. El controller solo emite el evento (`notificationService.emit('user:registered', data)`) sin saber qué ocurre después. Los listeners hacen `console.log` ahora; en la práctica final enviarán a Slack sin cambiar el controller.

Eventos implementados: `user:registered`, `user:verified`, `user:invited`, `user:deleted`.

---

## Paso 7: `src/middleware/auth.middleware.js` — Autenticación JWT

```js
const decoded = jwt.verify(token, process.env.JWT_SECRET);
const user = await User.findById(decoded.id);
req.user = user;
```

**Flujo:**
1. Leer la cabecera `Authorization: Bearer <token>`
2. Verificar la firma del JWT con `jwt.verify()` — lanza excepción si expirado o inválido
3. Buscar el usuario en BD para asegurarse de que sigue existiendo y no fue eliminado
4. Adjuntar el usuario a `req.user` para que los controllers lo usen

**Por qué buscar el usuario en BD:** El JWT podría seguir siendo válido aunque el usuario haya sido borrado (soft delete). Verificando en BD nos aseguramos de que el usuario existe y no está marcado como eliminado.

---

## Paso 8: `src/middleware/errorHandler.middleware.js` — Manejo centralizado de errores

```js
export const errorHandler = (err, req, res, next) => { ... }
```

**Cuatro parámetros:** Express identifica un middleware de errores precisamente por tener 4 parámetros `(err, req, res, next)`.

El middleware centraliza todos los tipos de error:
- `AppError` → respuesta con el `statusCode` definido
- `mongoose.Error.ValidationError` → 400 con detalle de campos
- `err.code === 11000` → 409 por duplicado en MongoDB
- `err.code === 'LIMIT_FILE_SIZE'` → 400 por Multer
- Errores no contemplados → 500

Esto evita duplicar lógica de error en cada controller.

---

## Paso 9: `src/middleware/role.middleware.js` — Autorización por roles

```js
export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return next(AppError.forbidden(...));
  next();
};
```

**Patrón factory:** `requireRole('admin')` devuelve un middleware que comprueba si el rol del usuario está en la lista. Se usa en la ruta de invitación: `router.post('/invite', requireRole('admin'), ...)`.

---

## Paso 10: `src/middleware/upload.middleware.js` — Multer

```js
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `logo-${req.user._id}-${Date.now()}${ext}`)
});
```

**Decisiones:**
- `diskStorage` en lugar de `memoryStorage` → el archivo se guarda en disco directamente, sin cargar en RAM
- Nombre de archivo único: `logo-{userId}-{timestamp}.ext` → evita colisiones
- `fileFilter` → solo imágenes JPEG, PNG, WebP, GIF
- `limits: { fileSize: 5 * 1024 * 1024 }` → máximo 5 MB

---

## Paso 11: `src/middleware/validate.middleware.js` — Validación Zod

```js
export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) { /* error 400 */ }
  req.body = result.data; // datos ya transformados
  next();
};
```

**Por qué `safeParse` en lugar de `parse`:** `safeParse` nunca lanza excepción — devuelve `{ success, data, error }`. Permite responder con 400 de forma controlada.

**Clave:** `req.body = result.data` reemplaza el body con los datos **ya transformados por Zod** (emails en minúsculas, strings con trim, valores por defecto…). El controller recibe datos ya limpios.

---

## Paso 12: `src/validators/user.validator.js` — Esquemas Zod

### `.transform()` para normalizar datos

```js
email: z.string().email().transform(v => v.toLowerCase().trim())
```

El `.transform()` se ejecuta después de la validación. Garantiza que los emails siempre se guardan en minúsculas, independientemente de cómo los envíe el cliente.

### `.refine()` para validaciones cruzadas (BONUS)

```js
export const passwordSchema = z.object({ currentPassword, newPassword })
  .refine(
    data => data.currentPassword !== data.newPassword,
    { message: 'La nueva contraseña debe ser diferente a la actual', path: ['newPassword'] }
  );
```

`.refine()` permite validaciones que dependen de varios campos a la vez. Se ejecuta después de validar cada campo individualmente.

### `z.discriminatedUnion` para onboarding de compañía (BONUS)

```js
export const companySchema = z.discriminatedUnion('isFreelance', [
  z.object({ isFreelance: z.literal(true) }),
  z.object({
    isFreelance: z.literal(false),
    name: z.string().min(1),
    cif: z.string().min(1),
    address: addressSchema.optional()
  })
]);
```

**Por qué `discriminatedUnion`:** Cuando `isFreelance: true`, los campos `name` y `cif` no son necesarios (se usan los datos personales). Cuando `isFreelance: false`, son obligatorios. `discriminatedUnion` valida el esquema correcto según el valor del campo discriminador, dando errores precisos.

---

## Paso 13: `src/controllers/user.controller.js` — Lógica de negocio

### Helper `generateTokens`

```js
const generateTokens = async (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshTokenValue = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  await RefreshToken.create({ userId, token: refreshTokenValue, expiresAt: ... });
  return { accessToken, refreshToken: refreshTokenValue };
};
```

**Access token (15 min):** Corta duración para minimizar el riesgo si es robado. El cliente lo usa en cada petición.

**Refresh token (7 días):** Larga duración. Se almacena en BD para poder invalidarlo explícitamente. Al hacer refresh, se **rota** (el token viejo se elimina y se emite uno nuevo).

### POST /register — Registro

- Comprueba si ya existe un usuario **verificado** con ese email (409 si existe)
- Genera código de 6 dígitos con `Math.floor(100000 + Math.random() * 900000)` — garantiza siempre 6 dígitos
- Hash de contraseña con bcrypt (cost factor 12)
- Emite evento `user:registered` con el código para que aparezca en consola

### PUT /validation — Validación de email

- Decrementa `verificationAttempts` en cada intento fallido
- Si llega a 0, devuelve **429 Too Many Requests**
- Si es correcto: `status = 'verified'`, borra el código de la BD

### POST /login — Login

- Busca el usuario incluyendo la contraseña con `.select('+password')`
- `bcrypt.compare()` hace la comparación segura (tiempo constante, evita timing attacks)
- El mensaje de error es genérico ("Credenciales incorrectas") tanto si no existe el email como si la contraseña es incorrecta — evita user enumeration

### PATCH /company — Onboarding de compañía

**Lógica del CIF:**
- Si `isFreelance: true` → CIF = NIF del usuario, nombre = nombre del usuario
- Busca si ya existe una Company con ese CIF
  - **Existe** → el usuario se une y su role cambia a `guest`
  - **No existe** → se crea la Company con el usuario como `owner`, mantiene role `admin`

### POST /refresh — Rotar refresh token

```js
await storedToken.deleteOne();
const { accessToken, refreshToken: newRefreshToken } = await generateTokens(decoded.id);
```

La **rotación** invalida el token usado y emite uno nuevo. Si un atacante roba un refresh token ya usado, el intento fallará (ya fue eliminado).

### DELETE /user — Soft vs Hard delete

```js
const soft = req.query.soft === 'true';
if (soft) {
  await User.findByIdAndUpdate(req.user._id, { deleted: true });
} else {
  await User.findByIdAndDelete(req.user._id);
}
```

El soft delete marca `deleted: true` pero mantiene el registro. El auth middleware comprueba `user.deleted` para bloquear acceso. El hard delete elimina el documento permanentemente.

### POST /invite — Invitar compañero

Solo accesible para usuarios con role `admin` (middleware `requireRole('admin')`). Crea el usuario invitado con una contraseña temporal aleatoria y lo asigna a la misma compañía del invitador. El nuevo usuario tendrá role `guest`.

---

## Paso 14: `src/routes/user.routes.js` — Rutas

```js
// Rutas públicas
router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.post('/refresh', validateBody(refreshTokenSchema), refreshAccessToken);

// A partir de aquí, todas las rutas requieren JWT
router.use(authenticate);

router.put('/validation', ...);
router.put('/register', ...);   // mismo path, distinto método
// ...
```

**`router.use(authenticate)`:** Aplica el middleware de autenticación a todas las rutas definidas **después** de esta línea. Las rutas anteriores (register, login, refresh) no requieren token.

**Mismo path, distinto método:** `POST /register` y `PUT /register` comparten el path `/register` pero hacen cosas distintas. Express los enruta por método HTTP.

---

## Paso 15: `src/app.js` — Configuración de Express

### Seguridad en capas

```js
app.use(helmet());           // 1. Cabeceras HTTP seguras
app.use(mongoSanitize());    // 2. Sanitización NoSQL
app.use('/api', limiter);    // 3. Rate limiting (100 req / 15 min)
```

**Helmet** añade automáticamente cabeceras como `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.

**express-mongo-sanitize** elimina claves que empiezan por `$` o contienen `.` del body, params y query — previene inyecciones MongoDB como `{ "email": { "$gt": "" } }`.

**Rate limiting** limita 100 peticiones por IP cada 15 minutos. Aplica solo a `/api` para no afectar al health check.

### Orden de middleware

El orden en Express importa:
1. Seguridad primero (helmet, sanitize, rate limit)
2. Parseo del body (json, urlencoded)
3. Archivos estáticos
4. Rutas de la API
5. Manejador de 404 (notFound)
6. Manejador de errores (errorHandler) — **siempre el último**

---

## Resumen de la arquitectura

```
Petición HTTP
     │
     ▼
[helmet + mongoSanitize + rateLimit]   ← Seguridad global
     │
     ▼
[express.json()]                        ← Parseo del body
     │
     ▼
[/api router]
     │
     ├─ POST /user/register ──► [validateBody] ──► [register controller]
     │
     ├─ POST /user/login ───► [validateBody] ──► [login controller]
     │
     └─ (rutas protegidas)
          │
          ▼
       [authenticate]                   ← Verifica JWT, adjunta req.user
          │
          ▼
       [requireRole?]                   ← Solo en /invite
          │
          ▼
       [validateBody]                   ← Valida y transforma con Zod
          │
          ▼
       [controller]                     ← Lógica de negocio
          │
          ├─ [Model] ──► MongoDB Atlas
          │
          └─ [notificationService.emit(...)] ──► console.log
```

Si cualquier middleware llama a `next(err)`, el flujo salta directamente al `errorHandler` final.

---

## Variables de entorno necesarias

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto (3000) |
| `PUBLIC_URL` | URL base para construir URLs de logos |
| `DB_URI` | Cadena de conexión MongoDB Atlas |
| `JWT_SECRET` | Secreto del access token (corta duración) |
| `JWT_REFRESH_SECRET` | Secreto del refresh token (larga duración) |

**Importante:** `JWT_SECRET` y `JWT_REFRESH_SECRET` deben ser **diferentes** para que un refresh token no pueda usarse como access token.

---

---

## Cambios aplicados tras revisión de la especificación

### Separación `app.js` / `index.js`

La especificación indica una estructura donde `app.js` solo configura Express y `index.js` es el punto de entrada que arranca el servidor. En la implementación original, `app.js` hacía ambas cosas. Se ha separado:

- **`src/app.js`** → solo configura middleware, rutas y manejadores de error. Exporta `app` con `export default app`.
- **`src/index.js`** → importa `app`, llama a `dbConnect()` y arranca el servidor con `app.listen()`.

### `src/config/db.js` → `src/config/index.js`

La especificación muestra `src/config/index.js` como fichero de configuración centralizada. El fichero `db.js` se mantiene por compatibilidad pero el nuevo fichero canónico es `src/config/index.js` (mismo contenido). `app.js` ya no importa ninguno de los dos directamente; la conexión a BD la gestiona `index.js`.

### `package.json` — scripts actualizados

Los scripts `dev` y `start` apuntaban a `src/app.js`. Tras la separación, ahora apuntan a `src/index.js`:

```json
"dev": "node --watch --env-file=.env src/index.js",
"start": "node --env-file=.env src/index.js"
```

### `src/middlewares/` (plural) — carpeta huérfana

Existe una carpeta `src/middlewares/` (plural) con versiones anteriores de `error.middleware.js` y `validate.middleware.js`. **No se importan en ningún lugar del proyecto** — toda la aplicación usa `src/middleware/` (singular). Esta carpeta es código muerto y puede eliminarse sin afectar a la funcionalidad.

### `README.md` añadido

Se ha creado `README.md` con instrucciones de instalación, configuración, ejecución y una tabla de endpoints, tal como exige la especificación en el apartado de entrega.

---

## Puntos de evaluación cubiertos

| Criterio | Implementado en |
|----------|----------------|
| ESM (`import`/`export`) | Todos los archivos |
| Node.js 22+ (`--watch`, `--env-file`) | `package.json` scripts |
| Async/await | Todos los controllers |
| EventEmitter | `notification.service.js` |
| MVC | `models/`, `controllers/`, `routes/` |
| Zod con `.transform()` | `user.validator.js` → `registerSchema`, `loginSchema` |
| Zod con `.refine()` (BONUS) | `user.validator.js` → `passwordSchema` |
| Zod `discriminatedUnion` (BONUS) | `user.validator.js` → `companySchema` |
| MongoDB + Mongoose | `models/` + `config/db.js` |
| `populate` | `getUser`, `updatePersonalData` |
| Virtual `fullName` | `user.model.js` |
| Indexes | `user.model.js` (email, status, company, role) |
| AppError con factoría | `utils/AppError.js` |
| Middleware centralizado | `middleware/errorHandler.middleware.js` |
| Helmet | `app.js` |
| Rate limiting | `app.js` |
| Sanitización NoSQL | `app.js` |
| JWT access + refresh | `user.controller.js` → `generateTokens` |
| bcrypt | `register`, `login`, `changePassword` |
| Roles | `middleware/role.middleware.js` |
| Soft delete | `deleteUser` con `?soft=true` |
| Multer | `middleware/upload.middleware.js` |
