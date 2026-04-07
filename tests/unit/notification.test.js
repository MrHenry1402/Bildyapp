import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { notificationService } from '../../src/services/notification.service.js';

describe('NotificationService', () => {
  it('debe ser instancia de EventEmitter', () => {
    assert.ok(notificationService instanceof EventEmitter);
  });

  it('debe tener listener registrado para user:registered', () => {
    const listeners = notificationService.listeners('user:registered');
    assert.ok(listeners.length > 0, 'Debe tener al menos un listener para user:registered');
  });

  it('debe tener listener registrado para user:verified', () => {
    const listeners = notificationService.listeners('user:verified');
    assert.ok(listeners.length > 0);
  });

  it('debe tener listener registrado para user:invited', () => {
    const listeners = notificationService.listeners('user:invited');
    assert.ok(listeners.length > 0);
  });

  it('debe tener listener registrado para user:deleted', () => {
    const listeners = notificationService.listeners('user:deleted');
    assert.ok(listeners.length > 0);
  });

  it('debe emitir evento user:registered sin error', () => {
    assert.doesNotThrow(() => {
      notificationService.emit('user:registered', {
        email: 'test@test.com',
        verificationCode: '123456'
      });
    });
  });

  it('debe emitir evento user:verified sin error', () => {
    assert.doesNotThrow(() => {
      notificationService.emit('user:verified', { email: 'test@test.com' });
    });
  });

  it('debe emitir evento user:invited sin error', () => {
    assert.doesNotThrow(() => {
      notificationService.emit('user:invited', {
        email: 'invited@test.com',
        companyId: '507f1f77bcf86cd799439011'
      });
    });
  });

  it('debe emitir evento user:deleted sin error', () => {
    assert.doesNotThrow(() => {
      notificationService.emit('user:deleted', {
        userId: '507f1f77bcf86cd799439011',
        soft: true
      });
    });
  });
});
