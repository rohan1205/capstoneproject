"""
train_model.py — BreachLens Model Training Pipeline
=====================================================
Trains two models on the synthetic breach dataset:
  1. Random Forest Classifier  → severity_label (Low/Medium/High/Critical)
  2. Gradient Boosting Regressor → financial_impact (USD)

Outputs (saved in ml/):
  - breach_classifier.pkl      — RF Classifier
  - breach_regressor.pkl       — GB Regressor
  - breach_encoders.pkl        — dict of LabelEncoders keyed by column name
  - model_metadata.json        — version, accuracy, trained_at, feature_importances
"""

import os
import sys
import io
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timezone

# Force UTF-8 stdout on Windows to support Unicode output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    mean_absolute_error,
    r2_score,
)

# ─────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────
ML_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(ML_DIR, "Data", "breach_dataset.csv")
CLASSIFIER_PATH = os.path.join(ML_DIR, "breach_classifier.pkl")
REGRESSOR_PATH = os.path.join(ML_DIR, "breach_regressor.pkl")
ENCODERS_PATH = os.path.join(ML_DIR, "breach_encoders.pkl")
METADATA_PATH = os.path.join(ML_DIR, "model_metadata.json")

# ─────────────────────────────────────────────
# Feature config
# ─────────────────────────────────────────────
CATEGORICAL_FEATURES = ["industry", "attack_vector", "data_type", "geography"]
NUMERIC_FEATURES = ["records_affected", "detection_time_hours"]
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
TARGET_CLASS = "severity_label"
TARGET_REG = "financial_impact"

SEVERITY_ORDER = ["Low", "Medium", "High", "Critical"]


def load_dataset() -> pd.DataFrame:
    """Load CSV; auto-generate if missing."""
    if not os.path.exists(DATA_PATH):
        print("⚠️  Dataset not found — generating now...")
        import generate_dataset  # noqa: F401 — runs generation as side-effect
        generate_dataset.generate_dataset(5000).to_csv(DATA_PATH, index=False)
        print(f"   Dataset generated at {DATA_PATH}")
    return pd.read_csv(DATA_PATH)


def encode_features(df: pd.DataFrame):
    """
    Encode all categorical columns with LabelEncoder.
    Returns: encoded DataFrame, encoders dict
    """
    encoders = {}
    df_enc = df.copy()
    for col in CATEGORICAL_FEATURES:
        le = LabelEncoder()
        df_enc[col] = le.fit_transform(df_enc[col].astype(str).str.lower().str.strip())
        encoders[col] = le

    # Encode target label
    le_sev = LabelEncoder()
    le_sev.fit(SEVERITY_ORDER)  # force canonical order
    df_enc[TARGET_CLASS] = le_sev.transform(df_enc[TARGET_CLASS])
    encoders[TARGET_CLASS] = le_sev

    return df_enc, encoders


def train_classifier(X_train, y_train, X_test, y_test, encoders):
    """Train Random Forest Classifier for severity."""
    print("\n🌲 Training Random Forest Classifier (severity)...")
    clf = RandomForestClassifier(
        n_estimators=300,
        max_depth=None,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    le_sev = encoders[TARGET_CLASS]
    labels = le_sev.inverse_transform(sorted(np.unique(y_test)))

    accuracy = (y_pred == y_test).mean()
    print(f"   Test Accuracy : {accuracy:.4f} ({accuracy*100:.2f}%)")
    print("\n   Classification Report:")
    print(classification_report(y_test, y_pred, target_names=le_sev.classes_))
    print("   Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    # Cross-validation
    cv_scores = cross_val_score(clf, X_train, y_train, cv=5, scoring="accuracy")
    print(f"\n   5-Fold CV Accuracy: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # Feature importances
    importances = dict(zip(ALL_FEATURES, clf.feature_importances_.tolist()))
    sorted_imp = dict(sorted(importances.items(), key=lambda x: x[1], reverse=True))
    print("\n   Feature Importances:")
    for feat, imp in sorted_imp.items():
        bar = "█" * int(imp * 50)
        print(f"   {feat:25s} {bar} {imp:.4f}")

    return clf, accuracy, cv_scores.mean(), sorted_imp


def train_regressor(X_train, y_train_reg, X_test, y_test_reg):
    """Train Gradient Boosting Regressor for financial impact."""
    print("\n📈 Training Gradient Boosting Regressor (financial impact)...")

    # Log-transform target (skewed distribution)
    y_train_log = np.log1p(y_train_reg)
    y_test_log = np.log1p(y_test_reg)

    reg = GradientBoostingRegressor(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.85,
        random_state=42,
    )
    reg.fit(X_train, y_train_log)

    y_pred_log = reg.predict(X_test)
    y_pred = np.expm1(y_pred_log)  # inverse log transform
    y_actual = y_test_reg.values

    mae = mean_absolute_error(y_actual, y_pred)
    r2 = r2_score(y_actual, y_pred)
    print(f"   Test MAE  : ${mae:,.0f}")
    print(f"   Test R²   : {r2:.4f}")

    return reg, mae, r2


def save_artifacts(clf, reg, encoders, metadata: dict):
    """Persist all model artifacts to disk."""
    joblib.dump(clf, CLASSIFIER_PATH)
    joblib.dump(reg, REGRESSOR_PATH)
    joblib.dump(encoders, ENCODERS_PATH)
    with open(METADATA_PATH, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"\n✅ Artifacts saved:")
    print(f"   {CLASSIFIER_PATH}")
    print(f"   {REGRESSOR_PATH}")
    print(f"   {ENCODERS_PATH}")
    print(f"   {METADATA_PATH}")


def main():
    print("=" * 60)
    print("  BreachLens — Model Training Pipeline")
    print("=" * 60)

    # 1. Load Data
    df = load_dataset()
    print(f"\n📂 Dataset loaded: {df.shape[0]} rows, {df.shape[1]} columns")
    print(f"   Severity distribution:\n{df[TARGET_CLASS].value_counts().to_string()}")

    # 2. Encode
    df_enc, encoders = encode_features(df)

    X = df_enc[ALL_FEATURES]
    y_class = df_enc[TARGET_CLASS]
    y_reg = df[TARGET_REG]

    # 3. Split (stratified on severity)
    X_train, X_test, y_cls_train, y_cls_test, y_reg_train, y_reg_test = train_test_split(
        X, y_class, y_reg, test_size=0.20, random_state=42, stratify=y_class
    )
    print(f"\n   Train: {X_train.shape[0]} | Test: {X_test.shape[0]}")

    # 4. Train Classifier
    clf, clf_acc, clf_cv_acc, feature_importances = train_classifier(
        X_train, y_cls_train, X_test, y_cls_test, encoders
    )

    # 5. Train Regressor
    reg, reg_mae, reg_r2 = train_regressor(X_train, y_reg_train, X_test, y_reg_test)

    # 6. Save
    metadata = {
        "version": "v2.0",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset_size": int(df.shape[0]),
        "features": ALL_FEATURES,
        "severity_classes": SEVERITY_ORDER,
        "classifier": {
            "algorithm": "RandomForestClassifier",
            "test_accuracy": round(clf_acc, 4),
            "cv_accuracy": round(clf_cv_acc, 4),
            "feature_importances": feature_importances,
        },
        "regressor": {
            "algorithm": "GradientBoostingRegressor",
            "target": "financial_impact_usd",
            "test_mae_usd": round(reg_mae, 2),
            "test_r2": round(reg_r2, 4),
        },
    }
    save_artifacts(clf, reg, encoders, metadata)

    print(f"\n{'='*60}")
    print(f"  Training complete!")
    print(f"  Classifier Accuracy : {clf_acc*100:.2f}%")
    print(f"  Regressor R²        : {reg_r2:.4f}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    # Make sure we can import generate_dataset from same directory
    sys.path.insert(0, ML_DIR)
    main()