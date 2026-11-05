const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/apiRoutes');
const errorHandler = require('./middlewares/errorHandler');
const requestLogger = require('./middlewares/requestLogger');
const { corsOrigins } = require('./config/environment');

const app = express();
app.disable('x-powered-by');
const allowedOrigins = corsOrigins(process.env.CORS_ALLOWED_ORIGINS);
app.use(requestLogger);

app.use(cors({
  origin: (origin, callback) => {
    callback(null, Boolean(origin && allowedOrigins.includes(origin)));
  },
}));
app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

module.exports = app;
