import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
import { User } from '../models/user.model.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(AppError.unauthorized('Token no proporcionado'));
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user || user.deleted) {
      return next(AppError.unauthorized('Usuario no encontrado o eliminado'));
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(AppError.unauthorized('Token expirado'));
    }
    next(AppError.unauthorized('Token inválido'));
  }
};
