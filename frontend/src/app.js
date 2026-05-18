/**
 * Ascetic PWA — src/app.js
 * Primary runtime: wires Firebase, LocalStorage, Render API,
 * and all page/component modules together.
 *
 * Firebase project : ascetic-app-ai
 * Render API URL   : https://ascetic-app.onrender.com
 */

// ── Firebase SDK (CDN) ───────────────────────────────────────────────────────
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Page / Component modules ─────────────────────────────────────────────────
import { renderHome }    from './pages/home.js';
import { renderStats }   from './pages/stats.js';
import {
  renderProfile,
  readProfileForm,
  initChips,
  DEFAULT_PROFILE,
} from './pages/profile.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

const API_BASE = 'https://ascetic-app.onrender.com';

const firebaseConfig = {
  apiKey:            'AIzaSyBBo67fMWRHIbvCptdmo5WrzREMmq1wHbI',
  authDomain:        'ascetic-app-ai.firebaseapp.com',
  projectId:         'ascetic-app-ai',
  storageBucket:     'ascetic-app-ai.firebasestorage.app',
  messagingSenderId: '660532686250',
  appId:             '1:660532686250:web:9d7d0cc7f37dbfeb4e4fd3',
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const LS = {
  get:    (k, fb = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set:    (k, v)         => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const KEYS = {
  profile:    'ascetic_profile',
  logs:       'ascetic_logs',
  lastResult: 'ascetic_last_result',
};

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

let profile    = LS.get(KEYS.profile,    DEFAULT_PROFILE);
let logs       = LS.get(KEYS.logs,       []);
let lastResult = LS.get(KEYS.lastResult, null);
let isOnline   = navigator.onLine;

// ═══════════════════════════════════════════════════════════════════════════════
// DOM REFERENCES
// ═══════════════════════════════════════════════════════════════════════════════

const $ = (id) => document.getElementById(id);

// Layout
const pages    = document.querySelectorAll('.page');
const navItems = document.querySelectorAll('.nav-item');

// Shared dom-refs bundles passed to page renderers
const homeRefs = {
  ringFill:   $('ring-fill'),
  ringScore:  $('ring-score'),
  ringTier:   $('ring-tier'),
  nudgeWrap:  $('nudge-wrap'),
  qsExam:     $('qs-exam'),
  qsStudy:    $('qs-study'),
  qsSocial:   $('qs-social'),
  qsSleep:    $('qs-sleep'),
  recentList: $('recent-list'),
};

const statsRefs = {
  avgFocus:     $('avg-focus'),
  avgExam:      $('avg-exam'),
  barChart:     $('bar-chart'),
  insightsList: $('insights-list'),
  allLogsList:  $('all-logs-list'),
};

const profileRefs = {
  avatarEl:     $('avatar-initials'),
  profileName:  $('profile-display-name'),
  streakCount:  $('streak-count'),
  pfName:       $('pf-name'),
  pfAge:        $('pf-age'),
  pfAttend:     $('pf-attendance'),
  pfAttendVal:  $('pf-attendance-val'),
  pfAssign:     $('pf-assignments'),
  pfAssignVal:  $('pf-assignments-val'),
};

// Toast
const toastEl = $('toast');

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE WORKER
// ═══════════════════════════════════════════════════════════════════════════════

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ONLINE / OFFLINE
// ═══════════════════════════════════════════════════════════════════════════════

window.addEventListener('online',  () => {
  isOnline = true;
  $('offline-banner').style.display = 'none';
  syncFromFirestore(); // re-sync when connection restored
});
window.addEventListener('offline', () => {
  isOnline = false;
  $('offline-banner').style.display = 'block';
});
if (!isOnline) $('offline-banner').style.display = 'block';

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════════

function showToast(msg, duration = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._tid);
  toastEl._tid = setTimeout(() => toastEl.classList.remove('show'), duration);
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════════

function navigate(page) {
  pages.forEach((p)    => p.classList.remove('active'));
  navItems.forEach((n) => n.classList.remove('active'));

  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');

  if (page === 'stats')   renderStats({   logs, domRefs: statsRefs });
  if (page === 'profile') renderProfile({ profile, logs, domRefs: profileRefs });
}

navItems.forEach((btn) =>
  btn.addEventListener('click', () => navigate(btn.dataset.page))
);

// ═══════════════════════════════════════════════════════════════════════════════
// TODAY'S DATE LABEL
// ═══════════════════════════════════════════════════════════════════════════════

$('today-date').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric',
});

// ═══════════════════════════════════════════════════════════════════════════════
// LOG MODAL — OPEN / CLOSE
// ═══════════════════════════════════════════════════════════════════════════════

const logModal = $('log-modal');

$('open-log-btn').addEventListener('click', openModal);

function openModal() {
  logModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  logModal.classList.remove('open');
  document.body.style.overflow = '';
}

logModal.addEventListener('click', (e) => { if (e.target === logModal) closeModal(); });

// ─── Slider sync ─────────────────────────────────────────────────────────────

const SLIDERS = [
  ['f-social',     'f-social-val'],
  ['f-streaming',  'f-streaming-val'],
  ['f-gaming',     'f-gaming-val'],
  ['f-smartphone', 'f-smartphone-val'],
  ['f-study',      'f-study-val'],
  ['f-sleep',      'f-sleep-val'],
  ['f-exercise',   'f-exercise-val'],
  ['f-caffeine',   'f-caffeine-val'],
];

SLIDERS.forEach(([sid, vid]) => {
  const slider = $(sid);
  const valEl  = $(vid);
  slider.addEventListener('input', () => { valEl.textContent = slider.value; });
});

// Profile sliders
$('pf-attendance').addEventListener('input', () => {
  $('pf-attendance-val').textContent = $('pf-attendance').value;
});
$('pf-assignments').addEventListener('input', () => {
  $('pf-assignments-val').textContent = $('pf-assignments').value;
});

// ═══════════════════════════════════════════════════════════════════════════════
// API — PREDICT
// ═══════════════════════════════════════════════════════════════════════════════

async function callPredict(form) {
  const body = {
    social_media_hours:            form.social,
    streaming_hours:               form.streaming,
    gaming_hours:                  form.gaming,
    smartphone_usage_hours:        form.smartphone,
    study_hours_per_day:           form.study,
    sleep_hours:                   form.sleep,
    exercise_hours:                form.exercise,
    caffeine_intake_cups:          form.caffeine,
    class_attendance_percent:      profile.attendance      ?? 75,
    assignment_completion_percent: profile.assignments     ?? 70,
    age:                           profile.age             ?? 20,
    gender:                        profile.gender          ?? 'Male',
    internet_quality:              profile.internetQuality ?? 'Average',
    motivation_level:              profile.motivationLevel ?? 'Medium',
    mental_health_status:          profile.mentalHealth    ?? 'Average',
    parent_education_level:        profile.parentEducation ?? 'Bachelors',
  };

  const res = await fetch(`${API_BASE}/predict`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `API error ${res.status}`);
  }

  return res.json(); // { focus_score, exam_score, tier, tier_label, nudge }
}

/** Offline fallback heuristic — no network needed */
function heuristicPredict(form) {
  const dist  = form.social + form.streaming + form.gaming;
  const focus = Math.round(
    Math.max(0, Math.min(100, (form.study * 8 + form.sleep * 4 - dist * 5) / 2 + 40))
  );
  const tier  = focus <= 30 ? 1 : focus <= 59 ? 2 : 3;
  return {
    focus_score: focus,
    exam_score:  Math.min(100, Math.max(0, Math.round(focus * 0.9 + 10))),
    tier,
    tier_label:  ['', 'Digital Detox', 'Warning', 'Excellent Alignment'][tier],
    nudge: '📡 Offline mode — estimated score. Predictions will sync once you\'re back online.',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMIT LOG
// ═══════════════════════════════════════════════════════════════════════════════

const predictBtn = $('predict-btn');

predictBtn.addEventListener('click', async () => {
  const form = {
    social:     parseFloat($('f-social').value),
    streaming:  parseFloat($('f-streaming').value),
    gaming:     parseFloat($('f-gaming').value),
    smartphone: parseFloat($('f-smartphone').value),
    study:      parseFloat($('f-study').value),
    sleep:      parseFloat($('f-sleep').value),
    exercise:   parseFloat($('f-exercise').value),
    caffeine:   parseFloat($('f-caffeine').value),
  };

  predictBtn.disabled = true;
  predictBtn.innerHTML = `<div class="spinner"></div>&nbsp;Predicting…`;

  try {
    const result = isOnline ? await callPredict(form) : heuristicPredict(form);

    const entry = {
      ts:     Date.now(),
      date:   new Date().toISOString().slice(0, 10),
      form,
      result,
    };

    // ── Save locally ────────────────────────────────────────────────────────
    logs.unshift(entry);
    if (logs.length > 90) logs = logs.slice(0, 90);
    LS.set(KEYS.logs,       logs);
    LS.set(KEYS.lastResult, entry);
    lastResult = entry;

    // ── Sync to Firestore ───────────────────────────────────────────────────
    if (isOnline) {
      addDoc(collection(db, 'logs'), {
        ...entry,
        serverTs: serverTimestamp(),
      }).catch((e) => console.warn('Firestore write failed:', e.message));
    }

    closeModal();
    renderHome({ lastResult, logs, domRefs: homeRefs });
    showToast('✓ Prediction saved!');

  } catch (err) {
    showToast(`❌ ${err.message}`);
    console.error('[predict]', err);
  } finally {
    predictBtn.disabled = false;
    predictBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
      Get AI Prediction`;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE SAVE
// ═══════════════════════════════════════════════════════════════════════════════

$('save-profile-btn').addEventListener('click', () => {
  profile = readProfileForm(profile);
  LS.set(KEYS.profile, profile);
  renderProfile({ profile, logs, domRefs: profileRefs });
  showToast('✓ Profile saved!');
});

// ═══════════════════════════════════════════════════════════════════════════════
// FIREBASE SYNC — pull remote logs and merge with local
// ═══════════════════════════════════════════════════════════════════════════════

async function syncFromFirestore() {
  if (!isOnline) return;
  try {
    const q    = query(collection(db, 'logs'), orderBy('ts', 'desc'), limit(90));
    const snap = await getDocs(q);
    if (snap.empty) return;

    const remote = snap.docs
      .map((d) => d.data())
      .filter((e) => e.form && e.result);

    // Merge: keep unique entries by (date, ts)
    const seen   = new Set(logs.map((l) => `${l.date}_${l.ts}`));
    const merged = [...logs];
    for (const r of remote) {
      if (!seen.has(`${r.date}_${r.ts}`)) merged.push(r);
    }
    merged.sort((a, b) => b.ts - a.ts);

    logs = merged.slice(0, 90);
    LS.set(KEYS.logs, logs);

    if (logs.length) {
      lastResult = logs[0];
      LS.set(KEYS.lastResult, lastResult);
    }

    renderHome({ lastResult, logs, domRefs: homeRefs });

  } catch (e) {
    console.warn('[firestore sync]', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

initChips();
renderHome({ lastResult, logs, domRefs: homeRefs });
syncFromFirestore();
