const { validationResult } = require('express-validator');
const Tarifa = require('../models/Tarifa');
const Cargo = require('../models/Cargo');

const populate = [
  { path: 'creadoPor', select: 'name email' },
  { path: 'definidaPor', select: 'name email' },
];

const listarTarifas = async (req, res) => {
  try {
    const tarifas = await Tarifa.find().populate(populate).sort({ anio: -1 });
    return res.json({ tarifas });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const obtenerTarifa = async (req, res) => {
  try {
    const tarifa = await Tarifa.findOne({ anio: Number(req.params.anio) }).populate(populate);
    if (!tarifa)
      return res.status(404).json({ message: `No existe tarifa para el anio ${req.params.anio}` });
    return res.json({ tarifa });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const crearTarifa = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });

  try {
    const tarifa = await Tarifa.create({ ...req.body, creadoPor: req.user._id });
    await tarifa.populate(populate);
    return res.status(201).json({ message: 'Tarifa creada exitosamente', tarifa });
  } catch (error) {
    if (error.code === 11000)
      return res.status(409).json({ message: `Ya existe una tarifa para el anio ${req.body.anio}` });
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Marks the tarifa as definitiva with final values.
// - Pending admin cargos linked to this tarifa get their monto updated to the new rate.
// - Paid admin cargos generate a retroactivo cargo per casa for the difference.
const definirTarifa = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });

  try {
    const tarifa = await Tarifa.findById(req.params.id);
    if (!tarifa) return res.status(404).json({ message: 'Tarifa no encontrada' });

    if (tarifa.estado === 'definitiva')
      return res.status(400).json({ message: 'La tarifa ya está definida' });

    const cuotaAnterior = tarifa.cuotaAdministracion;
    const { cuotaAdministracion, multaMora, diasGracia, parqueadero } = req.body;
    const diferencia = cuotaAdministracion - cuotaAnterior;

    tarifa.cuotaAdministracion = cuotaAdministracion;
    if (multaMora !== undefined) tarifa.multaMora = multaMora;
    if (diasGracia !== undefined) tarifa.diasGracia = diasGracia;
    if (parqueadero !== undefined) tarifa.parqueadero = parqueadero;
    tarifa.estado = 'definitiva';
    tarifa.definidaPor = req.user._id;
    tarifa.definidaEn = new Date();
    await tarifa.save();

    let retroactivosCreados = 0;

    if (diferencia !== 0) {
      // Update pending/vencido cargos to new amount
      await Cargo.updateMany(
        { tarifa: tarifa._id, tipo: 'administracion', estado: { $in: ['pendiente', 'vencido'] } },
        { $set: { monto: cuotaAdministracion } }
      );

      // Generate retroactivo for each casa that already paid at provisional rate
      if (diferencia > 0) {
        const cargosPagados = await Cargo.find({
          tarifa: tarifa._id,
          tipo: 'administracion',
          estado: 'pagado',
        });

        const porCasa = {};
        for (const cargo of cargosPagados) {
          const key = cargo.casa.toString();
          porCasa[key] = (porCasa[key] || 0) + 1;
        }

        for (const [casaId, meses] of Object.entries(porCasa)) {
          await Cargo.create({
            casa: casaId,
            tipo: 'retroactivo',
            monto: diferencia * meses,
            vencimiento: new Date(),
            descripcion: `Retroactivo ${tarifa.anio}: diferencia $${diferencia.toLocaleString('es-CO')} × ${meses} mes(es)`,
            creadoPor: req.user._id,
            tarifa: tarifa._id,
          });
          retroactivosCreados++;
        }
      }
    }

    await tarifa.populate(populate);
    return res.json({
      message: 'Tarifa definida exitosamente',
      tarifa,
      retroactivosCreados,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { listarTarifas, obtenerTarifa, crearTarifa, definirTarifa };
