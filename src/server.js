const app = require('./app');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const server = app.listen(port, host, () => {
  console.log(`API listening on ${host}:${port}`);
});

server.on('error', (error) => {
  console.error('Unable to start API:', error);
  process.exit(1);
});
