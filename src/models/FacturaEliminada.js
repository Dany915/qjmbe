const mongoose = require('mongoose');

const facturaEliminadaSchema = new mongoose.Schema(
  {
    numeroRecibo: {
      type: String,
      required: true,
      trim: true,
    },
    fechaOriginal: {
      type: Date,
      required: true,
    },
    valorOriginal: {
      type: Number,
      required: true,
    },
    estadoOriginal: {
      type: String,
      required: true,
    },
    anulada: {
      type: Boolean,
      default: false,
    },
    casa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Casa',
      default: null,
    },
    descripcion: {
      type: String,
      default: null,
    },
    nombrePagador: {
      type: String,
      default: null,
    },
    eliminadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    eliminadoEn: {
      type: Date,
      required: true,
    },
    motivo: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: false }
);

module.exports = mongoose.model('FacturaEliminada', facturaEliminadaSchema);
