/**
 * Pandai PST Sessions — Google Apps Script
 * ─────────────────────────────────────────
 * SETUP INSTRUCTIONS
 * ──────────────────
 * 1. Go to https://script.google.com  →  New project
 * 2. Replace the default code with this entire file
 * 3. Click  Deploy  →  New deployment
 *    • Type        : Web app
 *    • Execute as  : Me
 *    • Who has access : Anyone
 * 4. Authorise the permissions when prompted (Drive + Sheets access)
 * 5. Copy the Web App URL
 * 6. Paste it into  pandai-pst-sessions/js/config.js  →  APPS_SCRIPT_URL
 *
 * Sheet layout (row 1 = group headers, row 2 = column headers, row 3+ = data):
 *   [Submission] | [──── Event Details ────] | [Teacher 1──] | [Teacher 2──] | … | [Meta]
 *   Timestamp    | School | Time | Loc | Date | Name | Photo  | Name | Photo  | … | Submitted At
 *
 * NOTE: If you already have an existing "PST Sessions" sheet from a previous version,
 * delete it (or rename it) so this script can recreate it with the new layout.
 * Layout v3: 47 cols — Timestamp | School | Time | Loc | Date | Sub Text Poster
 *            | Teacher 1-10 (Name, Position, Title, Photo each) | Submitted At
 */

/* ─── Config ─────────────────────────────────────────────────────── */
const FOLDER_NAME   = 'PST-Sheets';
const PHOTOS_FOLDER = 'Photos';
const SHEET_NAME    = 'PST Sessions';
const MAX_TEACHERS  = 10;

/* ─── Canva Config ───────────────────────────────────────────────── */
// Client ID (public). Client Secret stored in Script Properties → CANVA_CLIENT_SECRET
const CANVA_CLIENT_ID = 'OC-AZ2GORzqxtRC';
const CANVA_API_BASE  = 'https://api.canva.com/rest/v1';
const CANVA_AUTH_URL  = 'https://www.canva.com/api/oauth/authorize';
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const CANVA_SCOPE     = 'asset:write asset:read design:content:write brandtemplate:content:read';

// Brand Template IDs by teacher count — add IDs as templates are created in Canva
const CANVA_TEMPLATES = {
  1: 'EAHGzdJTPio',
  // 2: 'TEMPLATE_ID_FOR_2',
  // 3: 'TEMPLATE_ID_FOR_3',
  // ...
};

/* Column palette */
const CLR_SUBMISSION  = '#1e293b';   // dark slate  — Timestamp
const CLR_EVENT       = '#4f46e5';   // indigo      — Event Details (4 cols)
const CLR_TEACHER_ODD = '#0d9488';   // teal        — odd teacher pairs
const CLR_TEACHER_EVN = '#0369a1';   // blue        — even teacher pairs
const CLR_META        = '#475569';   // slate       — Submitted At
const CLR_WHITE       = '#ffffff';
const CLR_HEADER_BG   = '#f8fafc';   // light row bg for group label row

/* ─── Entry points ───────────────────────────────────────────────── */
function doGet(e) {
  // Handle Canva OAuth redirect callback
  if (e && e.parameter) {
    if (e.parameter.code) {
      return handleCanvaOAuthCallback(e);
    }
    // Canva sent an error instead of a code — show it so we can diagnose
    if (e.parameter.error) {
      return HtmlService.createHtmlOutput(
        '<html><body style="font-family:sans-serif;padding:2rem;max-width:600px">' +
        '<h3 style="color:#c00">Canva OAuth Error</h3>' +
        '<p><strong>Error:</strong> ' + e.parameter.error + '</p>' +
        '<p>' + (e.parameter.error_description || '') + '</p>' +
        '<hr><p style="font-size:.85rem;color:#666">Params received: <pre>' +
        JSON.stringify(e.parameter, null, 2) + '</pre></p>' +
        '</body></html>'
      );
    }
  }
  return respond(true, 'PST Sessions Apps Script is running. Submit data via POST.');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (_) {
    return respond(false, 'Could not acquire lock — please try again.');
  }

  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'upload_photo') {
      const fileUrl = savePhotoToDrive(data.fileName, data.mimeType, data.base64Data, data.schoolName);
      return respond(true, 'Photo saved.', { fileUrl });
    }

    if (data.action === 'submit_form') {
      const sheetUrl = appendRow(data);
      return respond(true, 'Row saved successfully.', { sheetUrl });
    }

    if (data.action === 'generate_poster') {
      const result = handleGeneratePoster(data);
      if (result.needsAuth) {
        return respond(true, 'Authorization required.', { needsAuth: true, authUrl: result.authUrl });
      }
      return respond(true, 'Poster generated.', {
        driveViewUrl:     result.driveViewUrl,
        driveDownloadUrl: result.driveDownloadUrl,
      });
    }

    // Debug: returns the exact redirect URI and auth URL this deployment would use
    if (data.action === 'get_redirect_uri') {
      const redirectUri = getRedirectUri();
      const rawUrl      = ScriptApp.getService().getUrl();
      return respond(true, 'Debug info', { redirectUri, rawUrl });
    }

    return respond(false, 'Unknown action.');

  } catch (err) {
    return respond(false, err.toString());
  } finally {
    lock.releaseLock();
  }
}

/* ─── Photo Upload ───────────────────────────────────────────────── */
function savePhotoToDrive(fileName, mimeType, base64Data, schoolName) {
  const root       = getOrCreateFolder(FOLDER_NAME);
  const photosDir  = getOrCreateSubfolder(root, PHOTOS_FOLDER);

  // Store photos in a sub-folder named after the school
  const schoolFolder = getOrCreateSubfolder(photosDir, sanitizeFolderName(schoolName));

  const bytes = Utilities.base64Decode(base64Data);
  const blob  = Utilities.newBlob(bytes, mimeType || 'image/jpeg', fileName);
  const file  = schoolFolder.createFile(blob);

  // Workspace orgs may restrict "Anyone with link" sharing — catch and continue.
  // The Canva integration accesses files via the script owner's credentials, not via URL.
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (_) {}

  return 'https://drive.google.com/file/d/' + file.getId() + '/view';
}

function sanitizeFolderName(name) {
  if (!name) return 'Unknown School';
  // Trim, uppercase, replace characters unsafe in folder names
  return name.trim().toUpperCase().replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, ' ');
}

/* ─── Sheet Append ───────────────────────────────────────────────── */
function appendRow(data) {
  const sheet     = getOrCreateSheet();
  const names     = data.teacherNames     || [];
  const positions = data.teacherPositions || [];
  const titles    = data.teacherTitles    || [];
  const urls      = data.photoUrls        || [];

  // Cols 1-5: base event details
  // Col  6:   Sub Text Poster
  // Cols 7+:  Teacher quadruplets — Name | Position | Title | Photo (×10)
  // Last col: Submitted At
  const row = [
    new Date(),
    data.schoolName        || '',
    data.eventTime         || '',
    data.eventLocation     || '',
    data.onlineSessionDate || '',
    data.subTextPoster     || '',
  ];

  // Teacher quadruplets: Name | Position | Title | Photo (up to MAX_TEACHERS)
  for (let i = 0; i < MAX_TEACHERS; i++) {
    row.push(names[i] || '', positions[i] || '', titles[i] || '', urls[i] || '');
  }

  row.push(data.submittedAt || '');

  sheet.appendRow(row);
  const lastRow = sheet.getLastRow();

  // Centre-align the entire new row
  const TOTAL_COLS = 6 + MAX_TEACHERS * 4 + 1;
  sheet.getRange(lastRow, 1, 1, TOTAL_COLS)
       .setHorizontalAlignment('center')
       .setVerticalAlignment('middle');

  // Make photo URL cells into clickable hyperlinks
  // Photo col (1-based) for teacher i: 7 + i*4 + 3
  for (let i = 0; i < MAX_TEACHERS; i++) {
    const url = urls[i];
    if (url) {
      const col  = 7 + i * 4 + 3;
      const cell = sheet.getRange(lastRow, col);
      const richText = SpreadsheetApp.newRichTextValue()
        .setText('View Photo')
        .setLinkUrl(url)
        .build();
      cell.setRichTextValue(richText);
    }
  }

  // Return the spreadsheet URL so the frontend can link directly to it
  return sheet.getParent().getUrl();
}

/* ─── Sheet Creation ─────────────────────────────────────────────── */
function getOrCreateSheet() {
  const folder = getOrCreateFolder(FOLDER_NAME);
  const files  = folder.getFilesByName(SHEET_NAME);

  let ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SHEET_NAME);
    const file = DriveApp.getFileById(ss.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    buildSheetStructure(ss.getActiveSheet());
  }

  const sheet = ss.getSheetByName('Submissions') || ss.getActiveSheet();
  return sheet;
}

function buildSheetStructure(sheet) {
  sheet.setName('Submissions');

  // Col 1: Timestamp | Cols 2-5: Event Details | Col 6: Poster Detail
  // Cols 7-(6+MAX_TEACHERS*4): Teacher quadruplets | Last col: Meta
  const TOTAL_COLS = 6 + MAX_TEACHERS * 4 + 1; // 47 cols for 10 teachers

  /* ── Row 1: Group header labels ── */
  const groupLabels = [
    // [label, startCol, spanCols, bgColor]
    ['Submission',    1, 1, CLR_SUBMISSION],
    ['Event Details', 2, 4, CLR_EVENT],
    ['Poster Detail', 6, 1, CLR_META],
  ];
  for (let i = 0; i < MAX_TEACHERS; i++) {
    const col = 7 + i * 4;
    const clr = i % 2 === 0 ? CLR_TEACHER_ODD : CLR_TEACHER_EVN;
    groupLabels.push([`Teacher ${i + 1}`, col, 4, clr]);
  }
  groupLabels.push(['Meta', TOTAL_COLS, 1, CLR_META]);

  groupLabels.forEach(([label, startCol, span, bg]) => {
    const range = sheet.getRange(1, startCol, 1, span);
    if (span > 1) range.merge();
    range.setValue(label)
         .setBackground(bg)
         .setFontColor(CLR_WHITE)
         .setFontWeight('bold')
         .setFontSize(10)
         .setHorizontalAlignment('center')
         .setVerticalAlignment('middle');
  });

  /* ── Row 2: Individual column headers ── */
  const colHeaders = [
    'Timestamp',
    'School Name',
    'Event Time',
    'Event Location',
    'Online Session Date',
    'Sub Text Poster',
  ];
  for (let i = 1; i <= MAX_TEACHERS; i++) {
    colHeaders.push(
      `Teacher ${i} Name`,
      `Teacher ${i} Position`,
      `Teacher ${i} Title`,
      `Teacher ${i} Photo`
    );
  }
  colHeaders.push('Submitted At');

  const headerRow = sheet.getRange(2, 1, 1, TOTAL_COLS);
  headerRow.setValues([colHeaders])
           .setBackground('#e0e7ff')
           .setFontColor('#1e1b4b')
           .setFontWeight('bold')
           .setFontSize(9)
           .setHorizontalAlignment('center')
           .setVerticalAlignment('middle')
           .setWrap(false);

  /* ── Freeze both header rows ── */
  sheet.setFrozenRows(2);

  /* ── Row banding for data rows ── */
  const dataRange = sheet.getRange(3, 1, 1000, TOTAL_COLS);
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  /* ── Column widths ── */
  sheet.setColumnWidth(1, 160);  // Timestamp
  sheet.setColumnWidth(2, 180);  // School Name
  sheet.setColumnWidth(3, 150);  // Event Time
  sheet.setColumnWidth(4, 180);  // Event Location
  sheet.setColumnWidth(5, 150);  // Online Session Date
  sheet.setColumnWidth(6, 220);  // Sub Text Poster
  for (let i = 0; i < MAX_TEACHERS; i++) {
    sheet.setColumnWidth(7 + i * 4,     160);  // Teacher Name
    sheet.setColumnWidth(7 + i * 4 + 1, 160);  // Teacher Position
    sheet.setColumnWidth(7 + i * 4 + 2, 140);  // Teacher Title
    sheet.setColumnWidth(7 + i * 4 + 3, 110);  // Teacher Photo
  }
  sheet.setColumnWidth(TOTAL_COLS, 160); // Submitted At

  /* ── Row heights ── */
  sheet.setRowHeight(1, 28);
  sheet.setRowHeight(2, 24);

  /* ── Sheet tab colour ── */
  sheet.setTabColor('#0d9488');
}

/* ─── Drive Helpers ──────────────────────────────────────────────── */
function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function getOrCreateSubfolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

/* ─── Response Helper ────────────────────────────────────────────── */
function respond(success, message, extra) {
  const payload = Object.assign({ success, message }, extra || {});
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ═══════════════════════════════════════════════════════════════════
   CANVA INTEGRATION
   ═══════════════════════════════════════════════════════════════════ */

/* ─── OAuth / PKCE helpers ───────────────────────────────────────── */
function generateCodeVerifier() {
  // Two UUID hex strings concatenated → 64 unreserved chars, well within 43-128 range
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function generateCodeChallenge(verifier) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, verifier);
  // Base64URL encode: swap + → -, / → _, strip padding =
  return Utilities.base64Encode(digest)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g,  '');
}

/* ─── OAuth ──────────────────────────────────────────────────────── */

/**
 * Returns the canonical (non-Workspace-domain) redirect URI for Canva OAuth.
 * Google Workspace accounts get /a/macros/domain/s/.../exec URLs from ScriptApp,
 * but those don't work as OAuth redirect targets — we normalise to /macros/s/.../exec.
 * A CANVA_REDIRECT_URI Script Property can override this if needed.
 */
function getRedirectUri() {
  const props  = PropertiesService.getScriptProperties();
  const pinned = props.getProperty('CANVA_REDIRECT_URI');
  if (pinned) return pinned;

  // Normalise Workspace domain URL → canonical /macros/s/…/exec
  // Google Workspace returns: script.google.com/a/macros/<domain>/macros/s/<id>/dev|exec
  // We need:                  script.google.com/macros/s/<id>/exec
  const raw = ScriptApp.getService().getUrl();
  return raw
    .replace(/\/a\/macros\/[^\/]+\/macros\/s\//, '/macros/s/')  // strip /a/macros/<domain>/macros/
    .replace(/\/a\/macros\/[^\/]+\/s\//, '/macros/s/')           // fallback: strip /a/macros/<domain>/
    .replace(/\/dev$/, '/exec');                                  // dev URL → exec URL
}

function getCanvaAuthUrl() {
  const props        = PropertiesService.getScriptProperties();
  const state        = Utilities.getUuid();
  const codeVerifier = generateCodeVerifier();

  props.setProperty('CANVA_OAUTH_STATE',        state);
  props.setProperty('CANVA_CODE_VERIFIER',       codeVerifier);

  const codeChallenge = generateCodeChallenge(codeVerifier);
  const redirectUri   = getRedirectUri();
  const params = [
    'client_id='              + encodeURIComponent(CANVA_CLIENT_ID),
    'response_type=code',
    'scope='                  + encodeURIComponent(CANVA_SCOPE),
    'redirect_uri='           + encodeURIComponent(redirectUri),
    'state='                  + encodeURIComponent(state),
    'code_challenge='         + codeChallenge,
    'code_challenge_method=S256',
  ].join('&');

  return CANVA_AUTH_URL + '?' + params;
}

function handleCanvaOAuthCallback(e) {
  const props        = PropertiesService.getScriptProperties();
  const code         = e.parameter.code;
  const state        = e.parameter.state;
  const savedState   = props.getProperty('CANVA_OAUTH_STATE');

  if (!code || state !== savedState) {
    return HtmlService.createHtmlOutput('<h3>Authorization failed: invalid state.</h3>');
  }

  const clientSecret = props.getProperty('CANVA_CLIENT_SECRET');
  const codeVerifier = props.getProperty('CANVA_CODE_VERIFIER');
  const redirectUri  = getRedirectUri();

  const res = UrlFetchApp.fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    payload: [
      'grant_type=authorization_code',
      'code='           + encodeURIComponent(code),
      'client_id='      + encodeURIComponent(CANVA_CLIENT_ID),
      'client_secret='  + encodeURIComponent(clientSecret),
      'redirect_uri='   + encodeURIComponent(redirectUri),
      'code_verifier='  + encodeURIComponent(codeVerifier),
    ].join('&'),
    muteHttpExceptions: true,
  });

  const tokens = JSON.parse(res.getContentText());

  if (tokens.access_token) {
    props.setProperty('CANVA_ACCESS_TOKEN',  tokens.access_token);
    props.setProperty('CANVA_REFRESH_TOKEN', tokens.refresh_token || '');
    props.setProperty('CANVA_TOKEN_EXPIRY',  String(Date.now() + (tokens.expires_in || 3600) * 1000));

    return HtmlService.createHtmlOutput(
      '<html><body>' +
      '<script>window.opener && window.opener.postMessage("canva_auth_success","*");window.close();</script>' +
      '<p style="font-family:sans-serif;text-align:center;margin-top:3rem">' +
      '✅ Canva authorized! You can close this window.</p>' +
      '</body></html>'
    );
  }

  return HtmlService.createHtmlOutput(
    '<h3>Authorization failed.</h3><pre>' + res.getContentText() + '</pre>'
  );
}

function getCanvaAccessToken() {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty('CANVA_ACCESS_TOKEN');
  const expiry = props.getProperty('CANVA_TOKEN_EXPIRY');

  // Return token if valid with >5 min remaining
  if (token && expiry && Date.now() < parseInt(expiry) - 300000) return token;

  // Attempt refresh
  const refreshToken = props.getProperty('CANVA_REFRESH_TOKEN');
  if (refreshToken) return refreshCanvaToken(refreshToken);

  return null; // Not authorized yet
}

function refreshCanvaToken(refreshToken) {
  const props        = PropertiesService.getScriptProperties();
  const clientSecret = props.getProperty('CANVA_CLIENT_SECRET');

  const res = UrlFetchApp.fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    payload: [
      'grant_type=refresh_token',
      'refresh_token=' + encodeURIComponent(refreshToken),
      'client_id='     + encodeURIComponent(CANVA_CLIENT_ID),
      'client_secret=' + encodeURIComponent(clientSecret),
    ].join('&'),
    muteHttpExceptions: true,
  });

  const tokens = JSON.parse(res.getContentText());
  if (!tokens.access_token) throw new Error('Token refresh failed: ' + res.getContentText());

  props.setProperty('CANVA_ACCESS_TOKEN',  tokens.access_token);
  if (tokens.refresh_token) props.setProperty('CANVA_REFRESH_TOKEN', tokens.refresh_token);
  props.setProperty('CANVA_TOKEN_EXPIRY',  String(Date.now() + (tokens.expires_in || 3600) * 1000));

  return tokens.access_token;
}

/* ─── One-time setup ─────────────────────────────────────────────── */
/**
 * Run once in Apps Script editor: Run → setupCanvaCredentials
 * Paste your Canva Client Secret below, run the function ONCE, then delete the value.
 * The secret is stored in Script Properties and never exposed in code.
 */
function setupCanvaCredentials() {
  PropertiesService.getScriptProperties()
    .setProperty('CANVA_CLIENT_SECRET', 'PASTE_YOUR_CANVA_CLIENT_SECRET_HERE');
  Logger.log('✓ Canva client secret saved. Remove the value from code now.');
}

/**
 * Run this in the Apps Script editor to clear stored Canva tokens.
 * Required after adding new OAuth scopes — forces re-authorization next Generate Poster click.
 */
function clearCanvaTokens() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('CANVA_ACCESS_TOKEN');
  props.deleteProperty('CANVA_REFRESH_TOKEN');
  props.deleteProperty('CANVA_TOKEN_EXPIRY');
  Logger.log('✓ Canva tokens cleared. Re-authorization will be required.');
}

/**
 * Run in Apps Script editor to see the exact redirect URI this deployment uses.
 * Copy the logged URL and paste it into Canva Developer Portal → OAuth Redirect URIs.
 */
function logRedirectUri() {
  Logger.log('ScriptApp URL:  ' + ScriptApp.getService().getUrl());
  Logger.log('Pinned URI:     ' + getRedirectUri());
  Logger.log('Auth URL: '       + getCanvaAuthUrl());
}

/* ─── Asset Upload ───────────────────────────────────────────────── */
function uploadAssetToCanva(driveFileId, fileName, accessToken) {
  const file  = DriveApp.getFileById(driveFileId);
  const blob  = file.getBlob();
  const bytes = blob.getBytes();

  // Asset-Upload-Metadata: raw JSON string — NOT base64url-encoded
  // Only the inner name_base64 value is base64-encoded (standard, with = padding)
  const nameB64    = Utilities.base64Encode(fileName);
  const metaHeader = JSON.stringify({ name_base64: nameB64 });

  Logger.log('[upload] file=' + fileName + ' bytes=' + bytes.length + ' meta=' + metaHeader);

  // Correct endpoint: POST /rest/v1/asset-uploads (not /assets/upload)
  // Content-Type must be application/octet-stream per Canva docs
  const uploadRes = UrlFetchApp.fetch(CANVA_API_BASE + '/asset-uploads', {
    method:      'POST',
    contentType: 'application/octet-stream',
    headers: {
      'Authorization':         'Bearer ' + accessToken,
      'Asset-Upload-Metadata': metaHeader,
    },
    payload:            bytes,
    muteHttpExceptions: true,
  });

  Logger.log('[upload] status=' + uploadRes.getResponseCode() + ' body=' + uploadRes.getContentText());

  const uploadData = JSON.parse(uploadRes.getContentText());
  if (!uploadData.job || !uploadData.job.id) {
    throw new Error('Asset upload failed: ' + uploadRes.getContentText());
  }

  // If already succeeded on first response, return immediately
  if (uploadData.job.status === 'success') return uploadData.job.asset.id;

  // Poll GET /asset-uploads/{jobId} until job.status === 'success'
  const jobId = uploadData.job.id;
  for (let i = 0; i < 15; i++) {
    Utilities.sleep(2000);
    const statusRes = UrlFetchApp.fetch(CANVA_API_BASE + '/asset-uploads/' + jobId, {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true,
    });
    const statusData = JSON.parse(statusRes.getContentText());
    const job        = statusData.job;
    if (!job) throw new Error('Asset poll error: ' + statusRes.getContentText());
    if (job.status === 'success') return job.asset.id;
    if (job.status === 'failed')  throw new Error('Asset import failed for ' + fileName + ': ' + JSON.stringify(job.error));
  }
  throw new Error('Asset upload timed out for: ' + fileName);
}

/* ─── Autofill ───────────────────────────────────────────────────── */
function createAutofillJob(brandTemplateId, fieldData, accessToken) {
  // Canva autofill `data` must be an object keyed by field name, not an array
  // Input: [{name, type, text|asset_id}, ...]
  // Output: { field_name: { type, text|asset_id }, ... }
  const dataObj = {};
  fieldData.forEach(function(field) {
    const val = { type: field.type };
    if (field.type === 'text')  val.text     = field.text;
    if (field.type === 'image') val.asset_id = field.asset_id;
    dataObj[field.name] = val;
  });

  const body = JSON.stringify({ brand_template_id: brandTemplateId, data: dataObj });
  Logger.log('[autofill] body=' + body);

  const res = UrlFetchApp.fetch(CANVA_API_BASE + '/autofills', {
    method:      'POST',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
    },
    payload:            body,
    muteHttpExceptions: true,
  });

  Logger.log('[autofill] status=' + res.getResponseCode() + ' body=' + res.getContentText());

  const result = JSON.parse(res.getContentText());
  if (!result.job) throw new Error('Autofill job failed: ' + res.getContentText());
  return result.job.id;
}

function pollAutofillJob(jobId, accessToken) {
  let lastBody = '';
  for (let i = 0; i < 30; i++) {
    Utilities.sleep(3000);
    const res  = UrlFetchApp.fetch(CANVA_API_BASE + '/autofills/' + jobId, {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true,
    });
    lastBody = res.getContentText();
    Logger.log('[autofill poll ' + i + '] ' + lastBody);
    const result = JSON.parse(lastBody);
    const job    = result.job;
    if (!job) throw new Error('Autofill poll unexpected response: ' + lastBody);
    if (job.status === 'success') {
      // design ID lives at job.result.design.id
      const designId = job.result && job.result.design && job.result.design.id;
      if (!designId) throw new Error('Autofill success but no design ID. Full response: ' + lastBody);
      return designId;
    }
    if (job.status === 'failed') throw new Error('Autofill job failed: ' + lastBody);
  }
  throw new Error('Autofill timed out. Last response: ' + lastBody);
}

/* ─── Export ─────────────────────────────────────────────────────── */
function exportDesign(designId, accessToken) {
  const res = UrlFetchApp.fetch(CANVA_API_BASE + '/exports', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type':  'application/json',
    },
    payload:            JSON.stringify({ design_id: designId, format: 'png' }),
    muteHttpExceptions: true,
  });

  const result = JSON.parse(res.getContentText());
  if (!result.job || !result.job.id) throw new Error('Export job failed: ' + res.getContentText());
  return result.job.id;
}

function pollExportJob(exportJobId, accessToken) {
  for (let i = 0; i < 30; i++) {
    Utilities.sleep(3000);
    const res    = UrlFetchApp.fetch(CANVA_API_BASE + '/exports/' + exportJobId, {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true,
    });
    const result = JSON.parse(res.getContentText());
    const job    = result.job;
    if (job && job.status === 'success') {
      // API returns job.result.download_list[].url
      const list = job.result && job.result.download_list;
      if (list && list.length) return list.map(function(d) { return d.url; });
      throw new Error('Export succeeded but no download URLs returned.');
    }
    if (job && job.status === 'failed') throw new Error('Export job failed.');
  }
  throw new Error('Export job timed out.');
}

/* ─── Date / Time Formatting ─────────────────────────────────────── */
function formatEventTime(datetimeLocal) {
  // "2026-02-05T20:00" → "8PM"  |  "2026-02-05T08:30" → "8:30AM"
  if (!datetimeLocal) return '';
  const timePart = (datetimeLocal.split('T')[1] || '').substring(0, 5);
  if (!timePart) return '';

  const [h, m]  = timePart.split(':').map(Number);
  const ampm    = h >= 12 ? 'PM' : 'AM';
  const hour12  = h % 12 || 12;
  const minutes = m === 0 ? '' : ':' + String(m).padStart(2, '0');
  return hour12 + minutes + ampm;
}

function formatOnlineSessionDate(datetimeLocal) {
  // "2026-02-05T20:00" → "KHAMIS, 5 FEBRUARI 2026"
  if (!datetimeLocal) return '';
  const datePart = datetimeLocal.split('T')[0];
  // Construct in UTC to avoid timezone shift
  const [yr, mo, dy] = datePart.split('-').map(Number);
  const date = new Date(yr, mo - 1, dy); // local date, no TZ shift

  const DAYS   = ['AHAD','ISNIN','SELASA','RABU','KHAMIS','JUMAAT','SABTU'];
  const MONTHS = ['JANUARI','FEBRUARI','MAC','APRIL','MEI','JUN',
                  'JULAI','OGOS','SEPTEMBER','OKTOBER','NOVEMBER','DISEMBER'];

  return DAYS[date.getDay()] + ', ' + dy + ' ' + MONTHS[mo - 1] + ' ' + yr;
}

/* ─── Main Poster Generator ──────────────────────────────────────── */
function handleGeneratePoster(data) {
  const photoUrls    = (data.photoUrls || []).filter(u => u);
  const teacherCount = photoUrls.length;
  if (teacherCount === 0) throw new Error('No teacher photos provided.');

  const templateId = CANVA_TEMPLATES[teacherCount];
  if (!templateId) throw new Error(
    'No Canva template configured for ' + teacherCount + ' teacher(s). ' +
    'Please add the Brand Template ID to CANVA_TEMPLATES in Code.gs.'
  );

  const accessToken = getCanvaAccessToken();
  if (!accessToken) return { needsAuth: true, authUrl: getCanvaAuthUrl() };

  const names     = data.teacherNames     || [];
  const positions = data.teacherPositions || [];
  const titles    = data.teacherTitles    || [];

  // Build Canva autofill field data — must be an array of { name, type, ... } objects
  const fieldData = [
    { name: 'school_name',         type: 'text', text: data.schoolName    || '' },
    { name: 'subtext',             type: 'text', text: data.subTextPoster || '' },
    { name: 'event_time',          type: 'text', text: formatEventTime(data.eventTime) },
    { name: 'online_session_date', type: 'text', text: formatOnlineSessionDate(data.onlineSessionDate) },
  ];

  // Upload each teacher photo to Canva and add teacher fields
  for (let i = 0; i < teacherCount; i++) {
    const n      = i + 1;
    const match  = photoUrls[i].match(/\/d\/([a-zA-Z0-9_-]+)\//);
    if (!match) throw new Error('Cannot parse Drive file ID from: ' + photoUrls[i]);

    const assetId = uploadAssetToCanva(match[1], 'teacher_' + n + '.jpg', accessToken);
    fieldData.push({ name: 'teacher_' + n + '_photo',    type: 'image', asset_id: assetId });
    fieldData.push({ name: 'teacher_' + n + '_name',     type: 'text',  text: names[i]     || '' });
    fieldData.push({ name: 'teacher_' + n + '_position', type: 'text',  text: positions[i] || '' });
    fieldData.push({ name: 'teacher_' + n + '_title',    type: 'text',  text: titles[i]    || '' });
  }

  // Autofill → get design ID
  const autofillJobId = createAutofillJob(templateId, fieldData, accessToken);
  const designId      = pollAutofillJob(autofillJobId, accessToken);

  // Export design → download URLs
  const exportJobId   = exportDesign(designId, accessToken);
  const exportedUrls  = pollExportJob(exportJobId, accessToken);
  if (!exportedUrls || !exportedUrls.length) throw new Error('No export URLs returned.');

  // Download poster and save to Drive in school folder
  const posterBlob = UrlFetchApp.fetch(exportedUrls[0]).getBlob()
    .setName('PST_Poster_' + sanitizeFolderName(data.schoolName) + '.png');

  const root         = getOrCreateFolder(FOLDER_NAME);
  const photosDir    = getOrCreateSubfolder(root, PHOTOS_FOLDER);
  const schoolFolder = getOrCreateSubfolder(photosDir, sanitizeFolderName(data.schoolName));
  const posterFile   = schoolFolder.createFile(posterBlob);
  try { posterFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (_) {}

  const id = posterFile.getId();
  return {
    driveViewUrl:     'https://drive.google.com/file/d/' + id + '/view',
    driveDownloadUrl: 'https://drive.google.com/uc?export=download&id=' + id,
  };
}
