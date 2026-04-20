# Pandai Pages — Claude Context

## Project Overview
Internal tools for Pandai (edtech company). Primary active feature: **PST Sessions poster generator** — a web form that collects school/teacher data, uploads to Google Sheets via Apps Script, then auto-generates branded Canva posters.

## Repository Structure
```
pandai-pages-vscode/
├── index.html                  # Landing/root page
├── css/                        # Root-level styles
├── assets/                     # Shared images (banners, GIFs)
├── canva-credentials.local.md  # Local Canva OAuth notes (not committed to main)
└── pandai-pst-sessions/        # Main active project
    ├── pst-internal-form.html  # The submission form UI
    ├── css/style.css           # Form styles
    ├── js/
    │   ├── main.js             # Frontend form logic
    │   ├── config.js           # APPS_SCRIPT_URL + Sheet URL (gitignored secrets)
    │   └── config.example.js   # Template for config.js
    └── apps-script/
        └── Code.gs             # Google Apps Script (deployed as Web App)
```

## Tech Stack
- **Frontend**: Vanilla HTML/CSS/JS (no framework), deployed as static files
- **Backend**: Google Apps Script (Web App) — handles sheet writes, Drive uploads, Canva API calls
- **Canva API**: Brand Template autofill → export → save poster to Drive
- **Storage**: Google Sheets (PST Sessions sheet) + Google Drive (PST-Sheets/Photos folders)

## Current Branch: `staging`
Deploy to `main` when stable. The `staging` branch is the active dev branch.

## Canva Integration Details
- OAuth flow: Code.gs handles token storage in Script Properties
- Templates keyed by `speaker → teacher count` in `CANVA_TEMPLATES` object
- Current speakers: `zulfaqar` (templates 1–6 done), `cikgu_wan` (no templates yet)
- Autofill fields: `school_name`, `subtext`, `online_session_date`, `online_session_time`, `teacher_N_name/position/title/photo`

## Sheet Layout (row 1 = group headers, row 2 = col headers, row 3+ = data)
Timestamp | School | Time | Loc | Date | Sub Text Poster | Poster Link | Teacher 1–10 (Name, Position, Title, Photo each)
Layout v4: 47 cols total

## What's Done ✅
- Form UI: event details, online session date/time, photo upload (up to 10), teacher name/position/title fields
- Photo upload with drag-and-drop reorder, preview grid
- Image guideline step before upload
- Speaker selection (Zulfaqar selected by default; Cikgu Wan marked SOON)
- Apps Script: sheet write, Drive photo upload, Canva autofill + export, poster saved to Drive
- Canva template IDs for Zulfaqar: 1–6 teachers
- Poster link written back to sheet after generation
- Post-submit UI: Check Data Sheet button, Generate Poster button, WhatsApp button (SOON)
- Success card with countdown, New Submission button

## What's Pending / In-Progress 🔧
1. **Canva templates 7–10 for Zulfaqar** — commented stubs in Code.gs (lines 50–54), need template IDs
2. **Cikgu Wan speaker** — button exists (disabled/SOON), `cikgu_wan` key in CANVA_TEMPLATES is empty, needs all templates (1–10)
3. **WhatsApp Group button** — exists in UI (hidden/SOON), no logic implemented
4. **Event time field inconsistency** — form has `eventTime` (datetime-local) but sheet uses separate date/time; may need alignment review
5. **Templates for 7–10 teachers** — only 6-teacher layouts exist so far

## Key Config
- `APPS_SCRIPT_URL` in `js/config.js` (not committed) — must point to deployed Web App
- Canva Client ID: `OC-AZ2GORzqxtRC` (public, in Code.gs)
- Canva Client Secret: stored in Apps Script Properties as `CANVA_CLIENT_SECRET`
- Folders created automatically: `PST-Sheets/Photos/<SchoolName>/`

## Git Notes
- Branch: `staging` → PR to `main` when ready
- Git user: `pandaipixel`
- Commit without prompting — push directly when asked
