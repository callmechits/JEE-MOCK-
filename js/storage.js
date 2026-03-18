// ═══════════════════════════════════════════════════════════
//  storage.js  —  JEEAdv26  |  Supabase backend
// ═══════════════════════════════════════════════════════════
//
//  SETUP (one-time, ~10 minutes):
//  1. Go to https://supabase.com → New project (free)
//  2. Settings → API → copy Project URL + anon public key
//  3. Paste them in Admin → Settings → Supabase Config
//  4. Run the SQL in SETUP.sql in Supabase SQL Editor
//  5. Storage → New bucket → name: "question-images" → Public
//
// ═══════════════════════════════════════════════════════════

// These get set from Admin panel and saved to localStorage
let SUPABASE_URL  = localStorage.getItem('jee_sb_url')  || '';
let SUPABASE_ANON = localStorage.getItem('jee_sb_anon') || '';

const SB = {
  get headers() {
    return {
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type': 'application/json',
    };
  },

  async select(table, query = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: { ...this.headers }
    });
    if (!res.ok) { const t = await res.text(); throw new Error(t); }
    return res.json();
  },

  async upsert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...this.headers, 'Prefer': 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify(data)
    });
    if (!res.ok) { const t = await res.text(); throw new Error(t); }
    return res.json();
  },

  async delete(table, match) {
    const query = Object.entries(match).map(([k,v])=>`${k}=eq.${v}`).join('&');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method: 'DELETE', headers: this.headers
    });
    if (!res.ok) { const t = await res.text(); throw new Error(t); }
    return true;
  },

  async uploadImage(path, base64DataUrl) {
    const arr = base64DataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    const blob = new Blob([u8], { type: mime });
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/question-images/${path}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': mime,
        'x-upsert': 'true'
      },
      body: blob
    });
    if (!res.ok) { const t = await res.text(); throw new Error(t); }
    return `${SUPABASE_URL}/storage/v1/object/public/question-images/${path}`;
  }
};

const Cache = {
  get: k => { try { return JSON.parse(localStorage.getItem('jee_'+k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem('jee_'+k, JSON.stringify(v))
};

const Storage = {

  isConfigured() { return !!(SUPABASE_URL && SUPABASE_ANON && !SUPABASE_URL.includes('PASTE')); },

  setConfig(url, anon) {
    SUPABASE_URL  = url;
    SUPABASE_ANON = anon;
    localStorage.setItem('jee_sb_url', url);
    localStorage.setItem('jee_sb_anon', anon);
  },

  // ── PAPERS ─────────────────────────────────────────────────

  async getPapers() {
    try {
      const rows = await SB.select('papers', 'order=number.asc');
      const papers = rows.map(Storage._normalizePaper);
      Cache.set('papers', papers);
      return papers;
    } catch (e) {
      console.warn('Supabase error, using cache:', e.message);
      return Cache.get('papers') || [];
    }
  },

  async getPaper(id) {
    try {
      const rows = await SB.select('papers', `id=eq.${id}`);
      return rows.length ? Storage._normalizePaper(rows[0]) : null;
    } catch {
      return (Cache.get('papers') || []).find(p => p.id === id) || null;
    }
  },

  async savePaper(paper) {
    // Upload any base64 images to Supabase Storage
    if (paper.questions) {
      for (const q of paper.questions) {
        q.image         = await Storage._maybeUpload(q.image,         `q-${q.id}-body`);
        q.solutionImage = await Storage._maybeUpload(q.solutionImage, `q-${q.id}-sol`);
        if (q.optionImages) {
          for (let i = 0; i < q.optionImages.length; i++) {
            q.optionImages[i] = await Storage._maybeUpload(q.optionImages[i], `q-${q.id}-opt${i}`);
          }
        }
      }
    }
    const row = {
      id: paper.id, title: paper.title,
      start_time: paper.startTime, end_time: paper.endTime,
      number: paper.number || 1, description: paper.description || '',
      questions: paper.questions || [],
      created_at: paper.createdAt || new Date().toISOString()
    };
    await SB.upsert('papers', row);
    const norm = Storage._normalizePaper(row);
    const cached = Cache.get('papers') || [];
    const idx = cached.findIndex(p => p.id === paper.id);
    if (idx >= 0) cached[idx] = norm; else cached.push(norm);
    Cache.set('papers', cached);
    return norm;
  },

  async deletePaper(id) {
    await SB.delete('papers', { id });
    Cache.set('papers', (Cache.get('papers') || []).filter(p => p.id !== id));
  },

  // ── ATTEMPTS ───────────────────────────────────────────────

  async getAllAttempts() {
    try {
      const rows = await SB.select('attempts', 'order=submitted_at.desc.nullslast');
      const attempts = rows.map(Storage._normalizeAttempt);
      Cache.set('attempts', attempts);
      return attempts;
    } catch {
      return Cache.get('attempts') || [];
    }
  },

  async getAttemptsForPaper(paperId) {
    try {
      const rows = await SB.select('attempts', `paper_id=eq.${paperId}&order=total_score.desc.nullslast`);
      return rows.map(Storage._normalizeAttempt);
    } catch {
      return (Cache.get('attempts') || []).filter(a => a.paperId === paperId);
    }
  },

  async getUserAttempt(paperId, username) {
    try {
      const rows = await SB.select('attempts', `paper_id=eq.${paperId}&username=ilike.${encodeURIComponent(username)}`);
      return rows.length ? Storage._normalizeAttempt(rows[0]) : null;
    } catch {
      return (Cache.get('attempts') || []).find(a =>
        a.paperId === paperId && a.username.toLowerCase() === username.toLowerCase()) || null;
    }
  },

  async saveAttempt(attempt) {
    const row = {
      id: attempt.id, paper_id: attempt.paperId, username: attempt.username,
      started_at:   attempt.startedAt   ? new Date(attempt.startedAt).toISOString()   : new Date().toISOString(),
      submitted_at: attempt.submittedAt ? new Date(attempt.submittedAt).toISOString() : null,
      submitted: attempt.submitted || false,
      answers: attempt.answers || {},
      states:  attempt.states  || {},
      phy_score:   attempt.scores?.phy   ?? null,
      chem_score:  attempt.scores?.chem  ?? null,
      math_score:  attempt.scores?.math  ?? null,
      total_score: attempt.scores?.total ?? null
    };
    await SB.upsert('attempts', row);
    const norm = Storage._normalizeAttempt(row);
    const cached = Cache.get('attempts') || [];
    const idx = cached.findIndex(a => a.id === attempt.id);
    if (idx >= 0) cached[idx] = norm; else cached.push(norm);
    Cache.set('attempts', cached);
    return norm;
  },

  // ── LEADERBOARD ────────────────────────────────────────────

  async getPaperLeaderboard(paperId) {
    try {
      const rows = await SB.select('attempts', `paper_id=eq.${paperId}&submitted=eq.true&order=total_score.desc`);
      return rows.map(r => ({
        username: r.username,
        phy:   r.phy_score   || 0, chem: r.chem_score  || 0,
        math:  r.math_score  || 0, total: r.total_score || 0,
        submittedAt: r.submitted_at
      }));
    } catch {
      return (Cache.get('attempts') || [])
        .filter(a => a.paperId === paperId && a.submitted)
        .map(a => ({ username: a.username, phy: a.scores?.phy||0, chem: a.scores?.chem||0, math: a.scores?.math||0, total: a.scores?.total||0, submittedAt: a.submittedAt }))
        .sort((a,b) => b.total - a.total);
    }
  },

  async getOverallLeaderboard() {
    try {
      const rows = await SB.select('attempts', 'submitted=eq.true&select=username,phy_score,chem_score,math_score,total_score');
      const byUser = {};
      rows.forEach(r => {
        const u = r.username.toLowerCase();
        if (!byUser[u]) byUser[u] = { username: r.username, phy:0, chem:0, math:0, total:0, count:0 };
        byUser[u].phy   += r.phy_score   || 0;
        byUser[u].chem  += r.chem_score  || 0;
        byUser[u].math  += r.math_score  || 0;
        byUser[u].total += r.total_score || 0;
        byUser[u].count++;
      });
      return Object.values(byUser).sort((a,b) => b.total - a.total);
    } catch { return []; }
  },

  // ── SCORING ────────────────────────────────────────────────

  scoreAttempt(attempt, paper) {
    let phy = 0, chem = 0, math = 0;
    (paper.questions || []).forEach(q => {
      const ans = attempt.answers?.[q.id];
      if (ans === undefined || ans === null || ans === '') return;
      const m = Storage.calcMarks(q, ans);
      if (q.subject === 'physics')      phy  += m;
      else if (q.subject === 'chemistry')   chem += m;
      else if (q.subject === 'mathematics') math += m;
    });
    const r1 = n => Math.round(n * 10) / 10;
    return { phy: r1(phy), chem: r1(chem), math: r1(math), total: r1(phy+chem+math) };
  },

  calcMarks(q, ans) {
    if (q.type === 'scq') return ans === q.correct ? 3 : -1;
    if (q.type === 'mcq') {
      const sel = Array.isArray(ans) ? ans : [ans];
      const cor = Array.isArray(q.correct) ? q.correct : [q.correct];
      if (!sel.length) return 0;
      if (cor.every(c=>sel.includes(c)) && sel.every(s=>cor.includes(s))) return 4;
      if (sel.some(s=>!cor.includes(s))) return -2;
      return Math.floor(4 * sel.filter(s=>cor.includes(s)).length / cor.length);
    }
    if (q.type === 'integer') {
      const u = parseFloat(ans), c = parseFloat(q.correct);
      return (!isNaN(u) && Math.abs(u-c) < 0.01) ? 3 : 0;
    }
    return 0;
  },

  // ── SETTINGS ───────────────────────────────────────────────
  getSettings()   { return Cache.get('settings') || { adminPass: 'admin123' }; },
  saveSettings(s) { Cache.set('settings', s); },

  // ── UTILS ──────────────────────────────────────────────────
  generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); },

  async _maybeUpload(val, filename) {
    if (!val || !val.startsWith('data:')) return val || null;
    try { return await SB.uploadImage(`${filename}.jpg`, val); }
    catch (e) { console.warn('Image upload failed:', e.message); return val; }
  },

  _normalizePaper(r) {
    return {
      id: r.id, title: r.title,
      startTime: r.start_time, endTime: r.end_time,
      number: r.number, description: r.description,
      questions: r.questions || [], createdAt: r.created_at
    };
  },

  _normalizeAttempt(r) {
    return {
      id: r.id, paperId: r.paper_id, username: r.username,
      startedAt:   r.started_at   ? new Date(r.started_at).getTime()   : null,
      submittedAt: r.submitted_at ? new Date(r.submitted_at).getTime() : null,
      submitted: r.submitted,
      answers: r.answers || {}, states: r.states || {},
      scores: r.total_score != null
        ? { phy: r.phy_score, chem: r.chem_score, math: r.math_score, total: r.total_score }
        : null
    };
  },

  // Legacy no-ops so old page code doesn't break
  async pullFromSheets() {},
  syncToSheets() {}
};
