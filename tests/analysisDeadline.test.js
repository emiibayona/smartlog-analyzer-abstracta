const { EventEmitter } = require('node:events');
const { analysisDeadline } = require('../src/middlewares/analysisDeadline');

function setup({ destroyed = false, headersSent = false } = {}) {
  const req = Object.assign(new EventEmitter(), { app: { locals: { analysisHttpTimeoutMs: 100 } } });
  const res = Object.assign(new EventEmitter(), { destroyed, headersSent, writableFinished: false });
  res.status = jest.fn().mockReturnValue(res); res.json = jest.fn();
  analysisDeadline(req, res, jest.fn());
  return { req, res };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
test('client request abort cancels work and clears its response timer', () => {
  const { req, res } = setup();
  req.emit('aborted');
  expect(req.analysisSignal.reason.code).toBe('REQUEST_ABORTED');
  jest.advanceTimersByTime(200);
  expect(res.json).not.toHaveBeenCalled();
  res.emit('close');
});
test('a disconnected response aborts work; a finished response does not', () => {
  const disconnected = setup(); disconnected.res.emit('close');
  expect(disconnected.req.analysisSignal.aborted).toBe(true);
  const finished = setup(); finished.res.writableFinished = true; finished.res.emit('close');
  expect(finished.req.analysisSignal.aborted).toBe(false);
});
test.each([{ destroyed: true }, { headersSent: true }])('deadline cannot write to an unavailable response: %j', (options) => {
  const { req, res } = setup(options);
  jest.advanceTimersByTime(101);
  expect(req.analysisSignal.reason.code).toBe('REQUEST_TIMEOUT');
  expect(res.json).not.toHaveBeenCalled();
  res.emit('close');
});
