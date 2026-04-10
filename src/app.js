import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import morganBody from 'morgan-body';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.middleware.js';
import { loggerStream } from './utils/handleLogger.js';

const app = express();

// ─────────────────────────────────────────────────────────────────
// Seguridad
// ─────────────────────────────────────────────────────────────────

// Helmet añade cabeceras HTTP de seguridad
app.use(helmet());

// Sanitización NoSQL: evita inyección mediante operadores MongoDB ($gt, $where…)
// En Express v5 req.query es read-only; sanitizamos body y params manualmente
app.use((req, _res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.params) mongoSanitize.sanitize(req.params);
  next();
});

// Rate limiting: máximo 100 peticiones por IP cada 15 minutos
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: true, message: 'Demasiadas peticiones. Inténtalo más tarde.' }
});
app.use('/api', limiter);

// ─────────────────────────────────────────────────────────────────
// Parseo de cuerpo
// ─────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Morgan-body: loguea peticiones con errores HTTP >= 400 y las envía a Slack
morganBody(app, {
  noColors: true,
  skip: (_req, res) => res.statusCode < 400,
  stream: loggerStream
});

// ─────────────────────────────────────────────────────────────────
// Archivos estáticos (logos subidos)
// ─────────────────────────────────────────────────────────────────

app.use('/uploads', express.static('uploads'));

// ─────────────────────────────────────────────────────────────────
// Rutas
// ─────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api', routes);

// ─────────────────────────────────────────────────────────────────
// Manejo de errores
// ─────────────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

export default app;
