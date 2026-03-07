// storage.js — Central data layer
// Uses localStorage as cache + Google Sheets as backend

const Storage = (() => {

  // ── CONFIG ──────────────────────────────────────────────────
  // After deploying Google Apps Script, paste your Web App URL here:
  const GS_URL = window.GS_WEBHOOK_URL || '';
  // ────────────────────────────────────────────────────────────

  const KEYS = { papers: 'jeeadv_papers', attempts: 'jeeadv_attempts', settings: 'jeeadv_settings' };

  function get(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
  function set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  // ── PAPERS ───────────────────────────────────────────────────
  function getPapers() { return get(KEYS.papers) || []; }
  function savePaper(paper) {
    const papers = getPapers();
    const idx = papers.findIndex(p => p.id === paper.id);
    if (idx >= 0) papers[idx] = paper; else papers.push(paper);
    set(KEYS.papers, papers);
    syncToSheets('SAVE_PAPER', paper);
    return paper;
  }
  function getPaper(id) { return getPapers().find(p => p.id === id) || null; }
  function deletePaper(id) {
    set(KEYS.papers, getPapers().filter(p => p.id !== id));
  }

  // ── ATTEMPTS ────────────────────────────────────────────────
  function getAllAttempts() { return get(KEYS.attempts) || []; }
  function saveAttempt(attempt) {
    const all = getAllAttempts();
    const idx = all.findIndex(a => a.id === attempt.id);
    if (idx >= 0) all[idx] = attempt; else all.push(attempt);
    set(KEYS.attempts, all);
    syncToSheets('SAVE_ATTEMPT', attempt);
    return attempt;
  }
  function getAttemptsForPaper(paperId) { return getAllAttempts().filter(a => a.paperId === paperId); }
  function getUserAttempt(paperId, username) {
    return getAllAttempts().find(a => a.paperId === paperId && a.username.toLowerCase() === username.toLowerCase()) || null;
  }

  // ── LEADERBOARD ─────────────────────────────────────────────
  function getPaperLeaderboard(paperId) {
    const paper = getPaper(paperId);
    if (!paper) return [];
    return getAttemptsForPaper(paperId)
      .filter(a => a.submitted)
      .map(a => ({
        username: a.username,
        phy: a.scores?.phy || 0,
        chem: a.scores?.chem || 0,
        math: a.scores?.math || 0,
        total: a.scores?.total || 0,
        submittedAt: a.submittedAt
      }))
      .sort((a, b) => b.total - a.total);
  }

  function getOverallLeaderboard() {
    const attempts = getAllAttempts().filter(a => a.submitted);
    const byUser = {};
    attempts.forEach(a => {
      const u = a.username.toLowerCase();
      if (!byUser[u]) byUser[u] = { username: a.username, phy: 0, chem: 0, math: 0, total: 0, count: 0 };
      byUser[u].phy += (a.scores?.phy || 0);
      byUser[u].chem += (a.scores?.chem || 0);
      byUser[u].math += (a.scores?.math || 0);
      byUser[u].total += (a.scores?.total || 0);
      byUser[u].count++;
    });
    return Object.values(byUser).sort((a, b) => b.total - a.total);
  }

  // ── SCORING ─────────────────────────────────────────────────
  function scoreAttempt(attempt, paper) {
    let phy = 0, chem = 0, math = 0;
    paper.questions.forEach(q => {
      const ans = attempt.answers?.[q.id];
      if (ans === undefined || ans === null || ans === '') return;
      const marks = calcMarks(q, ans);
      if (q.subject === 'physics') phy += marks;
      else if (q.subject === 'chemistry') chem += marks;
      else if (q.subject === 'mathematics') math += marks;
    });
    return { phy: Math.round(phy * 10) / 10, chem: Math.round(chem * 10) / 10, math: Math.round(math * 10) / 10, total: Math.round((phy + chem + math) * 10) / 10 };
  }

  function calcMarks(q, ans) {
    if (q.type === 'scq') {
      return ans === q.correct ? 3 : -1;
    }
    if (q.type === 'mcq') {
      // ans is array of selected options
      const selected = Array.isArray(ans) ? ans : [ans];
      const correct = Array.isArray(q.correct) ? q.correct : [q.correct];
      if (selected.length === 0) return 0;
      const allCorrect = correct.every(c => selected.includes(c)) && selected.every(s => correct.includes(s));
      if (allCorrect) return 4;
      const hasWrong = selected.some(s => !correct.includes(s));
      if (hasWrong) return -2;
      // partial: all selected are correct but not all correct chosen
      const partialScore = Math.floor(4 * selected.filter(s => correct.includes(s)).length / correct.length);
      return partialScore;
    }
    if (q.type === 'integer') {
      const userVal = parseFloat(ans);
      const correctVal = parseFloat(q.correct);
      if (isNaN(userVal)) return 0;
      return Math.abs(userVal - correctVal) < 0.01 ? 3 : 0;
    }
    return 0;
  }

  // ── SYNC TO GOOGLE SHEETS ───────────────────────────────────
  async function syncToSheets(action, data) {
    if (!GS_URL) return;
    try {
      await fetch(GS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data, ts: Date.now() })
      });
    } catch (e) { console.warn('Sheets sync failed (offline?):', e.message); }
  }

  // Pull attempts from Sheets (call on page load for live data)
  async function pullFromSheets() {
    if (!GS_URL) return;
    try {
      const res = await fetch(GS_URL + '?action=GET_ALL');
      const json = await res.json();
      if (json.papers) set(KEYS.papers, json.papers);
      if (json.attempts) set(KEYS.attempts, json.attempts);
    } catch (e) { console.warn('Sheets pull failed:', e.message); }
  }

  // ── SETTINGS ─────────────────────────────────────────────────
  function getSettings() { return get(KEYS.settings) || { adminPass: 'admin123' }; }
  function saveSettings(s) { set(KEYS.settings, s); }

  // ── UTILS ─────────────────────────────────────────────────────
  function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  return {
    getPapers, savePaper, getPaper, deletePaper,
    getAllAttempts, saveAttempt, getAttemptsForPaper, getUserAttempt,
    getPaperLeaderboard, getOverallLeaderboard,
    scoreAttempt, calcMarks,
    syncToSheets, pullFromSheets,
    getSettings, saveSettings,
    generateId
  };
})();
