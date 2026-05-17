const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const {
  listarFacturas,
  obtenerFactura,
  crearFactura,
  crearFacturasEnLote,
  actualizarFactura,
  eliminarFactura,
  aprobarFactura,
  rechazarFactura,
  anularFactura,
  exportarFacturas,
  buscarFacturas,
  registrarHistoricaLote,
  registrarAprobadosLote,
} = require('../controllers/factura.controller');

const adminOnly = [authenticate, requireRole('admin')];
const anyActive = [authenticate]; // user or admin

const TIPOS_CARGO = ['administracion', 'mora', 'parqueadero', 'retroactivo', 'extraordinario'];

const facturaRules = [
  body('numeroRecibo').trim().notEmpty().withMessage('El número de recibo es requerido'),
  body('valor').isFloat({ min: 0 }).withMessage('El valor debe ser un número mayor o igual a 0'),
  body('fecha').isISO8601().withMessage('La fecha debe tener formato ISO 8601 (YYYY-MM-DD)'),
  body('casa').isMongoId().withMessage('El ID de la casa no es válido'),
  body('descripcion').trim().notEmpty().withMessage('La descripción es requerida'),
  body('nombrePagador').trim().notEmpty().withMessage('El nombre del pagador es requerido'),
  body('metodoPago').isIn(['efectivo', 'digital']).withMessage('El método de pago debe ser "efectivo" o "digital"'),
  body('cargos').isArray({ min: 1 }).withMessage('Debes especificar al menos un cargo'),
  body('cargos.*.tipo')
    .isIn(TIPOS_CARGO)
    .withMessage(`El tipo de cargo debe ser uno de: ${TIPOS_CARGO.join(', ')}`),
  body('cargos.*.periodo')
    .optional()
    .matches(/^\d{4}-\d{2}$/)
    .withMessage('El periodo del cargo debe tener formato YYYY-MM'),
  body('cargos.*.monto')
    .optional()
    .isFloat({ min: 1 })
    .withMessage('El monto del cargo debe ser mayor a 0'),
  body('cargos.*.vencimiento')
    .optional()
    .isISO8601()
    .withMessage('El vencimiento del cargo debe tener formato ISO 8601'),
  body('cargos.*.descripcion').optional().trim().notEmpty(),
];

const facturaUpdateRules = [
  body('valor').optional().isFloat({ min: 0 }).withMessage('El valor debe ser mayor o igual a 0'),
  body('fecha').optional().isISO8601().withMessage('La fecha debe tener formato ISO 8601'),
  body('casa').optional().isMongoId().withMessage('El ID de la casa no es válido'),
  body('descripcion').optional().trim().notEmpty().withMessage('La descripción no puede estar vacía'),
  body('nombrePagador').optional().trim().notEmpty().withMessage('El nombre del pagador no puede estar vacío'),
  body('metodoPago').optional().isIn(['efectivo', 'digital']).withMessage('El método de pago debe ser "efectivo" o "digital"'),
];

// Admin only
router.get('/', ...anyActive, listarFacturas);
router.get('/buscar', ...anyActive, buscarFacturas);
router.get('/buscar/exportar', ...adminOnly, exportarFacturas);
router.get('/:id', ...adminOnly, obtenerFactura);
router.post('/bulk', ...adminOnly, crearFacturasEnLote);
router.post('/historica/lote', ...adminOnly, registrarHistoricaLote);
router.post('/bulk-aprobadas', ...adminOnly, registrarAprobadosLote);
router.put('/:id', ...anyActive, facturaUpdateRules, actualizarFactura);
router.delete('/:id', ...adminOnly, eliminarFactura);
router.patch('/:id/aprobar', ...adminOnly, aprobarFactura);
router.patch('/:id/rechazar', ...adminOnly, rechazarFactura);
router.patch('/:id/anular', ...adminOnly, anularFactura);

// User and admin can create a single factura
router.post('/', ...anyActive, facturaRules, crearFactura);

module.exports = router;
