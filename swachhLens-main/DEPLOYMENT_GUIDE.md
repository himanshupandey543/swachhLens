# SwachLens - Complete Deployment Guide 🚀

This guide will take your SwachLens app from local development to a live, publicly accessible web application.

## 📋 Overview

Your project already has:
- ✅ FastAPI backend with authentication
- ✅ SQLite database with password hashing (scrypt)
- ✅ JWT-based sessions
- ✅ Static frontend (HTML/CSS/JS)

We'll deploy to:
- **Backend**: Railway (free tier with PostgreSQL)
- **Frontend**: Netlify (free tier)
- **Database**: PostgreSQL on Railway (free)

---

## 🗄️ STEP 1: Upgrade Database (SQLite → PostgreSQL)

SQLite works locally but won't persist on cloud platforms like Railway. We'll migrate to PostgreSQL.

### 1.1 Update Backend Dependencies

Add PostgreSQL support to `backend/requirements.txt`:

```txt
fastapi>=0.115
uvicorn>=0.32
python-dotenv>=1.0
psycopg2-binary>=2.9.9
sqlalchemy>=2.0
```

### 1.2 Update Database Configuration

Create/update `backend/app/config.py`:

```python
"""Configuration for SwachLens backend."""
import os
from pathlib import Path

# Database
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./data/swachlens.db"  # Local fallback
)

# If Railway provides postgres:// URL, convert to postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Static files
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR.parent

# CORS
FRONTEND_ORIGINS = os.getenv("FRONTEND_ORIGINS", "").split(",")
if not FRONTEND_ORIGINS or FRONTEND_ORIGINS == [""]:
    FRONTEND_ORIGINS = ["http://localhost:8000", "http://localhost:8090"]

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days
```

### 1.3 Update Database Module

Update `backend/app/database.py` to use SQLAlchemy (supports both SQLite and PostgreSQL):

Check your current `database.py` - if it's using raw SQLite, we need to migrate it. Let me know if you need the full migration code.

---

## 🚀 STEP 2: Deploy Backend to Railway

Railway provides free PostgreSQL database and backend hosting.

### 2.1 Create Railway Account

1. Go to https://railway.app/
2. Click "Login" → Sign in with GitHub
3. Authorize Railway to access your GitHub

### 2.2 Prepare Backend for Deployment

Create `backend/.env.example`:

```env
# Railway will auto-populate DATABASE_URL
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Generate a secure secret key for production
SECRET_KEY=your-super-secret-key-min-32-chars

# Frontend origins (add your Netlify URL after deployment)
FRONTEND_ORIGINS=https://your-app.netlify.app,http://localhost:8000

# Server config
HOST=0.0.0.0
PORT=8000
RELOAD=0
```

Create `backend/Procfile` (tells Railway how to start your app):

```
web: python run.py
```

Create `backend/railway.json` (Railway configuration):

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "python run.py",
    "healthcheckPath": "/api/constants",
    "healthcheckTimeout": 300
  }
}
```

### 2.3 Deploy to Railway

**Option A: Deploy via GitHub (Recommended)**

1. Create a GitHub repository:
   ```bash
   cd "C:\Users\hp184\Downloads\swachhLens-main\swachhLens-main\waste-management-vanilla"
   git init
   git add .
   git commit -m "Initial commit - SwachLens app"
   ```

2. Push to GitHub:
   - Go to https://github.com/new
   - Create a new repository (e.g., `swachlens-app`)
   - Don't initialize with README
   - Copy the commands shown:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/swachlens-app.git
   git branch -M main
   git push -u origin main
   ```

3. Deploy on Railway:
   - Go to https://railway.app/new
   - Click "Deploy from GitHub repo"
   - Select your `swachlens-app` repository
   - Railway will detect your Python app and start building

**Option B: Deploy via Railway CLI**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
cd backend
railway init

# Deploy
railway up
```

### 2.4 Add PostgreSQL Database

1. In your Railway project dashboard:
   - Click "+ New" → "Database" → "Add PostgreSQL"
   - Railway auto-creates a `DATABASE_URL` variable

2. Your backend will automatically connect to PostgreSQL using this URL

### 2.5 Set Environment Variables

In Railway dashboard → Your Project → Variables tab:

```
SECRET_KEY=<generate-secure-random-string-32-chars-min>
FRONTEND_ORIGINS=https://your-app.netlify.app
HOST=0.0.0.0
PORT=8000
RELOAD=0
```

To generate a secure SECRET_KEY:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 2.6 Get Your Backend URL

1. Railway dashboard → Your service → "Settings" tab
2. Click "Generate Domain"
3. You'll get a URL like: `https://swachlens-backend-production.up.railway.app`
4. **Save this URL** - you'll need it for frontend deployment

### 2.7 Test Your Backend

Visit: `https://your-railway-url.up.railway.app/docs`

You should see the FastAPI interactive documentation. Test the `/api/constants` endpoint.

---

## 🌐 STEP 3: Deploy Frontend to Netlify

### 3.1 Prepare Frontend for Deployment

Update `js/config.js` to use environment-based API URL:

```javascript
/* =====================================================================
 * SwachLens — App configuration
 * ---------------------------------------------------------------------
 * API_URL automatically detects production vs local environment
 * ===================================================================== */
window.SW_CONFIG = {
  APP_NAME: 'SwachLens',
  TICKER: 'Smart Waste Management',
  // Use Railway backend in production, localhost in development
  API_URL: window.location.hostname === 'localhost' 
    ? 'http://localhost:8000/api'
    : 'https://swachlens-backend-production.up.railway.app/api', // Replace with your Railway URL
};
```

Better approach - create `js/config.production.js`:

```javascript
window.SW_CONFIG = {
  APP_NAME: 'SwachLens',
  TICKER: 'Smart Waste Management',
  API_URL: 'https://your-railway-url.up.railway.app/api', // Your actual Railway URL
};
```

### 3.2 Create Netlify Configuration

Create `netlify.toml` in project root:

```toml
[build]
  publish = "."
  command = "echo 'No build needed - static site'"

[[redirects]]
  from = "/login"
  to = "/login.html"
  status = 200

[[redirects]]
  from = "/user"
  to = "/user.html"
  status = 200

[[redirects]]
  from = "/employee"
  to = "/employee.html"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  NODE_VERSION = "18"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

### 3.3 Deploy to Netlify

**Option A: Drag & Drop (Easiest)**

1. Go to https://app.netlify.com/
2. Sign up/Login with GitHub
3. Drag your project folder onto the Netlify dashboard
4. Done! Your site is live

**Option B: GitHub Integration (Recommended)**

1. Push your code to GitHub (if not already done)
2. Go to https://app.netlify.com/
3. Click "Add new site" → "Import an existing project"
4. Connect to GitHub → Select your repository
5. Configure:
   - Build command: (leave empty)
   - Publish directory: `.` (root)
6. Click "Deploy site"

**Option C: Netlify CLI**

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
cd "C:\Users\hp184\Downloads\swachhLens-main\swachhLens-main\waste-management-vanilla"
netlify init
netlify deploy --prod
```

### 3.4 Update API URL

After Netlify deploys, you'll get a URL like: `https://swachlens.netlify.app`

Update `js/config.js` with your actual Railway backend URL:

```javascript
API_URL: window.location.hostname === 'localhost' 
  ? 'http://localhost:8000/api'
  : 'https://swachlens-backend-production.up.railway.app/api', // Your actual Railway URL
```

Redeploy to Netlify after this change.

---

## 🔐 STEP 4: Configure CORS

Update Railway environment variables:

1. Go to Railway dashboard → Variables
2. Update `FRONTEND_ORIGINS`:
   ```
   FRONTEND_ORIGINS=https://swachlens.netlify.app,https://your-custom-domain.com
   ```
3. Railway will auto-restart with new settings

---

## ✅ STEP 5: Testing Checklist

### Local Testing (Before Deployment)

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python run.py
# Visit http://localhost:8000

# Test endpoints
curl http://localhost:8000/api/constants
```

### Production Testing (After Deployment)

- [ ] Visit your Netlify URL: `https://swachlens.netlify.app`
- [ ] Test Registration:
  - Click "Login" → "Citizen" panel → "Register"
  - Create a new account
  - Verify you can log in
- [ ] Test Citizen Dashboard:
  - Submit a waste report
  - Check "My Reports" updates
- [ ] Test Employee Dashboard:
  - Log out and log in with employee credentials
  - Verify task list loads
  - Test marking reports as collected
- [ ] Test on mobile device
- [ ] Open browser DevTools → Network tab
  - Check API calls go to Railway URL
  - Verify no CORS errors

---

## 🐛 Troubleshooting

### Backend Issues

**Problem: Railway build fails**
- Check `backend/requirements.txt` is present
- Verify Python version compatibility (Railway uses Python 3.11+)
- Check Railway logs: Dashboard → Deployments → View logs

**Problem: Database connection fails**
- Verify `DATABASE_URL` environment variable is set
- Check PostgreSQL service is running in Railway
- Look for connection errors in logs

**Problem: 500 errors on API calls**
- Check Railway logs for Python tracebacks
- Verify all environment variables are set
- Test endpoints directly: `https://your-url.up.railway.app/docs`

### Frontend Issues

**Problem: "Failed to fetch" or CORS errors**
- Verify `FRONTEND_ORIGINS` in Railway includes your Netlify URL
- Check `js/config.js` points to correct Railway URL
- Open DevTools → Console for specific error messages

**Problem: 404 on page routes**
- Verify `netlify.toml` has redirect rules
- Check file names match routes (login.html, user.html, etc.)

**Problem: Login doesn't work**
- Open DevTools → Application → Cookies
- Verify `swachlens.session` cookie is set
- Check Network tab for failed API requests
- Verify Railway backend is running

---

## 🎯 Final Configuration Summary

### Environment Variables Needed

**Railway (Backend):**
```env
DATABASE_URL=<auto-set-by-railway-postgres>
SECRET_KEY=<32-char-random-string>
FRONTEND_ORIGINS=https://swachlens.netlify.app
HOST=0.0.0.0
PORT=8000
RELOAD=0
```

**Netlify (Frontend):**
- No environment variables needed
- Just update `js/config.js` with Railway URL

### URLs After Deployment

- **Frontend**: `https://swachlens.netlify.app`
- **Backend**: `https://swachlens-backend-production.up.railway.app`
- **API Docs**: `https://swachlens-backend-production.up.railway.app/docs`

---

## 🚀 Quick Deploy Commands

```bash
# 1. Setup Git (if not already)
cd "C:\Users\hp184\Downloads\swachhLens-main\swachhLens-main\waste-management-vanilla"
git init
git add .
git commit -m "Initial commit"

# 2. Create GitHub repo and push
# (Do this via GitHub website: github.com/new)
git remote add origin https://github.com/YOUR_USERNAME/swachlens-app.git
git branch -M main
git push -u origin main

# 3. Deploy Backend to Railway
# Go to railway.app → "New Project" → "Deploy from GitHub"
# Select your repo → Add PostgreSQL database → Set environment variables

# 4. Deploy Frontend to Netlify
# Go to netlify.com → "Add new site" → "Import from Git"
# Select your repo → Deploy

# 5. Update config and redeploy
# Update js/config.js with Railway URL
git add js/config.js
git commit -m "Update API URL for production"
git push
# Netlify auto-redeploys on push
```

---

## 📝 Next Steps (Optional)

1. **Custom Domain**: 
   - Netlify: Site settings → Domain management → Add custom domain
   - Railway: Settings → Add custom domain

2. **Environment-based Config**:
   - Use build-time environment variables
   - Create separate configs for staging/production

3. **Database Backups**:
   - Railway Pro plan includes automatic backups
   - Free tier: Use Railway CLI to export data periodically

4. **Monitoring**:
   - Railway: Built-in metrics in dashboard
   - Add error tracking (e.g., Sentry)

5. **CI/CD**:
   - Both Railway and Netlify auto-deploy on git push
   - Add GitHub Actions for testing before deploy

---

## 💰 Cost Breakdown (Free Tier Limits)

**Railway Free Tier:**
- $5 credit per month
- ~500 hours execution time
- PostgreSQL database included
- Enough for small apps with moderate traffic

**Netlify Free Tier:**
- 100GB bandwidth/month
- Unlimited sites
- Automatic HTTPS
- More than enough for most projects

**Total Cost: $0/month** (within free tier limits)

---

## 🆘 Need Help?

If you encounter issues:
1. Check Railway logs: Dashboard → Deployments → Logs
2. Check Netlify logs: Site → Deploys → Deploy log
3. Browser DevTools → Console & Network tabs
4. Share specific error messages for targeted help

Good luck with your deployment! 🎉
