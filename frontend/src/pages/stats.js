/**
 * Ascetic PWA — pages/stats.js
 * Stats page render logic: averages, bar chart, insights, full log.
 */

import { barColumn, insightCard, historyItem, emptyState } from '../components/index.js';

/**
 * renderStats({ logs, domRefs })
 *
 * domRefs = { avgFocus, avgExam, barChart, insightsList, allLogsList }
 */
export function renderStats({ logs, domRefs }) {
  const { avgFocus, avgExam, barChart, insightsList, allLogsList } = domRefs;

  if (!logs.length) {
    avgFocus.textContent = '--';
    avgExam.textContent  = '--';
    barChart.innerHTML   = emptyState('📈', 'No data yet', 'Start logging to see your trends.');
    insightsList.innerHTML = '';
    allLogsList.innerHTML  = '';
    return;
  }

  // ── Averages ──────────────────────────────────────────────────────────────
  const n        = logs.length;
  const sumFocus = logs.reduce((s, l) => s + l.result.focus_score, 0);
  const sumExam  = logs.reduce((s, l) => s + l.result.exam_score,  0);

  avgFocus.textContent = Math.round(sumFocus / n);
  avgExam.textContent  = Math.round(sumExam  / n);

  // ── Bar Chart (last 7) ────────────────────────────────────────────────────
  const last7 = logs.slice(0, 7).reverse();
  barChart.innerHTML = last7.length
    ? last7.map(barColumn).join('')
    : emptyState('📊', 'Need more logs', 'Log at least once to see the chart.');

  // ── Insights ──────────────────────────────────────────────────────────────
  const recent    = logs.slice(0, 7);
  const avgSocial = avg(recent, (l) => l.form.social);
  const avgStudyH = avg(recent, (l) => l.form.study);
  const avgSleep  = avg(recent, (l) => l.form.sleep);
  const avgGaming = avg(recent, (l) => l.form.gaming);
  const avgStream = avg(recent, (l) => l.form.streaming);
  const bestDay   = maxBy(recent, (l) => l.result.focus_score);
  const worstDay  = minBy(recent, (l) => l.result.focus_score);

  const insights = [
    {
      icon:  '📱',
      title: `Avg Social Media: ${avgSocial.toFixed(1)}h/day`,
      desc:  avgSocial > 4
        ? 'Your social screen time is high. Research links 4+ hours/day to a 15% focus drop. Try app timers.'
        : 'Social media use is within a healthy range. Consistency is key — keep it up.',
    },
    {
      icon:  '🎮',
      title: `Avg Gaming: ${avgGaming.toFixed(1)}h/day`,
      desc:  avgGaming > 3
        ? 'Heavy gaming displaces study time. Even 1 less hour of gaming frees 60 focused minutes.'
        : 'Gaming is balanced. Short sessions can actually improve cognitive flexibility.',
    },
    {
      icon:  '📺',
      title: `Avg Streaming: ${avgStream.toFixed(1)}h/day`,
      desc:  avgStream > 3
        ? 'Streaming is one of the top focus-killers. Background noise from shows fragments deep work.'
        : 'Streaming is moderate. Watching before sleep can still delay sleep onset — wind down early.',
    },
    {
      icon:  '📚',
      title: `Avg Study Time: ${avgStudyH.toFixed(1)}h/day`,
      desc:  avgStudyH < 3
        ? 'Study hours are low. Even 30 extra minutes of deliberate practice can improve exam scores significantly.'
        : 'Good study consistency maintained. Aim for distributed sessions rather than last-minute cramming.',
    },
    {
      icon:  '😴',
      title: `Avg Sleep: ${avgSleep.toFixed(1)}h/night`,
      desc:  avgSleep < 6
        ? 'Sleep deprivation severely impairs memory consolidation. Aim for 7–9 hours.'
        : 'Healthy sleep detected. Sleep is your brain\'s maintenance window — protect it.',
    },
  ];

  if (bestDay) {
    insights.push({
      icon:  '🏆',
      title: `Best Focus Day: ${bestDay.result.focus_score}%`,
      desc:  `On ${fmtDate(bestDay.ts)} you studied ${bestDay.form.study}h and spent only ${bestDay.form.social}h on social media. Replicate that template.`,
    });
  }

  if (worstDay && worstDay !== bestDay) {
    insights.push({
      icon:  '📉',
      title: `Lowest Focus Day: ${worstDay.result.focus_score}%`,
      desc:  `On ${fmtDate(worstDay.ts)}: ${worstDay.form.social}h social media and only ${worstDay.form.study}h studying. Identify what went wrong and plan around it.`,
    });
  }

  insightsList.innerHTML = insights.map(insightCard).join('');

  // ── All Logs ──────────────────────────────────────────────────────────────
  allLogsList.innerHTML = logs.map((l) => historyItem(l, false)).join('');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function avg(arr, fn) {
  return arr.length ? arr.reduce((s, x) => s + fn(x), 0) / arr.length : 0;
}

function maxBy(arr, fn) {
  return arr.reduce((best, x) => (fn(x) > fn(best) ? x : best), arr[0]);
}

function minBy(arr, fn) {
  return arr.reduce((best, x) => (fn(x) < fn(best) ? x : best), arr[0]);
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
