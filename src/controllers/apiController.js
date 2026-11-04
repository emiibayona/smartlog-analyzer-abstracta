function getApiRoot(req, res) {
  res.status(200).type('text/plain').send('OK');
}

module.exports = { getApiRoot };
