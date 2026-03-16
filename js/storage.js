// storage.js — Central data layer
// Uses localStorage as cache + Google Sheets as backend

const Storage = (() => {
  const KEYS = {
    papers: 'jeeadv_papers',
    attempts: 'jeeadv_attempts',
    settings: 'jeeadv_settings',
    adminSession: 'jeeadv_admin_session'
  };

  function get(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
  function set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function getSettings() { return get(KEYS.settings) || {}; }
  function saveSettings(s) { set(KEYS.settings, s || {}); }

  function getGsUrl() {
    return (window.GS_WEBHOOK_URL || getSettings().gsUrl || '').trim();
  }

  function getAdminSession() {
    const session = get(KEYS.adminSession);
    if (!session?.token || !session?.expiresAt) return null;
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(KEYS.adminSession);
      return null;
    }
    return session;
  }

  function setAdminSession(session) {
    if (!session) localStorage.removeItem(KEYS.adminSession);
    else set(KEYS.adminSession, session);
  }

  async function apiGet(action) {
    const url = getGsUrl();
    if (!url) throw new Error('Google Apps Script URL is not configured.');
    const res = await fetch(`${url}?action=${encodeURIComponent(action)}`);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  async function apiPost(action, data = {}, opts = {}) {
    const url = getGsUrl();
    if (!url) throw new Error('Google Apps Script URL is not configured.');
    const payload = { action, data, ts: Date.now() };
    if (opts.withAdminToken) {
      const session = getAdminSession();
      if (!session?.token) throw new Error('Admin login required.');
      payload.adminToken = session.token;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new Error(json.error || `Request failed: ${res.status}`);
    return json;
  }

  // ── PAPERS ───────────────────────────────────────────────────
  function getPapers() { return get(KEYS.papers) || []; }
  async function savePaper(paper) {
    const papers = getPapers();
    const idx = papers.findIndex(p => p.id === paper.id);
    if (idx >= 0) papers[idx] = paper; else papers.push(paper);
    set(KEYS.papers, papers);
    await apiPost('SAVE_PAPER', paper, { withAdminToken: true });
    return paper;
  }
  function getPaper(id) { return getPapers().find(p => p.id === id) || null; }
  async function deletePaper(id) {
    set(KEYS.papers, getPapers().filter(p => p.id !== id));
    await apiPost('DELETE_PAPER', { id }, { withAdminToken: true });
  }

  // ── ATTEMPTS ────────────────────────────────────────────────
  function getAllAttempts() { return get(KEYS.attempts) || []; }
  async function saveAttempt(attempt) {
    const all = getAllAttempts();
    const idx = all.findIndex(a => a.id === attempt.id);
    if (idx >= 0) all[idx] = attempt; else all.push(attempt);
    set(KEYS.attempts, all);
    try {
      await apiPost('SAVE_ATTEMPT', attempt);
    } catch (e) {
      console.warn('Sheets sync failed:', e.message);
    }
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
@@ -68,91 +121,90 @@ const Storage = (() => {
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
    if (q.type === 'scq') return ans === q.correct ? 3 : -1;
    if (q.type === 'mcq') {
      const selected = Array.isArray(ans) ? ans : [ans];
      const correct = Array.isArray(q.correct) ? q.correct : [q.correct];
      if (selected.length === 0) return 0;
      const allCorrect = correct.every(c => selected.includes(c)) && selected.every(s => correct.includes(s));
      if (allCorrect) return 4;
      if (selected.some(s => !correct.includes(s))) return -2;
      return Math.floor(4 * selected.filter(s => correct.includes(s)).length / correct.length);
    }
    if (q.type === 'integer') {
      const userVal = parseFloat(ans), correctVal = parseFloat(q.correct);
      if (isNaN(userVal)) return 0;
      return Math.abs(userVal - correctVal) < 0.01 ? 3 : 0;
    }
    return 0;
  }

  // ── SYNC/PULL ───────────────────────────────────────────────
  async function syncToSheets(action, data) {
    if (action === 'SAVE_ATTEMPT') return saveAttempt(data);
    if (action === 'SAVE_PAPER') return savePaper(data);
    return apiPost(action, data);
  }

  async function pullFromSheets() {
    try {
      const json = await apiGet('GET_ALL');
      if (json.papers) set(KEYS.papers, json.papers);
      if (json.attempts) set(KEYS.attempts, json.attempts);
    } catch (e) {
      console.warn('Sheets pull failed:', e.message);
    }
  }

  // ── ADMIN AUTH ───────────────────────────────────────────────
  async function adminLogin(password) {
    const result = await apiPost('ADMIN_LOGIN', { password });
    if (!result?.token) throw new Error('Login failed');
    setAdminSession({ token: result.token, expiresAt: result.expiresAt || Date.now() + 12 * 60 * 60 * 1000 });
    return true;
  }

  function adminLogout() { setAdminSession(null); }
  function isAdminLoggedIn() { return !!getAdminSession(); }

  async function adminChangePassword(newPassword) {
    await apiPost('ADMIN_CHANGE_PASSWORD', { newPassword }, { withAdminToken: true });
    return true;
  }

  // ── UTILS ─────────────────────────────────────────────────────
  function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  return {
    getPapers, savePaper, getPaper, deletePaper,
    getAllAttempts, saveAttempt, getAttemptsForPaper, getUserAttempt,
    getPaperLeaderboard, getOverallLeaderboard,
    scoreAttempt, calcMarks,
    syncToSheets, pullFromSheets,
    getSettings, saveSettings,
    adminLogin, adminLogout, isAdminLoggedIn, adminChangePassword,
    generateId
  };
})();
