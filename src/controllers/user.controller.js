import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/user.model.js';
import { Company } from '../models/company.model.js';
import { RefreshToken } from '../models/refreshToken.model.js';
import { AppError } from '../utils/AppError.js';
import { notificationService } from '../services/notification.service.js';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const generateTokens = async (userId) => {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshTokenValue = jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ userId, token: refreshTokenValue, expiresAt });

  return { accessToken, refreshToken: refreshTokenValue };
};

// ─────────────────────────────────────────────────────────────────
// POST /api/user/register
// ─────────────────────────────────────────────────────────────────
export const register = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Solo bloquear si ya existe un usuario verificado con ese email
    const existingVerified = await User.findOne({ email, status: 'verified' });
    if (existingVerified) {
      throw AppError.conflict('Ya existe un usuario registrado con ese email');
    }

    const hashed = await bcrypt.hash(password, 12);
    const verificationCode = String(Math.floor(100000 + Math.random() * 900000));

    const user = await User.create({
      email,
      password: hashed,
      verificationCode,
      verificationAttempts: 3
    });

    const { accessToken, refreshToken } = await generateTokens(user._id);

    notificationService.emit('user:registered', {
      email: user.email,
      verificationCode
    });

    res.status(201).json({
      user: { email: user.email, status: user.status, role: user.role },
      accessToken,
      refreshToken
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────
// PUT /api/user/validation
// ─────────────────────────────────────────────────────────────────
export const validateEmail = async (req, res, next) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user._id);

    if (user.status === 'verified') {
      return res.json({ message: 'El email ya estaba verificado' });
    }

    if (user.verificationAttempts <= 0) {
      throw AppError.tooManyRequests('Se agotaron los intentos de verificación');
    }

    if (user.verificationCode !== code) {
      user.verificationAttempts -= 1;
      await user.save();

      if (user.verificationAttempts <= 0) {
        throw AppError.tooManyRequests('Se agotaron los intentos de verificación');
      }

      throw AppError.badRequest(
        `Código incorrecto. Intentos restantes: ${user.verificationAttempts}`
      );
    }

    user.status = 'verified';
    user.verificationCode = undefined;
    await user.save();

    notificationService.emit('user:verified', { email: user.email });

    res.json({ message: 'Email verificado correctamente' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────
// POST /api/user/login
// ─────────────────────────────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, deleted: { $ne: true } }).select('+password');
    if (!user) throw AppError.unauthorized('Credenciales incorrectas');

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw AppError.unauthorized('Credenciales incorrectas');

    const { accessToken, refreshToken } = await generateTokens(user._id);

    res.json({
      user: { email: user.email, status: user.status, role: user.role },
      accessToken,
      refreshToken
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────
// PUT /api/user/register — Onboarding: datos personales
// ─────────────────────────────────────────────────────────────────
export const updatePersonalData = async (req, res, next) => {
  try {
    const { name, lastName, nif, address } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, lastName, nif, address },
      { new: true, runValidators: true }
    ).populate('company');

    res.json({ user });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────
// PATCH /api/user/company — Onboarding: datos de compañía
// ─────────────────────────────────────────────────────────────────
export const updateCompany = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const { isFreelance, name, cif, address } = req.body;

    let companyCif;
    let companyData;

    if (isFreelance) {
      // Autónomo: CIF = NIF propio, datos de la empresa = datos personales
      if (!user.nif) {
        throw AppError.badRequest(
          'Completa tus datos personales (NIF) antes de configurar como autónomo'
        );
      }
      companyCif = user.nif;
      companyData = {
        name: user.name || '',
        cif: user.nif,
        address: user.address,
        isFreelance: true
      };
    } else {
      companyCif = cif;
      companyData = { name, cif, address, isFreelance: false };
    }

    const existingCompany = await Company.findOne({ cif: companyCif });

    let company;
    if (existingCompany) {
      // Compañía ya existe → el usuario se une como guest
      company = existingCompany;
      user.role = 'guest';
    } else {
      // No existe → crear compañía nueva y el usuario es owner (admin)
      company = await Company.create({ ...companyData, owner: user._id });
    }

    user.company = company._id;
    await user.save();

    res.json({ company, user });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────
// PATCH /api/user/logo
// ─────────────────────────────────────────────────────────────────
export const updateLogo = async (req, res, next) => {
  try {
    if (!req.file) throw AppError.badRequest('No se ha subido ninguna imagen');
    if (!req.user.company) {
      throw AppError.badRequest('El usuario no tiene compañía asociada');
    }

    const logoUrl = `${process.env.PUBLIC_URL}/uploads/${req.file.filename}`;

    const company = await Company.findByIdAndUpdate(
      req.user.company,
      { logo: logoUrl },
      { new: true }
    );

    res.json({ logo: company.logo });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/user
// ─────────────────────────────────────────────────────────────────
export const getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('company');
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────
// POST /api/user/refresh
// ─────────────────────────────────────────────────────────────────
export const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;

    const storedToken = await RefreshToken.findOne({ token });
    if (!storedToken) throw AppError.unauthorized('Refresh token inválido');

    if (storedToken.expiresAt < new Date()) {
      await storedToken.deleteOne();
      throw AppError.unauthorized('Refresh token expirado');
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    // Rotar el refresh token (invalidar el anterior y emitir uno nuevo)
    await storedToken.deleteOne();
    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(decoded.id);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(AppError.unauthorized('Refresh token inválido o expirado'));
    }
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────
// POST /api/user/logout
// ─────────────────────────────────────────────────────────────────
export const logout = async (req, res, next) => {
  try {
    await RefreshToken.deleteMany({ userId: req.user._id });
    res.json({ message: 'Sesión cerrada correctamente' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────
// DELETE /api/user
// ─────────────────────────────────────────────────────────────────
export const deleteUser = async (req, res, next) => {
  try {
    const soft = req.query.soft === 'true';

    if (soft) {
      await User.findByIdAndUpdate(req.user._id, { deleted: true });
    } else {
      await User.findByIdAndDelete(req.user._id);
    }

    await RefreshToken.deleteMany({ userId: req.user._id });

    notificationService.emit('user:deleted', {
      userId: req.user._id,
      soft
    });

    res.json({
      message: `Usuario ${soft ? 'desactivado (soft delete)' : 'eliminado permanentemente'}`
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────
// PUT /api/user/password — BONUS
// ─────────────────────────────────────────────────────────────────
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) throw AppError.unauthorized('La contraseña actual es incorrecta');

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────
// POST /api/user/invite
// ─────────────────────────────────────────────────────────────────
export const inviteUser = async (req, res, next) => {
  try {
    const { email, name, lastName, nif } = req.body;

    if (!req.user.company) {
      throw AppError.badRequest('El usuario no pertenece a ninguna compañía');
    }

    // Contraseña temporal aleatoria (el invitado deberá cambiarla)
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 12);
    const verificationCode = String(Math.floor(100000 + Math.random() * 900000));

    const newUser = await User.create({
      email,
      password: hashed,
      name,
      lastName,
      nif,
      company: req.user.company,
      role: 'guest',
      verificationCode,
      verificationAttempts: 3
    });

    notificationService.emit('user:invited', {
      email: newUser.email,
      companyId: req.user.company
    });

    res.status(201).json({
      message: 'Usuario invitado correctamente',
      user: { email: newUser.email, role: newUser.role }
    });
  } catch (err) {
    next(err);
  }
};
