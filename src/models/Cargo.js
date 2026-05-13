const mongoose = require('mongoose');

const TIPOS = ['administracion', 'mora', 'parqueadero', 'retroactivo', 'extraordinario'];
const ESTADOS = ['pendiente', 'pagado', 'vencido'];

const cargoSchema = new mongoose.Schema(
  {
    casa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Casa',
      required: true,
    },
    tipo: {
      type: String,
      enum: TIPOS,
      required: true,
    },
    periodo: {
      type: String, // "YYYY-MM" — null for one-time charges (extraordinario, retroactivo)
      trim: true,
      default: null,
    },
    monto: {
      type: Number,
      required: true,
      min: 0,
    },
    vencimiento: {
      type: Date,
      required: true,
    },
    estado: {
      type: String,
      enum: ESTADOS,
      default: 'pendiente',
    },
    // Set when a factura is created linking this cargo (before approval)
    factura: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Factura',
      default: null,
    },
    fechaPago: {
      type: Date,
      default: null,
    },
    descripcion: {
      type: String,
      trim: true,
      default: null,
    },
    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tarifa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tarifa',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cargo', cargoSchema);
