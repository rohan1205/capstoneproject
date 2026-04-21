const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    // ── New 6-feature ML schema ──────────────────────────────────
    industry:              { type: String, required: true },
    attack_vector:         { type: String, required: true },
    data_type:             { type: String, required: true },
    geography:             { type: String, required: true },
    records_affected:      { type: Number, required: true },
    detection_time_hours:  { type: Number, required: true },

    // ── ML outputs ───────────────────────────────────────────────
    severity:              { type: String, default: '' },
    riskScore:             { type: Number, default: 0 },
    financialImpact:       { type: Number, default: 0 },
    financialImpactFormatted: { type: String, default: '' },
    recommendations:       { type: [String], default: [] },
    modelVersion:          { type: String, default: 'v2.0' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Prediction', predictionSchema);
