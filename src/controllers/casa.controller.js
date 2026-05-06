const { validationResult } = require('express-validator');
const Casa = require('../models/Casa');

const listarCasas = async (req, res) => {
  try {
    const { bloque, activa, page = 1, limit = 20 } = req.query;

    // By default only return active houses; pass ?activa=false to see inactive
    const filter = { activa: activa === 'false' ? false : true };
    if (bloque) filter.bloque = bloque;

    const skip = (Number(page) - 1) * Number(limit);

    const [casas, total] = await Promise.all([
      Casa.find(filter)
        .sort({ bloque: 1, numeroCasa: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Casa.countDocuments(filter),
    ]);

    return res.json({
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      casas,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const obtenerCasa = async (req, res) => {
  try {
    const casa = await Casa.findById(req.params.id);
    if (!casa) return res.status(404).json({ message: 'Casa no encontrada' });
    return res.json({ casa });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const crearCasa = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  try {
    const casa = await Casa.create(req.body);
    return res.status(201).json({ message: 'Casa creada exitosamente', casa });
  } catch (error) {
    if (error.code === 11000)
      return res.status(409).json({
        message: 'Ya existe una casa con ese bloque y número',
      });
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const crearCasasEnLote = async (req, res) => {
  const { casas } = req.body;

  if (!Array.isArray(casas) || casas.length === 0)
    return res.status(400).json({ message: 'Debes enviar un array de casas en el campo "casas"' });

  try {
    // ordered: false — continues inserting even if some fail (duplicate key)
    const resultado = await Casa.insertMany(casas, { ordered: false });
    return res.status(201).json({
      message: `${resultado.length} casa(s) creada(s) exitosamente`,
      casas: resultado,
    });
  } catch (error) {
    // insertMany with ordered:false throws but also returns partial results
    if (error.name === 'MongoBulkWriteError') {
      const insertadas = error.insertedDocs ?? [];
      const duplicados = error.writeErrors.map((e) => e.err.op);
      return res.status(207).json({
        message: `${insertadas.length} casa(s) creada(s), ${duplicados.length} duplicada(s) omitida(s)`,
        insertadas,
        duplicados,
      });
    }
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const actualizarCasa = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  try {
    const casa = await Casa.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!casa) return res.status(404).json({ message: 'Casa no encontrada' });

    return res.json({ message: 'Casa actualizada exitosamente', casa });
  } catch (error) {
    if (error.code === 11000)
      return res.status(409).json({
        message: 'Ya existe una casa con ese bloque y número',
      });
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const desactivarCasa = async (req, res) => {
  try {
    const casa = await Casa.findById(req.params.id);
    if (!casa) return res.status(404).json({ message: 'Casa no encontrada' });

    if (!casa.activa)
      return res.status(400).json({ message: 'La casa ya está desactivada' });

    casa.activa = false;
    await casa.save();

    return res.json({ message: 'Casa desactivada exitosamente', casa });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const activarCasa = async (req, res) => {
  try {
    const casa = await Casa.findById(req.params.id);
    if (!casa) return res.status(404).json({ message: 'Casa no encontrada' });

    if (casa.activa)
      return res.status(400).json({ message: 'La casa ya está activa' });

    casa.activa = true;
    await casa.save();

    return res.json({ message: 'Casa activada exitosamente', casa });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  listarCasas,
  obtenerCasa,
  crearCasa,
  crearCasasEnLote,
  actualizarCasa,
  desactivarCasa,
  activarCasa,
};
