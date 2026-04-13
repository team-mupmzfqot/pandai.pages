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
 * What this script does:
 *   action = "upload_photo" → saves a base64-encoded image to Google Drive
 *                             (PST-Sheets/Photos/) and returns its URL
 *   action = "submit_form"  → appends one row to the PST Sessions spreadsheet
 *
 * On first "submit_form" call the script auto-creates:
 *   • A folder called "PST-Sheets" in your Google Drive root
 *   • A sub-folder "Photos" for uploaded images
 *   • A spreadsheet "PST Sessions" with styled headers
 */

/* ─── Config ─────────────────────────────────────────────────────── */
const FOLDER_NAME  = 'PST-Sheets';
const PHOTOS_FOLDER = 'Photos';
const SHEET_NAME   = 'PST Sessions';

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
  const root        = getOrCreateFolder(FOLDER_NAME);
  const photosDir   = getOrCreateSubfolder(root, PHOTOS_FOLDER);

  const bytes = Utilities.base64Decode(base64Data);
  const blob  = Utilities.newBlob(bytes, mimeType || 'image/jpeg', fileName);
  const file  = photosDir.createFile(blob);

  // Make the file viewable by anyone with the link
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return 'https://drive.google.com/file/d/' + file.getId() + '/view';
}

/* ─── Sheet Append ───────────────────────────────────────────────── */
function appendRow(data) {
  const sheet = getOrCreateSheet();
  sheet.appendRow([
    new Date(),
    data.schoolName         || '',
    data.eventTime          || '',
    data.eventLocation      || '',
    data.onlineSessionDate  || '',
    (data.teacherNames || []).length,
    (data.teacherNames || []).join(', '),
    (data.fileNames    || []).join(', '),
    (data.photoUrls    || []).join('\n'),
    data.submittedAt        || '',
  ]);
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

/* ─── Sheet Helper ───────────────────────────────────────────────── */
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

    const sheet = ss.getActiveSheet();
    sheet.setName('Submissions');
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);

    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#4f46e5');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
  }

  return ss.getSheetByName('Submissions') || ss.getActiveSheet();
}

/* ─── Response Helper ────────────────────────────────────────────── */
function respond(success, message, extra) {
  const payload = Object.assign({ success, message }, extra || {});
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
