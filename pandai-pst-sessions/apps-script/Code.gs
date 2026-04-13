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
 * What this script does on first run:
 *   • Creates a folder called "PST-Sheets" in your Google Drive root
 *   • Creates a spreadsheet called "PST Sessions" inside that folder
 *   • Adds column headers to the sheet
 *   • Every subsequent form submission appends one row
 */

/* ─── Config ─────────────────────────────────────────────────────── */
const FOLDER_NAME = 'PST-Sheets';
const SHEET_NAME  = 'PST Sessions';

const HEADERS = [
  'Timestamp',
  'School Name',
  'Event Time',
  'Event Location',
  'Online Session Date',
  'Number of Teachers',
  'Teacher Names',
  'Photo File Names',
  'Photo URLs',
  'Submitted At',
];

/* ─── Entry point ────────────────────────────────────────────────── */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (_) {
    return respond(false, 'Could not acquire lock — please try again.');
  }

  try {
    const data   = JSON.parse(e.postData.contents);
    const sheet  = getOrCreateSheet();

    sheet.appendRow([
      new Date(),                                    // Timestamp (auto)
      data.schoolName         || '',
      data.eventTime          || '',
      data.eventLocation      || '',
      data.onlineSessionDate  || '',
      (data.teacherNames || []).length,
      (data.teacherNames || []).join(', '),
      (data.fileNames    || []).join(', '),
      (data.photoUrls    || []).join('\n'),           // one URL per line
      data.submittedAt        || '',
    ]);

    return respond(true, 'Row saved successfully.');

  } catch (err) {
    return respond(false, err.toString());
  } finally {
    lock.releaseLock();
  }
}

/* ─── Helpers ────────────────────────────────────────────────────── */

/**
 * Returns the target sheet, creating the Drive folder, spreadsheet,
 * and header row if they do not yet exist.
 */
function getOrCreateSheet() {
  const folder = getOrCreateFolder(FOLDER_NAME);
  const files  = folder.getFilesByName(SHEET_NAME);

  let ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SHEET_NAME);
    // Move the newly created file into PST-Sheets
    const file = DriveApp.getFileById(ss.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);   // remove from root

    // Write headers
    const sheet = ss.getActiveSheet();
    sheet.setName('Submissions');
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);

    // Style the header row
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#4f46e5');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
  }

  return ss.getSheetByName('Submissions') || ss.getActiveSheet();
}

/**
 * Finds the first Drive folder with `name` in the root,
 * or creates it if it does not exist.
 */
function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

/**
 * Builds a JSON ContentService response with CORS headers.
 */
function respond(success, message) {
  const payload = JSON.stringify({ success, message });
  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}
