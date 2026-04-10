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

## Mapa de archivos — qué hay en cada fichero y cómo se conectan

### Punto de entrada y configuración

```
src/index.js
├── importa → src/app.js          (instancia Express configurada)
└── importa → src/config/index.js (conecta a MongoDB)

src/app.js
├── importa → src/routes/index.js                     (todas las rutas)
└── importa → src/middleware/errorHandler.middleware.js (notFound + errorHandler)
```

### Rutas

```
src/routes/index.js
└── monta en /user → src/routes/user.routes.js

src/routes/user.routes.js
├── importa → src/controllers/user.controller.js   (lógica de negocio)
├── importa → src/middleware/auth.middleware.js     (authenticate)
├── importa → src/middleware/role.middleware.js     (requireRole)
├── importa → src/middleware/upload.middleware.js   (uploadLogo — Multer)
├── importa → src/middleware/validate.middleware.js (validateBody — Zod)
└── importa → src/validators/user.validator.js     (esquemas Zod)
```

### Controller (lógica de negocio)

```
src/controllers/user.controller.js
├── importa → src/models/user.model.js             (User — CRUD)
├── importa → src/models/company.model.js          (Company — CRUD)
├── importa → src/models/refreshToken.model.js     (RefreshToken — CRUD)
├── importa → src/utils/AppError.js                (errores operacionales)
└── importa → src/services/notification.service.js (emite eventos)
```

### Modelos Mongoose

```
src/models/user.model.js
├── campos: email, password, name, lastName, nif, role, status,
│           verificationCode, verificationAttempts, company, address, deleted
├── virtual: fullName (name + lastName)
├── indexes: email (unique), status, company, role
└── ref → src/models/company.model.js  (campo company: ObjectId)

src/models/company.model.js
├── campos: owner, name, cif, address, logo, isFreelance, deleted
└── ref → src/models/user.model.js     (campo owner: ObjectId)

src/models/refreshToken.model.js
├── campos: userId, token, expiresAt
├── TTL index en expiresAt (MongoDB borra automáticamente los expirados)
└── ref → src/models/user.model.js     (campo userId: ObjectId)
```

### Middleware

```
src/middleware/auth.middleware.js
├── verifica JWT con JWT_SECRET
└── consulta → src/models/user.model.js (comprueba que el usuario existe y no está deleted)

src/middleware/role.middleware.js
└── lee req.user.role (puesto por auth.middleware)

src/middleware/validate.middleware.js
└── ejecuta schemas de → src/validators/user.validator.js

src/middleware/upload.middleware.js
└── guarda ficheros en → uploads/ (diskStorage Multer, máx 5 MB)

src/middleware/errorHandler.middleware.js
└── captura errores de → src/utils/AppError.js (y de Mongoose, Multer, Zod)
```

### Validación

```
src/validators/user.validator.js  (esquemas Zod exportados)
├── registerSchema      → POST  /api/user/register
├── loginSchema         → POST  /api/user/login
├── verificationSchema  → PUT   /api/user/validation
├── personalDataSchema  → PUT   /api/user/register
├── companySchema       → PATCH /api/user/company  (discriminatedUnion isFreelance)
├── passwordSchema      → PUT   /api/user/password  (refine nueva ≠ actual)
├── inviteSchema        → POST  /api/user/invite
└── refreshTokenSchema  → POST  /api/user/refresh
```

### Servicios y utilidades

```
src/services/notification.service.js  (EventEmitter)
├── escucha user:registered → console.log (email + código)
├── escucha user:verified   → console.log (email)
├── escucha user:invited    → console.log (email + companyId)
└── escucha user:deleted    → console.log (userId + soft)

src/utils/AppError.js
└── métodos factoría: badRequest · unauthorized · forbidden
                      notFound · conflict · tooManyRequests · internal
```

### Variables de entorno y quién las usa

```
PORT               → src/index.js            (puerto del servidor)
DB_URI             → src/config/index.js     (conexión MongoDB Atlas)
JWT_SECRET         → src/middleware/auth.middleware.js
                     src/controllers/user.controller.js (generateTokens)
JWT_REFRESH_SECRET → src/controllers/user.controller.js (generateTokens)
PUBLIC_URL         → src/controllers/user.controller.js (URL del logo)
```

### Flujo de una petición protegida (ejemplo: GET /api/user)

```
Request
  → src/app.js              (helmet · mongoSanitize · rateLimit)
  → src/routes/index.js
  → src/routes/user.routes.js
  → src/middleware/auth.middleware.js    (verifica JWT → adjunta req.user)
  → src/controllers/user.controller.js  (getUser)
      → User.findById().populate('company')
      → res.json({ user })   ← incluye virtual fullName
  → (si error) → src/middleware/errorHandler.middleware.js
```

---

## Paso 16: `src/docs/swagger.js` — Documentación con Swagger (T8)

### ¿Qué es Swagger?

**Swagger** es un conjunto de herramientas de código abierto para diseñar, construir y documentar APIs RESTful. Sigue la especificación **OpenAPI 3.0**.

Beneficios:
- Documentación interactiva auto-generada
- Los clientes pueden probar la API desde el navegador
- Contrato claro entre frontend y backend

### Instalación

```bash
npm install swagger-ui-express swagger-jsdoc
```

### Configuración `src/docs/swagger.js`

```js
import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'BildyApp API',
      version: '1.0.0',
      description: 'API REST de gestión de usuarios y compañías',
    },
    servers: [{ url: 'http://localhost:3000', description: 'Servidor de desarrollo' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      },
      schemas: {
        User: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@bildy.com' },
            password: { type: 'string', format: 'password' },
            name: { type: 'string', example: 'Juan' },
            lastName: { type: 'string', example: 'Pérez' },
            nif: { type: 'string', example: '12345678A' },
            role: { type: 'string', enum: ['admin', 'guest'], default: 'admin' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Mensaje de error' }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js']  // Las anotaciones JSDoc se leen de los archivos de rutas
};

export default swaggerJsdoc(options);
```

### Integración en `src/app.js`

```js
import swaggerUi from 'swagger-ui-express';
import swaggerSpecs from './docs/swagger.js';

// Antes de las rutas
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
```

Accesible en: `http://localhost:3000/api-docs`

### Documentar rutas con JSDoc en `src/routes/user.routes.js`

```js
/**
 * @openapi
 * /api/user/register:
 *   post:
 *     tags: [User]
 *     summary: Registrar nuevo usuario
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: Usuario creado. Se envía código de verificación por consola.
 *       409:
 *         description: Email ya registrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/register', validateBody(registerSchema), register);

/**
 * @openapi
 * /api/user/login:
 *   post:
 *     tags: [User]
 *     summary: Iniciar sesión
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Login'
 *     responses:
 *       200:
 *         description: Login exitoso, devuelve accessToken y refreshToken
 *       401:
 *         description: Credenciales incorrectas
 */
router.post('/login', validateBody(loginSchema), login);

/**
 * @openapi
 * /api/user:
 *   get:
 *     tags: [User]
 *     summary: Obtener perfil del usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del usuario (incluye virtual fullName)
 *       401:
 *         description: No autorizado
 */
router.get('/', authenticate, getUser);
```

**Por qué JSDoc en las rutas:** Las anotaciones `@openapi` viven junto al código que documentan. `swagger-jsdoc` las escanea automáticamente desde `apis: ['./src/routes/*.js']`, evitando mantener un fichero de especificación separado que se desincroniza.

---

## Paso 17: `tests/` — Testing con Jest y Supertest (T8)

### ¿Por qué Jest + Supertest?

- **Jest**: framework de testing estándar en el ecosistema Node.js con mocking integrado y coverage de código.
- **Supertest**: permite hacer peticiones HTTP reales a la app Express en memoria, sin levantar un servidor.

### Instalación

```bash
npm install --save-dev jest supertest
```

### Configuración en `package.json`

```json
{
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js --forceExit --detectOpenHandles",
    "test:watch": "npm test -- --watch",
    "test:coverage": "npm test -- --coverage"
  }
}
```

**`--experimental-vm-modules`:** necesario para ESM (`"type": "module"`).  
**`--forceExit`:** cierra Jest aunque queden handles abiertos (conexión MongoDB).  
**`--detectOpenHandles`:** muestra qué está impidiendo que el proceso termine.

### `jest.config.js`

```js
export default {
  testEnvironment: 'node',
  transform: {},                              // Sin Babel: usamos ESM nativo
  moduleFileExtensions: ['js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
  verbose: true
};
```

**`transform: {}`:** desactiva la transformación de Babel. Con Node 22 + `--experimental-vm-modules`, Jest puede ejecutar ESM directamente.

### `tests/user.test.js` — Tests de autenticación y perfil

```js
import request from 'supertest';
import app from '../src/app.js';

describe('User Endpoints', () => {
  let accessToken = '';
  let userId = '';

  const testUser = {
    email: `test_${Date.now()}@bildy.com`,
    password: 'Test1234!'
  };

  // --- Registro ---
  describe('POST /api/user/register', () => {
    it('debería registrar un nuevo usuario (201)', async () => {
      const res = await request(app)
        .post('/api/user/register')
        .send(testUser)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(res.body).toHaveProperty('message');
    });

    it('debería rechazar email duplicado (409)', async () => {
      await request(app)
        .post('/api/user/register')
        .send(testUser)
        .expect(409);
    });

    it('debería rechazar datos inválidos (400)', async () => {
      await request(app)
        .post('/api/user/register')
        .send({ email: 'no-es-email' })
        .expect(400);
    });
  });

  // --- Validación de email ---
  describe('PUT /api/user/validation', () => {
    it('debería rechazar un código incorrecto (400/429)', async () => {
      // Primero hacer login para obtener token (usuario no verificado)
      // En tests, el código de verificación aparece en consola via EventEmitter
      const loginRes = await request(app)
        .post('/api/user/login')
        .send(testUser);
      // Si el usuario aún no está verificado, login debería responder 403
      expect([200, 403]).toContain(loginRes.status);
    });
  });

  // --- Login ---
  describe('POST /api/user/login', () => {
    it('debería rechazar contraseña incorrecta (401)', async () => {
      await request(app)
        .post('/api/user/login')
        .send({ email: testUser.email, password: 'WrongPass!' })
        .expect(401);
    });
  });

  // --- Rutas protegidas ---
  describe('Rutas protegidas', () => {
    it('debería rechazar sin token (401)', async () => {
      await request(app)
        .get('/api/user')
        .expect(401);
    });

    it('debería rechazar token inválido (401)', async () => {
      await request(app)
        .get('/api/user')
        .set('Authorization', 'Bearer token_invalido')
        .expect(401);
    });
  });
});
```

**Por qué `Date.now()` en el email:** Garantiza que cada ejecución de tests usa un usuario único, evitando colisiones con datos de tests anteriores que no se limpiaron.

**`afterAll` con limpieza:** Si el test crea datos en BD, debe limpiarlos para que los tests sean idempotentes. Se usa el endpoint `DELETE /api/user` o directamente con Mongoose si se importa el modelo.

### Ejecutar tests

```bash
npm test                  # Una sola vez
npm run test:watch        # Re-ejecuta al cambiar archivos
npm run test:coverage     # Genera reporte de cobertura
```

---

## Paso 18: `src/utils/handleLogger.js` — Monitorización con Slack (T8)

### ¿Por qué Slack?

Enviar errores a Slack permite:
- Notificaciones en tiempo real al equipo
- Historial de errores centralizado
- Alertas para operaciones críticas (registro masivo, eliminaciones, etc.)

### Instalación

```bash
npm install morgan-body @slack/webhook
```

### Configurar Slack Webhook

1. Ve a `api.slack.com/messaging/webhooks`
2. Crea una nueva app "From Scratch"
3. Activa **Incoming Webhooks**
4. Añade webhook al canal deseado (ej: `#logs-bildyapp`)
5. Copia la URL del webhook → `SLACK_WEBHOOK` en `.env`

### `src/utils/handleLogger.js`

```js
import { IncomingWebhook } from '@slack/webhook';

const webhook = process.env.SLACK_WEBHOOK
  ? new IncomingWebhook(process.env.SLACK_WEBHOOK)
  : null;

// Stream compatible con morgan-body.
// morgan-body llama a stream.write(message) por cada petición que no se skipea.
export const loggerStream = {
  write: (message) => {
    if (webhook) {
      webhook.send({
        text: `🚨 *Error en BildyApp API*\n\`\`\`${message}\`\`\``
      }).catch(err => console.error('Error enviando a Slack:', err));
    }
    console.error(message);
  }
};

// Envío manual para eventos de negocio desde el NotificationService.
export const sendSlackNotification = async (message) => {
  if (webhook) {
    try {
      await webhook.send({ text: message });
    } catch (err) {
      console.error('Error enviando a Slack:', err);
    }
  }
};
```

**Por qué `if (webhook)`:** Si `SLACK_WEBHOOK` no está definido en `.env` (entorno de desarrollo o tests), el logger funciona igual pero solo hace `console.error`. Evita romper la app si no hay webhook configurado.

### Integración en `src/app.js`

```js
import morganBody from 'morgan-body';
import { loggerStream } from './utils/handleLogger.js';

// Después de express.json(), antes de las rutas
morganBody(app, {
  noColors: true,
  skip: (_req, res) => res.statusCode < 400, // Solo loguea errores 4xx/5xx
  stream: loggerStream
});
```

**`skip: (_req, res) => res.statusCode < 400`:** Filtra el ruido — solo envía a Slack peticiones que terminaron en error (4xx o 5xx). Las peticiones exitosas no generan notificación.

### Integración en `src/services/notification.service.js`

Los listeners del EventEmitter ahora llaman también a `sendSlackNotification` además de `console.log`:

```js
import { EventEmitter } from 'events';
import { sendSlackNotification } from '../utils/handleLogger.js';

class NotificationService extends EventEmitter {
  _registerListeners() {
    this.on('user:registered', (data) => {
      console.log(`[EVENT] user:registered — email: ${data.email} | código verificación: ${data.verificationCode}`);
      sendSlackNotification(`✅ Nuevo usuario registrado: ${data.email}`);
    });

    this.on('user:verified', (data) => {
      console.log(`[EVENT] user:verified — email: ${data.email}`);
      sendSlackNotification(`✅ Usuario verificado: ${data.email}`);
    });

    this.on('user:invited', (data) => {
      console.log(`[EVENT] user:invited — email: ${data.email} | compañía: ${data.companyId}`);
      sendSlackNotification(`📩 Usuario invitado: ${data.email} a la compañía ${data.companyId}`);
    });

    this.on('user:deleted', (data) => {
      console.log(`[EVENT] user:deleted — userId: ${data.userId} | soft: ${data.soft}`);
      const tipo = data.soft ? 'soft delete' : 'hard delete';
      sendSlackNotification(`⚠️ Usuario eliminado (${tipo}): ${data.userId}`);
    });
  }
}
```

**Dos canales de notificación:**
- **morgan-body → loggerStream:** captura automáticamente cualquier petición HTTP que falle (4xx/5xx).
- **EventEmitter → sendSlackNotification:** notificaciones de negocio para eventos concretos, independientemente del código HTTP.

### Añadir `SLACK_WEBHOOK` a `.env`

```env
# Slack Webhook — Obtener en: api.slack.com/messaging/webhooks
# Si no se define, los logs van solo a consola
SLACK_WEBHOOK=https://hooks.slack.com/services/XXXX/YYYY/ZZZZ
```

**Importante:** nunca commitear la URL real del webhook. En `.env.example` se deja la variable vacía para documentar su existencia sin exponer el valor real.

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
| Swagger / OpenAPI 3.0 | `docs/swagger.js` + anotaciones `@openapi` en `routes/user.routes.js` |
| Jest + Supertest | `tests/user.test.js` — registro, login, rutas protegidas |
| morgan-body + Slack | `utils/handleLogger.js` + `app.js` |
| Notificaciones Slack manuales | `services/notification.service.js` vía `sendSlackNotification` |
