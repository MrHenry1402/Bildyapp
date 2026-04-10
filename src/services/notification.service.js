import { EventEmitter } from 'events';
import { sendSlackNotification } from '../utils/handleLogger.js';

class NotificationService extends EventEmitter {
  constructor() {
    super();
    this._registerListeners();
  }

  _registerListeners() {
    this.on('user:registered', (data) => {
      console.log(`[EVENT] user:registered — email: ${data.email} | código verificación: ${data.verificationCode}`);
      sendSlackNotification(`✅ Nuevo usuario registrado: ${data.email}`);
    });

    this.on('user:verified', (data) => {
      console.log(`[EVENT] user:verified — email: ${data.email}`);
      sendSlackNotification(`✅ Usuario verificado: ${data.email}`);
    });

    this.on('user:invited', (data) => {
      console.log(`[EVENT] user:invited — email: ${data.email} | compañía: ${data.companyId}`);
      sendSlackNotification(`📩 Usuario invitado: ${data.email} a la compañía ${data.companyId}`);
    });

    this.on('user:deleted', (data) => {
      console.log(`[EVENT] user:deleted — userId: ${data.userId} | soft: ${data.soft}`);
      const tipo = data.soft ? 'soft delete' : 'hard delete';
      sendSlackNotification(`⚠️ Usuario eliminado (${tipo}): ${data.userId}`);
    });
  }
}

export const notificationService = new NotificationService();
