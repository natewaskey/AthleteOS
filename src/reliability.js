/*
 * Reliability and validity numbers for camera measurements. Pure, no DOM.
 *   trials(values) -> { n, best, median, mean, sd, cv }       spread of repeat trials in one session
 *   jumpNoise(key, value, history) -> typical error in the metric's unit
 *   realChange(prev, cur, te) -> { diff, mdc, real }          MDC95 = 1.96 × √2 × typical error
 *   scoreChange(prevScores, curScores) -> { diff, band, real } form score change vs rep-to-rep noise
 *   agreement(pairs) -> { n, bias, sd, lo, hi, r, mape }      Bland-Altman vs a reference device
 *   labelAccuracy(analyses) -> { n, right, pct, byCheck }       how often coaches/athletes said a check was right
 * Browser: window.Reliability. Node: require('./reliability.js').
 */
(function (root) {
  'use strict';

  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const sdOf = (xs) => {
    if (xs.length < 2) return null;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
  };
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const k = Math.floor(s.length / 2);
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  };
  const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);

  function trials(values, { better = 'higher' } = {}) {
    const xs = (values || []).filter((x) => x != null && isFinite(x)).map(Number);
    if (!xs.length) return { n: 0, best: null, median: null, mean: null, sd: null, cv: null };
    const m = mean(xs);
    const sd = sdOf(xs);
    return { n: xs.length, best: better === 'lower' ? Math.min(...xs) : Math.max(...xs), median: r2(median(xs)), mean: r2(m), sd: r2(sd), cv: sd != null && m ? r2((sd / m) * 100) : null };
  }

  // Published day-to-day variation for phone-video jump tests (coefficient of variation, %).
  // Bilateral CMJ ~4%, single-leg ~6%, drop-jump RSI ~7.5% (Balsalobre-Fernández 2015, Haynes 2019, Markwick 2015).
  const DEFAULT_CV = { cmj: 4, cmj_l: 6, cmj_r: 6, rsi: 7.5 };

  /*
   * Typical error for this athlete's metric. history: earlier sessions as [{ jumps: [values] }];
   * with 3+ sessions of repeat trials the athlete's own within-session spread is used.
   */
  function jumpNoise(key, value, history = []) {
    const spreads = history.map((h) => sdOf((h.jumps || []).filter((x) => x != null && isFinite(x)))).filter((x) => x != null);
    if (spreads.length >= 3) return { te: r2(Math.sqrt(mean(spreads.map((x) => x * x)))), from: 'yours' };
    const cv = DEFAULT_CV[key] || 5;
    return { te: r2((cv / 100) * (value || 0)), from: 'typical' };
  }

  function realChange(prev, cur, te) {
    if (prev == null || cur == null || !(te > 0)) return { diff: prev != null && cur != null ? r2(cur - prev) : null, mdc: null, real: null };
    const mdc = 1.96 * Math.SQRT2 * te;
    const diff = cur - prev;
    return { diff: r2(diff), mdc: r2(mdc), real: Math.abs(diff) > mdc };
  }

  // Form score change between two sessions, judged against how much the reps varied in each.
  function scoreChange(prevScores, curScores, { floor = 4 } = {}) {
    const a = (prevScores || []).filter(isFinite), b = (curScores || []).filter(isFinite);
    if (!a.length || !b.length) return { diff: null, band: null, real: null };
    const se = (xs) => Math.max(floor, sdOf(xs) ?? floor) / Math.sqrt(xs.length);
    const band = 1.96 * Math.sqrt(se(a) ** 2 + se(b) ** 2);
    const diff = mean(b) - mean(a);
    return { diff: Math.round(diff), band: Math.round(band), real: Math.abs(diff) > band };
  }

  // Bland-Altman agreement between the app and a reference device (jump mat, force plate, bar-speed unit).
  function agreement(pairs) {
    const ps = (pairs || []).filter((p) => p && isFinite(p.app) && isFinite(p.ref) && p.ref !== 0);
    if (ps.length < 2) return { n: ps.length, bias: null, sd: null, lo: null, hi: null, r: null, mape: null };
    const d = ps.map((p) => p.app - p.ref);
    const bias = mean(d);
    const sd = sdOf(d);
    const ma = mean(ps.map((p) => p.app)), mr = mean(ps.map((p) => p.ref));
    const cov = ps.reduce((s, p) => s + (p.app - ma) * (p.ref - mr), 0);
    const va = ps.reduce((s, p) => s + (p.app - ma) ** 2, 0), vr = ps.reduce((s, p) => s + (p.ref - mr) ** 2, 0);
    const r = va && vr ? cov / Math.sqrt(va * vr) : null;
    const mape = mean(ps.map((p) => Math.abs(p.app - p.ref) / Math.abs(p.ref))) * 100;
    return { n: ps.length, bias: r2(bias), sd: r2(sd), lo: r2(bias - 1.96 * sd), hi: r2(bias + 1.96 * sd), r: r2(r), mape: r2(mape) };
  }

  function labelAccuracy(analyses) {
    const byCheck = {};
    let n = 0, right = 0;
    for (const an of analyses || []) {
      for (const [id, v] of Object.entries(an.labels || {})) {
        const c = (byCheck[id] = byCheck[id] || { n: 0, right: 0, label: ((an.checks || []).find((x) => x.id === id) || {}).label || id });
        c.n++;
        n++;
        if (v === 'right') c.right++, right++;
      }
    }
    return { n, right, pct: n ? Math.round((right / n) * 100) : null, byCheck };
  }

  const Reliability = { trials, jumpNoise, realChange, scoreChange, agreement, labelAccuracy, DEFAULT_CV };
  if (typeof module !== 'undefined' && module.exports) module.exports = Reliability;
  else root.Reliability = Reliability;
})(typeof window !== 'undefined' ? window : globalThis);
