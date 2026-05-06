const router = require('express').Router();
const { body } = require('express-validator');
const { register, login, googleSignIn, me } = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

const loginRules = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

// Normal auth
router.post('/register', registerRules, register);
router.post('/login', loginRules, login);

// Google — Android sends the ID Token obtained from the Google Sign-In SDK
router.post('/google', googleSignIn);

// Protected
router.get('/me', authenticate, me);

module.exports = router;
