const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const { listarTarifas, obtenerTarifa, crearTarifa, definirTarifa } = require('../controllers/tarifa.controller');

const adminOnly = [authenticate, requireRole('admin')];

const tarifaRules = [
  body('anio').isInt({ min: 2000 }).withMessage('El anio debe ser un número válido'),
  body('cuotaAdministracion').isFloat({ min: 0 }).withMessage('La cuota de administración debe ser mayor o igual a 0'),
  body('multaMora').isFloat({ min: 0 }).withMessage('La multa por mora debe ser mayor o igual a 0'),
  body('diasGracia').optional().isInt({ min: 1 }).withMessage('Los días de gracia deben ser al menos 1'),
  body('parqueadero').isFloat({ min: 0 }).withMessage('El valor de parqueadero debe ser mayor o igual a 0'),
];

const definirRules = [
  body('cuotaAdministracion').isFloat({ min: 0 }).withMessage('La cuota de administración debe ser mayor o igual a 0'),
  body('multaMora').optional().isFloat({ min: 0 }).withMessage('La multa por mora debe ser mayor o igual a 0'),
  body('diasGracia').optional().isInt({ min: 1 }).withMessage('Los días de gracia deben ser al menos 1'),
  body('parqueadero').optional().isFloat({ min: 0 }).withMessage('El valor de parqueadero debe ser mayor o igual a 0'),
];

router.get('/', ...adminOnly, listarTarifas);
router.get('/:anio', ...adminOnly, obtenerTarifa);
router.post('/', ...adminOnly, tarifaRules, crearTarifa);
router.patch('/:id/definir', ...adminOnly, definirRules, definirTarifa);

module.exports = router;
