import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'http://localhost:3000/api/user';
const timestamp = Date.now();

// Estado compartido entre tests
let accessToken = '';
let refreshToken = '';
let testEmail = `testapi${timestamp}@bildyapp.com`;

const req = async (method, path, body = null, token = null) => {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
};

// ─────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────
describe('Health check', () => {
  it('GET /health debe devolver status ok', async () => {
    const res = await fetch('http://localhost:3000/health');
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.status, 'ok');
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /register
// ─────────────────────────────────────────────────────────────────
describe('POST /register', () => {
  it('debe registrar un usuario nuevo y devolver tokens', async () => {
    const { status, data } = await req('POST', '/register', {
      email: testEmail,
      password: 'Test1234!'
    });
    assert.equal(status, 201);
    assert.ok(data.accessToken, 'Debe devolver accessToken');
    assert.ok(data.refreshToken, 'Debe devolver refreshToken');
    assert.equal(data.user.email, testEmail);
    assert.equal(data.user.status, 'pending');
    assert.equal(data.user.role, 'admin');
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
  });

  it('debe rechazar registro sin email', async () => {
    const { status } = await req('POST', '/register', { password: '12345678' });
    assert.equal(status, 400);
  });

  it('debe rechazar registro sin password', async () => {
    const { status } = await req('POST', '/register', { email: 'x@y.com' });
    assert.equal(status, 400);
  });

  it('debe rechazar password corta', async () => {
    const { status } = await req('POST', '/register', {
      email: 'short@test.com',
      password: '123'
    });
    assert.equal(status, 400);
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /login
// ─────────────────────────────────────────────────────────────────
describe('POST /login', () => {
  it('debe hacer login con credenciales correctas', async () => {
    const { status, data } = await req('POST', '/login', {
      email: testEmail,
      password: 'Test1234!'
    });
    assert.equal(status, 200);
    assert.ok(data.accessToken);
    assert.ok(data.refreshToken);
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
  });

  it('debe rechazar email inexistente (401)', async () => {
    const { status, data } = await req('POST', '/login', {
      email: 'noexiste@fake.com',
      password: 'Test1234!'
    });
    assert.equal(status, 401);
    assert.equal(data.message, 'Credenciales incorrectas');
  });

  it('debe rechazar password incorrecta (401)', async () => {
    const { status, data } = await req('POST', '/login', {
      email: testEmail,
      password: 'WrongPassword!'
    });
    assert.equal(status, 401);
    assert.equal(data.message, 'Credenciales incorrectas');
  });
});

// ─────────────────────────────────────────────────────────────────
// Rutas protegidas sin token
// ─────────────────────────────────────────────────────────────────
describe('Rutas protegidas sin token', () => {
  it('GET /user sin token debe devolver 401', async () => {
    const { status } = await req('GET', '/');
    assert.equal(status, 401);
  });

  it('PUT /validation sin token debe devolver 401', async () => {
    const { status } = await req('PUT', '/validation', { code: '123456' });
    assert.equal(status, 401);
  });

  it('POST /logout sin token debe devolver 401', async () => {
    const { status } = await req('POST', '/logout');
    assert.equal(status, 401);
  });
});

// ─────────────────────────────────────────────────────────────────
// PUT /validation
// ─────────────────────────────────────────────────────────────────
describe('PUT /validation', () => {
  it('debe rechazar código incorrecto', async () => {
    const { status, data } = await req('PUT', '/validation', { code: '000000' }, accessToken);
    assert.equal(status, 400);
    assert.ok(data.message.includes('incorrecto') || data.message.includes('Código'));
  });

  it('debe rechazar código con formato inválido', async () => {
    const { status } = await req('PUT', '/validation', { code: 'abc' }, accessToken);
    assert.equal(status, 400);
  });
});

// ─────────────────────────────────────────────────────────────────
// GET /user
// ─────────────────────────────────────────────────────────────────
describe('GET /user', () => {
  it('debe devolver datos del usuario autenticado', async () => {
    const { status, data } = await req('GET', '/', null, accessToken);
    assert.equal(status, 200);
    assert.ok(data.user);
    assert.equal(data.user.email, testEmail);
  });
});

// ─────────────────────────────────────────────────────────────────
// PUT /register (datos personales)
// ─────────────────────────────────────────────────────────────────
describe('PUT /register (datos personales)', () => {
  it('debe actualizar nombre, apellidos y NIF', async () => {
    const { status, data } = await req('PUT', '/register', {
      name: 'Test',
      lastName: 'User',
      nif: '12345678A'
    }, accessToken);
    assert.equal(status, 200);
    assert.ok(data.user);
  });

  it('debe rechazar sin nombre', async () => {
    const { status } = await req('PUT', '/register', {
      lastName: 'User',
      nif: '12345678A'
    }, accessToken);
    assert.equal(status, 400);
  });

  it('debe rechazar sin NIF', async () => {
    const { status } = await req('PUT', '/register', {
      name: 'Test',
      lastName: 'User'
    }, accessToken);
    assert.equal(status, 400);
  });
});

// ─────────────────────────────────────────────────────────────────
// PATCH /company
// ─────────────────────────────────────────────────────────────────
describe('PATCH /company', () => {
  it('debe crear compañía como freelance', async () => {
    const { status, data } = await req('PATCH', '/company', {
      isFreelance: true
    }, accessToken);
    assert.equal(status, 200);
    assert.ok(data.company);
  });

  it('debe crear compañía como empresa (nuevo usuario)', async () => {
    // Registrar un nuevo usuario para esta prueba
    const email = `empresa${timestamp}@bildyapp.com`;
    const reg = await req('POST', '/register', { email, password: 'Test1234!' });
    assert.equal(reg.status, 201);
    const token = reg.data.accessToken;

    // Completar datos personales primero
    await req('PUT', '/register', {
      name: 'Empresa',
      lastName: 'Test',
      nif: '87654321B'
    }, token);

    // Crear compañía
    const { status, data } = await req('PATCH', '/company', {
      isFreelance: false,
      name: 'Mi Empresa SL',
      cif: `CIF${timestamp}`
    }, token);
    assert.equal(status, 200);
    assert.ok(data.company);
    assert.equal(data.company.name, 'Mi Empresa SL');
  });

  it('debe rechazar sin isFreelance', async () => {
    const { status } = await req('PATCH', '/company', {
      name: 'Empresa'
    }, accessToken);
    assert.equal(status, 400);
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /refresh
// ─────────────────────────────────────────────────────────────────
describe('POST /refresh', () => {
  it('debe rotar el refresh token y devolver tokens nuevos', async () => {
    const { status, data } = await req('POST', '/refresh', { refreshToken });
    assert.equal(status, 200);
    assert.ok(data.accessToken);
    assert.ok(data.refreshToken);
    // Actualizar tokens para los siguientes tests
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
  });

  it('debe rechazar refresh token inválido', async () => {
    const { status } = await req('POST', '/refresh', { refreshToken: 'token_falso' });
    assert.equal(status, 401);
  });

  it('debe rechazar refresh token ya usado (rotación)', async () => {
    // Usar el token actual
    const first = await req('POST', '/refresh', { refreshToken });
    assert.equal(first.status, 200);
    accessToken = first.data.accessToken;

    // Intentar reusar el mismo token (ya eliminado)
    const second = await req('POST', '/refresh', { refreshToken });
    assert.equal(second.status, 401);

    refreshToken = first.data.refreshToken;
  });
});

// ─────────────────────────────────────────────────────────────────
// PUT /password
// ─────────────────────────────────────────────────────────────────
describe('PUT /password', () => {
  it('debe cambiar la contraseña correctamente', async () => {
    const { status, data } = await req('PUT', '/password', {
      currentPassword: 'Test1234!',
      newPassword: 'NuevaPass1234!'
    }, accessToken);
    assert.equal(status, 200);
    assert.ok(data.message.includes('actualizada'));
  });

  it('debe rechazar si contraseña actual es incorrecta', async () => {
    const { status } = await req('PUT', '/password', {
      currentPassword: 'IncorrectaXYZ',
      newPassword: 'OtraPass1234!'
    }, accessToken);
    assert.equal(status, 401);
  });

  it('debe rechazar si nueva = actual', async () => {
    const { status } = await req('PUT', '/password', {
      currentPassword: 'NuevaPass1234!',
      newPassword: 'NuevaPass1234!'
    }, accessToken);
    assert.equal(status, 400);
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /invite
// ─────────────────────────────────────────────────────────────────
describe('POST /invite', () => {
  it('debe invitar a un usuario nuevo', async () => {
    const { status, data } = await req('POST', '/invite', {
      email: `invited${timestamp}@bildyapp.com`,
      name: 'Invitado',
      lastName: 'Test',
      nif: '99999999Z'
    }, accessToken);
    assert.equal(status, 201);
    assert.ok(data.user);
    assert.equal(data.user.role, 'guest');
  });

  it('debe rechazar sin email', async () => {
    const { status } = await req('POST', '/invite', {
      name: 'Invitado'
    }, accessToken);
    assert.equal(status, 400);
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /logout
// ─────────────────────────────────────────────────────────────────
describe('POST /logout', () => {
  it('debe cerrar sesión correctamente', async () => {
    const { status, data } = await req('POST', '/logout', null, accessToken);
    assert.equal(status, 200);
    assert.ok(data.message.includes('cerrada'));
  });
});

// ─────────────────────────────────────────────────────────────────
// DELETE /user
// ─────────────────────────────────────────────────────────────────
describe('DELETE /user', () => {
  it('debe hacer soft delete', async () => {
    // Crear usuario temporal
    const email = `softdel${timestamp}@bildyapp.com`;
    const reg = await req('POST', '/register', { email, password: 'Test1234!' });
    assert.equal(reg.status, 201);

    const { status, data } = await req('DELETE', '/?soft=true', null, reg.data.accessToken);
    assert.equal(status, 200);
    assert.ok(data.message.includes('desactivado'));
  });

  it('debe hacer hard delete', async () => {
    // Crear usuario temporal
    const email = `harddel${timestamp}@bildyapp.com`;
    const reg = await req('POST', '/register', { email, password: 'Test1234!' });
    assert.equal(reg.status, 201);

    const { status, data } = await req('DELETE', '/', null, reg.data.accessToken);
    assert.equal(status, 200);
    assert.ok(data.message.includes('eliminado'));
  });
});
