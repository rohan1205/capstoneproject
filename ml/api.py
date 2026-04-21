"""
api.py — BreachLens ML Prediction API
======================================
FastAPI microservice exposing:
  POST /predict      — Breach severity + financial impact + recommendations
  GET  /health       — Service health + model version
  GET  /model-info   — Accuracy metrics, feature importances

Start with:
  uvicorn api:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import sys
import json
import joblib
import logging
import numpy as np
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator

# ─────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("breachlens.api")

# ─────────────────────────────────────────────
# Path Resolution
# ─────────────────────────────────────────────
ML_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ML_DIR)

CLASSIFIER_PATH = os.path.join(ML_DIR, "breach_classifier.pkl")
REGRESSOR_PATH  = os.path.join(ML_DIR, "breach_regressor.pkl")
ENCODERS_PATH   = os.path.join(ML_DIR, "breach_encoders.pkl")
METADATA_PATH   = os.path.join(ML_DIR, "model_metadata.json")

# ─────────────────────────────────────────────
# Load Models at Startup
# ─────────────────────────────────────────────
def load_model_artifacts():
    """Load all model artifacts; raise descriptive errors if missing."""
    missing = [p for p in [CLASSIFIER_PATH, REGRESSOR_PATH, ENCODERS_PATH] if not os.path.exists(p)]
    if missing:
        raise FileNotFoundError(
            f"Model artifacts not found: {missing}\n"
            "Run `python train_model.py` first."
        )
    clf      = joblib.load(CLASSIFIER_PATH)
    reg      = joblib.load(REGRESSOR_PATH)
    encoders = joblib.load(ENCODERS_PATH)
    metadata = {}
    if os.path.exists(METADATA_PATH):
        with open(METADATA_PATH, "r") as f:
            metadata = json.load(f)
    logger.info("✅ Model artifacts loaded (version=%s)", metadata.get("version", "unknown"))
    return clf, reg, encoders, metadata


try:
    clf, reg, encoders, model_metadata = load_model_artifacts()
    MODELS_LOADED = True
except FileNotFoundError as e:
    logger.warning("⚠️  %s\nStarting API in degraded mode.", str(e))
    clf = reg = encoders = None
    model_metadata = {}
    MODELS_LOADED = False

# ─────────────────────────────────────────────
# Feature Config (must match train_model.py)
# ─────────────────────────────────────────────
CATEGORICAL_FEATURES = ["industry", "attack_vector", "data_type", "geography"]
NUMERIC_FEATURES     = ["records_affected", "detection_time_hours"]
ALL_FEATURES         = NUMERIC_FEATURES + CATEGORICAL_FEATURES

SEVERITY_CLASSES = ["Low", "Medium", "High", "Critical"]

VALID_INDUSTRIES = [
    "healthcare", "finance", "technology", "retail",
    "government", "education", "manufacturing", "energy",
    "legal", "hospitality",
]
VALID_ATTACK_VECTORS = [
    "phishing", "malware", "ransomware", "insider_threat",
    "sql_injection", "credential_stuffing", "ddos",
    "supply_chain", "zero_day", "physical_breach",
]
VALID_DATA_TYPES = [
    "pii", "financial", "health", "credentials",
    "intellectual_property", "government_classified", "operational",
]
VALID_GEOGRAPHIES = [
    "north_america", "europe", "asia_pacific",
    "middle_east", "latin_america", "africa",
]

# ─────────────────────────────────────────────
# Risk Score Mapping
# ─────────────────────────────────────────────
SEVERITY_RISK_BASE = {
    "Low":      15,
    "Medium":   45,
    "High":     75,
    "Critical": 95,
}

# ─────────────────────────────────────────────
# Response Recommendations Engine
# ─────────────────────────────────────────────
RECOMMENDATIONS = {
    "Low": [
        "🔍 Monitor affected systems for unusual activity for 30 days.",
        "📧 Notify affected users via secure email within 72 hours.",
        "🔐 Force password resets for potentially exposed accounts.",
        "📋 File an internal incident report and document the root cause.",
        "🛡️ Review and tighten access controls on affected data stores.",
    ],
    "Medium": [
        "🚨 Activate your Incident Response Team immediately.",
        "🔒 Isolate affected systems from the network within 1 hour.",
        "📣 Notify impacted users and regulatory bodies within 48 hours.",
        "🔑 Rotate all API keys, tokens, and passwords system-wide.",
        "💾 Preserve logs and forensic evidence before remediation.",
        "🛡️ Deploy enhanced intrusion detection on related segments.",
        "⚖️ Engage legal counsel to evaluate compliance obligations.",
    ],
    "High": [
        "🚨 IMMEDIATE: Declare a security incident and page leadership.",
        "🔌 Disconnect all affected systems from production networks NOW.",
        "🏛️ Notify regulatory bodies (GDPR DPA / HIPAA OCR / FTC) within 72 hours.",
        "📞 Engage a third-party forensics firm within 24 hours.",
        "💰 Activate cyber-insurance policy — document all losses.",
        "📰 Prepare a public-facing breach notification statement.",
        "🔄 Initiate full credential rotation and MFA enforcement.",
        "🕵️ Conduct a root-cause analysis with timeline reconstruction.",
        "🔐 Deploy network segmentation upgrades post-remediation.",
    ],
    "Critical": [
        "🚨 CRITICAL: Execute your full Business Continuity Plan NOW.",
        "📵 Take affected systems OFFLINE immediately — accept downtime.",
        "🏛️ Mandatory regulatory notification: GDPR (72h), HIPAA (60d), SEC (4 days).",
        "⚖️ Retain specialized breach response legal counsel immediately.",
        "🕵️ Engage Tier-1 forensics firm for evidence preservation & attribution.",
        "💰 Notify cyber-insurance carrier and document financial exposure.",
        "📰 Issue public breach disclosure — proactively manage media.",
        "🏦 Consider credit monitoring / identity theft protection for affected users.",
        "🔄 Complete infrastructure rebuild from verified clean backups.",
        "🛡️ Commission a full third-party security audit post-incident.",
        "📊 Board-level briefing required within 24 hours.",
    ],
}


def compute_risk_score(
    severity: str,
    records_affected: int,
    detection_time_hours: float,
    attack_vector: str,
) -> int:
    """
    Compute a 0-100 risk score from base severity + modifiers.
    """
    base = SEVERITY_RISK_BASE.get(severity, 50)

    # Records modifier (±10)
    if records_affected > 5_000_000:
        rec_mod = 10
    elif records_affected > 1_000_000:
        rec_mod = 6
    elif records_affected > 100_000:
        rec_mod = 2
    else:
        rec_mod = -5

    # Detection time modifier (longer undetected = worse)
    if detection_time_hours > 720:      # >30d
        det_mod = 8
    elif detection_time_hours > 168:    # >1w
        det_mod = 4
    elif detection_time_hours < 1:      # <1h (caught fast)
        det_mod = -8
    else:
        det_mod = 0

    # Attack vector modifier
    high_risk_attacks = {"ransomware", "supply_chain", "zero_day"}
    low_risk_attacks  = {"ddos", "physical_breach"}
    if attack_vector in high_risk_attacks:
        atk_mod = 5
    elif attack_vector in low_risk_attacks:
        atk_mod = -3
    else:
        atk_mod = 0

    score = base + rec_mod + det_mod + atk_mod
    return max(1, min(100, score))


# ─────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────
class BreachInput(BaseModel):
    records_affected: int = Field(
        ..., ge=1, le=100_000_000,
        description="Number of records exposed in the breach",
    )
    industry: str = Field(
        ..., description=f"Industry sector. One of: {VALID_INDUSTRIES}",
    )
    attack_vector: str = Field(
        ..., description=f"Attack method. One of: {VALID_ATTACK_VECTORS}",
    )
    data_type: str = Field(
        ..., description=f"Type of data compromised. One of: {VALID_DATA_TYPES}",
    )
    detection_time_hours: float = Field(
        ..., ge=0.0, le=8760.0,
        description="Hours from breach start to detection (0.5–8760)",
    )
    geography: str = Field(
        ..., description=f"Region of the breach. One of: {VALID_GEOGRAPHIES}",
    )

    @validator("industry")
    def validate_industry(cls, v):
        v = v.lower().strip()
        if v not in VALID_INDUSTRIES:
            raise ValueError(f"industry must be one of: {VALID_INDUSTRIES}")
        return v

    @validator("attack_vector")
    def validate_attack_vector(cls, v):
        v = v.lower().strip().replace(" ", "_")
        if v not in VALID_ATTACK_VECTORS:
            raise ValueError(f"attack_vector must be one of: {VALID_ATTACK_VECTORS}")
        return v

    @validator("data_type")
    def validate_data_type(cls, v):
        v = v.lower().strip().replace(" ", "_")
        if v not in VALID_DATA_TYPES:
            raise ValueError(f"data_type must be one of: {VALID_DATA_TYPES}")
        return v

    @validator("geography")
    def validate_geography(cls, v):
        v = v.lower().strip().replace(" ", "_")
        if v not in VALID_GEOGRAPHIES:
            raise ValueError(f"geography must be one of: {VALID_GEOGRAPHIES}")
        return v


class PredictionResponse(BaseModel):
    severity: Literal["Low", "Medium", "High", "Critical"]
    risk_score: int = Field(..., ge=0, le=100)
    financial_impact: float = Field(..., description="Estimated financial impact in USD")
    financial_impact_formatted: str = Field(..., description="Human-readable USD amount")
    recommendations: list[str]
    model_version: str
    predicted_at: str


# ─────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────
app = FastAPI(
    title="BreachLens ML API",
    description="AI-powered data breach severity prediction microservice",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Allow requests from React dev server and Node.js backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # Node.js backend
        "http://localhost:5173",   # Vite React dev server
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# Error Handlers
# ─────────────────────────────────────────────
@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error in request to %s", request.url)
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────
@app.get("/health", summary="Health Check")
def health_check():
    """Returns service status, model version, and load status."""
    return {
        "status":        "ok" if MODELS_LOADED else "degraded",
        "models_loaded": MODELS_LOADED,
        "model_version": model_metadata.get("version", "unknown"),
        "trained_at":    model_metadata.get("trained_at", "unknown"),
        "api_version":   "2.0.0",
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    }


@app.get("/model-info", summary="Model Metadata & Accuracy Metrics")
def model_info():
    """Returns training metadata, accuracy metrics, and feature importances."""
    if not MODELS_LOADED:
        raise HTTPException(
            status_code=503,
            detail="Models not loaded. Run python train_model.py first.",
        )
    return {
        "version":          model_metadata.get("version"),
        "trained_at":       model_metadata.get("trained_at"),
        "dataset_size":     model_metadata.get("dataset_size"),
        "features":         model_metadata.get("features"),
        "severity_classes": model_metadata.get("severity_classes"),
        "classifier": {
            "algorithm":           model_metadata.get("classifier", {}).get("algorithm"),
            "test_accuracy":       model_metadata.get("classifier", {}).get("test_accuracy"),
            "cv_accuracy":         model_metadata.get("classifier", {}).get("cv_accuracy"),
            "feature_importances": model_metadata.get("classifier", {}).get("feature_importances"),
        },
        "regressor": {
            "algorithm":   model_metadata.get("regressor", {}).get("algorithm"),
            "test_mae_usd":model_metadata.get("regressor", {}).get("test_mae_usd"),
            "test_r2":     model_metadata.get("regressor", {}).get("test_r2"),
        },
    }


@app.post("/predict", response_model=PredictionResponse, summary="Predict Breach Severity")
def predict(data: BreachInput):
    """
    Accepts breach parameters and returns:
    - severity_label (Low / Medium / High / Critical)
    - risk_score (0–100)
    - financial_impact (USD)
    - recommended_response_actions[]
    """
    if not MODELS_LOADED:
        raise HTTPException(
            status_code=503,
            detail="ML models not available. Run python train_model.py first.",
        )

    try:
        # ── Encode categorical features ──
        encoded = {}
        for col in CATEGORICAL_FEATURES:
            le = encoders[col]
            val = getattr(data, col)
            try:
                encoded[col] = int(le.transform([val])[0])
            except ValueError:
                # Unseen label — use closest known class
                logger.warning("Unseen label '%s' for feature '%s'; using 0", val, col)
                encoded[col] = 0

        # ── Assemble feature vector (as DataFrame for sklearn feature-name compatibility) ──
        import pandas as _pd
        feature_vector = _pd.DataFrame([[
            float(data.records_affected),
            float(data.detection_time_hours),
            encoded["industry"],
            encoded["attack_vector"],
            encoded["data_type"],
            encoded["geography"],
        ]], columns=ALL_FEATURES)

        # ── Classify severity ──
        severity_encoded = clf.predict(feature_vector)[0]
        le_sev = encoders["severity_label"]
        severity: str = le_sev.inverse_transform([severity_encoded])[0]

        # ── Predict financial impact (log-scale model, inverse transform) ──
        log_impact = reg.predict(feature_vector)[0]
        financial_impact = float(np.expm1(log_impact))
        financial_impact = max(1000.0, round(financial_impact, 2))

        # ── Compute risk score ──
        risk_score = compute_risk_score(
            severity,
            data.records_affected,
            data.detection_time_hours,
            data.attack_vector,
        )

        # ── Format financial impact ──
        if financial_impact >= 1_000_000_000:
            fmt = f"${financial_impact / 1_000_000_000:.2f}B"
        elif financial_impact >= 1_000_000:
            fmt = f"${financial_impact / 1_000_000:.2f}M"
        elif financial_impact >= 1_000:
            fmt = f"${financial_impact / 1_000:.1f}K"
        else:
            fmt = f"${financial_impact:.0f}"

        # ── Response recommendations ──
        recommendations = RECOMMENDATIONS.get(severity, RECOMMENDATIONS["Medium"])

        logger.info(
            "Prediction: industry=%s attack=%s records=%d → %s (risk=%d, $%.0f)",
            data.industry, data.attack_vector, data.records_affected,
            severity, risk_score, financial_impact,
        )

        return PredictionResponse(
            severity=severity,
            risk_score=risk_score,
            financial_impact=financial_impact,
            financial_impact_formatted=fmt,
            recommendations=recommendations,
            model_version=model_metadata.get("version", "v2.0"),
            predicted_at=datetime.now(timezone.utc).isoformat(),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Prediction failed: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")