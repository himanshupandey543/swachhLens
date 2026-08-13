# SwachLens - Quick Start Deployment Guide 🚀

## ✅ Preparation Complete!

Your project is now ready for deployment. Here's what I've set up:

### Files Created/Updated:
- ✅ `backend/requirements.txt` - Added PostgreSQL support
- ✅ `backend/app/config.py` - Environment-aware configuration
- ✅ `backend/app/database.py` - Supports both SQLite and PostgreSQL
- ✅ `backend/Procfile` - Railway deployment config
- ✅ `backend/railway.json` - Railway settings
- ✅ `backend/.env.example` - Environment variable template
- ✅ `netlify.toml` - Netlify configuration
- ✅ `js/config.js` - Environment-aware API URL
- ✅ `DEPLOYMENT_GUIDE.md` - Complete step-by-step guide

---

## 🎯 Next Steps - Deploy Your App

### Step 1: Test Locally (Optional but Recommended)

```bash
cd "C:\Users\hp184\Downloads\swachhLens-main\swachhLens-main\waste-management-vanilla\backend"

# Install dependencies
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# Run the backend
python run.py

# Visit: http://localhost:8000
```

### Step 2: Create GitHub Repository

```bash
cd "C:\Users\hp184\Downloads\swachhLens-main\swachhLens-main\waste-management-vanilla"

# Initialize Git (if not already done)
git init
git add .
git commit -m "Initial commit - SwachLens ready for deployment"

# Create repo on GitHub:
# 1. Go to https://github.com/new
# 2. Create repository named "swachlens-app"
# 3. Don't initialize with README

# Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/swachlens-app.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy Backend to Railway

1. **Go to Railway**: https://railway.app/
2. **Login** with GitHub
3. **Create New Project** → "Deploy from GitHub repo"
4. **Select** your `swachlens-app` repository
5. **Add PostgreSQL Database**:
   - In project dashboard → Click "+ New"
   - Select "Database" → "Add PostgreSQL"
   - Railway auto-creates `DATABASE_URL` variable
6. **Set Environment Variables**:
   - Click on your service → "Variables" tab
   - Add these variables:
   ```
   SECRET_KEY=<generate-random-32-char-string>
   FRONTEND_ORIGINS=https://your-app.netlify.app
   HOST=0.0.0.0
   PORT=8000
   RELOAD=0
   ```
   - Generate SECRET_KEY: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
7. **Generate Domain**:
   - Settings tab → "Generate Domain"
   - Copy your URL: `https://your-app-name.up.railway.app`

### Step 4: Deploy Frontend to Netlify

1. **Go to Netlify**: https://app.netlify.com/
2. **Login** with GitHub
3. **Add New Site** → "Import an existing project"
4. **Connect to GitHub** → Select `swachlens-app`
5. **Configure Build Settings**:
   - Build command: (leave empty)
   - Publish directory: `.` (root)
6. **Deploy Site**
7. **Copy your Netlify URL**: `https://your-app.netlify.app`

### Step 5: Update Configuration

1. **Update Frontend Config**:
   - Open `js/config.js`
   - Replace `YOUR-RAILWAY-APP.up.railway.app` with your actual Railway URL
   - Example:
   ```javascript
   API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
     ? 'http://localhost:8000/api'
     : 'https://swachlens-backend-abc123.up.railway.app/api', // Your actual URL
   ```

2. **Update Railway CORS**:
   - Go to Railway → Your project → Variables
   - Update `FRONTEND_ORIGINS`:
   ```
   FRONTEND_ORIGINS=https://your-actual-app.netlify.app
   ```

3. **Commit and Push**:
   ```bash
   git add js/config.js
   git commit -m "Update API URL for production"
   git push
   ```
   - Netlify will auto-redeploy

---

## 🧪 Testing Your Deployed App

Visit your Netlify URL and test:

1. **Registration**: Create a new account
2. **Login**: Log in with your credentials
3. **Citizen Dashboard**: Submit a waste report
4. **Employee Dashboard**: Login with `employee@test.com` / `123456`
5. **Mobile**: Test on your phone

### Check for Issues:
- Open Browser DevTools (F12)
- **Console tab**: Look for errors
- **Network tab**: Verify API calls go to Railway URL

---

## 🐛 Common Issues & Fixes

### "Failed to fetch" / CORS Error
- **Fix**: Update `FRONTEND_ORIGINS` in Railway to include your Netlify URL
- Verify `js/config.js` has correct Railway URL

### 500 Internal Server Error
- **Fix**: Check Railway logs (Dashboard → Deployments → Logs)
- Verify `DATABASE_URL` environment variable is set
- Check `SECRET_KEY` is configured

### Login Doesn't Work
- Open DevTools → Application → Cookies
- Verify `swachlens.session` cookie exists
- Check Network tab for failed `/api/auth/login` requests

---

## 📊 Your App URLs

After deployment, you'll have:

- **Live App**: `https://your-app.netlify.app`
- **Backend API**: `https://your-app.railway.app`
- **API Docs**: `https://your-app.railway.app/docs`

---

## 💰 Cost: $0/month

Both Railway and Netlify offer free tiers:
- **Railway**: $5 credit/month (~500 hours)
- **Netlify**: 100GB bandwidth, unlimited sites

---

## 📚 Need More Help?

- **Detailed Guide**: See `DEPLOYMENT_GUIDE.md` for comprehensive instructions
- **Railway Docs**: https://docs.railway.app/
- **Netlify Docs**: https://docs.netlify.com/

---

## 🎉 What's Next?

Once deployed, you can:
- Share your app URL with anyone
- Access from any device
- Add a custom domain (optional)
- Monitor usage in Railway/Netlify dashboards

**Ready to deploy? Start with Step 2 above!**
