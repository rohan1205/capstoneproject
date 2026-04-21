"""
generate_dataset.py — BreachLens Synthetic Dataset Generator
=============================================================
Generates a realistic 5,000-row synthetic breach dataset based on
industry research (IBM Cost of a Data Breach 2023) with features:
  - records_affected     : int   — number of records exposed
  - industry             : str   — sector of the breached organization
  - attack_vector        : str   — how the breach occurred
  - data_type            : str   — type of data compromised
  - detection_time_hours : float — hours from breach start to detection
  - geography            : str   — region where the breach occurred

Target Variables:
  - severity_label    : Low / Medium / High / Critical (classification)
  - financial_impact  : USD cost estimate (regression)
"""

import numpy as np
import pandas as pd
import os

np.random.seed(42)
N = 5000

# ─────────────────────────────────────────────
# Categorical Pools
# ─────────────────────────────────────────────
INDUSTRIES = [
    "healthcare", "finance", "technology", "retail",
    "government", "education", "manufacturing", "energy",
    "legal", "hospitality",
]

ATTACK_VECTORS = [
    "phishing", "malware", "ransomware", "insider_threat",
    "sql_injection", "credential_stuffing", "ddos",
    "supply_chain", "zero_day", "physical_breach",
]

DATA_TYPES = [
    "pii",          # personally identifiable information
    "financial",    # credit cards, bank details
    "health",       # medical records (HIPAA-sensitive)
    "credentials",  # usernames / passwords / tokens
    "intellectual_property",
    "government_classified",
    "operational",  # internal processes, configs
]

GEOGRAPHIES = [
    "north_america", "europe", "asia_pacific",
    "middle_east", "latin_america", "africa",
]

# ─────────────────────────────────────────────
# Industry → base cost per record (USD, inspired by IBM 2023)
# ─────────────────────────────────────────────
INDUSTRY_COST_PER_RECORD = {
    "healthcare":   9.48,
    "finance":      5.97,
    "technology":   4.45,
    "retail":       3.28,
    "government":   2.07,
    "education":    2.84,
    "manufacturing":4.73,
    "energy":       4.72,
    "legal":        5.10,
    "hospitality":  2.96,
}

# ─────────────────────────────────────────────
# Attack vector → financial multiplier
# ─────────────────────────────────────────────
ATTACK_MULTIPLIER = {
    "ransomware":          1.80,
    "supply_chain":        1.65,
    "zero_day":            1.55,
    "insider_threat":      1.40,
    "phishing":            1.10,
    "malware":             1.20,
    "sql_injection":       1.15,
    "credential_stuffing": 1.05,
    "ddos":                0.90,
    "physical_breach":     0.80,
}

# ─────────────────────────────────────────────
# Data type → sensitivity multiplier
# ─────────────────────────────────────────────
DATA_SENSITIVITY = {
    "government_classified":  2.0,
    "health":                 1.8,
    "financial":              1.6,
    "intellectual_property":  1.5,
    "pii":                    1.2,
    "credentials":            1.1,
    "operational":            0.9,
}

# ─────────────────────────────────────────────
# Geography → regulatory / economic adjustment
# ─────────────────────────────────────────────
GEO_MULTIPLIER = {
    "north_america": 1.30,
    "europe":        1.20,
    "middle_east":   1.05,
    "asia_pacific":  0.90,
    "latin_america": 0.75,
    "africa":        0.60,
}


def assign_severity(records: int, detection_hrs: float, attack_vec: str) -> str:
    """
    Deterministic severity rules (with noise).
    Critical  — >1M records OR ransomware/zero_day AND >500k
    High      — 100k-1M records OR long detection (>168h = 1 week)
    Medium    — 10k-100k records
    Low       — <10k records
    """
    score = 0

    # Records weight
    if records > 1_000_000:
        score += 40
    elif records > 500_000:
        score += 30
    elif records > 100_000:
        score += 20
    elif records > 10_000:
        score += 10
    else:
        score += 2

    # Detection time weight
    if detection_hrs > 720:    # >30 days
        score += 30
    elif detection_hrs > 168:  # >1 week
        score += 20
    elif detection_hrs > 24:   # >1 day
        score += 10
    else:
        score += 2

    # Attack vector weight
    high_risk = {"ransomware", "supply_chain", "zero_day", "insider_threat"}
    if attack_vec in high_risk:
        score += 20
    elif attack_vec in {"phishing", "malware"}:
        score += 10
    else:
        score += 3

    # Add random noise (±8 points)
    score += np.random.randint(-8, 9)
    score = max(0, min(100, score))

    if score >= 75:
        return "Critical"
    elif score >= 50:
        return "High"
    elif score >= 25:
        return "Medium"
    else:
        return "Low"


def compute_financial_impact(
    records: int,
    industry: str,
    attack_vec: str,
    data_type: str,
    geography: str,
    detection_hrs: float,
) -> float:
    """
    Financial impact (USD) based on IBM methodology:
      base = records × cost_per_record
      × attack_multiplier × data_sensitivity × geo_multiplier
      + detection_penalty (extended dwell time increases cost)
    """
    base = records * INDUSTRY_COST_PER_RECORD.get(industry, 3.0)
    atk_m = ATTACK_MULTIPLIER.get(attack_vec, 1.0)
    data_m = DATA_SENSITIVITY.get(data_type, 1.0)
    geo_m = GEO_MULTIPLIER.get(geography, 1.0)

    # Detection time penalty: every week beyond 24h adds 5%
    weeks_undetected = max(0, (detection_hrs - 24) / 168)
    detection_penalty = 1 + (weeks_undetected * 0.05)

    impact = base * atk_m * data_m * geo_m * detection_penalty

    # Add realistic noise (±15%)
    noise = np.random.uniform(0.85, 1.15)
    return round(impact * noise, 2)


def generate_dataset(n: int = N) -> pd.DataFrame:
    """Generate n synthetic breach records."""

    # Sample categorical columns
    industries = np.random.choice(INDUSTRIES, n)
    attack_vectors = np.random.choice(ATTACK_VECTORS, n, p=[
        0.22, 0.15, 0.14, 0.11, 0.09, 0.09, 0.07, 0.06, 0.04, 0.03
    ])
    data_types = np.random.choice(DATA_TYPES, n)
    geographies = np.random.choice(GEOGRAPHIES, n)

    # Records affected — log-normal distribution (realistic breach sizes)
    records_affected = np.random.lognormal(mean=10.5, sigma=2.0, size=n).astype(int)
    records_affected = np.clip(records_affected, 100, 50_000_000)

    # Detection time — log-normal (hours): median ~72h, range 0.5h–8760h (1yr)
    detection_time_hours = np.random.lognormal(mean=4.2, sigma=1.4, size=n)
    detection_time_hours = np.clip(detection_time_hours, 0.5, 8760.0).round(1)

    # Compute targets
    severity_labels = [
        assign_severity(int(records_affected[i]), float(detection_time_hours[i]), attack_vectors[i])
        for i in range(n)
    ]

    financial_impacts = [
        compute_financial_impact(
            int(records_affected[i]),
            industries[i],
            attack_vectors[i],
            data_types[i],
            geographies[i],
            float(detection_time_hours[i]),
        )
        for i in range(n)
    ]

    df = pd.DataFrame({
        "records_affected":     records_affected,
        "industry":             industries,
        "attack_vector":        attack_vectors,
        "data_type":            data_types,
        "detection_time_hours": detection_time_hours,
        "geography":            geographies,
        "severity_label":       severity_labels,
        "financial_impact":     financial_impacts,
    })

    return df


if __name__ == "__main__":
    print("[*] Generating BreachLens synthetic dataset...")
    df = generate_dataset(N)

    # Save inside ml/Data/
    out_dir = os.path.join(os.path.dirname(__file__), "Data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "breach_dataset.csv")
    df.to_csv(out_path, index=False)

    print(f"[OK] Dataset saved -> {out_path}")
    print(f"   Shape: {df.shape}")
    print(f"\n   Severity distribution:")
    print(df["severity_label"].value_counts().to_string())
    print(f"\n   Financial impact stats (USD):")
    print(df["financial_impact"].describe().apply(lambda x: f"${x:,.0f}").to_string())
    print(f"\n   Sample rows:")
    print(df.head(3).to_string())
