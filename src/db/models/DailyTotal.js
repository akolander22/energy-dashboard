const mongoose = require('mongoose');

/**
 * One document per day.
 * Stores whole-home consumption from each data source so we can
 * compare them and track drift over time.
 *
 * net = source_kwh - solar_kwh (what actually came from the grid)
 */
const DailyTotalSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // 'YYYY-MM-DD'

  // Raw totals from each source (kWh)
  xcel_kwh:    { type: Number, default: null },
  emporia_kwh: { type: Number, default: null },
  solar_kwh:   { type: Number, default: null }, // production

  // Net grid draw = source - solar
  xcel_net:    { type: Number, default: null },
  emporia_net: { type: Number, default: null },
  solar_net:   { type: Number, default: null }, // solar app's own usage - production

  // Which sources actually returned data vs. placeholder
  sources: {
    xcel:      { type: String, enum: ['live', 'placeholder', 'error'], default: 'placeholder' },
    emporia:   { type: String, enum: ['live', 'placeholder', 'error'], default: 'placeholder' },
    apsystems: { type: String, enum: ['live', 'placeholder', 'error'], default: 'placeholder' },
  },

  collected_at: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('DailyTotal', DailyTotalSchema);
