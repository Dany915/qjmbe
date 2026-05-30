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
  crearCargoCasa,
} = require('../controllers/cargo.controller');

const adminOnly = [authenticate, requireRole('admin')];
const anyActive = [authenticate, requireRole('user', 'admin')];

const periodoRule = body('periodo')
  .matches(/^\d{4}-\d{2}$/)
  .withMessage('El periodo debe tener formato YYYY-MM (ej: 2026-05)');

const extraordinarioRules = [
  body('descripcion').trim().notEmpty().withMessage('La descripción es requerida'),
  body('monto').isFloat({ min: 1 }).withMessage('El monto debe ser mayor a 0'),
  body('vencimiento').isISO8601().withMessage('La fecha de vencimiento debe tener formato ISO 8601'),
];

const TIPOS = ['administracion', 'mora', 'parqueadero', 'retroactivo', 'extraordinario'];

const cargoCasaRules = [
  body('tipo').isIn(TIPOS).withMessage(`El tipo debe ser uno de: ${TIPOS.join(', ')}`),
  body('periodo')
    .optional()
    .matches(/^\d{4}-\d{2}$/)
    .withMessage('El periodo debe tener formato YYYY-MM'),
  body('monto').optional().isFloat({ min: 1 }).withMessage('El monto debe ser mayor a 0'),
  body('vencimiento').optional().isISO8601().withMessage('La fecha de vencimiento debe tener formato ISO 8601'),
  body('descripcion').optional().trim().notEmpty().withMessage('La descripción no puede estar vacía'),
];

router.get('/', ...anyActive, listarCargos);
router.get('/casa/:casaId/estado-cuenta', ...anyActive, estadoCuenta);
router.post('/casa/:casaId', ...adminOnly, cargoCasaRules, crearCargoCasa);
router.post('/generar-mensual', ...adminOnly, periodoRule, generarMensual);
router.post('/aplicar-mora', ...adminOnly, periodoRule, aplicarMora);
router.post('/extraordinario', ...adminOnly, extraordinarioRules, crearExtraordinario);

module.exports = router;
