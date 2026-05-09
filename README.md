# Employee Call Reporting App

A lightweight employee reporting website with:

- an employee form for daily call details
- automatic date capture
- doctor coverage counts by type
- an admin dashboard
- Excel-friendly CSV export
- production-ready Google Sheets storage

## App modes

This app supports two storage modes:

- `local`: saves submissions into `data/submissions.json`
- `google_sheets`: sends submissions directly into Google Sheets through a Google Apps Script web app

For real deployment, use `google_sheets`.

## Local run

```bash
node server.js
```

Then open:

- Employee form: `http://localhost:3000`
- Admin dashboard: `http://localhost:3000/admin`

Default admin code:

```text
admin123
```

Useful local overrides:

```bash
ADMIN_CODE=mysecurecode APP_TIME_ZONE=Asia/Kolkata node server.js
```

## Production setup

In production, each employee submission is saved to Google Sheets immediately. That means you already have the data in Sheets throughout the day, and the admin dashboard can still export a CSV for Excel whenever needed.

### 1. Create the Google Sheet

Create a Google Sheet that will hold all employee submissions.

### 2. Add the Apps Script connector

1. Open the Google Sheet.
2. Go to `Extensions` -> `Apps Script`.
3. Replace the default file contents with the code from [google-apps-script/Code.gs](/Users/ravindrakulkarni/Documents/Codex/2026-05-09-build-an-app-or-website-application/google-apps-script/Code.gs).
4. In Apps Script, open `Project Settings`.
5. Add a script property:

```text
APP_SECRET=your-long-random-secret
```

### 3. Deploy the Apps Script as a web app

1. Click `Deploy` -> `New deployment`.
2. Choose type `Web app`.
3. Execute as: yourself.
4. Who has access: anyone with the link.
5. Deploy and copy the web app URL.

### 4. Deploy the Node app on Render

This repo includes [render.yaml](/Users/ravindrakulkarni/Documents/Codex/2026-05-09-build-an-app-or-website-application/render.yaml), so you can deploy it as a Render Blueprint or create a standard web service from the repo.

Set these environment variables in Render:

- `ADMIN_CODE`: your admin login code
- `GOOGLE_SCRIPT_URL`: the Apps Script web app URL
- `GOOGLE_SCRIPT_SECRET`: the same secret you stored as `APP_SECRET`

The config already sets:

- `HOST=0.0.0.0`
- `PORT=10000`
- `APP_TIME_ZONE=Asia/Kolkata`
- `STORAGE_PROVIDER=google_sheets`

### 5. Open the deployed app

- `/` for employee submissions
- `/admin` for the admin dashboard

## Files

- [server.js](/Users/ravindrakulkarni/Documents/Codex/2026-05-09-build-an-app-or-website-application/server.js): web server and storage integration
- [public/index.html](/Users/ravindrakulkarni/Documents/Codex/2026-05-09-build-an-app-or-website-application/public/index.html): employee form
- [public/admin.html](/Users/ravindrakulkarni/Documents/Codex/2026-05-09-build-an-app-or-website-application/public/admin.html): admin dashboard
- [google-apps-script/Code.gs](/Users/ravindrakulkarni/Documents/Codex/2026-05-09-build-an-app-or-website-application/google-apps-script/Code.gs): Google Sheets connector
- [render.yaml](/Users/ravindrakulkarni/Documents/Codex/2026-05-09-build-an-app-or-website-application/render.yaml): Render deployment config

## Notes

- CSV exports remain available from the admin dashboard.
- Local file export to `exports/` remains available in `local` mode only.
- If you want true multi-admin authentication, that should be upgraded from the single admin code to a proper login provider.
