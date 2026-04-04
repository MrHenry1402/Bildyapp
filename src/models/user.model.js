import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  street: String,
  number: String,
  postal: String,
  city: String,
  province: String
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  name: String,
  lastName: String,
  nif: String,
  role: {
    type: String,
    enum: ['admin', 'guest'],
    default: 'admin',
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'verified'],
    default: 'pending',
    index: true
  },
  verificationCode: String,
  verificationAttempts: {
    type: Number,
    default: 3
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    index: true
  },
  address: addressSchema,
  deleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual: fullName
userSchema.virtual('fullName').get(function () {
  if (this.name && this.lastName) return `${this.name} ${this.lastName}`;
  return this.name || '';
});

export const User = mongoose.model('User', userSchema);
