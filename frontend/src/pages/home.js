/**
 * Ascetic PWA — pages/home.js
 * Home page render logic.
 * Called from app.js; receives shared state refs.
 */

import {
  animateRing, resetRing,
  tierBadge, nudgeCard, welcomeCard,
  historyItem, emptyState, statCard,
} from '../components/index.js';

/**
 * renderHome({ lastResult, logs, domRefs })
 *
 * domRefs = {
 *   ringFill, ringScore, ringTier, nudgeWrap,
 *   qsExam, qsStudy, qsSocial, qsSleep, recentList
 * }
 */
export function renderHome({ lastResult, logs, domRefs }) {
  const { ringFill, ringScore, ringTier, nudgeWrap,
          qsExam, qsStudy, qsSocial, qsSleep, recentList } = domRefs;

  if (lastResult) {
    const { result, form } = lastResult;

    // Ring
    animateRing(ringFill, ringScore, result.focus_score, result.tier);
    ringTier.innerHTML = tierBadge(result.tier);

    // Nudge
    nudgeWrap.innerHTML = nudgeCard(result.nudge, result.tier);

    // Quick stats
    qsExam.innerHTML   = `${result.exam_score}<span class="stat-unit">/100</span>`;
    qsStudy.innerHTML  = `${form.study}<span class="stat-unit">h</span>`;
    qsSocial.innerHTML = `${form.social}<span class="stat-unit">h</span>`;
    qsSleep.innerHTML  = `${form.sleep}<span class="stat-unit">h</span>`;

  } else {
    // First-run empty state
    resetRing(ringFill, ringScore);
    ringTier.innerHTML  = `
      <div class="tier-badge"
           style="background:var(--card);color:var(--muted);border:1px solid var(--border)">
        Log data to get your prediction
      </div>`;
    nudgeWrap.innerHTML = welcomeCard();

    qsExam.innerHTML   = `--<span class="stat-unit">/100</span>`;
    qsStudy.innerHTML  = `--<span class="stat-unit">h</span>`;
    qsSocial.innerHTML = `--<span class="stat-unit">h</span>`;
    qsSleep.innerHTML  = `--<span class="stat-unit">h</span>`;
  }

  // Recent history list
  if (!logs.length) {
    recentList.innerHTML = emptyState(
      '📊',
      'No logs yet',
      'Tap "Log Today\'s Data" to get your first AI prediction.'
    );
  } else {
    recentList.innerHTML = logs.slice(0, 5).map((l) => historyItem(l, true)).join('');
  }
}
