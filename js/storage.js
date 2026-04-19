// ═══════════════════════════════════════════════════════════
//  storage.js  —  JEEAdv26  |  Supabase backend
// ═══════════════════════════════════════════════════════════

// !! REPLACE THESE WITH YOUR ACTUAL VALUES !!
const DEFAULT_URL  = 'https://cqhqexcqqjhdhemnydgs.supabase.co';
const DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxaHFleGNxcWpoZGhlbW55ZGdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTc5OTgsImV4cCI6MjA5MjEzMzk5OH0.0xHgNncHb77nM6W9hB1RJy3yXXaglQc_J7wFaaumnA8';

// Read from localStorage if set (admin panel), otherwise use defaults above
function _url()  { return localStorage.getItem('jee_sb_url')  || DEFAULT_URL;  }
function _anon() { return localStorage.getItem('jee_sb_anon') || DEFAULT_ANON; }

// ── Raw Supabase REST calls ──────────────────────────────────
const SB = {
  get h() {
    return {
      'apikey': _anon(),
      'Authorization': `Bearer ${_anon()}`,
      'Content-Type': 'application/json',
    };
  },
  _check() {
    const url = _url(), anon = _anon();
    if (!url || !url.startsWith('https://'))
      throw new Error('Supabase not configured. Go to Admin → Settings and paste your Project URL + anon key.');
    if (!anon)
      throw new Error('Supabase anon key missing. Go to Admin → Settings.');
  },
  async select(table, query='') {
    this._check();
    const r = await fetch(`${_url()}/rest/v1/${table}?${query}`, { headers: this.h });
    if (!r.ok) throw new Error(`Supabase error (${r.status}): ${await r.text()}`);
    return r.json();
  },
  async upsert(table, data) {
    this._check();
    const r = await fetch(`${_url()}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...this.h, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(`Supabase error (${r.status}): ${await r.text()}`);
    // 204 No Content is a valid success response
    if (r.status === 204) return data;
    const text = await r.text();
    return text ? JSON.parse(text) : data;
  },
  async del(table, match) {
    this._check();
    const q = Object.entries(match).map(([k,v])=>`${k}=eq.${v}`).join('&');
    const r = await fetch(`${_url()}/rest/v1/${table}?${q}`, { method: 'DELETE', headers: this.h });
    if (!r.ok) throw new Error(`Supabase error (${r.status}): ${await r.text()}`);
  },
  async uploadImage(path, dataUrl) {
    this._check();
    const [head, b64] = dataUrl.split(',');
    const mime = head.match(/:(.*?);/)[1];
    const bytes = atob(b64);
    const u8 = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) u8[i] = bytes.charCodeAt(i);
    const r = await fetch(`${_url()}/storage/v1/object/question-images/${path}`, {
      method: 'POST',
      headers: { 'apikey': _anon(), 'Authorization': `Bearer ${_anon()}`, 'Content-Type': mime, 'x-upsert': 'true' },
      body: new Blob([u8], { type: mime })
    });
    if (!r.ok) throw new Error(`Image upload error (${r.status}): ${await r.text()}`);
    return `${_url()}/storage/v1/object/public/question-images/${path}`;
  }
};

// ── Local cache so UI feels instant ─────────────────────────
const Cache = {
  get: k => { try { return JSON.parse(localStorage.getItem('jee_'+k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem('jee_'+k, JSON.stringify(v))
};

// ── Helpers ──────────────────────────────────────────────────
function normPaper(r) {
  return { id:r.id, title:r.title, startTime:r.start_time, endTime:r.end_time,
           number:r.number, description:r.description, questions:r.questions||[], createdAt:r.created_at,
           entryWindow:r.entry_window ?? 30, locked:!!r.locked };
}
function normAttempt(r) {
  return { id:r.id, paperId:r.paper_id, username:r.username,
           startedAt:   r.started_at   ? new Date(r.started_at).getTime()   : null,
           submittedAt: r.submitted_at ? new Date(r.submitted_at).getTime() : null,
           submitted: r.submitted, answers:r.answers||{}, states:r.states||{},
           scores: r.total_score != null
             ? { phy:r.phy_score, chem:r.chem_score, math:r.math_score, total:r.total_score }
             : null };
}
async function maybeUpload(val, filename) {
  if (!val || !val.startsWith('data:')) return val || null;
  try { return await SB.uploadImage(`${filename}.jpg`, val); }
  catch (e) { console.warn('Image upload failed, keeping base64:', e.message); return val; }
}

// ════════════════════════════════════════════════════════════
//  PUBLIC Storage API  — ALL async
// ════════════════════════════════════════════════════════════
const Storage = {

  // ── Config ────────────────────────────────────────────────
  isConfigured() { const u=_url(); return !!(u && u.startsWith('https://')); },
  setConfig(url, anon) {
    localStorage.setItem('jee_sb_url', url.trim());
    localStorage.setItem('jee_sb_anon', anon.trim());
  },

  // ── Settings (local only — admin password) ─────────────
  // These are SYNCHRONOUS — they only touch localStorage, not Supabase
  getSettings()   { return Cache.get('settings') || { adminPass: 'admin123' }; },
  saveSettings(s) { Cache.set('settings', s); },

  // ── Utils ─────────────────────────────────────────────────
  generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); },

  // Scoring helpers are SYNCHRONOUS (pure math, no network)
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
  scoreAttempt(attempt, paper) {
    let phy=0, chem=0, math=0;
    (paper.questions||[]).forEach(q => {
      const ans = attempt.answers?.[q.id];
      if (ans===undefined||ans===null||ans==='') return;
      const m = Storage.calcMarks(q, ans);
      if (q.subject==='physics') phy+=m;
      else if (q.subject==='chemistry') chem+=m;
      else if (q.subject==='mathematics') math+=m;
    });
    const r1 = n => Math.round(n*10)/10;
    return { phy:r1(phy), chem:r1(chem), math:r1(math), total:r1(phy+chem+math) };
  },

  // ── Papers (ASYNC) ────────────────────────────────────────
  async getPapers() {
    try {
      const rows = await SB.select('papers', 'order=number.asc');
      const papers = rows.map(normPaper);
      Cache.set('papers', papers);
      return papers;
    } catch(e) { console.warn('getPapers falling back to cache:', e.message); return Cache.get('papers')||[]; }
  },
  async getPaper(id) {
    try {
      const rows = await SB.select('papers', `id=eq.${id}`);
      return rows.length ? normPaper(rows[0]) : null;
    } catch { return (Cache.get('papers')||[]).find(p=>p.id===id)||null; }
  },
  async savePaper(paper) {
    if (paper.questions) {
      for (const q of paper.questions) {
        q.image          = await maybeUpload(q.image,         `q-${q.id}-body`);
        q.solutionImage  = await maybeUpload(q.solutionImage, `q-${q.id}-sol`);
        if (q.optionImages) for (let i=0;i<q.optionImages.length;i++)
          q.optionImages[i] = await maybeUpload(q.optionImages[i], `q-${q.id}-opt${i}`);
      }
    }
    const row = { id:paper.id, title:paper.title,
                  start_time: new Date(paper.startTime).toISOString(),
                  end_time: new Date(paper.endTime).toISOString(),
                  number:paper.number||1, description:paper.description||'',
                  questions:paper.questions||[],
                  entry_window: Number.isFinite(Number(paper.entryWindow)) ? Number(paper.entryWindow) : 30,
                  locked: !!paper.locked,
                  created_at: paper.createdAt ? new Date(paper.createdAt).toISOString() : new Date().toISOString() };
    await SB.upsert('papers', row);
    const norm = normPaper(row);
    const cached = Cache.get('papers')||[];
    const idx = cached.findIndex(p=>p.id===paper.id);
    if (idx>=0) cached[idx]=norm; else cached.push(norm);
    Cache.set('papers', cached);
    return norm;
  },
  async deletePaper(id) {
    const paper = await this.getPaper(id);
    if (paper?.locked) throw new Error('Locked exams cannot be deleted.');
    await SB.del('papers', {id});
    Cache.set('papers', (Cache.get('papers')||[]).filter(p=>p.id!==id));
  },

  // ── Attempts (ASYNC) ──────────────────────────────────────
  async getAllAttempts() {
    try {
      const rows = await SB.select('attempts', 'order=submitted_at.desc.nullslast');
      const a = rows.map(normAttempt); Cache.set('attempts', a); return a;
    } catch { return Cache.get('attempts')||[]; }
  },
  async getAttemptsForPaper(paperId) {
    try {
      const rows = await SB.select('attempts', `paper_id=eq.${paperId}&order=total_score.desc.nullslast`);
      return rows.map(normAttempt);
    } catch { return (Cache.get('attempts')||[]).filter(a=>a.paperId===paperId); }
  },
  async getUserAttempt(paperId, username) {
    try {
      const rows = await SB.select('attempts', `paper_id=eq.${paperId}&username=ilike.${encodeURIComponent(username)}`);
      return rows.length ? normAttempt(rows[0]) : null;
    } catch { return (Cache.get('attempts')||[]).find(a=>a.paperId===paperId&&a.username.toLowerCase()===username.toLowerCase())||null; }
  },
  async saveAttempt(attempt) {
    const toISO = v => v ? new Date(v).toISOString() : null;
    const row = { id:attempt.id, paper_id:attempt.paperId, username:attempt.username,
                  started_at:   toISO(attempt.startedAt)   || new Date().toISOString(),
                  submitted_at: toISO(attempt.submittedAt) || null,
                  submitted: attempt.submitted||false, answers:attempt.answers||{}, states:attempt.states||{},
                  phy_score:attempt.scores?.phy??null, chem_score:attempt.scores?.chem??null,
                  math_score:attempt.scores?.math??null, total_score:attempt.scores?.total??null };
    await SB.upsert('attempts', row);
    const norm = normAttempt(row);
    const cached = Cache.get('attempts')||[];
    const idx = cached.findIndex(a=>a.id===attempt.id);
    if (idx>=0) cached[idx]=norm; else cached.push(norm);
    Cache.set('attempts', cached);
    return norm;
  },

  // ── Leaderboards (ASYNC) ──────────────────────────────────
  async getPaperLeaderboard(paperId) {
    try {
      const rows = await SB.select('attempts', `paper_id=eq.${paperId}&submitted=eq.true&order=total_score.desc`);
      return rows.map(r=>({ username:r.username, phy:r.phy_score||0, chem:r.chem_score||0,
                             math:r.math_score||0, total:r.total_score||0, submittedAt:r.submitted_at }));
    } catch {
      return (Cache.get('attempts')||[]).filter(a=>a.paperId===paperId&&a.submitted)
        .map(a=>({ username:a.username, phy:a.scores?.phy||0, chem:a.scores?.chem||0,
                   math:a.scores?.math||0, total:a.scores?.total||0, submittedAt:a.submittedAt }))
        .sort((a,b)=>b.total-a.total);
    }
  },
  async getOverallLeaderboard() {
    try {
      const rows = await SB.select('attempts', 'submitted=eq.true&select=username,phy_score,chem_score,math_score,total_score');
      const byUser = {};
      rows.forEach(r => {
        const u = r.username.toLowerCase();
        if (!byUser[u]) byUser[u]={username:r.username,phy:0,chem:0,math:0,total:0,count:0};
        byUser[u].phy+=r.phy_score||0; byUser[u].chem+=r.chem_score||0;
        byUser[u].math+=r.math_score||0; byUser[u].total+=r.total_score||0; byUser[u].count++;
      });
      return Object.values(byUser).sort((a,b)=>b.total-a.total);
    } catch { return []; }
  },

  // Legacy no-ops
  async pullFromSheets() {},
  syncToSheets() {}
};
