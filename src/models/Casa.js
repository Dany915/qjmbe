const mongoose = require('mongoose');

const casaSchema = new mongoose.Schema(
  {
    bloque: {
      type: String,
      required: true,
      trim: true,
    },
    numeroCasa: {
      type: String,
      required: true,
      trim: true,
    },
    propietario: {
      type: String,
      required: true,
      trim: true,
    },
    tipoDocumento: {
      type: String,
      required: true,
      trim: true,
    },
    numeroDocumento: {
      type: String,
      required: true,
      trim: true,
    },
    contactoPropietario: {
      type: String,
      trim: true,
      default: null,
    },
    correo: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    direccion: {
      type: String,
      trim: true,
      default: null,
    },
    activa: {
      type: Boolean,
      default: true,
    },
    parqueadero: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

casaSchema.virtual('codigo').get(function () {
  return `${this.bloque}${this.numeroCasa}`;
});

// A house is uniquely identified by its block + number
casaSchema.index({ bloque: 1, numeroCasa: 1 }, { unique: true });

module.exports = mongoose.model('Casa', casaSchema);
