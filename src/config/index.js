import mongoose from 'mongoose';

/**
 * Conecta a MongoDB usando la URI de .env
 */
const dbConnect = async () => {
  const DB_URI = process.env.DB_URI;

  if (!DB_URI) {
    console.error('❌ DB_URI no está definida en .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(DB_URI);
    console.log('✅ Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    process.exit(1);
  }
};

// Eventos de conexión
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ Desconectado de MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Error en MongoDB:', err.message);
});

// Cerrar conexión al terminar
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('🔌 Conexión a MongoDB cerrada');
  process.exit(0);
});

export default dbConnect;
