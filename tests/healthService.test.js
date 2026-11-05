const mongoose = require('mongoose');
const { checkHealth } = require('../src/services/healthService');

test('disconnected databases fail readiness immediately', async () => {
  await expect(checkHealth()).rejects.toThrow('Database unavailable');
});
test('ping has both client and server deadlines and propagates failures', async () => {
  const connection = mongoose.connection;
  const state = connection.readyState;
  const originalDb = connection.db;
  const command = jest.fn().mockResolvedValue({ ok: 1 });
  try {
    connection.readyState = 1;
    connection.db = { command };
    await checkHealth(100);
    expect(command).toHaveBeenCalledWith({ ping: 1 }, { timeoutMS: 100, maxTimeMS: 100 });
    command.mockRejectedValue(new Error('timeout'));
    await expect(checkHealth(100)).rejects.toThrow('timeout');
  } finally { connection.readyState = state; connection.db = originalDb; }
});
