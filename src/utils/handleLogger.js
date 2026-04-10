import { IncomingWebhook } from '@slack/webhook';

const webhook = process.env.SLACK_WEBHOOK
  ? new IncomingWebhook(process.env.SLACK_WEBHOOK)
  : null;

// Stream compatible con morgan-body.
// morgan-body llama a stream.write(message) por cada petición que no se skipea.
export const loggerStream = {
  write: (message) => {
    if (webhook) {
      webhook.send({
        text: `🚨 *Error en BildyApp API*\n\`\`\`${message}\`\`\``
      }).catch(err => console.error('Error enviando a Slack:', err));
    }
    console.error(message);
  }
};

// Envío manual para eventos de negocio desde el NotificationService.
export const sendSlackNotification = async (message) => {
  if (webhook) {
    try {
      await webhook.send({ text: message });
    } catch (err) {
      console.error('Error enviando a Slack:', err);
    }
  }
};
