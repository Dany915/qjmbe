const { validationResult } = require('express-validator');
const ExcelJS = require('exceljs');
const Factura = require('../models/Factura');
const Casa = require('../models/Casa');
const Cargo = require('../models/Cargo');
const Tarifa = require('../models/Tarifa');

// bloque + numeroCasa are needed so the 'codigo' virtual (e.g. "G12") is computed
const populate = [
  { path: 'casa', select: 'bloque numeroCasa' },
  { path: 'creadoPor', select: 'name email role' },
  { path: 'aprobadoPor', select: 'name email role' },
];

const listarFacturas = async (req, res) => {
  try {
    const { estado, casa, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (estado) filter.estado = estado;
    if (casa) filter.casa = casa;

    const skip = (Number(page) - 1) * Number(limit);

    const [facturas, total] = await Promise.all([
      Factura.find(filter)
        .populate(populate)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Factura.countDocuments(filter),
    ]);

    return res.json({
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      facturas,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const obtenerFactura = async (req, res) => {
  try {
    const factura = await Factura.findById(req.params.id).populate(populate);
    if (!factura) return res.status(404).json({ message: 'Factura no encontrada' });
    return res.json({ factura });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Creates a factura and auto-generates its cargos from the provided specs.
// For period-based types (administracion, parqueadero, mora): reuses an existing
// unpaid cargo for that casa+tipo+periodo if one exists, otherwise creates it.
// For non-period types (retroactivo, extraordinario): always creates a new cargo.
const crearFactura = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });

  const { numeroRecibo, casa: casaId, fecha, nombrePagador, metodoPago, descripcion, valor, cargos: specs } = req.body;

  try {
    const casa = await Casa.findById(casaId);
    if (!casa) return res.status(404).json({ message: 'La casa especificada no existe' });

    const cargoIds = await _resolverCargos(specs, casaId, fecha, req.user._id).catch((err) =>
      res.status(400).json({ message: err.message })
    );
    if (!cargoIds) return;

    const factura = await Factura.create({
      numeroRecibo,
      valor,
      fecha: new Date(fecha),
      casa: casaId,
      descripcion,
      nombrePagador,
      metodoPago,
      estado: 'por_aprobar',
      creadoPor: req.user._id,
      cargos: cargoIds,
    });

    await Cargo.updateMany({ _id: { $in: cargoIds } }, { $set: { factura: factura._id } });

    await factura.populate(populate);
    return res.status(201).json({ message: 'Factura creada exitosamente', factura });
  } catch (error) {
    if (error.code === 11000)
      return res.status(409).json({ message: 'El número de recibo ya existe' });
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const crearFacturasEnLote = async (req, res) => {
  const { facturas } = req.body;

  if (!Array.isArray(facturas) || facturas.length === 0)
    return res.status(400).json({ message: 'Debes enviar un array de facturas en el campo "facturas"' });

  try {
    const casaIds = [...new Set(facturas.map((f) => f.casa))];
    const casasExistentes = await Casa.find({ _id: { $in: casaIds } }).select('_id');
    const casasValidas = new Set(casasExistentes.map((c) => c._id.toString()));

    const invalidas = casaIds.filter((id) => !casasValidas.has(id));
    if (invalidas.length > 0)
      return res.status(400).json({
        message: 'Algunas casas no existen',
        casasInvalidas: invalidas,
      });

    const docs = facturas.map((f) => ({
      ...f,
      estado: 'por_aprobar',
      creadoPor: req.user._id,
    }));

    const resultado = await Factura.insertMany(docs, { ordered: false });
    return res.status(201).json({
      message: `${resultado.length} factura(s) creada(s) exitosamente`,
      facturas: resultado,
    });
  } catch (error) {
    if (error.name === 'MongoBulkWriteError') {
      const insertadas = error.insertedDocs ?? [];
      const duplicados = error.writeErrors.map((e) => ({
        numeroRecibo: e.err.op?.numeroRecibo,
        razon: 'Número de recibo duplicado',
      }));
      return res.status(207).json({
        message: `${insertadas.length} factura(s) creada(s), ${duplicados.length} omitida(s)`,
        insertadas,
        duplicados,
      });
    }
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const actualizarFactura = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });

  try {
    const factura = await Factura.findById(req.params.id);
    if (!factura) return res.status(404).json({ message: 'Factura no encontrada' });

    if (factura.estado !== 'por_aprobar' || factura.anulado)
      return res.status(403).json({
        message: 'Solo se pueden editar facturas en estado "por_aprobar" que no estén anuladas',
      });

    // Campos protegidos — nunca modificables por esta ruta
    delete req.body.numeroRecibo;
    delete req.body.estado;
    delete req.body.creadoPor;
    delete req.body.aprobadoPor;
    delete req.body.aprobadoEn;
    delete req.body.anulado;
    delete req.body.anuladoPor;
    delete req.body.anuladoEn;

    if (req.body.casa) {
      const casaExiste = await Casa.findById(req.body.casa);
      if (!casaExiste)
        return res.status(404).json({ message: 'La casa especificada no existe' });
    }

    const actualizada = await Factura.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate(populate);

    return res.json({ message: 'Factura actualizada exitosamente', factura: actualizada });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};


const eliminarFactura = async (req, res) => {
  try {
    const factura = await Factura.findById(req.params.id);
    if (!factura) return res.status(404).json({ message: 'Factura no encontrada' });

    if (factura.estado !== 'por_aprobar' || factura.anulado)
      return res.status(403).json({
        message: 'Solo se pueden eliminar facturas en estado "por_aprobar" que no estén anuladas',
      });

    // Release linked cargos so they can be used in a new factura
    if (factura.cargos?.length) {
      await Cargo.updateMany(
        { _id: { $in: factura.cargos } },
        { $set: { factura: null } }
      );
    }

    await factura.deleteOne();
    return res.json({ message: 'Factura eliminada exitosamente' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const aprobarFactura = async (req, res) => {
  try {
    const factura = await Factura.findById(req.params.id);
    if (!factura) return res.status(404).json({ message: 'Factura no encontrada' });

    if (factura.estado === 'aprobado')
      return res.status(400).json({ message: 'La factura ya está aprobada' });

    factura.estado = 'aprobado';
    factura.aprobadoPor = req.user._id;
    factura.aprobadoEn = new Date();
    await factura.save();

    // Mark all linked cargos as paid
    if (factura.cargos?.length) {
      await Cargo.updateMany(
        { _id: { $in: factura.cargos } },
        { $set: { estado: 'pagado', fechaPago: new Date() } }
      );
    }

    await factura.populate(populate);
    return res.json({ message: 'Factura aprobada exitosamente', factura });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const rechazarFactura = async (req, res) => {
  try {
    const factura = await Factura.findById(req.params.id);
    if (!factura) return res.status(404).json({ message: 'Factura no encontrada' });

    if (factura.estado === 'rechazado')
      return res.status(400).json({ message: 'La factura ya está rechazada' });

    factura.estado = 'rechazado';
    factura.aprobadoPor = null;
    factura.aprobadoEn = null;
    await factura.save();

    // Release reserved cargos so they can be linked to a new factura
    if (factura.cargos?.length) {
      await Cargo.updateMany(
        { _id: { $in: factura.cargos } },
        { $set: { factura: null } }
      );
    }

    await factura.populate(populate);
    return res.json({ message: 'Factura rechazada', factura });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const anularFactura = async (req, res) => {
  try {
    const factura = await Factura.findById(req.params.id);
    if (!factura) return res.status(404).json({ message: 'Factura no encontrada' });

    if (factura.anulado)
      return res.status(400).json({ message: 'La factura ya está anulada' });

    factura.anulado = true;
    factura.anuladoPor = req.user._id;
    factura.anuladoEn = new Date();
    await factura.save();

    // Revert cargos: restore vencido if past due, pendiente otherwise
    if (factura.cargos?.length) {
      await Cargo.updateMany(
        { _id: { $in: factura.cargos } },
        [
          {
            $set: {
              estado: {
                $cond: {
                  if: { $lt: ['$vencimiento', new Date()] },
                  then: 'vencido',
                  else: 'pendiente',
                },
              },
              factura: null,
              fechaPago: null,
            },
          },
        ]
      );
    }

    await factura.populate([
      ...populate,
      { path: 'anuladoPor', select: 'name email role' },
    ]);

    return res.json({ message: 'Factura anulada exitosamente', factura });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const exportarFacturas = async (req, res) => {
  const { desde, bloque, codigo } = req.query;

  if (!desde)
    return res.status(400).json({ message: 'El parámetro "desde" es obligatorio' });

  if (!bloque && !codigo)
    return res.status(400).json({ message: 'Debes enviar al menos "bloque" o "codigo" (ej: G12)' });

  const fechaDesde = new Date(desde);
  if (isNaN(fechaDesde.getTime()))
    return res.status(400).json({ message: 'La fecha "desde" no es válida. Usa formato YYYY-MM-DD' });

  try {
    const casaFilter = codigo
      ? { $expr: { $eq: [{ $concat: ['$bloque', '$numeroCasa'] }, codigo.toUpperCase()] } }
      : { bloque: { $regex: new RegExp(`^${bloque}$`, 'i') } };

    const casas = await Casa.find(casaFilter).select('_id');

    if (casas.length === 0)
      return res.status(404).json({ message: 'No se encontraron casas con los parámetros indicados' });

    const facturas = await Factura.find({
      casa: { $in: casas.map((c) => c._id) },
      fecha: { $gte: fechaDesde, $lte: new Date() },
    })
      .populate([
        { path: 'casa', select: 'bloque numeroCasa' },
        { path: 'creadoPor', select: 'name email' },
        { path: 'aprobadoPor', select: 'name email' },
        { path: 'anuladoPor', select: 'name email' },
      ])
      .sort({ fecha: -1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'qjmbe';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Facturas', {
      pageSetup: { fitToPage: true, orientation: 'landscape' },
    });

    sheet.columns = [
      { header: 'N° Recibo',      key: 'numeroRecibo',  width: 16 },
      { header: 'Fecha',          key: 'fecha',         width: 14 },
      { header: 'Casa',           key: 'casa',          width: 10 },
      { header: 'Descripción',    key: 'descripcion',   width: 30 },
      { header: 'Nombre Pagador', key: 'nombrePagador', width: 24 },
      { header: 'Método de Pago', key: 'metodoPago',    width: 16 },
      { header: 'Valor',          key: 'valor',         width: 14 },
      { header: 'Estado',         key: 'estado',        width: 14 },
      { header: 'Anulado',        key: 'anulado',       width: 10 },
      { header: 'Creado Por',     key: 'creadoPor',     width: 24 },
      { header: 'Aprobado Por',   key: 'aprobadoPor',   width: 24 },
      { header: 'Aprobado En',    key: 'aprobadoEn',    width: 20 },
      { header: 'Anulado Por',    key: 'anuladoPor',    width: 24 },
      { header: 'Anulado En',     key: 'anuladoEn',     width: 20 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;

    const fmt = (date) => date ? new Date(date).toLocaleDateString('es-CO') : '';

    facturas.forEach((f) => {
      const row = sheet.addRow({
        numeroRecibo:  f.numeroRecibo,
        fecha:         fmt(f.fecha),
        casa:          f.casa?.codigo ?? '',
        descripcion:   f.descripcion,
        nombrePagador: f.nombrePagador,
        metodoPago:    f.metodoPago,
        valor:         f.valor,
        estado:        f.estado,
        anulado:       f.anulado ? 'Sí' : 'No',
        creadoPor:     f.creadoPor?.name ?? '',
        aprobadoPor:   f.aprobadoPor?.name ?? '',
        aprobadoEn:    fmt(f.aprobadoEn),
        anuladoPor:    f.anuladoPor?.name ?? '',
        anuladoEn:     fmt(f.anuladoEn),
      });

      // Right-align valor column
      row.getCell('valor').alignment = { horizontal: 'right' };

      // Format valor as currency
      row.getCell('valor').numFmt = '"$"#,##0';
    });

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const fecha = new Date().toISOString().slice(0, 10);
    const filtro = codigo ? codigo.toUpperCase() : `bloque-${bloque}`;
    const filename = `facturas_${filtro}_desde_${desde}_al_${fecha}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const buscarFacturas = async (req, res) => {
  const { desde, bloque, codigo, page = 1, limit = 20 } = req.query;

  if (!desde)
    return res.status(400).json({ message: 'El parámetro "desde" es obligatorio' });

  if (!bloque && !codigo)
    return res.status(400).json({ message: 'Debes enviar al menos "bloque" o "codigo" (ej: G12)' });

  const fechaDesde = new Date(desde);
  if (isNaN(fechaDesde.getTime()))
    return res.status(400).json({ message: 'La fecha "desde" no es válida. Usa formato YYYY-MM-DD' });

  try {
    // Build casa filter — codigo takes priority over bloque when both are sent
    const casaFilter = codigo
      ? { $expr: { $eq: [{ $concat: ['$bloque', '$numeroCasa'] }, codigo.toUpperCase()] } }
      : { bloque: { $regex: new RegExp(`^${bloque}$`, 'i') } };

    const casas = await Casa.find(casaFilter).select('_id');

    if (casas.length === 0)
      return res.status(404).json({ message: 'No se encontraron casas con los parámetros indicados' });

    const casaIds = casas.map((c) => c._id);
    const skip = (Number(page) - 1) * Number(limit);

    const facturaFilter = {
      casa: { $in: casaIds },
      fecha: { $gte: fechaDesde, $lte: new Date() },
    };

    const [facturas, total] = await Promise.all([
      Factura.find(facturaFilter)
        .populate(populate)
        .sort({ fecha: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Factura.countDocuments(facturaFilter),
    ]);

    return res.json({
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      facturas,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Shared helper: resolves and creates cargos from specs for a given casa.
// Returns the list of cargo IDs or throws an error string via rejection.
const _resolverCargos = async (specs, casaId, fallbackFecha, adminUserId) => {
  const TIPOS_CON_PERIODO = ['administracion', 'parqueadero', 'mora'];
  const cargoIds = [];

  for (const spec of specs) {
    const { tipo, periodo, monto: montoSpec, descripcion: descSpec, vencimiento: vencSpec } = spec;

    if (TIPOS_CON_PERIODO.includes(tipo) && !periodo)
      throw new Error(`El tipo "${tipo}" requiere un campo periodo (YYYY-MM)`);

    if (periodo) {
      const existente = await Cargo.findOne({ casa: casaId, tipo, periodo });
      if (existente) {
        if (existente.estado === 'pagado')
          throw new Error(`El cargo de ${tipo} para ${periodo} ya está pagado`);
        if (existente.factura)
          throw new Error(`El cargo de ${tipo} para ${periodo} ya está reservado en otra factura`);
        cargoIds.push(existente._id);
        continue;
      }
    }

    let monto = montoSpec;
    let vencimiento = vencSpec ? new Date(vencSpec) : null;
    let tarifaId = null;

    if (TIPOS_CON_PERIODO.includes(tipo) && periodo) {
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
      throw new Error(
        `El cargo de tipo "${tipo}"${periodo ? ` (${periodo})` : ''} requiere un monto. No hay tarifa o no se especificó.`
      );

    if (!vencimiento) vencimiento = new Date(fallbackFecha);

    const nuevoCargo = await Cargo.create({
      casa: casaId,
      tipo,
      periodo: periodo || null,
      monto,
      vencimiento,
      descripcion: descSpec || null,
      creadoPor: adminUserId,
      tarifa: tarifaId,
    });

    cargoIds.push(nuevoCargo._id);
  }

  return cargoIds;
};

// Bulk import of already-approved facturas using cargo specs.
// Creates cargos on the fly (or reuses existing pending ones), marks everything
// as approved and paid immediately. Designed for loading historical data.
const registrarAprobadosLote = async (req, res) => {
  const { facturas } = req.body;

  if (!Array.isArray(facturas) || facturas.length === 0)
    return res.status(400).json({ message: 'Debes enviar un array de facturas en el campo "facturas"' });

  const procesadas = [];
  const omitidas = [];

  for (const item of facturas) {
    const { numeroRecibo, casa: casaId, fecha, nombrePagador, metodoPago, descripcion, valor, cargos: specs } = item;

    try {
      const duplicado = await Factura.findOne({ numeroRecibo });
      if (duplicado) {
        omitidas.push({ numeroRecibo, razon: 'Número de recibo duplicado' });
        continue;
      }

      const casa = await Casa.findById(casaId);
      if (!casa) {
        omitidas.push({ numeroRecibo, razon: 'Casa no encontrada' });
        continue;
      }

      if (!Array.isArray(specs) || specs.length === 0) {
        omitidas.push({ numeroRecibo, razon: 'Debes especificar al menos un cargo' });
        continue;
      }

      const cargoIds = await _resolverCargos(specs, casaId, fecha, req.user._id);

      const factura = await Factura.create({
        numeroRecibo,
        valor,
        fecha: new Date(fecha),
        casa: casaId,
        descripcion,
        nombrePagador,
        metodoPago,
        estado: 'aprobado',
        creadoPor: req.user._id,
        aprobadoPor: req.user._id,
        aprobadoEn: new Date(),
        cargos: cargoIds,
      });

      await Cargo.updateMany(
        { _id: { $in: cargoIds } },
        { $set: { estado: 'pagado', fechaPago: new Date(fecha), factura: factura._id } }
      );

      procesadas.push({ numeroRecibo, facturaId: factura._id, cargos: cargoIds.length });
    } catch (err) {
      omitidas.push({ numeroRecibo: numeroRecibo ?? 'N/A', razon: err.message });
    }
  }

  return res.status(207).json({
    message: `${procesadas.length} factura(s) registrada(s) y aprobadas, ${omitidas.length} omitida(s)`,
    procesadas: procesadas.length,
    omitidas: omitidas.length,
    detalle_omitidas: omitidas,
  });
};

// Registers historical paid invoices in bulk.
// Simulates the flow as if the facturas had been entered before definirTarifa ran:
//   1. Adjusts existing admin cargo monto to the provisional rate (valor - parking monto).
//   2. Creates the factura already approved with the historical date.
//   3. Marks linked cargos as pagado with the historical fechaPago.
//   4. Generates a retroactivo for the difference (definitiva - provisional) when applicable.
const registrarHistoricaLote = async (req, res) => {
  const { facturas } = req.body;

  if (!Array.isArray(facturas) || facturas.length === 0)
    return res.status(400).json({ message: 'Debes enviar un array de facturas en el campo "facturas"' });

  const procesadas = [];
  const omitidas = [];

  for (const item of facturas) {
    const { casa: casaId, periodo, valor, fecha, nombrePagador, metodoPago, numeroRecibo, descripcion } = item;

    try {
      // Duplicate receipt check
      const reciboDuplicado = await Factura.findOne({ numeroRecibo });
      if (reciboDuplicado) {
        omitidas.push({ numeroRecibo, razon: 'Número de recibo duplicado' });
        continue;
      }

      const casa = await Casa.findById(casaId);
      if (!casa) {
        omitidas.push({ numeroRecibo, razon: 'Casa no encontrada' });
        continue;
      }

      // Find all pending/overdue cargos for this casa + periodo not already linked
      const cargos = await Cargo.find({
        casa: casaId,
        periodo,
        estado: { $in: ['pendiente', 'vencido'] },
        factura: null,
      });

      const cargosPagados = await Cargo.find({ casa: casaId, periodo, estado: 'pagado' });
      if (cargosPagados.length > 0 && cargos.length === 0) {
        omitidas.push({ numeroRecibo, razon: `Los cargos del periodo ${periodo} ya están pagados` });
        continue;
      }

      let cargoIds = [];
      let retroactivoDiff = 0;
      let tarifaId = null;

      if (cargos.length > 0) {
        const adminCargo = cargos.find((c) => c.tipo === 'administracion');
        const parkingCargo = cargos.find((c) => c.tipo === 'parqueadero');

        if (adminCargo) {
          // adminCargo.monto is at definitiva rate (updated by definirTarifa)
          const definitivaAdmin = adminCargo.monto;
          const provisionalParking = parkingCargo?.monto ?? 0;
          const provisionalAdmin = valor - provisionalParking;

          retroactivoDiff = definitivaAdmin - provisionalAdmin;
          tarifaId = adminCargo.tarifa;

          adminCargo.monto = provisionalAdmin;
          await adminCargo.save();
        }

        cargoIds = cargos.map((c) => c._id);
      } else {
        // No cargos exist for this period — create a fresh admin cargo at the provisional rate
        const anio = parseInt(periodo.split('-')[0]);
        const mes = parseInt(periodo.split('-')[1]);
        const tarifa = await Tarifa.findOne({ anio });

        const nuevoCargo = await Cargo.create({
          casa: casaId,
          tipo: 'administracion',
          periodo,
          monto: valor,
          vencimiento: tarifa ? new Date(anio, mes - 1, tarifa.diasGracia) : new Date(fecha),
          descripcion,
          creadoPor: req.user._id,
          tarifa: tarifa?._id ?? null,
        });

        cargoIds = [nuevoCargo._id];
        tarifaId = tarifa?._id ?? null;
      }

      const factura = await Factura.create({
        numeroRecibo,
        valor,
        fecha: new Date(fecha),
        casa: casaId,
        descripcion,
        nombrePagador,
        metodoPago,
        estado: 'aprobado',
        creadoPor: req.user._id,
        aprobadoPor: req.user._id,
        aprobadoEn: new Date(),
        cargos: cargoIds,
      });

      await Cargo.updateMany(
        { _id: { $in: cargoIds } },
        { $set: { estado: 'pagado', fechaPago: new Date(fecha), factura: factura._id } }
      );

      if (retroactivoDiff > 0) {
        const existeRetroactivo = await Cargo.findOne({ casa: casaId, tipo: 'retroactivo', periodo });
        if (!existeRetroactivo) {
          const anio = periodo.split('-')[0];
          await Cargo.create({
            casa: casaId,
            tipo: 'retroactivo',
            periodo,
            monto: retroactivoDiff,
            vencimiento: new Date(),
            descripcion: `Retroactivo ${anio}: diferencia provisional→definitiva ${periodo}`,
            creadoPor: req.user._id,
            tarifa: tarifaId,
          });
        }
      }

      procesadas.push({ numeroRecibo, periodo, valor, retroactivo: retroactivoDiff > 0 ? retroactivoDiff : null });
    } catch (err) {
      omitidas.push({ numeroRecibo: numeroRecibo ?? 'N/A', razon: err.message });
    }
  }

  return res.status(207).json({
    message: `${procesadas.length} factura(s) registrada(s), ${omitidas.length} omitida(s)`,
    procesadas: procesadas.length,
    omitidas: omitidas.length,
    retroactivosGenerados: procesadas.filter((p) => p.retroactivo).length,
    detalle_omitidas: omitidas,
  });
};

module.exports = {
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
};

