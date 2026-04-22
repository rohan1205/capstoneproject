# BreachLens ML Microservice — Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Copy everything from ml/ folder into /app
COPY . .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Generate dataset and train model at build time
RUN python generate_dataset.py && python train_model.py

# Expose FastAPI port
EXPOSE 8000

# Start uvicorn
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]