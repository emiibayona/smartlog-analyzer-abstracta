// Only allow operational identifiers; raw errors, URLs, headers and payloads may contain secrets.
function errorDetails(error) {
  const safeToken = (value) => typeof value === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(value) ? value : undefined;
  return { name: safeToken(error?.name), code: typeof error?.code === 'number' ? error.code : safeToken(error?.code), causeName: safeToken(error?.cause?.name), causeCode: safeToken(error?.cause?.code) };
}

function log(level, event, fields = {}) {
  const entry = { time: new Date().toISOString(), level, event, ...fields };
  const output = level === 'error' ? console.error : console.log;
  output(JSON.stringify(entry));
}

module.exports = { log, errorDetails };
