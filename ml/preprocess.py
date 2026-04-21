import pandas as pd


def load_and_prepare(csv_path: str) -> pd.DataFrame:
    data = pd.read_csv(csv_path)
    data = data.rename(
        columns={
            "Records": "recordsAffected",
            "Method": "attackVector",
            "Industry": "industry",
        }
    )

    data["recordsAffected"] = (
        data["recordsAffected"].astype(str).str.replace(",", "", regex=False)
    )
    data["recordsAffected"] = pd.to_numeric(data["recordsAffected"], errors="coerce")
    data = data.dropna(subset=["recordsAffected"])
    data = data[data["recordsAffected"] > 0]
    return data


def severity_label(records: float) -> str:
    if records > 1_000_000:
        return "Critical"
    if records > 100_000:
        return "High"
    if records > 10_000:
        return "Medium"
    return "Low"
