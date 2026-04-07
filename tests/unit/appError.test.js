import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../src/utils/AppError.js';

describe('AppError', () => {
  it('debe crear un error con mensaje y statusCode', () => {
    const err = new AppError('algo salió mal', 500);
    assert.equal(err.message, 'algo salió mal');
    assert.equal(err.statusCode, 500);
    assert.equal(err.isOperational, true);
  });

  it('debe marcar status como "fail" para códigos 4xx', () => {
    const err = new AppError('bad request', 400);
    assert.equal(err.status, 'fail');
  });

  it('debe marcar status como "error" para códigos 5xx', () => {
    const err = new AppError('internal', 500);
    assert.equal(err.status, 'error');
  });

  it('debe ser instancia de Error', () => {
    const err = new AppError('test', 400);
    assert.ok(err instanceof Error);
    assert.ok(err instanceof AppError);
  });

  describe('métodos factoría', () => {
    it('badRequest → 400', () => {
      const err = AppError.badRequest('campo inválido');
      assert.equal(err.statusCode, 400);
      assert.equal(err.message, 'campo inválido');
    });

    it('unauthorized → 401', () => {
      const err = AppError.unauthorized();
      assert.equal(err.statusCode, 401);
      assert.equal(err.message, 'No autorizado');
    });

    it('unauthorized con mensaje custom', () => {
      const err = AppError.unauthorized('Token inválido');
      assert.equal(err.statusCode, 401);
      assert.equal(err.message, 'Token inválido');
    });

    it('forbidden → 403', () => {
      const err = AppError.forbidden();
      assert.equal(err.statusCode, 403);
    });

    it('notFound → 404', () => {
      const err = AppError.notFound();
      assert.equal(err.statusCode, 404);
    });

    it('conflict → 409', () => {
      const err = AppError.conflict('duplicado');
      assert.equal(err.statusCode, 409);
      assert.equal(err.message, 'duplicado');
    });

    it('tooManyRequests → 429', () => {
      const err = AppError.tooManyRequests();
      assert.equal(err.statusCode, 429);
    });

    it('internal → 500', () => {
      const err = AppError.internal();
      assert.equal(err.statusCode, 500);
    });
  });
});
