// ═══════════════════════════════════════════════════════════════════
// Google Apps Script — JEEAdv26 Backend
// ═══════════════════════════════════════════════════════════════════
const SHEET_PAPERS = 'Papers';
const SHEET_ATTEMPTS = 'Attempts';
const PROP_ADMIN_HASH = 'ADMIN_PASSWORD_HASH';
const PROP_ADMIN_SALT = 'ADMIN_PASSWORD_SALT';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const ADMIN_SESSION_HOURS = 12;

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'GET_ALL') {
    return jsonOut(getAllData());
  }
  return jsonOut({ ok: true, message: 'JEEAdv26 API OK' });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const action = payload.action;
    const data = payload.data || {};

    if (action === 'SAVE_ATTEMPT') {
      saveAttempt(data);
      return jsonOut({ ok: true });
    }

    if (action === 'ADMIN_LOGIN') {
      const tokenData = adminLogin_(data.password || '');
      return jsonOut({ ok: true, token: tokenData.token, expiresAt: tokenData.expiresAt });
    }

    if (['SAVE_PAPER', 'DELETE_PAPER', 'ADMIN_CHANGE_PASSWORD'].includes(action)) {
      requireAdmin_(payload.adminToken || '');
    }

    if (action === 'SAVE_PAPER') {
      savePaper(data);
      return jsonOut({ ok: true });
    }

    if (action === 'DELETE_PAPER') {
      deletePaper(data.id);
      return jsonOut({ ok: true });
    }

    if (action === 'ADMIN_CHANGE_PASSWORD') {
      changeAdminPassword_(data.newPassword || '');
      return jsonOut({ ok: true });
    }

    throw new Error('Unknown action: ' + action);
  } catch (err) {
    return jsonOut({ error: err.message || 'Unknown error' });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    papers: getSheetData(ss, SHEET_PAPERS),
    attempts: getSheetData(ss, SHEET_ATTEMPTS)
  };
}

function getSheetData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = row[i];
      try { obj[h] = JSON.parse(v); } catch (_) { obj[h] = v; }
    });
    return obj;
  });
}

function savePaper(paper) {
  if (!paper || !paper.id) throw new Error('Invalid paper payload');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_PAPERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_PAPERS);
    sheet.appendRow(['id', 'title', 'startTime', 'endTime', 'number', 'questions', 'description', 'createdAt']);
  }
  const data = sheet.getDataRange().getValues();
  const ids = data.slice(1).map(r => r[0]);
  const idx = ids.indexOf(paper.id);
  const row = [
    paper.id,
    paper.title || '',
    paper.startTime || '',
    paper.endTime || '',
    paper.number || '',
    JSON.stringify(paper.questions || []),
    paper.description || '',
    paper.createdAt || Date.now()
  ];
  if (idx >= 0) sheet.getRange(idx + 2, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
}

function deletePaper(paperId) {
  if (!paperId) throw new Error('paper id required');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const papersSheet = ss.getSheetByName(SHEET_PAPERS);
  if (papersSheet) {
    const data = papersSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === paperId) papersSheet.deleteRow(i + 1);
    }
  }

  const attemptsSheet = ss.getSheetByName(SHEET_ATTEMPTS);
  if (attemptsSheet) {
    const data = attemptsSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][1] === paperId) attemptsSheet.deleteRow(i + 1);
    }
  }
}

function saveAttempt(attempt) {
  if (!attempt || !attempt.id) throw new Error('Invalid attempt payload');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_ATTEMPTS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ATTEMPTS);
    sheet.appendRow(['id', 'paperId', 'username', 'startedAt', 'submittedAt', 'submitted', 'answers', 'states', 'scores']);
  }
  const data = sheet.getDataRange().getValues();
  const ids = data.slice(1).map(r => r[0]);
  const idx = ids.indexOf(attempt.id);
  const row = [
    attempt.id,
    attempt.paperId,
    attempt.username,
    attempt.startedAt || '',
    attempt.submittedAt || '',
    attempt.submitted ? 'TRUE' : 'FALSE',
    JSON.stringify(attempt.answers || {}),
    JSON.stringify(attempt.states || {}),
    JSON.stringify(attempt.scores || {})
  ];
  if (idx >= 0) sheet.getRange(idx + 2, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
}

function adminLogin_(password) {
  ensureAdminPassword_();
  if (!verifyPassword_(password)) throw new Error('Invalid password');
  const token = Utilities.getUuid() + Utilities.getUuid();
  const ttl = ADMIN_SESSION_HOURS * 60 * 60;
  CacheService.getScriptCache().put('adm:' + token, '1', ttl);
  return { token: token, expiresAt: Date.now() + ttl * 1000 };
}

function requireAdmin_(token) {
  if (!token) throw new Error('Admin token required');
  const ok = CacheService.getScriptCache().get('adm:' + token);
  if (!ok) throw new Error('Admin session expired. Please login again.');
}

function changeAdminPassword_(newPassword) {
  if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters long');
  const salt = Utilities.getUuid();
  const hash = sha256_(salt + newPassword);
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_ADMIN_SALT, salt);
  props.setProperty(PROP_ADMIN_HASH, hash);
}

function ensureAdminPassword_() {
  const props = PropertiesService.getScriptProperties();
  const currentHash = props.getProperty(PROP_ADMIN_HASH);
  const currentSalt = props.getProperty(PROP_ADMIN_SALT);
  if (!currentHash || !currentSalt) {
    const salt = Utilities.getUuid();
    const hash = sha256_(salt + DEFAULT_ADMIN_PASSWORD);
    props.setProperty(PROP_ADMIN_SALT, salt);
    props.setProperty(PROP_ADMIN_HASH, hash);
  }
}

function verifyPassword_(password) {
  const props = PropertiesService.getScriptProperties();
  const salt = props.getProperty(PROP_ADMIN_SALT) || '';
  const hash = props.getProperty(PROP_ADMIN_HASH) || '';
  return sha256_(salt + password) === hash;
}

function sha256_(input) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  return raw.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
