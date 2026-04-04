export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message) {
    return new AppError(message, 400);
  }

  static unauthorized(message = 'No autorizado') {
    return new AppError(message, 401);
  }

  static forbidden(message = 'Acceso denegado') {
    return new AppError(message, 403);
  }

  static notFound(message = 'No encontrado') {
    return new AppError(message, 404);
  }

  static conflict(message) {
    return new AppError(message, 409);
  }

  static tooManyRequests(message = 'Demasiados intentos') {
    return new AppError(message, 429);
  }

  static internal(message = 'Error interno del servidor') {
    return new AppError(message, 500);
  }
}
