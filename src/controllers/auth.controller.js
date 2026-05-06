const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const { name, email, password } = req.body;

  try {
    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ message: 'Email already registered' });

    const user = await User.create({ name, email, password });

    return res.status(201).json({
      message:
        'Account created successfully. Wait for an admin to activate your account before logging in.',
      user: user.toSafeObject(),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user || user.authProvider !== 'local')
      return res.status(401).json({ message: 'Invalid credentials' });

    const match = await user.comparePassword(password);
    if (!match)
      return res.status(401).json({ message: 'Invalid credentials' });

    if (user.status !== 'active')
      return res.status(403).json({
        message: 'Account not active. Contact an administrator to activate your account.',
        status: user.status,
      });

    const token = signToken(user._id);

    return res.json({ token, user: user.toSafeObject() });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Receives the Google ID Token from the Android app and verifies it
const googleSignIn = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken)
    return res.status(400).json({ message: 'idToken is required' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { sub: googleId, email, name, picture } = ticket.getPayload();

    let user = await User.findOne({ googleId });

    if (!user) {
      // Check if there's already a local account with that email
      user = await User.findOne({ email });

      if (user) {
        user.googleId = googleId;
        if (!user.avatar) user.avatar = picture;
        await user.save();
      } else {
        user = await User.create({
          googleId,
          name,
          email,
          avatar: picture,
          authProvider: 'google',
        });

        return res.status(201).json({
          message: 'Account created. Wait for an admin to activate it before logging in.',
          user: user.toSafeObject(),
        });
      }
    }

    if (user.status !== 'active')
      return res.status(403).json({
        message: 'Account not active. Contact an administrator.',
        status: user.status,
      });

    const token = signToken(user._id);
    return res.json({ token, user: user.toSafeObject() });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid Google token', error: error.message });
  }
};

const me = async (req, res) => {
  return res.json({ user: req.user.toSafeObject() });
};

module.exports = { register, login, googleSignIn, me };
