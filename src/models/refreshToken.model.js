import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true });

// TTL index: MongoDB elimina automáticamente los tokens expirados
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
