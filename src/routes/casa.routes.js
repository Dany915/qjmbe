const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const {
  listarCasas,
  obtenerCasa,
  crearCasa,
  crearCasasEnLote,
  actualizarCasa,
  desactivarCasa,
  activarCasa,
} = require('../controllers/casa.controller');

const adminOnly = [authenticate, requireRole('admin')];

const casaRules = [
  body('bloque').trim().notEmpty().withMessage('El bloque es requerido'),
  body('numeroCasa').trim().notEmpty().withMessage('El número de casa es requerido'),
  body('propietario').trim().notEmpty().withMessage('El propietario es requerido'),
  body('tipoDocumento').trim().notEmpty().withMessage('El tipo de documento es requerido'),
  body('numeroDocumento').trim().notEmpty().withMessage('El número de documento es requerido'),
  body('correo').optional({ nullable: true }).isEmail().withMessage('Correo inválido').normalizeEmail(),
];

const casaUpdateRules = [
  body('bloque').optional().trim().notEmpty().withMessage('El bloque no puede estar vacío'),
  body('numeroCasa').optional().trim().notEmpty().withMessage('El número de casa no puede estar vacío'),
  body('propietario').optional().trim().notEmpty().withMessage('El propietario no puede estar vacío'),
  body('tipoDocumento').optional().trim().notEmpty().withMessage('El tipo de documento no puede estar vacío'),
  body('numeroDocumento').optional().trim().notEmpty().withMessage('El número de documento no puede estar vacío'),
  body('correo').optional({ nullable: true }).isEmail().withMessage('Correo inválido').normalizeEmail(),
];

router.get('/', ...adminOnly, listarCasas);
router.get('/:id', ...adminOnly, obtenerCasa);
router.post('/', ...adminOnly, casaRules, crearCasa);
router.post('/bulk', ...adminOnly, crearCasasEnLote);
router.put('/:id', ...adminOnly, casaUpdateRules, actualizarCasa);
router.patch('/:id/desactivar', ...adminOnly, desactivarCasa);
router.patch('/:id/activar', ...adminOnly, activarCasa);

module.exports = router;
