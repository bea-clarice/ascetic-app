/**
 * Ascetic PWA — pages/profile.js
 * Profile page render, chip interactions, and save logic.
 */

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_PROFILE = {
  name:            'Student',
  age:             20,
  gender:          'Male',
  internetQuality: 'Average',
  motivationLevel: 'Medium',
  mentalHealth:    'Average',
  parentEducation: 'Bachelors',
  attendance:      75,
  assignments:     70,
};

// ─── Render ──────────────────────────────────────────────────────────────────

/**
 * renderProfile({ profile, logs, domRefs })
 *
 * domRefs = {
 *   avatarEl, profileName, streakCount,
 *   pfName, pfAge, pfAttend, pfAttendVal, pfAssign, pfAssignVal
 * }
 */
export function renderProfile({ profile, logs, domRefs }) {
  const {
    avatarEl, profileName, streakCount,
    pfName, pfAge,
    pfAttend, pfAttendVal,
    pfAssign,  pfAssignVal,
  } = domRefs;

  const name = profile.name || 'Student';

  // Header
  avatarEl.textContent    = name.slice(0, 1).toUpperCase();
  profileName.textContent = name;
  streakCount.textContent = calcStreak(logs);

  // Form fields
  pfName.value  = name === 'Student' ? '' : name;
  pfAge.value   = profile.age ?? 20;

  pfAttend.value          = profile.attendance  ?? 75;
  pfAttendVal.textContent = profile.attendance  ?? 75;
  pfAssign.value          = profile.assignments ?? 70;
  pfAssignVal.textContent = profile.assignments ?? 70;

  // Chip selections
  setChip('gender',     profile.gender          ?? 'Male');
  setChip('internet',   profile.internetQuality  ?? 'Average');
  setChip('motivation', profile.motivationLevel  ?? 'Medium');
  setChip('mental',     profile.mentalHealth     ?? 'Average');
  setChip('edu',        profile.parentEducation  ?? 'Bachelors');
}

// ─── Read current form state → profile object ─────────────────────────────────

/**
 * readProfileForm(currentProfile) → new profile object
 */
export function readProfileForm(currentProfile) {
  const name = document.getElementById('pf-name').value.trim();
  const age  = parseInt(document.getElementById('pf-age').value) || 20;
  const att  = parseInt(document.getElementById('pf-attendance').value) || 75;
  const asgn = parseInt(document.getElementById('pf-assignments').value) || 70;

  return {
    name:            name || 'Student',
    age:             Math.min(100, Math.max(10, age)),
    gender:          getChip('gender')     ?? currentProfile.gender     ?? 'Male',
    internetQuality: getChip('internet')   ?? currentProfile.internetQuality ?? 'Average',
    motivationLevel: getChip('motivation') ?? currentProfile.motivationLevel ?? 'Medium',
    mentalHealth:    getChip('mental')     ?? currentProfile.mentalHealth    ?? 'Average',
    parentEducation: getChip('edu')        ?? currentProfile.parentEducation ?? 'Bachelors',
    attendance:      att,
    assignments:     asgn,
  };
}

// ─── Chip helpers ─────────────────────────────────────────────────────────────

export function initChips() {
  document.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.group;
      document.querySelectorAll(`[data-group="${group}"]`)
        .forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
}

function setChip(group, val) {
  document.querySelectorAll(`[data-group="${group}"]`).forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.val === val);
  });
}

function getChip(group) {
  const sel = document.querySelector(`[data-group="${group}"].selected`);
  return sel ? sel.dataset.val : null;
}

// ─── Streak calculator ────────────────────────────────────────────────────────

export function calcStreak(logs) {
  if (!logs.length) return 0;
  const sorted = [...logs].sort((a, b) => b.ts - a.ts);
  let streak = 0;
  let prev   = new Date();
  prev.setHours(0, 0, 0, 0);

  for (const log of sorted) {
    const d = new Date(log.ts);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((prev - d) / 86400000);
    if (diff <= 1) { streak++; prev = d; }
    else break;
  }
  return streak;
}
