import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────
// Esquema de dirección reutilizable
// ─────────────────────────────────────────────────────────────────
const addressSchema = z.object({
  street: z.string().trim().optional(),
  number: z.string().trim().optional(),
  postal: z.string().trim().optional(),
  city: z.string().trim().optional(),
  province: z.string().trim().optional()
}).optional();

// ─────────────────────────────────────────────────────────────────
// POST /api/user/register
// ─────────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  email: z
    .string({ required_error: 'El email es requerido' })
    .email('El email no es válido')
    .transform(v => v.toLowerCase().trim()),
  password: z
    .string({ required_error: 'La contraseña es requerida' })
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
});

// ─────────────────────────────────────────────────────────────────
// POST /api/user/login
// ─────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z
    .string({ required_error: 'El email es requerido' })
    .email('El email no es válido')
    .transform(v => v.toLowerCase().trim()),
  password: z
    .string({ required_error: 'La contraseña es requerida' })
    .min(1, 'La contraseña es requerida')
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/user/validation
// ─────────────────────────────────────────────────────────────────
export const verificationSchema = z.object({
  code: z
    .string({ required_error: 'El código es requerido' })
    .length(6, 'El código debe tener exactamente 6 dígitos')
    .regex(/^\d{6}$/, 'El código debe ser numérico')
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/user/register (datos personales — onboarding)
// ─────────────────────────────────────────────────────────────────
export const personalDataSchema = z.object({
  name: z
    .string({ required_error: 'El nombre es requerido' })
    .min(1, 'El nombre no puede estar vacío')
    .trim(),
  lastName: z
    .string({ required_error: 'Los apellidos son requeridos' })
    .min(1, 'Los apellidos no pueden estar vacíos')
    .trim(),
  nif: z
    .string({ required_error: 'El NIF es requerido' })
    .min(1, 'El NIF no puede estar vacío')
    .trim(),
  address: addressSchema
});

// ─────────────────────────────────────────────────────────────────
// PATCH /api/user/company — BONUS: discriminatedUnion según isFreelance
// ─────────────────────────────────────────────────────────────────
export const companySchema = z.discriminatedUnion('isFreelance', [
  // Autónomo: los datos de empresa se rellenan con los datos personales del usuario
  z.object({
    isFreelance: z.literal(true)
  }),
  // Empresa regular: nombre y CIF obligatorios
  z.object({
    isFreelance: z.literal(false),
    name: z
      .string({ required_error: 'El nombre de la empresa es requerido' })
      .min(1, 'El nombre de la empresa no puede estar vacío')
      .trim(),
    cif: z
      .string({ required_error: 'El CIF es requerido' })
      .min(1, 'El CIF no puede estar vacío')
      .trim(),
    address: addressSchema
  })
]);

// ─────────────────────────────────────────────────────────────────
// PUT /api/user/password — BONUS: refine para validar nueva ≠ actual
// ─────────────────────────────────────────────────────────────────
export const passwordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'La contraseña actual es requerida' })
      .min(1, 'La contraseña actual es requerida'),
    newPassword: z
      .string({ required_error: 'La nueva contraseña es requerida' })
      .min(8, 'La nueva contraseña debe tener al menos 8 caracteres')
  })
  .refine(data => data.currentPassword !== data.newPassword, {
    message: 'La nueva contraseña debe ser diferente a la actual',
    path: ['newPassword']
  });

// ─────────────────────────────────────────────────────────────────
// POST /api/user/invite
// ─────────────────────────────────────────────────────────────────
export const inviteSchema = z.object({
  email: z
    .string({ required_error: 'El email es requerido' })
    .email('El email no es válido')
    .transform(v => v.toLowerCase().trim()),
  name: z
    .string({ required_error: 'El nombre es requerido' })
    .min(1, 'El nombre no puede estar vacío')
    .trim(),
  lastName: z.string().trim().optional().default(''),
  nif: z.string().trim().optional()
});

// ─────────────────────────────────────────────────────────────────
// POST /api/user/refresh
// ─────────────────────────────────────────────────────────────────
export const refreshTokenSchema = z.object({
  refreshToken: z
    .string({ required_error: 'El refresh token es requerido' })
    .min(1, 'El refresh token es requerido')
});
