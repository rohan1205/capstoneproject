import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
import joblib

# Load dataset
data = pd.read_csv("df_1.csv")

# Rename columns if needed
data = data.rename(columns={
    "Records": "recordsAffected",
    "Method": "attackVector",
    "Industry": "industry"
})

# Convert records column to numeric
data["recordsAffected"] = (
    data["recordsAffected"]
    .astype(str)
    .str.replace(",", "", regex=False)
)

data["recordsAffected"] = pd.to_numeric(data["recordsAffected"], errors="coerce")

# Drop rows where recordsAffected is missing
data = data.dropna(subset=["recordsAffected"])

# Create severity labels
def severity(records):
    if records > 1000000:
        return "Critical"
    elif records > 100000:
        return "High"
    elif records > 10000:
        return "Medium"
    return "Low"

# Apply severity function
data["severity"] = data["recordsAffected"].apply(severity)

# Features
X = data[["recordsAffected"]]

# Target
y = data["severity"]

# Train test split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Train model
model = RandomForestClassifier()
model.fit(X_train, y_train)

# Save model
joblib.dump(model, "breach_model.pkl")

print("Model trained successfully")
print("Model Accuracy:", model.score(X_test, y_test))