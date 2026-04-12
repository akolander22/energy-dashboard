const mongoose = require('mongoose');

/**
 * One document per breaker per snapshot.
 * Written every 5 minutes by the circuit collector.
 * This is the raw time-series data used to compute averages.
 */
const CircuitReadingSchema = new mongoose.Schema({
  timestamp:   { type: Date, required: true, index: true },
  channel_num: { type: String, required: true, index: true },
  name:        { type: String, required: true },
  kw:          { type: Number, required: true },
  is_main:     { type: Boolean, default: false }, // true = whole-home total channel
}, { timestamps: true });

// Compound index for efficient per-circuit time-range queries
CircuitReadingSchema.index({ channel_num: 1, timestamp: -1 });

// TTL — auto-delete raw readings older than 90 days to keep Mongo lean
// Averages are preserved in the Circuit model
CircuitReadingSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('CircuitReading', CircuitReadingSchema);
