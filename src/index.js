import app from './app.js';
import dbConnect from './config/index.js';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await dbConnect();
    app.listen(PORT, () => {
      console.log(`Servidor en http://localhost:${PORT}`);
      console.log(`API en http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Error al iniciar:', error);
    process.exit(1);
  }
};

startServer();
