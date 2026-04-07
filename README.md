# BildyApp API

API REST para la gestión de usuarios de BildyApp — plataforma de albaranes de obra. Esta práctica intermedia implementa el módulo completo de gestión de usuarios: registro, autenticación con JWT (access + refresh tokens), verificación de email, onboarding de datos personales y compañía, subida de logo con Multer, sistema de roles (admin/guest), invitación de compañeros, cambio de contraseña y eliminación de cuenta (soft/hard delete). Construido con Node.js 22+, Express 5, MongoDB Atlas, Mongoose, Zod y bcrypt.

Para una explicación detallada paso a paso de cada decisión técnica, arquitectura, flujos y funciones, consulta el fichero [IMPLEMENTACION.md](IMPLEMENTACION.md).

## Requisitos

- Node.js 22+
- Cuenta en [MongoDB Atlas](https://cloud.mongodb.com/)

## Instalación

```bash
npm install
```

## Configuración

Copia el fichero de ejemplo y rellena los valores reales:

```bash
cp .env.example .env
```

Variables necesarias en `.env`:

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto del servidor (por defecto `3000`) |
| `PUBLIC_URL` | URL base para construir URLs de logos (p. ej. `http://localhost:3000`) |
| `DB_URI` | Cadena de conexión de MongoDB Atlas |
| `JWT_SECRET` | Secreto para firmar los access tokens (mínimo 64 caracteres) |
| `JWT_REFRESH_SECRET` | Secreto para firmar los refresh tokens (diferente al anterior) |

Para generar secretos seguros:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Ejecución

```bash
# Desarrollo (recarga automática)
npm run dev

# Producción
npm start
```

El servidor arranca en `http://localhost:3000` por defecto.

## Endpoints

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `POST` | `/api/user/register` | Registro de usuario | No |
| `PUT` | `/api/user/validation` | Validación del email | JWT |
| `POST` | `/api/user/login` | Login | No |
| `PUT` | `/api/user/register` | Onboarding: datos personales | JWT |
| `PATCH` | `/api/user/company` | Onboarding: datos de compañía | JWT |
| `PATCH` | `/api/user/logo` | Subir logo de compañía | JWT |
| `GET` | `/api/user` | Obtener usuario autenticado | JWT |
| `POST` | `/api/user/refresh` | Renovar access token | No |
| `POST` | `/api/user/logout` | Cerrar sesión | JWT |
| `DELETE` | `/api/user` | Eliminar usuario (`?soft=true`) | JWT |
| `PUT` | `/api/user/password` | Cambiar contraseña | JWT |
| `POST` | `/api/user/invite` | Invitar compañero (solo admin) | JWT |
| `GET` | `/health` | Health check | No |

## Pruebas

Importa el fichero `test/index.http` en VS Code con la extensión [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) o en cualquier cliente HTTP compatible.

Flujo recomendado:

1. `POST /api/user/register` → guarda el `accessToken`
2. Consulta el `verificationCode` en MongoDB
3. `PUT /api/user/validation` con el código
4. `PUT /api/user/register` → datos personales
5. `PATCH /api/user/company` → datos de compañía
6. `PATCH /api/user/logo` → subir logo (multipart)
7. `GET /api/user` → verificar populate y virtual `fullName`

## Arquitectura

```
src/
├── config/         # Conexión a MongoDB
├── controllers/    # Lógica de negocio
├── middleware/     # Auth, roles, validación, errores, Multer
├── models/         # Schemas Mongoose (User, Company, RefreshToken)
├── routes/         # Definición de rutas Express
├── services/       # EventEmitter para eventos del ciclo de vida del usuario
├── utils/          # AppError (errores operacionales)
├── validators/     # Esquemas Zod
├── app.js          # Configuración de Express
└── index.js        # Punto de entrada
```
