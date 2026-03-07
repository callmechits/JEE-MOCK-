// ═══════════════════════════════════════════════════════════════════
// Google Apps Script — JEEAdv26 Backend
// ═══════════════════════════════════════════════════════════════════
// SETUP INSTRUCTIONS:
// 1. Go to sheets.google.com → Create new spreadsheet "JEEAdv26-DB"
// 2. Extensions → Apps Script → Paste this entire file → Save
// 3. Click "Deploy" → "New Deployment" → Type: Web App
//    - Execute as: Me
//    - Who has access: Anyone
// 4. Click Deploy, copy the Web App URL
// 5. Paste URL in Admin → Settings on your site
// ═══════════════════════════════════════════════════════════════════

const SHEET_PAPERS = 'Papers';
const SHEET_ATTEMPTS = 'Attempts';

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'GET_ALL') {
    return ContentService
      .createTextOutput(JSON.stringify(getAllData()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput('JEEAdv26 API OK');
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const { action, data } = payload;
    if (action === 'SAVE_PAPER') savePaper(data);
    if (action === 'SAVE_ATTEMPT') saveAttempt(data);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const papers = getSheetData(ss, SHEET_PAPERS);
  const attempts = getSheetData(ss, SHEET_ATTEMPTS);
  return { papers, attempts };
}

function getSheetData(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      try { obj[h] = JSON.parse(row[i]); } catch { obj[h] = row[i]; }
    });
    return obj;
  });
}

function savePaper(paper) {
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
    paper.id, paper.title, paper.startTime, paper.endTime,
    paper.number || '',
    JSON.stringify(paper.questions || []),
    paper.description || '',
    paper.createdAt || Date.now()
  ];
  if (idx >= 0) {
    sheet.getRange(idx + 2, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function saveAttempt(attempt) {
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
    attempt.id, attempt.paperId, attempt.username,
    attempt.startedAt || '', attempt.submittedAt || '',
    attempt.submitted ? 'TRUE' : 'FALSE',
    JSON.stringify(attempt.answers || {}),
    JSON.stringify(attempt.states || {}),
    JSON.stringify(attempt.scores || {})
  ];
  if (idx >= 0) {
    sheet.getRange(idx + 2, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}
