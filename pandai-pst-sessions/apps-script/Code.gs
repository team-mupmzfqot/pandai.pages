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
 */

/* ─── Config ─────────────────────────────────────────────────────── */
const FOLDER_NAME   = 'PST-Sheets';
const PHOTOS_FOLDER = 'Photos';
const SHEET_NAME    = 'PST Sessions';
const MAX_TEACHERS  = 10;

/* Column palette */
const CLR_SUBMISSION  = '#1e293b';   // dark slate  — Timestamp
const CLR_EVENT       = '#4f46e5';   // indigo      — Event Details (4 cols)
const CLR_TEACHER_ODD = '#0d9488';   // teal        — odd teacher pairs
const CLR_TEACHER_EVN = '#0369a1';   // blue        — even teacher pairs
const CLR_META        = '#475569';   // slate       — Submitted At
const CLR_WHITE       = '#ffffff';
const CLR_HEADER_BG   = '#f8fafc';   // light row bg for group label row

/* ─── Entry points ───────────────────────────────────────────────── */
function doGet() {
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
      const fileUrl = savePhotoToDrive(data.fileName, data.mimeType, data.base64Data);
      return respond(true, 'Photo saved.', { fileUrl });
    }

    if (data.action === 'submit_form') {
      appendRow(data);
      return respond(true, 'Row saved successfully.');
    }

    return respond(false, 'Unknown action.');

  } catch (err) {
    return respond(false, err.toString());
  } finally {
    lock.releaseLock();
  }
}

/* ─── Photo Upload ───────────────────────────────────────────────── */
function savePhotoToDrive(fileName, mimeType, base64Data) {
  const root       = getOrCreateFolder(FOLDER_NAME);
  const photosDir  = getOrCreateSubfolder(root, PHOTOS_FOLDER);

  const bytes = Utilities.base64Decode(base64Data);
  const blob  = Utilities.newBlob(bytes, mimeType || 'image/jpeg', fileName);
  const file  = photosDir.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return 'https://drive.google.com/file/d/' + file.getId() + '/view';
}

/* ─── Sheet Append ───────────────────────────────────────────────── */
function appendRow(data) {
  const sheet   = getOrCreateSheet();
  const names   = data.teacherNames || [];
  const urls    = data.photoUrls    || [];

  // Base columns: Timestamp, School, Event Time, Location, Online Date
  const row = [
    new Date(),
    data.schoolName        || '',
    data.eventTime         || '',
    data.eventLocation     || '',
    data.onlineSessionDate || '',
  ];

  // Teacher pairs: Name | Photo (up to MAX_TEACHERS)
  for (let i = 0; i < MAX_TEACHERS; i++) {
    row.push(names[i] || '', urls[i] || '');
  }

  row.push(data.submittedAt || '');

  const lastRow = sheet.getLastRow() + 1;
  sheet.appendRow(row);

  // Make photo URL cells into clickable hyperlinks
  for (let i = 0; i < MAX_TEACHERS; i++) {
    const url = urls[i];
    if (url) {
      const col = 6 + i * 2 + 1; // photo column index (1-based)
      const cell = sheet.getRange(lastRow, col);
      const richText = SpreadsheetApp.newRichTextValue()
        .setText('View Photo')
        .setLinkUrl(url)
        .build();
      cell.setRichTextValue(richText);
    }
  }
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

  const TOTAL_COLS = 5 + MAX_TEACHERS * 2 + 1; // 26 cols for 10 teachers

  /* ── Row 1: Group header labels ── */
  const groupLabels = [
    // [label, startCol, spanCols, bgColor]
    ['Submission',     1, 1, CLR_SUBMISSION],
    ['Event Details',  2, 4, CLR_EVENT],
  ];
  for (let i = 0; i < MAX_TEACHERS; i++) {
    const col = 6 + i * 2;
    const clr = i % 2 === 0 ? CLR_TEACHER_ODD : CLR_TEACHER_EVN;
    groupLabels.push([`Teacher ${i + 1}`, col, 2, clr]);
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
  ];
  for (let i = 1; i <= MAX_TEACHERS; i++) {
    colHeaders.push(`Teacher ${i} Name`, `Teacher ${i} Photo`);
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
  for (let i = 0; i < MAX_TEACHERS; i++) {
    sheet.setColumnWidth(6 + i * 2,     160);  // Teacher Name
    sheet.setColumnWidth(6 + i * 2 + 1, 110);  // Teacher Photo
  }
  sheet.setColumnWidth(TOTAL_COLS, 160); // Submitted At

  /* ── Row heights ── */
  sheet.setRowHeight(1, 28);
  sheet.setRowHeight(2, 24);

  /* ── Sheet tab colour ── */
  sheet.setTabColor('#4f46e5');
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
