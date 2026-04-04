import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  street: String,
  number: String,
  postal: String,
  city: String,
  province: String
}, { _id: false });

const companySchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: String,
  cif: {
    type: String,
    unique: true,
    sparse: true
  },
  address: addressSchema,
  logo: String,
  isFreelance: {
    type: Boolean,
    default: false
  },
  deleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

export const Company = mongoose.model('Company', companySchema);
