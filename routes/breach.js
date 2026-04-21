const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const Prediction = require('../models/Prediction');
const { ensureAuth } = require('./auth');

const ML_API_URL   = (process.env.ML_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const ML_TIMEOUT   = Number(process.env.ML_TIMEOUT_MS || 8000);

// All routes require a session
router.use(ensureAuth);

/* ──────────────────────────────────────────────────────────────────
   VALID VALUES (mirror ml/api.py)
────────────────────────────────────────────────────────────────── */
const VALID = {
  industry: ['healthcare','finance','technology','retail','government',
             'education','manufacturing','energy','legal','hospitality'],
  attack_vector: ['phishing','malware','ransomware','insider_threat',
                  'sql_injection','credential_stuffing','ddos',
                  'supply_chain','zero_day','physical_breach'],
  data_type: ['pii','financial','health','credentials',
              'intellectual_property','government_classified','operational'],
  geography: ['north_america','europe','asia_pacific',
              'middle_east','latin_america','africa'],
};

/* ──────────────────────────────────────────────────────────────────
   VALIDATE & SANITIZE incoming body → new 6-feature ML payload
────────────────────────────────────────────────────────────────── */
function buildPayload(body) {
  const errors = [];

  const industry             = String(body.industry || '').toLowerCase().trim();
  const attack_vector        = String(body.attack_vector || '').toLowerCase().trim();
  const data_type            = String(body.data_type || '').toLowerCase().trim();
  const geography            = String(body.geography || '').toLowerCase().trim();
  const records_affected     = Number(body.records_affected);
  const detection_time_hours = Number(body.detection_time_hours);

  if (!VALID.industry.includes(industry))
    errors.push(`Invalid industry: "${industry}". Choose from: ${VALID.industry.join(', ')}`);
  if (!VALID.attack_vector.includes(attack_vector))
    errors.push(`Invalid attack_vector: "${attack_vector}".`);
  if (!VALID.data_type.includes(data_type))
    errors.push(`Invalid data_type: "${data_type}".`);
  if (!VALID.geography.includes(geography))
    errors.push(`Invalid geography: "${geography}".`);
  if (!Number.isFinite(records_affected) || records_affected < 1)
    errors.push('records_affected must be a positive integer.');
  if (!Number.isFinite(detection_time_hours) || detection_time_hours < 0)
    errors.push('detection_time_hours must be >= 0.');

  if (errors.length) return { errors };

  return {
    payload: { industry, attack_vector, data_type, geography, records_affected, detection_time_hours }
  };
}

/* ──────────────────────────────────────────────────────────────────
   CALL ML MICROSERVICE
────────────────────────────────────────────────────────────────── */
async function callMlService(payload) {
  try {
    const response = await axios.post(`${ML_API_URL}/predict`, payload, {
      timeout: ML_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,          // handle HTTP errors ourselves
    });

    if (response.status < 200 || response.status >= 300) {
      const detail = response.data?.detail || `Status ${response.status}`;
      return { error: `ML service error: ${detail}`, status: 502 };
    }

    return { data: response.data };
  } catch (err) {
    if (err.code === 'ECONNABORTED') return { error: 'ML service timed out.', status: 504 };
    if (err.code === 'ECONNREFUSED') return { error: 'ML service is offline. Please start the FastAPI server.', status: 503 };
    return { error: `ML service unavailable: ${err.message}`, status: 503 };
  }
}

/* ──────────────────────────────────────────────────────────────────
   POST /predict
────────────────────────────────────────────────────────────────── */
router.post('/predict', async (req, res) => {
  try {
    // 1. Validate
    const { payload, errors } = buildPayload(req.body || {});
    if (errors) {
      return res.status(400).json({ message: errors.join(' '), errors });
    }

    // 2. Call ML
    const mlResult = await callMlService(payload);
    if (mlResult.error) {
      return res.status(mlResult.status || 502).json({ message: mlResult.error });
    }

    const r = mlResult.data;

    // 3. Persist
    const doc = new Prediction({
      userId:               req.user._id,
      industry:             payload.industry,
      attack_vector:        payload.attack_vector,
      data_type:            payload.data_type,
      geography:            payload.geography,
      records_affected:     payload.records_affected,
      detection_time_hours: payload.detection_time_hours,
      severity:             r.severity,
      riskScore:            r.risk_score,
      financialImpact:      r.financial_impact,
      financialImpactFormatted: r.financial_impact_formatted,
      recommendations:      r.recommendations || [],
      modelVersion:         r.model_version || 'v2.0',
    });
    await doc.save();

    // 4. Respond — pass through everything from FastAPI plus our DB id
    return res.json({
      _id:                       doc._id,
      severity:                  r.severity,
      riskScore:                 r.risk_score,
      financial_impact:          r.financial_impact,
      financial_impact_formatted:r.financial_impact_formatted,
      recommendations:           r.recommendations || [],
      model_version:             r.model_version,
      predicted_at:              r.predicted_at,
    });

  } catch (err) {
    console.error('[POST /predict]', err);
    return res.status(500).json({ message: 'Internal server error during prediction.' });
  }
});

/* ──────────────────────────────────────────────────────────────────
   GET /history
────────────────────────────────────────────────────────────────── */
router.get('/history', async (req, res) => {
  try {
    const docs = await Prediction
      .find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json(docs.map(d => ({
      _id:                       d._id,
      industry:                  d.industry,
      attack_vector:             d.attack_vector,
      data_type:                 d.data_type,
      geography:                 d.geography,
      records_affected:          d.records_affected,
      detection_time_hours:      d.detection_time_hours,
      severity:                  d.severity,
      riskScore:                 d.riskScore,
      financialImpact:           d.financialImpact,
      financialImpactFormatted:  d.financialImpactFormatted,
      recommendations:           d.recommendations,
      modelVersion:              d.modelVersion,
      createdAt:                 d.createdAt,
    })));

  } catch (err) {
    console.error('[GET /history]', err);
    return res.status(500).json({ message: 'Failed to fetch history.' });
  }
});

/* ──────────────────────────────────────────────────────────────────
   DELETE /history/clear
────────────────────────────────────────────────────────────────── */
router.delete('/history/clear', async (req, res) => {
  try {
    const result = await Prediction.deleteMany({ userId: req.user._id });
    return res.json({ message: `Deleted ${result.deletedCount} prediction(s) successfully.` });
  } catch (err) {
    console.error('[DELETE /history/clear]', err);
    return res.status(500).json({ message: 'Failed to clear history.' });
  }
});

module.exports = router;