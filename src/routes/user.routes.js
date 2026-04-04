import { Router } from 'express';
import {
  register,
  validateEmail,
  login,
  updatePersonalData,
  updateCompany,
  updateLogo,
  getUser,
  refreshAccessToken,
  logout,
  deleteUser,
  changePassword,
  inviteUser
} from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { uploadLogo } from '../middleware/upload.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import {
  registerSchema,
  loginSchema,
  verificationSchema,
  personalDataSchema,
  companySchema,
  passwordSchema,
  inviteSchema,
  refreshTokenSchema
} from '../validators/user.validator.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────
// Rutas públicas (sin autenticación)
// ─────────────────────────────────────────────────────────────────
router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.post('/refresh', validateBody(refreshTokenSchema), refreshAccessToken);

// ─────────────────────────────────────────────────────────────────
// Rutas protegidas (requieren JWT)
// ─────────────────────────────────────────────────────────────────
router.use(authenticate);

router.put('/validation', validateBody(verificationSchema), validateEmail);
router.put('/register', validateBody(personalDataSchema), updatePersonalData);
router.patch('/company', validateBody(companySchema), updateCompany);
router.patch('/logo', uploadLogo, updateLogo);
router.get('/', getUser);
router.post('/logout', logout);
router.delete('/', deleteUser);

// Bonus
router.put('/password', validateBody(passwordSchema), changePassword);
router.post('/invite', requireRole('admin'), validateBody(inviteSchema), inviteUser);

export default router;
