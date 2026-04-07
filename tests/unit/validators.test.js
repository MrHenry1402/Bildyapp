import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerSchema,
  loginSchema,
  verificationSchema,
  personalDataSchema,
  companySchema,
  passwordSchema,
  inviteSchema,
  refreshTokenSchema
} from '../../src/validators/user.validator.js';

describe('registerSchema', () => {
  it('debe validar email y password correctos', () => {
    const result = registerSchema.safeParse({ email: 'Test@Email.COM', password: '12345678' });
    assert.ok(result.success);
    assert.equal(result.data.email, 'test@email.com'); // transform a lowercase
  });

  it('debe rechazar email inválido', () => {
    const result = registerSchema.safeParse({ email: 'no-email', password: '12345678' });
    assert.ok(!result.success);
  });

  it('debe rechazar password corta (< 8 chars)', () => {
    const result = registerSchema.safeParse({ email: 'a@b.com', password: '1234' });
    assert.ok(!result.success);
  });

  it('debe rechazar sin email', () => {
    const result = registerSchema.safeParse({ password: '12345678' });
    assert.ok(!result.success);
  });

  it('debe rechazar sin password', () => {
    const result = registerSchema.safeParse({ email: 'a@b.com' });
    assert.ok(!result.success);
  });
});

describe('loginSchema', () => {
  it('debe validar email y password correctos', () => {
    const result = loginSchema.safeParse({ email: 'User@Test.com', password: 'x' });
    assert.ok(result.success);
    assert.equal(result.data.email, 'user@test.com');
  });

  it('debe rechazar password vacío', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: '' });
    assert.ok(!result.success);
  });
});

describe('verificationSchema', () => {
  it('debe aceptar código de 6 dígitos', () => {
    const result = verificationSchema.safeParse({ code: '123456' });
    assert.ok(result.success);
  });

  it('debe rechazar código de 5 dígitos', () => {
    const result = verificationSchema.safeParse({ code: '12345' });
    assert.ok(!result.success);
  });

  it('debe rechazar código con letras', () => {
    const result = verificationSchema.safeParse({ code: '12345a' });
    assert.ok(!result.success);
  });

  it('debe rechazar código de 7 dígitos', () => {
    const result = verificationSchema.safeParse({ code: '1234567' });
    assert.ok(!result.success);
  });
});

describe('personalDataSchema', () => {
  it('debe aceptar datos completos', () => {
    const result = personalDataSchema.safeParse({
      name: 'Juan',
      lastName: 'García',
      nif: '12345678A'
    });
    assert.ok(result.success);
  });

  it('debe aceptar datos con dirección', () => {
    const result = personalDataSchema.safeParse({
      name: 'Juan',
      lastName: 'García',
      nif: '12345678A',
      address: { street: 'Calle Mayor', number: '5', city: 'Madrid' }
    });
    assert.ok(result.success);
  });

  it('debe rechazar sin nombre', () => {
    const result = personalDataSchema.safeParse({ lastName: 'García', nif: '12345678A' });
    assert.ok(!result.success);
  });

  it('debe rechazar sin apellidos', () => {
    const result = personalDataSchema.safeParse({ name: 'Juan', nif: '12345678A' });
    assert.ok(!result.success);
  });

  it('debe rechazar sin NIF', () => {
    const result = personalDataSchema.safeParse({ name: 'Juan', lastName: 'García' });
    assert.ok(!result.success);
  });
});

describe('companySchema (discriminatedUnion)', () => {
  it('debe aceptar isFreelance: true sin más campos', () => {
    const result = companySchema.safeParse({ isFreelance: true });
    assert.ok(result.success);
  });

  it('debe aceptar isFreelance: false con name y cif', () => {
    const result = companySchema.safeParse({
      isFreelance: false,
      name: 'Mi Empresa SL',
      cif: 'B12345678'
    });
    assert.ok(result.success);
  });

  it('debe rechazar isFreelance: false sin name', () => {
    const result = companySchema.safeParse({
      isFreelance: false,
      cif: 'B12345678'
    });
    assert.ok(!result.success);
  });

  it('debe rechazar isFreelance: false sin cif', () => {
    const result = companySchema.safeParse({
      isFreelance: false,
      name: 'Mi Empresa SL'
    });
    assert.ok(!result.success);
  });

  it('debe rechazar sin campo isFreelance', () => {
    const result = companySchema.safeParse({ name: 'Empresa' });
    assert.ok(!result.success);
  });
});

describe('passwordSchema (refine)', () => {
  it('debe aceptar contraseñas diferentes', () => {
    const result = passwordSchema.safeParse({
      currentPassword: 'OldPass123',
      newPassword: 'NewPass123'
    });
    assert.ok(result.success);
  });

  it('debe rechazar si nueva = actual', () => {
    const result = passwordSchema.safeParse({
      currentPassword: 'SamePass123',
      newPassword: 'SamePass123'
    });
    assert.ok(!result.success);
    const issue = result.error.issues.find(i => i.path.includes('newPassword'));
    assert.ok(issue, 'El error debe apuntar al campo newPassword');
  });

  it('debe rechazar nueva contraseña corta (< 8 chars)', () => {
    const result = passwordSchema.safeParse({
      currentPassword: 'OldPass123',
      newPassword: 'short'
    });
    assert.ok(!result.success);
  });
});

describe('inviteSchema', () => {
  it('debe aceptar invitación válida', () => {
    const result = inviteSchema.safeParse({
      email: 'Invitado@Test.COM',
      name: 'Pedro'
    });
    assert.ok(result.success);
    assert.equal(result.data.email, 'invitado@test.com');
    assert.equal(result.data.lastName, ''); // default
  });

  it('debe rechazar sin email', () => {
    const result = inviteSchema.safeParse({ name: 'Pedro' });
    assert.ok(!result.success);
  });

  it('debe rechazar sin name', () => {
    const result = inviteSchema.safeParse({ email: 'a@b.com' });
    assert.ok(!result.success);
  });
});

describe('refreshTokenSchema', () => {
  it('debe aceptar refreshToken válido', () => {
    const result = refreshTokenSchema.safeParse({ refreshToken: 'abc123token' });
    assert.ok(result.success);
  });

  it('debe rechazar refreshToken vacío', () => {
    const result = refreshTokenSchema.safeParse({ refreshToken: '' });
    assert.ok(!result.success);
  });

  it('debe rechazar sin refreshToken', () => {
    const result = refreshTokenSchema.safeParse({});
    assert.ok(!result.success);
  });
});
