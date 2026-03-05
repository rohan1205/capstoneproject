const express = require('express');
const router = express.Router();
const Breach = require('../models/Breach');

// Fix for node-fetch with CommonJS
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));


// POST /api/predict
router.post('/predict', async (req, res) => {

  try {

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { industry, recordsAffected, attackVector, detectionTime } = req.body;

    // Call Python ML API
    const response = await fetch("http://127.0.0.1:8000/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        recordsAffected: Number(recordsAffected)
      })
    });

    const result = await response.json();

    const severity = result.severity;
    const riskScore = result.riskScore;
    const financialImpact = result.financialImpact;

    // Save prediction for current user
    const breach = new Breach({
      industry,
      recordsAffected,
      attackVector,
      detectionTime,
      severity,
      riskScore,
      financialImpact,
      user: req.user._id
    });

    await breach.save();

    res.json({
      severity,
      riskScore,
      financialImpact
    });

  } catch (error) {

    console.error("Prediction Error:", error);

    res.status(500).json({
      message: "Prediction failed"
    });

  }

});


// GET /api/history
router.get('/history', async (req, res) => {

  try {

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const breaches = await Breach
      .find({ user: req.user._id })   // ✅ only this user's breaches
      .sort({ createdAt: -1 })
      .limit(20);

    res.json(breaches);

  } catch (error) {

    console.error("History Error:", error);

    res.status(500).json({
      message: "Failed to fetch history"
    });

  }

});

module.exports = router;