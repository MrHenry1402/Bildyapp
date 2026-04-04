import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';

export const notFound = (req, res, next) => {
  next(AppError.notFound(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (err, req, res, next) => {
  console.error('[ERROR]', err.message);

  // Error operacional propio (AppError)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: true,
      message: err.message
    });
  }

  // Error de validación de Mongoose
  if (err instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      error: true,
      message: 'Error de validación',
      details: messages
    });
  }

  // ID inválido de Mongoose
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      error: true,
      message: `Valor inválido para '${err.path}'`
    });
  }

  // Duplicado en MongoDB (ej. email único)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'campo';
    return res.status(409).json({
      error: true,
      message: `Ya existe un registro con ese '${field}'`
    });
  }

  // Multer: archivo demasiado grande
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: true,
      message: 'El archivo excede el tamaño máximo (5MB)'
    });
  }

  // Zod
  if (err.name === 'ZodError') {
    const errors = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }));
    return res.status(400).json({
      error: true,
      message: 'Error de validación',
      details: errors
    });
  }

  // Error genérico
  res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Error interno del servidor'
  });
};
