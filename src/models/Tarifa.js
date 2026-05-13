const mongoose = require('mongoose');

const tarifaSchema = new mongoose.Schema(
  {
    anio: {
      type: Number,
      required: true,
      unique: true,
    },
    cuotaAdministracion: {
      type: Number,
      required: true,
      min: 0,
    },
    multaMora: {
      type: Number,
      required: true,
      min: 0,
    },
    diasGracia: {
      type: Number,
      required: true,
      default: 10,
      min: 1,
    },
    parqueadero: {
      type: Number,
      required: true,
      min: 0,
    },
    estado: {
      type: String,
      enum: ['provisional', 'definitiva'],
      default: 'provisional',
    },
    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    definidaPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    definidaEn: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tarifa', tarifaSchema);
