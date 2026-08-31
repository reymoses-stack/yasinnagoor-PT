# Pioneers Technical — Project Management & Workforce Live Board 🚀

An executive real-time project management and workforce scheduling platform built for **Pioneers Technical Co. Ltd.** ([www.pt-tgc.com](https://www.pt-tgc.com/)).

---

## 🌟 Key Features

* **Apple Dynamic Island Navigation**: Frosted glass floating navigation pill bar with live local internet timezone clock.
* **Intelligent Sequential Team Allocation**: Automatic 1-team-per-project allocation with helper absorption for active jobs.
* **Category Workforce Command Center**: Full-width executive strips tracking 85 headcount slots (Staff + Open Needs).
* **Project Directory & Workforce Rosters**: Complete CRUD capabilities, multi-column sorting, and automatic mobilization date calculation (`Start Date - 5 Days`).
* **Instant Excel Export**: Export styled spreadsheets for Live Board, Projects, and Workforce rosters.
* **Dual-Mode Architecture**: Works seamlessly with Go REST backend or standalone static client on Vercel/Netlify.

---

## 🚀 Quick Deployment Guide

### Option 1: Deploy to Vercel (Recommended)

1. Push this repository to your **GitHub** account.
2. Log in to [Vercel](https://vercel.com/) and click **"Add New Project"**.
3. Import your GitHub repository (`pioneer-technical`).
4. **Vercel will automatically detect `vercel.json` and build settings**:
   * **Framework Preset**: Vite
   * **Root Directory**: `./` (or leave default)
   * **Build Command**: `npm --prefix frontend install && npm --prefix frontend run build`
   * **Output Directory**: `frontend/dist`
5. Click **"Deploy"** — your live dashboard will be online in ~30 seconds!

---

### Option 2: Deploy to Netlify

1. Push this repository to your **GitHub** account.
2. Log in to [Netlify](https://www.netlify.com/) and click **"Add new site" > "Import an existing project"**.
3. Select your GitHub repository.
4. **Netlify will automatically read `netlify.toml`**:
   * **Base directory**: `frontend`
   * **Build command**: `npm run build`
   * **Publish directory**: `frontend/dist`
5. Click **"Deploy site"**!

---

## 💻 Local Development

### 1. Prerequisites
* **Node.js** (v18+)
* **Go** (1.21+) *(Optional: only needed if running local Go backend)*

### 2. Run Frontend
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Run Go Backend (Optional)
```bash
cd backend
go run main.go
```
The REST API will start on [http://localhost:8080](http://localhost:8080).

---

## 📦 How to Push to GitHub

Run these commands inside this folder:

```bash
# 1. Initialize Git repository
git init

# 2. Add all project files
git add .

# 3. Create initial commit
git commit -m "Initial commit: Pioneer Technical Project & Workforce Dashboard v2.0"

# 4. Set main branch
git branch -M main

# 5. Link to your GitHub repository (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/pioneer-technical.git

# 6. Push code to GitHub
git push -u origin main
```

---

© 2026 **Pioneers Technical Co. Ltd.** All rights reserved.
# Yasin-Nagoor
# Yasin-Nagoor
