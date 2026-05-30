const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['user', 'admin', 'super_admin', 'report_user'];
const STATUS = ['pending', 'active', 'suspended'];
const AUTH_PROVIDERS = ['local', 'google'];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: 6,
      // Not required — google users won't have one
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    avatar: {
      type: String,
    },
    role: {
      type: String,
      enum: ROLES,
      default: 'user',
    },
    status: {
      type: String,
      enum: STATUS,
      default: 'pending', // All new accounts start as pending until an admin activates them
    },
    authProvider: {
      type: String,
      enum: AUTH_PROVIDERS,
      default: 'local',
    },
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.googleId;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
