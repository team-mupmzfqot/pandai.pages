/* ─── State ──────────────────────────────────────────────────────── */
const MAX_PHOTOS = 10;
let uploadedFiles   = [];   // { file: File, dataUrl: string }[]
let isSubmitting    = false;
let dragSrcIndex    = null;

/* ─── DOM Refs ───────────────────────────────────────────────────── */
const photoUpload          = document.getElementById('photoUpload');
const uploadZone           = document.getElementById('uploadZone');
const photoPreview         = document.getElementById('photoPreview');
const uploadCounter        = document.getElementById('uploadCounter');
const photoCountEl         = document.getElementById('photoCount');
const teacherNamesSection  = document.getElementById('teacherNamesSection');
const teacherNameFields    = document.getElementById('teacherNameFields');
const pstForm              = document.getElementById('pstForm');
const statusMessage        = document.getElementById('statusMessage');
const progressWrapper      = document.getElementById('progressWrapper');
const progressFill         = document.getElementById('progressFill');
const progressLabel        = document.getElementById('progressLabel');
const submitBtn            = document.getElementById('submitBtn');
const submitLabel          = document.getElementById('submitLabel');

/* ─── File Selection ─────────────────────────────────────────────── */
photoUpload.addEventListener('change', handleFileSelect);

// Allow cards to be dropped anywhere within the grid
photoPreview.addEventListener('dragover', e => e.preventDefault());

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  addFiles(files);
});

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  addFiles(files);
  photoUpload.value = '';
}

function addFiles(files) {
  const remaining = MAX_PHOTOS - uploadedFiles.length;
  if (remaining <= 0) {
    showStatus(`Maximum of ${MAX_PHOTOS} photos already uploaded.`, 'warning');
    return;
  }

  const toAdd = files.slice(0, remaining);

  if (files.length > remaining) {
    showStatus(
      `Only ${remaining} slot(s) remaining. ${files.length - remaining} photo(s) were not added.`,
      'warning'
    );
  }

  const reads = toAdd.map(file => readFileAsDataUrl(file).then(dataUrl => ({ file, dataUrl })));

  Promise.all(reads).then(results => {
    uploadedFiles = uploadedFiles.concat(results);
    renderPreviews();
    renderTeacherFields();
    updateCounter();
  });
}

function removeFile(index) {
  uploadedFiles.splice(index, 1);
  renderPreviews();
  renderTeacherFields();
  updateCounter();
}

/* ─── Render Helpers ─────────────────────────────────────────────── */
function updateCounter() {
  if (uploadedFiles.length === 0) {
    uploadCounter.classList.add('hidden');
    return;
  }
  uploadCounter.classList.remove('hidden');
  photoCountEl.textContent = uploadedFiles.length;
}

function renderPreviews() {
  photoPreview.innerHTML = '';

  uploadedFiles.forEach(({ file, dataUrl }, index) => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.draggable = true;
    card.dataset.index = index;
    card.innerHTML = `
      <img src="${dataUrl}" alt="Photo ${index + 1}" draggable="false" />
      <span class="photo-badge">${index + 1}</span>
      <div class="drag-handle" title="Drag to reorder">
        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M7 4a1 1 0 000 2 1 1 0 000-2zm6 0a1 1 0 000 2 1 1 0 000-2zM7 9a1 1 0 000 2 1 1 0 000-2zm6 0a1 1 0 000 2 1 1 0 000-2zM7 14a1 1 0 000 2 1 1 0 000-2zm6 0a1 1 0 000 2 1 1 0 000-2z"/></svg>
      </div>
      <button type="button" class="photo-remove" onclick="removeFile(${index})" title="Remove">&times;</button>
      <div class="photo-filename">${file.name}</div>
    `;

    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragover',  onDragOver);
    card.addEventListener('dragleave', onDragLeave);
    card.addEventListener('drop',      onDrop);
    card.addEventListener('dragend',   onDragEnd);

    photoPreview.appendChild(card);
  });
}

/* ─── Drag-to-Reorder ────────────────────────────────────────────── */
function onDragStart(e) {
  dragSrcIndex = parseInt(e.currentTarget.dataset.index);
  // setData is required by Firefox for drag to initiate
  e.dataTransfer.setData('text/plain', String(dragSrcIndex));
  e.dataTransfer.effectAllowed = 'move';
  // Slight delay so the card doesn't look faded before the ghost image is captured
  requestAnimationFrame(() => e.currentTarget.classList.add('dragging'));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const card = e.currentTarget;
  if (parseInt(card.dataset.index) !== dragSrcIndex) {
    card.classList.add('drop-target');
  }
}

function onDragLeave(e) {
  // relatedTarget is where the pointer went — if it's still inside this card
  // (e.g. moved over a child element) we don't want to remove the highlight
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drop-target');
  }
}

function onDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const destIndex = parseInt(e.currentTarget.dataset.index);
  if (dragSrcIndex === null || dragSrcIndex === destIndex) return;

  // Capture current teacher name values before re-render
  const names = getTeacherNames();

  // Reorder files array
  const moved = uploadedFiles.splice(dragSrcIndex, 1)[0];
  uploadedFiles.splice(destIndex, 0, moved);

  // Reorder names to match
  const movedName = names.splice(dragSrcIndex, 1)[0];
  names.splice(destIndex, 0, movedName);

  dragSrcIndex = null;
  renderPreviews();
  renderTeacherFields(names);
  updateCounter();
}

function onDragEnd(e) {
  dragSrcIndex = null;
  // Clean up all cards in case drop fired on a non-card target
  document.querySelectorAll('.photo-card').forEach(c => {
    c.classList.remove('dragging', 'drop-target');
  });
}

function renderTeacherFields(preorderedNames) {
  // Use provided names (from a reorder) or read current input values
  const existingValues = preorderedNames || Array.from(
    teacherNameFields.querySelectorAll('.teacher-name-input')
  ).map(inp => inp.value.trim());

  teacherNameFields.innerHTML = '';

  if (uploadedFiles.length === 0) {
    teacherNamesSection.classList.add('hidden');
    return;
  }

  teacherNamesSection.classList.remove('hidden');

  uploadedFiles.forEach(({ file, dataUrl }, index) => {
    const row = document.createElement('div');
    row.className = 'teacher-name-row';
    row.innerHTML = `
      <img class="teacher-thumb" src="${dataUrl}" alt="Photo ${index + 1}" />
      <div class="teacher-input-wrap">
        <span class="teacher-input-label">Photo ${index + 1} &mdash; ${escapeHtml(file.name)}</span>
        <input
          class="teacher-name-input"
          type="text"
          id="teacher_${index}"
          placeholder="Enter teacher's name"
          required
          autocomplete="off"
          value="${escapeHtml(existingValues[index] || '')}"
        />
      </div>
    `;
    teacherNameFields.appendChild(row);
  });
}

/* ─── Utilities ──────────────────────────────────────────────────── */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlToBase64(dataUrl) {
  return dataUrl.split(',')[1];
}

function sanitize(str) {
  return str.trim().toUpperCase().replace(/\s+/g, '');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Build the file name per spec:
 *   SCHOOLNAME_TEACHERNAME_01.jpg
 */
function buildFileName(schoolName, teacherName, index, file) {
  const ext    = file.name.split('.').pop().toLowerCase() || 'jpg';
  const school = sanitize(schoolName);
  const teacher = sanitize(teacherName);
  return `${school}_${teacher}_${pad(index + 1)}.${ext}`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTeacherNames() {
  return uploadedFiles.map((_, i) => {
    const el = document.getElementById(`teacher_${i}`);
    return el ? el.value.trim() : '';
  });
}

/* ─── Status / Progress ──────────────────────────────────────────── */
function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className   = `status-message ${type}`;
  statusMessage.classList.remove('hidden');
}

function hideStatus() {
  statusMessage.classList.add('hidden');
}

function setProgress(percent, label) {
  progressWrapper.classList.remove('hidden');
  progressFill.style.width = `${percent}%`;
  progressLabel.textContent = label;
}

function hideProgress() {
  progressWrapper.classList.add('hidden');
  progressFill.style.width = '0%';
}

function setSubmitting(state) {
  isSubmitting         = state;
  submitBtn.disabled   = state;
  submitLabel.textContent = state ? 'Submitting…' : 'Submit';
}

/* ─── GitHub Upload ──────────────────────────────────────────────── */
async function uploadToGitHub(fileName, base64Content) {
  const path = `${CONFIG.GITHUB_UPLOAD_PATH}/${fileName}`;
  const url  = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/${path}`;

  const headers = {
    Authorization: `Bearer ${CONFIG.GITHUB_TOKEN}`,
    Accept:        'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const body = {
    message: `Upload PST photo: ${fileName}`,
    content: base64Content,
  };

  // If the file already exists we need its SHA to update it
  const checkRes = await fetch(url, { headers });
  if (checkRes.ok) {
    const existing = await checkRes.json();
    body.sha = existing.sha;
  }

  const res = await fetch(url, {
    method:  'PUT',
    headers,
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub upload failed for "${fileName}": ${err.message || res.status}`);
  }

  const data = await res.json();
  return data.content.download_url;
}

/* ─── Google Sheets via Apps Script ─────────────────────────────── */
async function submitToSheets(payload) {
  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Google Sheets submission failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Apps Script returned an error.');
  }

  return data;
}

/* ─── Form Submission ────────────────────────────────────────────── */
pstForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isSubmitting) return;

  hideStatus();
  hideProgress();

  const schoolName        = document.getElementById('schoolName').value.trim();
  const eventTime         = document.getElementById('eventTime').value;
  const eventLocation     = document.getElementById('eventLocation').value.trim();
  const onlineSessionDate = document.getElementById('onlineSessionDate').value;
  const teacherNames      = getTeacherNames();

  /* ── Client-side validation ── */
  if (!schoolName) {
    showStatus('Please enter the school name.', 'error');
    document.getElementById('schoolName').focus();
    return;
  }

  if (uploadedFiles.length === 0) {
    showStatus('Please upload at least one teacher photo.', 'error');
    return;
  }

  if (teacherNames.some(n => !n)) {
    showStatus('Please enter all teacher names.', 'error');
    return;
  }

  if (!eventTime) {
    showStatus('Please select the event time.', 'error');
    document.getElementById('eventTime').focus();
    return;
  }

  if (!eventLocation) {
    showStatus('Please enter the event location.', 'error');
    document.getElementById('eventLocation').focus();
    return;
  }

  if (!onlineSessionDate) {
    showStatus('Please select the online session date.', 'error');
    document.getElementById('onlineSessionDate').focus();
    return;
  }

  if (!CONFIG.GITHUB_TOKEN || CONFIG.GITHUB_TOKEN === 'YOUR_GITHUB_PAT_HERE') {
    showStatus('GitHub token not configured. Please update js/config.js.', 'error');
    return;
  }

  if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE') {
    showStatus('Google Apps Script URL not configured. Please update js/config.js.', 'error');
    return;
  }

  setSubmitting(true);

  try {
    /* ── Upload photos to GitHub ── */
    const photoUrls  = [];
    const fileNames  = [];

    for (let i = 0; i < uploadedFiles.length; i++) {
      const { file, dataUrl } = uploadedFiles[i];
      const teacherName = teacherNames[i];
      const fileName    = buildFileName(schoolName, teacherName, i, file);

      const percent = Math.round(((i) / uploadedFiles.length) * 80);
      setProgress(percent, `Uploading photo ${i + 1} of ${uploadedFiles.length}: ${fileName}`);

      const base64 = dataUrlToBase64(dataUrl);
      const url    = await uploadToGitHub(fileName, base64);

      photoUrls.push(url);
      fileNames.push(fileName);
    }

    /* ── Submit to Google Sheets ── */
    setProgress(85, 'Saving to Google Sheets…');

    await submitToSheets({
      schoolName,
      teacherNames,
      fileNames,
      photoUrls,
      eventTime,
      eventLocation,
      onlineSessionDate,
      submittedAt: new Date().toISOString(),
    });

    setProgress(100, 'Done!');

    showStatus(
      `Submission successful! ${uploadedFiles.length} photo(s) uploaded and data saved to Google Sheets.`,
      'success'
    );

    /* ── Reset form ── */
    pstForm.reset();
    uploadedFiles = [];
    renderPreviews();
    renderTeacherFields();
    updateCounter();

    setTimeout(hideProgress, 1500);

  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
    console.error('[PST Form]', err);
    hideProgress();
  } finally {
    setSubmitting(false);
  }
});
