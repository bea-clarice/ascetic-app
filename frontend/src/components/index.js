/**
 * Ascetic PWA — components/index.js
 * Pure-function HTML template builders for reusable UI pieces.
 * Each function returns an HTML string; caller inserts via innerHTML.
 */

// ─── Tier helpers ─────────────────────────────────────────────────────────────

export const TIER_ICONS  = { 1: '🚨', 2: '⚠️', 3: '✅' };
export const TIER_LABELS = { 1: 'Digital Detox', 2: 'Warning', 3: 'Excellent Alignment' };
export const TIER_COLORS = { 1: 'var(--danger)', 2: 'var(--warn)', 3: 'var(--good)' };

/**
 * tierBadge(tier) → "<div class='tier-badge tier-N'>…</div>"
 */
export function tierBadge(tier) {
  return `
    <div class="tier-badge tier-${tier}">
      ${TIER_ICONS[tier]} ${TIER_LABELS[tier]}
    </div>`;
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

/**
 * Animate the SVG ring stroke and update the numeric label.
 * @param {SVGCircleElement} fillEl   – the <circle class="ring-fill"> element
 * @param {HTMLElement}      scoreEl  – element showing the number
 * @param {number}           score    – 0–100
 * @param {number}           tier     – 1 | 2 | 3
 */
export function animateRing(fillEl, scoreEl, score, tier) {
  const circumference = 502; // 2π × r(80)
  const offset = circumference - (score / 100) * circumference;
  fillEl.style.strokeDashoffset = offset;
  fillEl.style.stroke           = TIER_COLORS[tier];
  scoreEl.textContent            = score;
  scoreEl.style.color            = TIER_COLORS[tier];
}

/**
 * Reset ring to empty/loading state.
 */
export function resetRing(fillEl, scoreEl) {
  fillEl.style.strokeDashoffset = 502;
  fillEl.style.stroke           = 'var(--border2)';
  scoreEl.textContent            = '--';
  scoreEl.style.color            = 'var(--text)';
}

// ─── Nudge Card ───────────────────────────────────────────────────────────────

/**
 * nudgeCard(nudge, tier) → HTML string
 */
export function nudgeCard(nudge, tier) {
  return `<div class="nudge-card nudge-${tier}">${nudge}</div>`;
}

export function welcomeCard() {
  return `
    <div class="nudge-card nudge-3" style="text-align:center;">
      👋 Welcome to <strong>Ascetic</strong>.
      Log your daily habits below to receive an AI-powered focus &amp; exam prediction.
    </div>`;
}

// ─── History Item ─────────────────────────────────────────────────────────────

/**
 * historyItem(log, compact?) → HTML string
 * log = { ts, date, form, result }
 */
export function historyItem(log, compact = false) {
  const { result, form } = log;
  const dateStr = new Date(log.ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
  const color = TIER_COLORS[result.tier];

  if (compact) {
    return `
      <div class="history-item">
        <div class="hist-dot hist-dot-${result.tier}">${TIER_ICONS[result.tier]}</div>
        <div class="hist-info">
          <div class="hist-date">${dateStr}</div>
          <div class="hist-scores">
            Focus <strong>${result.focus_score}%</strong> ·
            Exam <strong>${result.exam_score}/100</strong>
          </div>
        </div>
        <div class="hist-focus" style="color:${color}">${result.focus_score}%</div>
      </div>`;
  }

  return `
    <div class="history-item">
      <div class="hist-dot hist-dot-${result.tier}">${TIER_ICONS[result.tier]}</div>
      <div class="hist-info">
        <div class="hist-date">${dateStr} · ${result.tier_label}</div>
        <div class="hist-scores" style="font-size:12px;color:var(--muted)">
          📱 ${form.social}h &nbsp;·&nbsp;
          📚 ${form.study}h &nbsp;·&nbsp;
          😴 ${form.sleep}h
        </div>
      </div>
      <div style="text-align:right">
        <div class="hist-focus" style="color:${color};font-size:16px">${result.focus_score}%</div>
        <div style="font-size:11px;color:var(--muted)">${result.exam_score}/100</div>
      </div>
    </div>`;
}

// ─── Empty State ──────────────────────────────────────────────────────────────

/**
 * emptyState(icon, title, desc) → HTML string
 */
export function emptyState(icon = '📊', title = 'No data yet', desc = '') {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${title}</div>
      ${desc ? `<div class="empty-desc">${desc}</div>` : ''}
    </div>`;
}

// ─── Bar Column ───────────────────────────────────────────────────────────────

/**
 * barColumn(log) → HTML string for one day column in the bar chart
 */
export function barColumn(log) {
  const pct   = log.result.focus_score;
  const h     = Math.max(4, pct);
  const day   = new Date(log.ts).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);
  const color = TIER_COLORS[log.result.tier];
  return `
    <div class="bar-col">
      <div class="bar-fill has-data"
           style="height:${h}%;background:${color};border-radius:4px 4px 0 0;">
      </div>
      <span class="bar-day">${day}</span>
    </div>`;
}

// ─── Insight Card ─────────────────────────────────────────────────────────────

/**
 * insightCard({ icon, title, desc }) → HTML string
 */
export function insightCard({ icon, title, desc }) {
  return `
    <div class="insight-card">
      <div class="insight-icon">${icon}</div>
      <div class="insight-body">
        <div class="insight-title">${title}</div>
        <div class="insight-desc">${desc}</div>
      </div>
    </div>`;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

/**
 * statCard(label, value, unit, color?) → HTML string
 */
export function statCard(label, value, unit = '', color = 'var(--text)') {
  return `
    <div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value" style="color:${color}">
        ${value}<span class="stat-unit">${unit}</span>
      </div>
    </div>`;
}

// ─── Loading Spinner (inline) ─────────────────────────────────────────────────

export function spinnerHTML() {
  return `<div class="spinner"></div>`;
}
