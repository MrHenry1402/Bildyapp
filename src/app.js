import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import dbConnect from './config/db.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.middleware.js';

const app = express();

// ─────────────────────────────────────────────────────────────────
// Seguridad
// ─────────────────────────────────────────────────────────────────

// Helmet añade cabeceras HTTP de seguridad
app.use(helmet());

// Sanitización NoSQL: evita inyección mediante operadores MongoDB ($gt, $where…)
app.use(mongoSanitize());

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

// ─────────────────────────────────────────────────────────────────
// Archivos estáticos (logos subidos)
// ─────────────────────────────────────────────────────────────────

app.use('/uploads', express.static('uploads'));

// ─────────────────────────────────────────────────────────────────
// Rutas
// ─────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
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

// ─────────────────────────────────────────────────────────────────
// Arranque del servidor
// ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await dbConnect();
    app.listen(PORT, () => {
      console.log(`Servidor en http://localhost:${PORT}`);
      console.log(`API en http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Error al iniciar:', error);
    process.exit(1);
  }
};

startServer();
