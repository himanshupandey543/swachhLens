# SwachLens - Complete Deployment Guide (Step-by-Step)
## From Zero to Live in 30 Minutes

**Last Updated:** August 13, 2026  
**Your Project:** C:\Users\hp184\Downloads\swachhLens-main\swachhLens-main\waste-management-vanilla

---

## 📋 What You'll Deploy

- **Frontend:** Static HTML/CSS/JS → Netlify (Free)
- **Backend:** FastAPI Python → Railway (Free)
- **Database:** PostgreSQL → Railway (Free)

**Total Cost:** $0/month (within free tier limits)

---

## 🎯 Prerequisites

Before you start, make sure you have:

- [x] Python 3.9+ installed
- [x] Git installed
- [x] GitHub account (create at github.com if you don't have one)
- [x] A web browser
- [x] 30 minutes of time

---

## 📦 PART 1: Test Locally (10 minutes)

This step ensures everything works before deployment.

### Step 1.1: Navigate to Your Project

Open Git Bash or Command Prompt:

```bash
cd "C:\Users\hp184\Downloads\swachhLens-main\swachhLens-main\waste-management-vanilla"
```

### Step 1.2: Install Backend Dependencies

```bash
# Navigate to backend folder
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# On Windows:
.venv\Scripts\activate

# On Mac/Linux:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

**Expected output:**
```
Successfully installed fastapi-... uvicorn-... python-dotenv-... psycopg2-binary-...
```

### Step 1.3: Run the Backend Server

```bash
python run.py
```

**Expected output:**
```
✅ Connected to SQLite database: C:\Users\hp184\Downloads\...\backend\data\swachlens.db
✅ Database initialized with demo data
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

### Step 1.4: Test the Backend

Open your browser and visit:
- http://localhost:8000 - Should load the landing page
- http://localhost:8000/docs - Should show API documentation

**✅ Checkpoint:** If you see the API docs page, your backend works!

### Step 1.5: Test Login

1. Go to http://localhost:8000/login
2. Click "Citizen" panel
3. Try logging in with:
   - Email: `user@test.com`
   - Password: `123456`
4. You should be redirected to the citizen dashboard

**✅ Checkpoint:** If you can log in, your app is working locally!

Press `CTRL+C` in the terminal to stop the server.

---

## 🌐 PART 2: Push to GitHub (5 minutes)

### Step 2.1: Initialize Git Repository

Go back to the project root:

```bash
# From backend folder
cd ..

# Now you should be in: C:\Users\hp184\Downloads\swachhLens-main\swachhLens-main\waste-management-vanilla
```

Initialize Git:

```bash
git init
```

**Expected output:**
```
Initialized empty Git repository in ...
```

### Step 2.2: Add All Files

```bash
git add .
```

### Step 2.3: Create Initial Commit

```bash
git commit -m "Initial commit - SwachLens ready for deployment"
```

**Expected output:**
```
[main (root-commit) abc1234] Initial commit - SwachLens ready for deployment
 XX files changed, XXXX insertions(+)
```

### Step 2.4: Create GitHub Repository

**Open your web browser:**

1. Go to https://github.com/new
2. Fill in the form:
   - **Repository name:** `swachlens-app`
   - **Description:** "Smart Waste Management System"
   - **Visibility:** Public (or Private, your choice)
   - **DO NOT check** "Initialize this repository with a README"
3. Click **"Create repository"**

### Step 2.5: Connect to GitHub and Push

GitHub will show you commands. Use these:

```bash
# Add GitHub as remote (replace YOUR_USERNAME with your actual GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/swachlens-app.git

# Rename branch to main
git branch -M main

# Push to GitHub
git push -u origin main
```

**You may be prompted to login to GitHub.** Enter your credentials.

**Expected output:**
```
Enumerating objects: XXX, done.
Counting objects: 100% (XXX/XXX), done.
Writing objects: 100% (XXX/XXX), XXX KiB | XXX MiB/s, done.
Total XXX (delta XX), reused 0 (delta 0)
To https://github.com/YOUR_USERNAME/swachlens-app.git
 * [new branch]      main -> main
```

**✅ Checkpoint:** Refresh your GitHub repository page. You should see all your files!

---

## 🚂 PART 3: Deploy Backend to Railway (10 minutes)

### Step 3.1: Create Railway Account

1. Open https://railway.app/ in your browser
2. Click **"Login"** (top right)
3. Click **"Login with GitHub"**
4. Click **"Authorize Railway"**
5. You'll be redirected to Railway dashboard

### Step 3.2: Create New Project

1. Click **"New Project"** button (purple button)
2. Select **"Deploy from GitHub repo"**
3. If prompted, click **"Configure GitHub App"** and allow Railway access to your repositories
4. Select **`swachlens-app`** from the list
5. Click **"Deploy Now"**

Railway will automatically:
- Detect it's a Python project
- Install dependencies from `requirements.txt`
- Start your backend using `Procfile`

**Wait 2-3 minutes** for the build to complete.

### Step 3.3: Add PostgreSQL Database

1. In your Railway project dashboard, click **"+ New"** button
2. Select **"Database"**
3. Click **"Add PostgreSQL"**
4. Wait ~30 seconds for database to provision

**✅ Checkpoint:** You should now see two services in your dashboard:
- Your `swachlens-app` service
- A PostgreSQL database

### Step 3.4: Generate SECRET_KEY

Open a new terminal/Git Bash window:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Example output:**
```
xK9mP3vL8nQ2wR5yT7uZ4aB6cD1eF0gH3iJ5kL8mN2oP
```

**Copy this entire string** - you'll need it in the next step.

### Step 3.5: Set Environment Variables

1. In Railway dashboard, click on your **`swachlens-app`** service (NOT the database)
2. Go to **"Variables"** tab
3. Click **"+ New Variable"**
4. Add these variables one by one:

**Variable 1:**
- Variable: `SECRET_KEY`
- Value: `<paste-the-string-you-generated-above>`

**Variable 2:**
- Variable: `FRONTEND_ORIGINS`
- Value: `https://placeholder.netlify.app` (we'll update this later)

**Variable 3:**
- Variable: `HOST`
- Value: `0.0.0.0`

**Variable 4:**
- Variable: `PORT`
- Value: `8000`

**Variable 5:**
- Variable: `RELOAD`
- Value: `0`

Click **"Add"** after each variable.

**Note:** `DATABASE_URL` is automatically added by Railway when you added PostgreSQL - don't add it manually!

### Step 3.6: Generate Public Domain

1. Click on your **`swachlens-app`** service
2. Go to **"Settings"** tab
3. Scroll to **"Networking"** section
4. Click **"Generate Domain"** button

Railway will generate a URL like:
```
https://swachlens-app-production-abc123.up.railway.app
```

**✅ IMPORTANT: Copy this URL!** You'll need it for the frontend.

### Step 3.7: Verify Backend is Running

1. Copy your Railway URL from above
2. Open in browser: `https://your-railway-url.up.railway.app/docs`
3. You should see the FastAPI documentation page

**Try testing an endpoint:**
- Click **"GET /api/constants"**
- Click **"Try it out"**
- Click **"Execute"**
- You should see a response with waste types and groups

**✅ Checkpoint:** If you see the API docs and can call endpoints, your backend is live! 🎉

---

## 🎨 PART 4: Deploy Frontend to Netlify (5 minutes)

### Step 4.1: Create Netlify Account

1. Open https://app.netlify.com/ in your browser
2. Click **"Sign up"**
3. Click **"Sign up with GitHub"**
4. Click **"Authorize Netlify"**
5. You'll be redirected to Netlify dashboard

### Step 4.2: Deploy Your Site

1. Click **"Add new site"** button (green button)
2. Select **"Import an existing project"**
3. Click **"Deploy with GitHub"**
4. If prompted, click **"Configure Netlify on GitHub"** and authorize
5. Select **`swachlens-app`** from your repository list

### Step 4.3: Configure Build Settings

You'll see a form with build settings:

- **Branch to deploy:** `main`
- **Build command:** Leave empty (or put: `echo "Static site"`)
- **Publish directory:** `.` (just a dot - this means root folder)
- **Functions directory:** Leave empty

Click **"Deploy swachlens-app"**

**Wait 1-2 minutes** for deployment to complete.

### Step 4.4: Get Your Netlify URL

Once deployment finishes:

1. You'll see a success message
2. Your site URL will be shown, something like:
   ```
   https://cheerful-unicorn-abc123.netlify.app
   ```
3. **Copy this URL!**

**Test your frontend:**
- Click the URL
- You should see the SwachLens landing page
- **BUT** login won't work yet - we need to connect it to the backend

### Step 4.5: Rename Your Site (Optional)

1. Go to **"Site configuration"** → **"Site details"**
2. Click **"Change site name"**
3. Enter: `swachlens-himanshu` (or any available name)
4. Click **"Save"**

Your new URL will be: `https://swachlens-himanshu.netlify.app`

**✅ Checkpoint:** Your frontend is live, but not connected to backend yet!

---

## 🔗 PART 5: Connect Frontend to Backend (5 minutes)

Now we need to tell your frontend where the backend API is.

### Step 5.1: Update Frontend Config

**On your computer**, open this file in a text editor:
```
C:\Users\hp184\Downloads\swachhLens-main\swachhLens-main\waste-management-vanilla\js\config.js
```

Find this section:
```javascript
API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000/api'
  : 'https://YOUR-RAILWAY-APP.up.railway.app/api', // TODO: Update with your Railway URL
```

Replace `YOUR-RAILWAY-APP.up.railway.app` with your **actual Railway URL** (from Step 3.6).

**Example:**
```javascript
API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000/api'
  : 'https://swachlens-app-production-abc123.up.railway.app/api',
```

**Save the file.**

### Step 5.2: Push Changes to GitHub

```bash
cd "C:\Users\hp184\Downloads\swachhLens-main\swachhLens-main\waste-management-vanilla"

# Add the changed file
git add js/config.js

# Commit
git commit -m "Update API URL for production"

# Push to GitHub
git push
```

### Step 5.3: Wait for Auto-Deploy

- Go back to your **Netlify dashboard**
- Click on **"Deploys"** tab
- You'll see a new deploy starting automatically (triggered by your git push)
- Wait ~1 minute for it to complete

**✅ Checkpoint:** Once deploy shows "Published", your frontend is updated!

### Step 5.4: Update Backend CORS Settings

Now tell your backend to accept requests from your Netlify URL.

1. Go back to **Railway dashboard**
2. Click on your **`swachlens-app`** service
3. Go to **"Variables"** tab
4. Find the **`FRONTEND_ORIGINS`** variable
5. Click the **pencil icon** to edit
6. Update the value to your **actual Netlify URL**:
   ```
   https://swachlens-himanshu.netlify.app
   ```
   (Use YOUR actual Netlify URL!)
7. Click **"Update"**

Railway will automatically restart your backend (~30 seconds).

---

## 🧪 PART 6: Test Your Live App!

### Step 6.1: Open Your Live App

Go to your Netlify URL: `https://swachlens-himanshu.netlify.app`

### Step 6.2: Test Registration

1. Click **"Login"** in the top navigation
2. Click the **"Citizen"** panel
3. Click **"Register as Citizen"** at the bottom
4. Fill in the form:
   - Name: `Himanshu Pandey`
   - Email: `himanshu@test.com`
   - Password: `mypassword`
5. Click **"Register"**

**Expected:** You should be redirected to the citizen dashboard!

### Step 6.3: Test Creating a Report

1. Click **"Report Waste"** button
2. Fill in the form:
   - Waste Type: Select "Plastic"
   - Location: "Test location"
   - Description: "Testing my deployed app"
   - Severity: "Medium"
3. Click **"Submit Report"**

**Expected:** Success message appears, report shows in "My Reports" tab

### Step 6.4: Test Employee Login

1. Logout (if there's a logout button) or open in incognito/private window
2. Go to: `https://your-netlify-url.netlify.app/login`
3. Click **"Employee"** panel
4. Login with:
   - Email: `employee@test.com`
   - Password: `123456`

**Expected:** You should see the employee dashboard with the pending report!

### Step 6.5: Test on Mobile

1. Open your Netlify URL on your phone: `https://swachlens-himanshu.netlify.app`
2. Test login and report creation

**Expected:** Everything should work on mobile too!

---

## 🎉 PART 7: You're Done!

### Your Live URLs

**Frontend (Public App):**
```
https://swachlens-himanshu.netlify.app
```

**Backend API:**
```
https://swachlens-app-production-abc123.up.railway.app
```

**API Documentation:**
```
https://swachlens-app-production-abc123.up.railway.app/docs
```

### Share Your App

You can now share your Netlify URL with anyone:
- Friends and family
- Potential employers
- On your resume/portfolio
- On social media

**Everyone can access it from any device, anywhere in the world!**

---

## 🔧 Troubleshooting

### Problem: "Failed to fetch" error when logging in

**Symptoms:** Login button doesn't work, console shows CORS error

**Solution:**
1. Open browser DevTools (F12) → Console tab
2. Look for the error message
3. Check `FRONTEND_ORIGINS` in Railway includes your EXACT Netlify URL
4. Make sure `js/config.js` has your EXACT Railway URL
5. Try clearing browser cache (Ctrl+Shift+Delete)

**Verify CORS:**
```bash
# Run this in terminal (replace with your URLs)
curl -H "Origin: https://your-netlify-url.netlify.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://your-railway-url.up.railway.app/api/auth/login -v
```

### Problem: 500 Internal Server Error

**Symptoms:** API calls return 500 error

**Solution:**
1. Go to Railway dashboard
2. Click your service → "Deployments" tab
3. Click the latest deployment
4. Check the **logs** for error messages
5. Common issues:
   - Missing `DATABASE_URL` (should be auto-added by Railway)
   - Missing `SECRET_KEY`
   - Database connection failed

### Problem: Can't see my changes after git push

**Symptoms:** Pushed code but site still shows old version

**Solution:**
1. **Netlify:** Go to Deploys tab, verify new deploy is "Published"
2. **Railway:** Go to Deployments tab, verify new deployment is "Success"
3. Clear browser cache: Ctrl+Shift+Delete → Clear cached images and files
4. Try in incognito/private window
5. Check that your git push actually succeeded: `git log` should show your commit

### Problem: Railway deployment failed

**Symptoms:** Railway shows "Deployment failed" or "Build failed"

**Solution:**
1. Click on the failed deployment
2. Read the build logs
3. Common issues:
   - `requirements.txt` missing dependencies
   - Python version mismatch
   - Syntax errors in Python code
4. Fix locally, then:
   ```bash
   git add .
   git commit -m "Fix deployment issue"
   git push
   ```

### Problem: Database won't initialize

**Symptoms:** Backend runs but database is empty

**Solution:**
1. Check Railway logs for "Database initialized" message
2. Verify `DATABASE_URL` environment variable exists
3. If using PostgreSQL, make sure the database service is running
4. Restart the service: Railway dashboard → Service → "Restart"

### Problem: Login works locally but not in production

**Symptoms:** Login works on localhost:8000 but not on live site

**Checklist:**
- [ ] `js/config.js` has correct Railway URL
- [ ] Railway has correct `FRONTEND_ORIGINS` with your Netlify URL
- [ ] No typos in URLs (trailing slashes, http vs https)
- [ ] Browser isn't blocking third-party cookies
- [ ] Check browser console for specific error messages

---

## 📊 Monitoring Your App

### Check Backend Health

**Railway Dashboard:**
- View deployment logs
- Monitor CPU/memory usage
- See request counts
- Check error logs

**Direct Health Check:**
Visit: `https://your-railway-url.up.railway.app/api/constants`
- Should return JSON with waste types and groups
- If it fails, your backend is down

### Check Frontend Health

**Netlify Dashboard:**
- View deploy history
- Check bandwidth usage
- See visitor analytics
- Monitor form submissions

### Database Management

**Railway Dashboard:**
- Click on PostgreSQL service
- View connection info
- Monitor storage usage
- Download backups (Pro plan only)

**Connect to Database:**
```bash
# Get DATABASE_URL from Railway Variables tab
# Install psql: https://www.postgresql.org/download/

psql "postgresql://user:pass@host:5432/dbname"

# List tables
\dt

# Query users
SELECT * FROM users;

# Exit
\q
```

---

## 🔒 Security Checklist

Before sharing your app widely:

- [ ] `SECRET_KEY` is strong (32+ random characters)
- [ ] `FRONTEND_ORIGINS` only includes your Netlify domain (no wildcards in production)
- [ ] Database credentials are not in your code
- [ ] `.env` file is in `.gitignore` (never commit secrets)
- [ ] HTTPS is enabled (Railway and Netlify do this automatically)
- [ ] Demo accounts (`user@test.com`, `employee@test.com`) use placeholder data only

---

## 💰 Free Tier Limits

### Railway Free Tier
- **$5 credit per month**
- ~500 execution hours
- Good for: Development, portfolios, small projects
- **What happens when you hit the limit:** App goes to sleep, wakes on request

### Netlify Free Tier
- **100GB bandwidth/month**
- **300 build minutes/month**
- Unlimited sites
- Good for: Most personal projects
- **What happens when you hit the limit:** Site stays up, but stops auto-deploying

### PostgreSQL on Railway
- **1GB storage**
- **100 hours uptime/month**
- Good for: Development, small databases
- **What happens when you hit the limit:** Database goes offline

**Monitoring:**
- Check usage in Railway/Netlify dashboards
- Both services email you before hitting limits

---

## 🚀 Next Steps (Optional)

### Add Custom Domain

**Netlify:**
1. Buy domain from Namecheap, GoDaddy, etc.
2. Netlify dashboard → Domain settings → Add custom domain
3. Update DNS records at your registrar
4. Netlify automatically provisions SSL certificate

**Railway:**
1. Railway dashboard → Service → Settings → Networking
2. Add custom domain
3. Update DNS records to point to Railway

### Set Up Continuous Deployment

**Already done!** Both Railway and Netlify auto-deploy when you push to GitHub.

To deploy changes:
```bash
# Make your changes
git add .
git commit -m "Description of changes"
git push
```

Wait 2-3 minutes - both services redeploy automatically!

### Add Environment-Specific Configs

Create separate configs for staging and production:

**`.env.production`:**
```env
SECRET_KEY=<strong-production-key>
FRONTEND_ORIGINS=https://swachlens.com
```

**`.env.staging`:**
```env
SECRET_KEY=<staging-key>
FRONTEND_ORIGINS=https://staging-swachlens.netlify.app
```

### Enable Database Backups

**Railway Pro Plan ($20/month):**
- Automatic daily backups
- Point-in-time recovery
- Increased limits

**Manual Backups (Free):**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Backup database
railway run pg_dump > backup.sql

# Restore database
railway run psql < backup.sql
```

### Add Analytics

**Google Analytics:**
1. Create account at analytics.google.com
2. Get tracking ID
3. Add to `index.html`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Monitor Errors

**Sentry (Free tier available):**
1. Sign up at sentry.io
2. Create project
3. Add to backend (`requirements.txt`):
   ```
   sentry-sdk[fastapi]
   ```
4. Initialize in `backend/app/main.py`:
   ```python
   import sentry_sdk
   sentry_sdk.init(dsn="your-dsn-here")
   ```

---

## 📚 Additional Resources

### Official Documentation
- **FastAPI:** https://fastapi.tiangolo.com/
- **Railway:** https://docs.railway.app/
- **Netlify:** https://docs.netlify.com/
- **PostgreSQL:** https://www.postgresql.org/docs/

### Community Help
- **Railway Discord:** https://discord.gg/railway
- **Netlify Forums:** https://answers.netlify.com/
- **Stack Overflow:** Tag questions with `fastapi`, `railway`, `netlify`

### Video Tutorials
- **Deploy FastAPI to Railway:** Search YouTube for "Railway FastAPI tutorial"
- **Deploy Static Site to Netlify:** Search YouTube for "Netlify deployment"

---

## 🎓 What You've Learned

Congratulations! You've successfully:

✅ Set up a Python FastAPI backend  
✅ Configured PostgreSQL database  
✅ Deployed backend to Railway  
✅ Deployed frontend to Netlify  
✅ Connected frontend and backend  
✅ Configured CORS for security  
✅ Tested your live application  
✅ Made your app accessible worldwide  

**You now have a fully functional, production-ready web application!**

---

## 💬 Need Help?

If you encounter any issues:

1. **Check the logs:**
   - Railway: Dashboard → Deployments → View logs
   - Netlify: Dashboard → Deploys → Deploy log
   - Browser: F12 → Console tab

2. **Common fixes:**
   - Clear browser cache
   - Verify environment variables
   - Check URLs (no typos, trailing slashes)
   - Restart services in Railway

3. **Still stuck?**
   - Review the Troubleshooting section above
   - Check Railway/Netlify status pages
   - Search error messages on Google
   - Ask in Railway Discord or Netlify forums

---

## 🎯 Quick Reference Card

Save this for future deployments:

```
┌─────────────────────────────────────────────┐
│  SWACHLENS DEPLOYMENT QUICK REFERENCE       │
├─────────────────────────────────────────────┤
│ 1. Git Push:                                │
│    git add .                                │
│    git commit -m "message"                  │
│    git push                                 │
│                                             │
│ 2. Railway URLs:                            │
│    Dashboard: railway.app                   │
│    Service: <project>.up.railway.app        │
│    API Docs: <project>.up.railway.app/docs  │
│                                             │
│ 3. Netlify URLs:                            │
│    Dashboard: app.netlify.com               │
│    Site: <sitename>.netlify.app             │
│                                             │
│ 4. Environment Variables (Railway):         │
│    - SECRET_KEY                             │
│    - FRONTEND_ORIGINS                       │
│    - DATABASE_URL (auto)                    │
│    - HOST, PORT, RELOAD                     │
│                                             │
│ 5. Test Accounts:                           │
│    Citizen: user@test.com / 123456          │
│    Employee: employee@test.com / 123456     │
│                                             │
│ 6. Key Files:                               │
│    - js/config.js (API URL)                 │
│    - backend/requirements.txt               │
│    - backend/Procfile                       │
│    - netlify.toml                           │
└─────────────────────────────────────────────┘
```

---

**🎉 Congratulations on deploying SwachLens!**

Your app is now live and accessible to the world. Share it proudly!

**Questions?** Let me know - I'm here to help! 😊
