const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const {
  listarCargos,
  estadoCuenta,
  generarMensual,
  aplicarMora,
  crearExtraordinario,
} = require('../controllers/cargo.controller');

const adminOnly = [authenticate, requireRole('admin')];
const anyActive = [authenticate];

const periodoRule = body('periodo')
  .matches(/^\d{4}-\d{2}$/)
  .withMessage('El periodo debe tener formato YYYY-MM (ej: 2026-05)');

const extraordinarioRules = [
  body('descripcion').trim().notEmpty().withMessage('La descripción es requerida'),
  body('monto').isFloat({ min: 1 }).withMessage('El monto debe ser mayor a 0'),
  body('vencimiento').isISO8601().withMessage('La fecha de vencimiento debe tener formato ISO 8601'),
];

router.get('/', ...adminOnly, listarCargos);
router.get('/casa/:casaId/estado-cuenta', ...anyActive, estadoCuenta);
router.post('/generar-mensual', ...adminOnly, periodoRule, generarMensual);
router.post('/aplicar-mora', ...adminOnly, periodoRule, aplicarMora);
router.post('/extraordinario', ...adminOnly, extraordinarioRules, crearExtraordinario);

module.exports = router;
