// Script rápido de smoke test para probar todos los endpoints
// Ejecutar con: node tests/smoke/test-api.js

const BASE = 'http://localhost:3000/api/user';
let accessToken = '';
let refreshToken = '';
let verificationCode = '';

const test = async (name, method, path, body = null, token = null) => {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${BASE}${path}`, opts);
    const data = await res.json();
    const status = res.status;
    const ok = status >= 200 && status < 300;
    console.log(`${ok ? '✅' : '❌'} [${status}] ${name}`);
    if (!ok) console.log('   ', JSON.stringify(data));
    return { status, data, ok };
  } catch (err) {
    console.log(`❌ ${name} — ${err.message}`);
    return { status: 0, data: null, ok: false };
  }
};

const run = async () => {
  console.log('\n🔧 Testeando API de BildyApp...\n');

  // 1. Register
  const reg = await test('POST /register', 'POST', '/register', {
    email: `test${Date.now()}@bildyapp.com`,
    password: 'Test1234!'
  });
  if (reg.ok) {
    accessToken = reg.data.accessToken;
    refreshToken = reg.data.refreshToken;
    console.log('    → Tokens obtenidos');
  }

  // 2. Register duplicado (debe dar 409 solo si está verificado, si no, crea otro)
  await test('POST /register duplicado', 'POST', '/register', {
    email: `test${Date.now()}@bildyapp.com`,
    password: 'Test1234!'
  });

  // 3. Login (con el usuario recién creado)
  const loginRes = await test('POST /login', 'POST', '/login', {
    email: reg.data?.user?.email,
    password: 'Test1234!'
  });
  if (loginRes.ok) {
    accessToken = loginRes.data.accessToken;
    refreshToken = loginRes.data.refreshToken;
  }

  // 4. Login con credenciales incorrectas (debe dar 401)
  await test('POST /login incorrecto', 'POST', '/login', {
    email: 'noexiste@test.com',
    password: 'wrongpass'
  });

  // 5. Get user (requiere token)
  await test('GET /user', 'GET', '/', null, accessToken);

  // 6. Get user sin token (debe dar 401)
  await test('GET /user sin token (debe 401)', 'GET', '/');

  // 7. Validate email (código incorrecto — debe dar 400)
  await test('PUT /validation código incorrecto', 'PUT', '/validation', {
    code: '000000'
  }, accessToken);

  // 8. Update personal data
  await test('PUT /register (datos personales)', 'PUT', '/register', {
    name: 'Test',
    lastName: 'User',
    nif: '12345678A'
  }, accessToken);

  // 9. Update company (freelance)
  await test('PATCH /company (freelance)', 'PATCH', '/company', {
    isFreelance: true
  }, accessToken);

  // 10. Update company (empresa)
  const regEmpresa = await test('POST /register (usuario empresa)', 'POST', '/register', {
    email: `empresa${Date.now()}@bildyapp.com`,
    password: 'Test1234!'
  });
  if (regEmpresa.ok) {
    const empresaToken = regEmpresa.data.accessToken;
    await test('PUT /register datos empresa', 'PUT', '/register', {
      name: 'Empresa',
      lastName: 'Test',
      nif: '87654321B'
    }, empresaToken);
    await test('PATCH /company (empresa)', 'PATCH', '/company', {
      isFreelance: false,
      name: 'Mi Empresa SL',
      cif: 'B12345678'
    }, empresaToken);
  }

  // 11. Refresh token
  await test('POST /refresh', 'POST', '/refresh', {
    refreshToken
  });

  // 12. Change password
  await test('PUT /password', 'PUT', '/password', {
    currentPassword: 'Test1234!',
    newPassword: 'NuevaPass1234!'
  }, accessToken);

  // 13. Change password con contraseña incorrecta (debe dar 401)
  await test('PUT /password incorrecta (debe 401)', 'PUT', '/password', {
    currentPassword: 'wrongpass',
    newPassword: 'OtraPass1234!'
  }, accessToken);

  // 14. Invite (requiere role admin)
  await test('POST /invite', 'POST', '/invite', {
    email: `invited${Date.now()}@bildyapp.com`,
    name: 'Invitado',
    lastName: 'Test',
    nif: '11111111C'
  }, accessToken);

  // 15. Logout
  await test('POST /logout', 'POST', '/logout', null, accessToken);

  // 16. Soft delete — creamos un usuario temporal
  const tempUser = await test('POST /register (para delete)', 'POST', '/register', {
    email: `delete${Date.now()}@bildyapp.com`,
    password: 'Test1234!'
  });
  if (tempUser.ok) {
    await test('DELETE /user?soft=true', 'DELETE', '/?soft=true', null, tempUser.data.accessToken);
  }

  // 17. Hard delete — creamos otro usuario temporal
  const tempUser2 = await test('POST /register (para hard delete)', 'POST', '/register', {
    email: `harddelete${Date.now()}@bildyapp.com`,
    password: 'Test1234!'
  });
  if (tempUser2.ok) {
    await test('DELETE /user (hard)', 'DELETE', '/', null, tempUser2.data.accessToken);
  }

  console.log('\n🏁 Tests completados\n');
};

run();
