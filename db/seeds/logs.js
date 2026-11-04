const { createHash } = require('node:crypto');

const scenarios = {
  'inventory-service': [
    'Stock lookup completed for SKU-DEMO-001 in zone A',
    'Stock adjustment completed for SKU-DEMO-001: quantity 120',
    'Low stock detected for SKU-DEMO-002 in picking bin A-01',
    'Stock reservation failed: inventory lock timeout for SKU-DEMO-002',
    'Stock reservation failed: inventory lock timeout for SKU-DEMO-002',
    'Stock reservation recovered after retry for SKU-DEMO-002',
  ],
  'replenishment-service': [
    'Restock task created for SKU-DEMO-002 from bulk zone B to bin A-01',
    'Restock task completed for SKU-DEMO-003: moved 40 units',
    'Restock delayed for SKU-DEMO-002: destination bin capacity is low',
    'Restock failed for SKU-DEMO-002: inventory reservation timed out',
    'Restock failed for SKU-DEMO-002: inventory reservation timed out',
    'Restock completed after reservation retry for SKU-DEMO-002',
  ],
  'cycle-counting-service': [
    'Cycle count scheduled for zone A',
    'Cycle count matched expected quantity for SKU-DEMO-001',
    'Count discrepancy detected for SKU-DEMO-002: expected 20, counted 18',
    'Stock adjustment failed for SKU-DEMO-002: inventory lock timeout',
    'Stock adjustment failed for SKU-DEMO-002: inventory lock timeout',
    'Stock adjustment completed after retry for SKU-DEMO-002: quantity 18',
  ],
  'slotting-service': [
    'Product velocity analysis completed for zone A',
    'Slotting recommendation generated for fast-moving SKU-DEMO-001',
    'Slotting recommendation deferred: stale stock snapshot for zone A',
    'Slotting plan failed: inventory snapshot request timed out for zone A',
    'Slotting plan failed: inventory snapshot request timed out for zone A',
    'Slotting plan generated after inventory snapshot recovered for zone A',
  ],
};

const levels = ['info', 'info', 'warn', 'error', 'error', 'info'];

// Stable IDs and UTC times make reruns repeatable, including after process restarts.
module.exports = Object.entries(scenarios).flatMap(([microservice, messages], serviceIndex) =>
  messages.map((message, index) => ({
    _id: createHash('sha256').update(`smartlog-demo-v1:${microservice}:${index}`).digest('hex').slice(0, 24),
    microservice,
    date: new Date(Date.UTC(2026, 10, 4, 12, index * 5, serviceIndex)),
    level: levels[index],
    message,
  })),
);
