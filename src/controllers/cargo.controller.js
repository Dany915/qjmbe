const { validationResult } = require('express-validator');
const Cargo = require('../models/Cargo');
const Casa = require('../models/Casa');
const Tarifa = require('../models/Tarifa');

const populateCargo = [
  { path: 'casa', select: 'bloque numeroCasa' },
  { path: 'factura', select: 'numeroRecibo fecha' },
  { path: 'creadoPor', select: 'name email' },
];

const listarCargos = async (req, res) => {
  try {
    const { casa, tipo, estado, periodo, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (casa) filter.casa = casa;
    if (tipo) filter.tipo = tipo;
    if (estado) filter.estado = estado;
    if (periodo) filter.periodo = periodo;

    const skip = (Number(page) - 1) * Number(limit);

    const [cargos, total] = await Promise.all([
      Cargo.find(filter)
        .populate(populateCargo)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Cargo.countDocuments(filter),
    ]);

    return res.json({
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      cargos,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const estadoCuenta = async (req, res) => {
  try {
    const casa = await Casa.findById(req.params.casaId);
    if (!casa) return res.status(404).json({ message: 'Casa no encontrada' });

    const cargos = await Cargo.find({ casa: req.params.casaId })
      .populate('factura', 'numeroRecibo fecha')
      .sort({ createdAt: -1 });

    const pendientes = cargos.filter((c) => c.estado === 'pendiente');
    const vencidos = cargos.filter((c) => c.estado === 'vencido');
    const pagados = cargos.filter((c) => c.estado === 'pagado');

    const sumar = (arr) => arr.reduce((sum, c) => sum + c.monto, 0);

    return res.json({
      casa,
      resumen: {
        totalPendiente: sumar(pendientes),
        totalVencido: sumar(vencidos),
        totalPagado: sumar(pagados),
        alDia: pendientes.length === 0 && vencidos.length === 0,
      },
      cargos: { pendientes, vencidos, pagados },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Generates administracion + parqueadero charges for all active houses for a given period.
const generarMensual = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });

  const { periodo } = req.body;
  const anio = parseInt(periodo.split('-')[0]);
  const mes = parseInt(periodo.split('-')[1]);

  try {
    const tarifa = await Tarifa.findOne({ anio });
    if (!tarifa)
      return res.status(404).json({ message: `No existe tarifa para el anio ${anio}. Crea una primero.` });

    const vencimiento = new Date(anio, mes - 1, tarifa.diasGracia);
    const casas = await Casa.find({ activa: true });

    let creados = 0;
    let omitidos = 0;

    for (const casa of casas) {
      const existeAdmin = await Cargo.findOne({ casa: casa._id, tipo: 'administracion', periodo });
      if (!existeAdmin) {
        await Cargo.create({
          casa: casa._id,
          tipo: 'administracion',
          periodo,
          monto: tarifa.cuotaAdministracion,
          vencimiento,
          creadoPor: req.user._id,
          tarifa: tarifa._id,
        });
        creados++;
      } else {
        omitidos++;
      }

      if (casa.parqueadero) {
        const existeParq = await Cargo.findOne({ casa: casa._id, tipo: 'parqueadero', periodo });
        if (!existeParq) {
          await Cargo.create({
            casa: casa._id,
            tipo: 'parqueadero',
            periodo,
            monto: tarifa.parqueadero,
            vencimiento,
            descripcion: 'Cargo parqueadero adicional',
            creadoPor: req.user._id,
            tarifa: tarifa._id,
          });
          creados++;
        }
      }
    }

    return res.status(201).json({
      message: `Cargos generados para ${periodo}`,
      casas: casas.length,
      creados,
      omitidos,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Applies late fee to all houses with unpaid administracion for the given period.
// Also marks those admin cargos as 'vencido'.
const aplicarMora = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });

  const { periodo } = req.body;
  const anio = parseInt(periodo.split('-')[0]);

  try {
    const tarifa = await Tarifa.findOne({ anio });
    if (!tarifa)
      return res.status(404).json({ message: `No existe tarifa para el anio ${anio}` });

    // Exclude cargos already linked to a factura (payment submitted but pending approval)
    const cargosPendientes = await Cargo.find({
      tipo: 'administracion',
      periodo,
      estado: 'pendiente',
      factura: null,
    });

    let aplicadas = 0;
    let omitidas = 0;

    for (const cargo of cargosPendientes) {
      const existeMora = await Cargo.findOne({ casa: cargo.casa, tipo: 'mora', periodo });
      if (!existeMora) {
        await Cargo.create({
          casa: cargo.casa,
          tipo: 'mora',
          periodo,
          monto: tarifa.multaMora,
          vencimiento: cargo.vencimiento,
          descripcion: `Mora por pago tardío - ${periodo}`,
          creadoPor: req.user._id,
          tarifa: tarifa._id,
        });
        cargo.estado = 'vencido';
        await cargo.save();
        aplicadas++;
      } else {
        omitidas++;
      }
    }

    return res.json({
      message: `Mora aplicada para ${periodo}`,
      aplicadas,
      omitidas,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Creates a single cargo for one house by ID.
// For period-based types (administracion, parqueadero, mora), checks for duplicates first.
// monto and vencimiento are auto-resolved from tarifa when not provided.
const crearCargoCasa = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });

  const { casaId } = req.params;
  const { tipo, periodo, monto: montoBody, vencimiento: vencimientoBody, descripcion } = req.body;

  const TIPOS_CON_PERIODO = ['administracion', 'parqueadero', 'mora'];

  try {
    const casa = await Casa.findById(casaId);
    if (!casa) return res.status(404).json({ message: 'Casa no encontrada' });

    if (TIPOS_CON_PERIODO.includes(tipo) && !periodo)
      return res.status(400).json({ message: `El campo periodo es requerido para el tipo "${tipo}"` });

    if (periodo) {
      const existente = await Cargo.findOne({ casa: casaId, tipo, periodo });
      if (existente)
        return res.status(409).json({
          message: `Ya existe un cargo de tipo "${tipo}" para el periodo ${periodo} en esta casa`,
          cargo: existente._id,
        });
    }

    let monto = montoBody;
    let vencimiento = vencimientoBody ? new Date(vencimientoBody) : null;
    let tarifaId = null;

    if ((!monto || !vencimiento) && periodo) {
      const anio = parseInt(periodo.split('-')[0]);
      const mes = parseInt(periodo.split('-')[1]);
      const tarifa = await Tarifa.findOne({ anio });
      if (tarifa) {
        tarifaId = tarifa._id;
        if (!monto) {
          if (tipo === 'administracion') monto = tarifa.cuotaAdministracion;
          else if (tipo === 'parqueadero') monto = tarifa.parqueadero;
          else if (tipo === 'mora') monto = tarifa.multaMora;
        }
        if (!vencimiento) vencimiento = new Date(anio, mes - 1, tarifa.diasGracia);
      }
    }

    if (!monto || monto <= 0)
      return res.status(400).json({ message: 'El monto es requerido y no pudo derivarse de la tarifa' });
    if (!vencimiento)
      return res.status(400).json({ message: 'La fecha de vencimiento es requerida y no pudo derivarse de la tarifa' });

    const cargo = await Cargo.create({
      casa: casaId,
      tipo,
      periodo: periodo || null,
      monto,
      vencimiento,
      descripcion: descripcion || null,
      creadoPor: req.user._id,
      tarifa: tarifaId,
    });

    await cargo.populate(populateCargo);

    return res.status(201).json({ message: 'Cargo creado exitosamente', cargo });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Creates an extraordinary charge for all active houses.
const crearExtraordinario = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });

  const { descripcion, monto, vencimiento } = req.body;

  try {
    const casas = await Casa.find({ activa: true });

    const docs = casas.map((casa) => ({
      casa: casa._id,
      tipo: 'extraordinario',
      monto,
      vencimiento: new Date(vencimiento),
      descripcion,
      creadoPor: req.user._id,
    }));

    await Cargo.insertMany(docs);

    return res.status(201).json({
      message: `Cuota extraordinaria creada para ${casas.length} casa(s)`,
      casas: casas.length,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { listarCargos, estadoCuenta, generarMensual, aplicarMora, crearExtraordinario, crearCargoCasa };
