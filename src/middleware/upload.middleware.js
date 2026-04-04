import multer from 'multer';
import path from 'path';
import { AppError } from '../utils/AppError.js';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `logo-${req.user._id}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(AppError.badRequest('Solo se permiten imágenes (jpeg, png, webp, gif)'), false);
  }
};

export const uploadLogo = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB máximo
  fileFilter
}).single('logo');
