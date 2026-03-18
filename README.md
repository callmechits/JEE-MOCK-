# JEEAdv26 Mock Test Platform
### Built for r/JEEAdv26dailyupdates

A full-featured JEE Advanced mock test website with exam interface, leaderboard, and Google Sheets backend.

---

## 🚀 Hosting on GitHub Pages (Free, Forever)

### Step 1 — Create GitHub Repository
1. Go to [github.com](https://github.com) → Sign in (or create free account)
2. Click **"New repository"** (the green button)
3. Name it: `jeeadv26` (or anything you like)
4. Set to **Public**
5. Click **Create repository**

### Step 2 — Upload Files
**Option A: GitHub Web UI (easiest)**
1. On your new repo page, click **"uploading an existing file"**
2. Drag and drop ALL files from this folder:
   - `index.html`
   - `exam.html`
   - `results.html`
   - `leaderboard.html`
   - `papers.html`
   - `admin.html`
   - `js/storage.js`
   - `google-apps-script.js` (keep for reference, don't need to upload)
3. Click **Commit changes**

**Option B: Git CLI**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/jeeadv26.git
git push -u origin main
```

### Step 3 — Enable GitHub Pages
1. Go to your repo → **Settings** tab
2. Scroll down to **"Pages"** in the left sidebar
3. Under **"Source"**, select **"Deploy from a branch"**
4. Branch: `main`, Folder: `/ (root)`
5. Click **Save**
6. Wait ~2 minutes, then your site is live at:
   **`https://YOUR_USERNAME.github.io/jeeadv26/`**

---

## 📊 Setting Up Google Sheets (Free Database)

> Without this, data only saves locally in each user's browser. With Google Sheets, scores sync across all users!

### Step 1 — Create the Spreadsheet
1. Go to [sheets.google.com](https://sheets.google.com)
2. Create a new spreadsheet, name it **`JEEAdv26-DB`**

### Step 2 — Add the Script
1. Click **Extensions → Apps Script**
2. Delete all existing code
3. Open `google-apps-script.js` from this folder, copy everything, paste it in
4. Click 💾 Save (name it anything, e.g. "JEEAdv26")

### Step 3 — Deploy as Web App
1. Click **Deploy → New Deployment**
2. Click the gear icon ⚙️ → Select type: **Web App**
3. Settings:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. **Copy the Web App URL** (looks like `https://script.google.com/macros/s/ABC.../exec`)

### Step 4 — Connect to the Website
1. Go to your site → **Admin** page
2. Enter admin password (default: `admin123`, change this!)
3. Go to **Settings & GSheets**
4. Paste the Web App URL → **Save**
5. Done! All scores now sync to your Google Sheet.

---

## 📝 How to Create a Mock Paper

1. Go to `yoursite.github.io/jeeadv26/admin.html`
2. Login with password (`admin123` by default)
3. **Create Paper** → Enter title, start time, end time → Create
4. **Add Question** → Select paper → Add questions one by one:
   - Type the question text (supports basic HTML for formatting)
   - Upload an image if needed (diagrams, graphs, etc.)
   - Select question type: SCQ / MCQ / Integer
   - Enter options and correct answer
   - Optionally add solution text/image (shown after deadline)
5. Repeat for all questions
6. Post the exam link on Reddit when it's time!

---

## 🔑 Marking Scheme

| Type | Full Marks | Partial | Wrong |
|------|-----------|---------|-------|
| SCQ (Single Correct) | +3 | — | −1 |
| MCQ (Multi Correct) | +4 | +1/+2/+3 (proportional) | −2 (if any wrong option) |
| Integer (Numerical) | +3 | — | 0 |

---

## 📁 File Structure

```
jeeadv26/
├── index.html          # Home page with live/upcoming papers
├── exam.html           # JEE-style exam interface
├── results.html        # Score + solutions page
├── leaderboard.html    # Overall + per-paper leaderboard
├── papers.html         # All papers list
├── admin.html          # Admin panel (create papers, add questions)
├── js/
│   └── storage.js      # Data layer (localStorage + Google Sheets)
└── google-apps-script.js  # Paste this in Google Apps Script
```

---

## ⚙️ Admin Panel Features

- Create papers with custom start/end times
- Add questions with image uploads
- Supports SCQ, MCQ, Integer question types
- Add solutions (revealed after deadline)
- Delete questions or entire papers
- Change admin password
- Configure Google Sheets URL

---

## 🔒 Security Notes

- **Honor system** — username only, no login required for students
- Admin panel protected by password (change the default `admin123`!)
- All data stored in browser localStorage + Google Sheets
- No server costs — 100% free hosting

---

## 💡 Tips

- **Set end time to midnight IST** so everyone has a fair window
- **Post the link on Reddit** with a countdown
- **Change admin password** immediately from Settings
- Images are stored as base64 in the data — keep them under 1MB each for best performance
- The site works offline once loaded (localStorage cache)

---

Built with ❤️ for JEE 2026 aspirants · Good luck! 🎯
