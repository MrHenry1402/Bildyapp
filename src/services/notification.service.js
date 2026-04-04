import { EventEmitter } from 'events';

class NotificationService extends EventEmitter {
  constructor() {
    super();
    this._registerListeners();
  }

  _registerListeners() {
    this.on('user:registered', (data) => {
      console.log(`[EVENT] user:registered — email: ${data.email} | código verificación: ${data.verificationCode}`);
    });

    this.on('user:verified', (data) => {
      console.log(`[EVENT] user:verified — email: ${data.email}`);
    });

    this.on('user:invited', (data) => {
      console.log(`[EVENT] user:invited — email: ${data.email} | compañía: ${data.companyId}`);
    });

    this.on('user:deleted', (data) => {
      console.log(`[EVENT] user:deleted — userId: ${data.userId} | soft: ${data.soft}`);
    });
  }
}

export const notificationService = new NotificationService();
