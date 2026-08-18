# ArcBridge Deployment Guide

## Backend (Render)

### Step 1: Push code to GitHub
```bash
git add backend/render.yaml backend/
git commit -m "Add Render deployment config"
git push
```

### Step 2: Create Render account
1. Go to https://render.com
2. Sign up with GitHub
3. Click "New" → "Web Service"
4. Connect your GitHub repo
5. Select `backend` as root directory

### Step 3: Set environment variables on Render
| Key | Value |
|-----|-------|
| `ARC_RPC_URL` | `https://rpc.testnet.arc.network` |
| `CONTRACT_ADDRESS` | `0x788bd809f93b8915f0dcd1ab3b3560355c8d0ff3` |
| `GEMINI_API_KEY` | Your Gemini API key |
| `GEMINI_MODEL` | `gemini-3.7-flash` |
| `CORS_ORIGINS` | `https://your-app.vercel.app,http://localhost:5173` |

### Step 4: Deploy
- Render auto-deploys on push
- Your backend URL will be: `https://arcbridge-backend.onrender.com`

---

## Frontend (Vercel)

### Step 1: Set environment variable on Vercel
1. Go to your Vercel project → Settings → Environment Variables
2. Add:
   | Key | Value |
   |-----|-------|
   | `VITE_BACKEND_URL` | `https://arcbridge-backend.onrender.com` |

### Step 2: Deploy
```bash
git push  # Vercel auto-deploys
```

---

## Local Development
For local development, no changes needed — frontend defaults to `http://127.0.0.1:8000`.
