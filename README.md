# Capstone Project - Authentication, Breach ML, and Production Hardening

This project provides:
- secure local + Google OAuth authentication,
- MongoDB-backed session management,
- breach prediction with a persisted ML model,
- Dockerized runtime (app + Mongo + ML API),
- Jenkins CI/CD with test and smoke checks.

## Core Features

### Authentication & Security
- Email/password signup and login via Passport local strategy.
- Google OAuth 2.0 with safe fallback when env config is missing.
- Session-based auth persisted in MongoDB (`connect-mongo`).
- Password hashing and comparison via `bcryptjs`.
- HTTP hardening with `helmet` and basic rate limiting.

### Breach Detection & ML
- Breach history stored per-user in MongoDB.
- Node API calls FastAPI model service with timeout/error handling.
- Training pipeline reads CSV, trains model, persists model + metadata.
- Prediction responses include severity, risk score, impact, model version.

### Infrastructure
- Responsive EJS pages for login/signup/dashboard.
- Docker Compose orchestration for `app`, `mongo`, and `ml`.
- Jenkins pipeline for install, tests, build, smoke checks, and main-branch deploy.

## Environment Variables

Use `.env.example` as a template.

Required for secure deployments:
- `SESSION_SECRET`
- `MONGODB_URI`
- `ML_API_URL`

Optional:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`
- `ML_MODEL_PATH`
- `ML_MODEL_META_PATH`
- `ML_TRAINING_CSV`
- `ML_MODEL_VERSION`

## Getting Started and Running the App

### Option 1: Docker Compose (Recommended)
This is the easiest way to run the entire stack (Node.js App, MongoDB, ML Service, and Nginx proxy).

Start all services:
```bash
docker compose up -d --build
```
The application will be available at `http://localhost`.

Stop and clean up all services:
```bash
docker compose down --remove-orphans
```

### Option 2: Local Development
If you want to run the components separately for development:

1. Install dependencies:
```bash
npm install
pip install -r requirements.txt
```

2. Train or refresh the ML model:
```bash
python ml/train_model.py
```

3. Start a local MongoDB service on port 27017.

4. Run services in separate terminals:

Terminal 1 (Backend ML Service):
```bash
python -m uvicorn ml.api:app --reload --port 8000
```

Terminal 2 (Node.js Web App):
```bash
npm start
```

5. Access the services:
- Main App: `http://localhost:3000`
- App Health check: `http://localhost:3000/health`
- ML API Health check: `http://localhost:8000/health`

## CI/CD (Jenkins)

Pipeline stages:
1. Checkout
2. Install Node dependencies (`npm ci`)
3. Install Python dependencies (`pip install -r requirements.txt`)
4. Run tests (`npm test`, Python compile check)
5. Build containers (`docker compose build`)
6. Deploy on `main` (`docker compose up -d`)
7. Smoke checks (`/health` and ML `/health`)

## Deployment Notes (Docker VM Target)

For production:
- provision a VM with Docker + Docker Compose + Jenkins agent prerequisites,
- set strong secrets/environment variables in Jenkins credentials,
- run Jenkins pipeline from `main`,
- monitor `docker compose ps` and health endpoints for rollout verification.
