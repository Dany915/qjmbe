const mongoose = require('mongoose');

const ESTADOS = ['por_aprobar', 'aprobado', 'rechazado'];
const METODOS_PAGO = ['efectivo', 'digital'];

const facturaSchema = new mongoose.Schema(
  {
    numeroRecibo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    valor: {
      type: Number,
      required: true,
      min: 0,
    },
    fecha: {
      type: Date,
      required: true,
    },
    casa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Casa',
      default: null,
    },
    descripcion: {
      type: String,
      required: true,
      trim: true,
    },
    nombrePagador: {
      type: String,
      required: true,
      trim: true,
    },
    metodoPago: {
      type: String,
      enum: METODOS_PAGO,
      required: true,
    },
    estado: {
      type: String,
      enum: ESTADOS,
      default: 'por_aprobar',
    },
    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    aprobadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    aprobadoEn: {
      type: Date,
      default: null,
    },
    cargos: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cargo',
      },
    ],
    anulado: {
      type: Boolean,
      default: false,
    },
    anuladoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    anuladoEn: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Factura', facturaSchema);
