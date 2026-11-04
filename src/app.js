const express = require('express');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
app.disable('x-powered-by');
app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
