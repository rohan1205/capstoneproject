from fastapi import FastAPI
import joblib
import numpy as np

app = FastAPI()

# load trained model
model = joblib.load("breach_model.pkl")


@app.post("/predict")
def predict(data: dict):

    records = float(data["recordsAffected"])

    prediction = model.predict([[records]])

    severity = prediction[0]

    # simple impact score
    impact = records * 5

    return {
        "severity": severity,
        "riskScore": int(records / 10000),
        "financialImpact": impact
    }