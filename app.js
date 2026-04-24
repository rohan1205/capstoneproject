require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const flash = require('express-flash');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

const passport = require('passport');
require('./config/passport'); 
const authRoutes = require('./routes/auth');
const breachRoutes = require('./routes/breach');
const Prediction = require('./models/Prediction');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const ML_API_URL = (process.env.ML_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 5000);
const { ensureAuth } = authRoutes;

if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'fallback-secret')) {
  console.warn('SESSION_SECRET is not set to a secure value. Configure it before production.');
}
if (isProduction && !process.env.MONGODB_URI) {
  console.warn('MONGODB_URI is not set. Production deployments should provide a managed database URI.');
}

if (isProduction) {
  app.set('trust proxy', 1);
}

// ─────────────────────────────
// View Engine //
// ─────────────────────────────
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// ─────────────────────────────
// Middleware //
// ─────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 200 : 2000
}));

// ─────────────────────────────
// GitHub Webhook
// ─────────────────────────────
app.post('/github-webhook', (req, res) => {
console.log('GitHub webhook received');
console.log('Event:', req.headers['x-github-event']);
res.status(200).send('Webhook received successfully');
});

app.get('/github-webhook', (req, res) => {
res.send('Webhook endpoint is live');
});

// ─────────────────────────────
// Session Configuration
// ─────────────────────────────
app.use(session({
name: 'breachlens.sid',
secret: process.env.SESSION_SECRET || 'fallback-secret',
resave: false,
saveUninitialized: false,
store: MongoStore.create({
mongoUrl: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/loginpage',
collectionName: 'sessions',
ttl: 14 * 24 * 60 * 60
}),
cookie: {
httpOnly: true,
secure: isProduction,
sameSite: isProduction ? 'none' : 'lax',
maxAge: 1000 * 60 * 60 * 24
}
}));

// ─────────────────────────────
// Passport Authentication
// ─────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ─────────────────────────────
// Flash Messages
// ─────────────────────────────
app.use(flash());

// ─────────────────────────────
// Routes
// ─────────────────────────────

// Breach prediction APIs
app.use('/api', breachRoutes);

// Authentication routes
app.use('/', authRoutes);

// POST /predict — delegates to the breach router (new 6-feature ML schema)
// This is the endpoint the dashboard JS calls directly.
app.post('/predict', ensureAuth, async (req, res) => {
  const VALID = {
    industry:      ['healthcare','finance','technology','retail','government','education','manufacturing','energy','legal','hospitality'],
    attack_vector: ['phishing','malware','ransomware','insider_threat','sql_injection','credential_stuffing','ddos','supply_chain','zero_day','physical_breach'],
    data_type:     ['pii','financial','health','credentials','intellectual_property','government_classified','operational'],
    geography:     ['north_america','europe','asia_pacific','middle_east','latin_america','africa'],
  };

  try {
    const b = req.body || {};
    const industry             = String(b.industry || '').toLowerCase().trim();
    const attack_vector        = String(b.attack_vector || '').toLowerCase().trim();
    const data_type            = String(b.data_type || '').toLowerCase().trim();
    const geography            = String(b.geography || '').toLowerCase().trim();
    const records_affected     = Number(b.records_affected);
    const detection_time_hours = Number(b.detection_time_hours);

    const errors = [];
    if (!VALID.industry.includes(industry))      errors.push('Invalid industry.');
    if (!VALID.attack_vector.includes(attack_vector)) errors.push('Invalid attack_vector.');
    if (!VALID.data_type.includes(data_type))    errors.push('Invalid data_type.');
    if (!VALID.geography.includes(geography))    errors.push('Invalid geography.');
    if (!Number.isFinite(records_affected)  || records_affected < 1)     errors.push('records_affected must be a positive number.');
    if (!Number.isFinite(detection_time_hours) || detection_time_hours < 0) errors.push('detection_time_hours must be >= 0.');

    if (errors.length) {
      return res.status(400).json({ message: errors.join(' ') });
    }

    const payload = { industry, attack_vector, data_type, geography, records_affected, detection_time_hours };

    let mlData;
    try {
      const mlRes = await axios.post(`${ML_API_URL}/predict`, payload, {
        timeout: ML_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true,
      });
      if (mlRes.status < 200 || mlRes.status >= 300) {
        return res.status(502).json({ message: `ML service error: ${mlRes.data?.detail || mlRes.status}` });
      }
      mlData = mlRes.data;
    } catch (mlErr) {
      const msg = mlErr.code === 'ECONNREFUSED'
        ? 'ML service is offline. Please start the FastAPI server (python -m uvicorn api:app) in the /ml directory.'
        : mlErr.code === 'ECONNABORTED' ? 'ML service timed out.' : `ML service unavailable: ${mlErr.message}`;
      return res.status(503).json({ message: msg });
    }

    // Persist to MongoDB
    const Prediction = require('./models/Prediction');
    const doc = new Prediction({
      userId:               req.user._id,
      industry, attack_vector, data_type, geography, records_affected, detection_time_hours,
      severity:             mlData.severity,
      riskScore:            mlData.risk_score,
      financialImpact:      mlData.financial_impact,
      financialImpactFormatted: mlData.financial_impact_formatted,
      recommendations:      mlData.recommendations || [],
      modelVersion:         mlData.model_version || 'v2.0',
    });
    await doc.save();

    return res.json({
      _id:                        doc._id,
      severity:                   mlData.severity,
      riskScore:                  mlData.risk_score,
      financial_impact:           mlData.financial_impact,
      financial_impact_formatted: mlData.financial_impact_formatted,
      recommendations:            mlData.recommendations || [],
      model_version:              mlData.model_version,
      predicted_at:               mlData.predicted_at,
    });

  } catch (err) {
    console.error('[POST /predict]', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// ─────────────────────────────
// Health Check
// ─────────────────────────────
app.get('/health', (req, res) => {
res.status(200).json({ status: 'ok' });
});

// ─────────────────────────────
// Database + Server Start
// ─────────────────────────────
mongoose.connect(
process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/loginpage'
)
.then(() => {
console.log('MongoDB connected');

app.listen(PORT, () => {
console.log(`Server running on http://localhost:${PORT}`);
});

})
.catch(err => {
console.error('MongoDB connection error:', err.message);
process.exit(1);
});

module.exports = app;
