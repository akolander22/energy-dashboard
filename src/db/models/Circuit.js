const mongoose = require('mongoose');

/**
 * One document per breaker/circuit.
 * Tracks when each breaker was monitored and its computed average draw.
 * This persists across CT clamp rotations — when you move a clamp to a
 * new breaker, the old breaker's average stays here.
 */
const CircuitSchema = new mongoose.Schema({
  // Emporia channel identifier — set automatically from the API
  channel_num: { type: String, required: true, unique: true },

  // Human-readable name (from Emporia app, editable)
  name: { type: String, required: true },

  // Breaker panel position (optional, for your reference)
  breaker_number: { type: Number, default: null },
  notes: { type: String, default: '' },

  // Monitoring window — null means currently being monitored
  monitored_from:  { type: Date, default: null },
  monitored_until: { type: Date, default: null },

  // Computed stats (updated by the collector on each run)
  avg_kw:     { type: Number, default: null }, // average draw while monitored
  max_kw:     { type: Number, default: null }, // peak observed
  reading_count: { type: Number, default: 0 }, // how many snapshots we have

  // Is this breaker currently being actively monitored?
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Circuit', CircuitSchema);
