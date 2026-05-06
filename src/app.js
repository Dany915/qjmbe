const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const casaRoutes = require('./routes/casa.routes');
const facturaRoutes = require('./routes/factura.routes');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/casas', casaRoutes);
app.use('/api/facturas', facturaRoutes);

app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;
