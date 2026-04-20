# Pandai Pages — Claude Context

## Project Overview
Internal tools for Pandai (edtech company). Primary active feature: **PST Sessions poster generator** — a web form that collects school/teacher data, uploads to Google Sheets via Apps Script, then auto-generates branded Canva posters.

## Repository Structure
```
pandai-pages-vscode/
├── index.html                  # Landing/root page
├── css/                        # Root-level styles
├── assets/                     # Local asset copies (not used by live page — CDN replaces these)
├── canva-credentials.local.md  # Local Canva OAuth notes (not committed to main)
└── pandai-pst-sessions/        # Main active project
    ├── pst-internal-form.html  # The submission form UI
    ├── css/style.css           # Form styles
    ├── js/
    │   ├── main.js             # Frontend form logic + optimizer polling
    │   ├── config.js           # APPS_SCRIPT_URL (gitignored — not committed)
    │   └── config.example.js   # Template for config.js
    └── apps-script/
        └── Code.gs             # Google Apps Script (deployed as Web App)
```

## Tech Stack
- **Frontend**: Vanilla HTML/CSS/JS (no framework), hosted on GitHub Pages
- **Backend**: Google Apps Script (Web App) — sheet writes, Drive uploads, Canva API, optimizer status
- **Canva API**: Brand Template autofill → export → save poster to Drive
- **Image Optimizer**: n8n workflow → Gemini image edit → remove.bg → Drive → callback to Apps Script
- **Storage**: Google Sheets (PST Sessions + Optimizer Status tabs) + Google Drive (PST-Sheets/Photos/)
- **CDN**: Cloudflare Images for header banner, guideline image, success GIF

## Deployment
- **GitHub Pages**: `main` branch auto-deploys — merge `staging` → `main` to ship
- **Apps Script**: Must manually deploy a new version after any Code.gs changes
  - Deploy → Manage deployments → pencil icon → New version → Deploy
  - URL is stable across versions (no config.js update needed)
- **Active branch**: `staging` for development

## Apps Script Web App
- URL stored in `js/config.js` as `CONFIG.APPS_SCRIPT_URL`
- All frontend fetches must use `CONFIG.APPS_SCRIPT_URL` (not bare `APPS_SCRIPT_URL`)
- `doPost` actions: `upload_photo`, `submit_form`, `generate_poster`, `get_redirect_uri`, `optimizer_callback`
- `doGet` actions: Canva OAuth callback (`code`/`error` params), `optimizerStatus`

## Canva Integration
- OAuth flow: Code.gs handles token storage in Script Properties
- Templates keyed by `speaker → teacher count` in `CANVA_TEMPLATES` object (Code.gs)
- Current speakers: `zulfaqar` (templates 1–6 done), `cikgu_wan` (no templates yet)
- Autofill fields: `school_name`, `subtext`, `online_session_date`, `online_session_time`, `teacher_N_name/position/title/photo`
- Canva Client ID: `OC-AZ2GORzqxtRC` (public); Client Secret in Script Properties as `CANVA_CLIENT_SECRET`

## n8n Image Optimizer Workflow
- Form URL: `https://n8n.pandai.org/form/d7345732-b411-4389-96fe-da3475d01cad`
- Flow: Form submit → Extract file → Gemini Pro image edit → Upload to Drive (temp) → remove.bg → Upload final to Drive → Delete temp → POST callback to Apps Script
- Output folder: Drive `1HfvIJXcv-qXOJM886tJADMZ-s4fo0khz` (same as "Check Optimized Image" button)
- Last node (HTTP Request): POSTs `{ action: "optimizer_callback", teacherName, status: "done", fileLink }` to Apps Script
- **Dead node**: "Generate an image" (Gemini Flash path) is disconnected — safe to delete from n8n

## PiP Optimizer Status Flow
1. User clicks "Optimize My Image" → PiP opens, `pipOpenedAt` timestamp recorded, polling starts
2. After 6s auto-transitions to "Processing your image…" (pulsing dot)
3. Every 5s: polls `CONFIG.APPS_SCRIPT_URL?action=optimizerStatus&since={pipOpenedAt}`
4. When n8n callback fires → Apps Script writes to "Optimizer Status" sheet tab
5. Poll detects `status: "done"` → shows ✅ + "View Image" button (links to Drive folder)

## Google Sheet Structure
- File: `PST Sessions` in Drive folder `PST-Sheets/`
- Tab 1 "Submissions": 48 cols — Timestamp | School | Event Time | Location | Online Date | Online Time | Sub Text Poster | Poster Link | Teacher 1–10 (Name, Position, Title, Photo ×4 each)
- Tab 2 "Optimizer Status": Timestamp | Teacher Name | Status | File Link (written by n8n callback)
- Row 1: group headers, Row 2: column headers, Row 3+: data

## Cloudflare Images CDN
- Header banner (Header PST_v3.png): `https://imagedelivery.net/zy4C5mYDeC8QYHozzOk2nQ/413b3f2c-288c-4a33-96e8-fd8676e02a00/public`
- Image guideline: `https://imagedelivery.net/zy4C5mYDeC8QYHozzOk2nQ/98fc8baa-ab90-4c67-b583-156e682a6a00/public`
- Success GIF: `https://imagedelivery.net/zy4C5mYDeC8QYHozzOk2nQ/a532a0b9-be93-4902-c453-fb5d62727500/public`

## What's Done ✅
- Form UI: event details, online session date/time, photo upload (up to 10), teacher name/position/title
- Photo upload with drag-and-drop reorder, preview grid
- Image guideline step with "Optimize My Image" (PiP) + "Check Optimized Image" (Drive folder) buttons
- PiP overlay with live status bar (idle → processing → done) via Apps Script polling
- Speaker selection (Zulfaqar default; Cikgu Wan disabled/SOON)
- Apps Script: sheet write, Drive photo upload, Canva autofill + export, poster saved to Drive
- Canva templates for Zulfaqar: 1–6 teachers
- Poster link written back to sheet after generation
- Post-submit UI: Check Data Sheet, Generate Poster, WhatsApp (SOON)
- Success card with countdown + New Submission button
- Assets on Cloudflare Images CDN

## What's Pending 🔧
1. **Canva templates 7–10 (Zulfaqar)** — stubs commented in Code.gs lines 50–54, just need template IDs
2. **Cikgu Wan speaker** — button exists (SOON), `cikgu_wan` in CANVA_TEMPLATES is empty, needs templates 1–10
3. **WhatsApp Group button** — UI exists (hidden/SOON), no backend logic yet
4. **n8n dead node cleanup** — "Generate an image" node is disconnected, safe to delete

## Git Notes
- Active branch: `staging` → merge to `main` to deploy
- Always push to both: `git push && git checkout main && git merge staging && git push origin main && git checkout staging`
- Git user: `pandaipixel`
- Commit and push directly without prompting when asked
