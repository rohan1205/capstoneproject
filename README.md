# Capstone Project - Login/Signup with ML Integration

A full-stack web application combining **user authentication**, **breach detection**, and **machine learning** capabilities, with **MongoDB**, **Google OAuth**, **Docker**, and **Jenkins CI/CD** support.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![MongoDB](https://img.shields.io/badge/MongoDB-7-brightgreen)
![Python](https://img.shields.io/badge/Python-3.8+-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

---

## Features

### Authentication & Security
- Email & password signup / login
- Google OAuth 2.0 authentication
- Session-based authentication (MongoDB stored)
- Password hashing with bcrypt
- Health check endpoint (`/health`)

### Breach Detection & Analysis
- Breach data model and tracking
- ML-powered breach analysis API
- CSV data import for training
- Trained model persistence

### Infrastructure
- Responsive, clean UI (EJS templates)
- Docker & Docker Compose containerization
- Jenkins CI/CD pipeline with automated testing
- Production-ready deployment

---

## Project Structure

```
capstoneproject/
├── app.js                    # Express app entry point
├── test.js                   # Test suite
├── package.json              # Node.js dependencies & scripts
│
├── config/
│   └── passport.js           # Passport strategies (local + Google)
│
├── models/
│   ├── User.js               # Mongoose user model
│   └── Breach.js             # Breach detection model
│
├── routes/
│   ├── auth.js               # Auth routes (signup, login, Google, logout)
│   └── breach.js             # Breach analysis routes
│
├── views/
│   ├── login.ejs             # Login page
│   ├── signup.ejs            # Signup page
│   └── dashboard.ejs         # Dashboard (authenticated users)
│
├── ml/
│   ├── train_model.py        # Model training script
│   ├── api.py                # Flask API for ML predictions
│   ├── df_1.csv              # Training dataset
│   └── __pycache__/          # Python cache
│
├── Dockerfile                # Docker image definition
├── docker-compose.yml        # Docker Compose (app + MongoDB)
├── Jenkinsfile               # Jenkins CI/CD pipeline
├── .env                      # Environment variables (local)
└── README.md
```

---

## Quick Start (Local)

### Prerequisites

- **Node.js 18+**
- **Python 3.8+** (for ML features)
- **MongoDB** running locally
- **pip** for Python dependencies

### Setup

```bash
# 1. Install Node.js dependencies
npm install

# 2. Install Python dependencies
pip install -r ml/requirements.txt

# 3. Configure environment
#    Create or update .env with:
#    - MONGODB_URI
#    - SESSION_SECRET
#    - GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET (optional)
#    - PORT (default: 3000)
#    - ML_API_URL (default: http://localhost:5000)

# 4. Train ML model (optional)
python ml/train_model.py

# 5. Start ML API (in separate terminal)
python -m uvicorn ml.api:app --reload --port 5000

# 6. Start Node.js server (in another terminal)
npm start

# 7. Open browser
#    http://localhost:3000
```

---

## Quick Start (Docker)

```bash
# Start everything (Node app + MongoDB + ML API)
docker-compose up -d --build

# Check logs
docker-compose logs -f

# Open http://localhost:3000

# Stop all services
docker-compose down
```

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Set **Authorized redirect URI** to: `http://localhost:3000/auth/google/callback`
6. Copy credentials to `.env`:

```
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Node.js server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/loginpage` |
| `SESSION_SECRET` | Session encryption key | (required) |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | (optional) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | (optional) |
| `GOOGLE_CALLBACK_URL` | Google OAuth callback URL | `http://localhost:3000/auth/google/callback` |
| `ML_API_URL` | Flask ML API endpoint | `http://localhost:5000` |

---

## API Endpoints

### Authentication Routes (`/auth`)
- `POST /auth/signup` — Register new user
- `POST /auth/login` — Login with email/password
- `GET /auth/google` — Google OAuth login
- `GET /auth/google/callback` — OAuth callback
- `GET /auth/logout` — Logout user

### Breach Routes (`/breach`)
- `GET /breach` — List detected breaches
- `POST /breach/analyze` — Analyze potential breach
- `GET /breach/:id` — Get breach details

### Health
- `GET /health` — Application health check

---

## Machine Learning

### Training

```bash
python ml/train_model.py
```

Trains the model on `ml/df_1.csv` and saves the model for predictions.

### Predictions

The ML API runs on `http://localhost:5000` and provides endpoints for:
- Breach likelihood scoring
- Vulnerability analysis
- Risk assessment

See `ml/api.py` for detailed endpoint documentation.

---

## Testing

```bash
npm test
```

Runs the test suite defined in `test.js`.

---

## Jenkins CI/CD Pipeline

The `Jenkinsfile` defines an automated pipeline:

1. **Checkout** — Pull latest code
2. **Install Dependencies** — `npm ci` & Python deps
3. **Run Tests** — `npm test`
4. **Build Docker Image** — Create production image
5. **Deploy** — Run `docker-compose up`
6. **Health Check** — Verify application is running

### Setup Jenkins

1. Install Jenkins with Docker, Node.js, and Python plugins
2. Create a **Pipeline** job
3. Point it to your Git repository
4. Jenkins automatically uses the `Jenkinsfile`

---

## Database

### Collections

**users** — User accounts & authentication data

```json
{
  "_id": ObjectId,
  "email": "user@example.com",
  "password": "hashed-password",
  "googleId": "optional-google-id",
  "createdAt": ISODate
}
```

**breach** — Breach records & analysis

```json
{
  "_id": ObjectId,
  "userid": ObjectId,
  "riskLevel": "high|medium|low",
  "description": "Breach details",
  "detectedAt": ISODate
}
```

**sessions** — Active user sessions

```json
{
  "_id": String,
  "user": ObjectId,
  "expires": ISODate
}
```

---

## Development

### Run in Watch Mode

```bash
# Terminal 1: ML API
python -m uvicorn ml.api:app --reload --port 5000

# Terminal 2: Node.js app
npm start
```

### View Database

Connect MongoDB Compass to `mongodb://localhost:27017/loginpage`

---

## Deployment

### Docker Production Build

```bash
docker build -t capstone-app:latest .
docker run -d -p 3000:3000 --env-file .env capstone-app:latest
```

### Using Docker Compose

```bash
docker-compose -f docker-compose.yml up -d
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| MongoDB connection error | Ensure MongoDB is running on `localhost:27017` or update `MONGODB_URI` |
| ML API not responding | Check Flask is running on port 5000; verify `ML_API_URL` in `.env` |
| Google OAuth fails | Verify `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` in `.env` |
| Tests fail | Run `npm install` to ensure all dependencies are installed |

---

## License

ISC

---

## Support

For issues or questions, please check the logs:

```bash
# Node.js logs
npm start

# Docker logs
docker-compose logs -f

# ML API logs
python -m uvicorn ml.api:app --reload
```
