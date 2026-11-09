/*
 * Look and feel (ideas 58-60): display mode, accent colour and team colors.
 *   Display modes: system, light, dark, black (true black for OLED phones, saves battery), contrast (high contrast).
 *   Accents: six colours tuned to read on both light and dark backgrounds, or the team color.
 *   Team color and logo: set by a coach in Settings, synced to the team, used as the accent for everyone on the
 *   team who hasn't picked their own, and printed on exports (weekly review, recruiting profile).
 * Display and accent are per device (they live in localStorage, like the old theme setting).
 * Browser: window.Theme. Node: require('./theme.js') for the colour maths.
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const DISPLAY_KEY = 'athleteos:theme';
  const ACCENT_KEY = 'motiq.accent';

  const DISPLAYS = [
    { id: 'system', label: 'Match my device' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'black', label: 'True black (OLED)' },
    { id: 'contrast', label: 'High contrast' },
  ];
  // [light-mode shade, dark-mode shade]
  const ACCENTS = [
    { id: 'aurora', label: 'Motiq aurora', light: '#0a86b0', dark: '#7fe8ff' },
    { id: 'orange', label: 'Orange', light: '#c94a0c', dark: '#ff7a3d' },
    { id: 'ice', label: 'Ice blue', light: '#0b6fc0', dark: '#4cb4ff' },
    { id: 'lime', label: 'Lime', light: '#4d8a00', dark: '#a3e635' },
    { id: 'violet', label: 'Violet', light: '#6d3fe0', dark: '#a78bfa' },
    { id: 'red', label: 'Red', light: '#d6283b', dark: '#ff4d5e' },
    { id: 'gold', label: 'Gold', light: '#a87400', dark: '#facc15' },
  ];

  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgbHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  function luminance(hex) {
    const c = hexRgb(hex).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    const x = luminance(a);
    const y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  const mix = (a, b, t) => rgbHex(hexRgb(a).map((v, i) => v + (hexRgb(b)[i] - v) * t));
  // Make any team color readable: lighten it on dark backgrounds, darken it on light ones, until it reaches 3:1.
  function readable(hex, bg) {
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return null;
    const towards = luminance(bg) < 0.2 ? '#ffffff' : '#000000';
    let c = hex.toLowerCase();
    for (let i = 0; i < 20 && contrast(c, bg) < 3; i++) c = mix(c, towards, 0.1);
    return c;
  }
  // Text on top of the accent (buttons): dark or white, whichever reads better.
  const inkFor = (hex) => (contrast(hex, '#0b0d10') >= contrast(hex, '#ffffff') ? '#0b0d10' : '#ffffff');

  const Theme = { DISPLAYS, ACCENTS, luminance, contrast, readable, inkFor, mix };

  if (!node && typeof document !== 'undefined') {
    const get = (k, d) => {
      try {
        return localStorage.getItem(k) || d;
      } catch {
        return d;
      }
    };
    const put = (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {}
    };
    let brand = { color: '', logo: '' };
    const display = () => get(DISPLAY_KEY, 'dark');
    const accent = () => get(ACCENT_KEY, 'auto'); // auto = team color if there is one, else orange
    const isDark = () => {
      const d = document.documentElement.dataset.theme;
      if (d === 'dark') return true;
      if (d === 'light') return false;
      return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
    };
    function apply() {
      const el = document.documentElement;
      const d = display();
      if (d === 'light' || d === 'dark') el.dataset.theme = d;
      else if (d === 'black' || d === 'contrast') el.dataset.theme = 'dark';
      else delete el.dataset.theme;
      if (d === 'black' || d === 'contrast') el.dataset.display = d;
      else delete el.dataset.display;
      const dark = isDark();
      const bg = d === 'black' || d === 'contrast' ? '#000000' : dark ? '#070a12' : '#eef1f8';
      const a = accent();
      let color = null;
      if ((a === 'auto' || a === 'team') && brand.color) color = readable(brand.color, bg);
      else {
        const pick = ACCENTS.find((x) => x.id === a);
        if (pick && pick.id !== 'aurora') color = dark ? pick.dark : pick.light;
      }
      if (color) {
        el.style.setProperty('--accent', color);
        el.style.setProperty('--accent-ink', inkFor(color));
      } else {
        el.style.removeProperty('--accent');
        el.style.removeProperty('--accent-ink');
      }
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? (d === 'black' || d === 'contrast' ? '#000000' : '#070a12') : '#eef1f8');
      // Team logo next to the app name.
      document.querySelectorAll('.brand').forEach((b) => {
        let img = b.querySelector('.team-logo');
        if (brand.logo) {
          if (!img) {
            img = document.createElement('img');
            img.className = 'team-logo';
            img.alt = 'Team logo';
            b.append(img);
          }
          if (img.src !== brand.logo) img.src = brand.logo;
        } else if (img) img.remove();
      });
    }
    function setDisplay(d) {
      if (!DISPLAYS.some((x) => x.id === d)) d = 'system';
      put(DISPLAY_KEY, d);
      apply();
    }
    function setAccent(a) {
      put(ACCENT_KEY, a === 'team' || ACCENTS.some((x) => x.id === a) ? a : 'auto');
      apply();
    }
    function setBrand(b) {
      const next = { color: (b && b.color) || '', logo: (b && b.logo) || '' };
      if (next.color === brand.color && next.logo === brand.logo) return;
      brand = next;
      apply();
    }
    // Settings fields: display mode + accent swatches (team color first when the team has one).
    function fields(esc = (x) => x) {
      const d = display();
      const a = accent();
      const sw = [];
      if (brand.color) sw.push({ id: 'auto', label: 'Team color', color: brand.color });
      for (const x of ACCENTS) sw.push({ id: x.id, label: x.label, color: isDark() ? x.dark : x.light });
      const current = a === 'team' ? 'auto' : a === 'auto' && !brand.color ? 'orange' : a;
      return `<label>Display <select name="theme">${DISPLAYS.map((x) => `<option value="${x.id}" ${x.id === d ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
        <fieldset class="accent-pick" style="grid-column:1/-1"><legend>Accent color</legend>
          ${sw.map((x) => `<label class="swatch" title="${esc(x.label)}"><input type="radio" name="accent" value="${x.id}" ${x.id === current ? 'checked' : ''}/><i style="background:${x.color}"></i><span>${esc(x.label)}</span></label>`).join('')}
        </fieldset>`;
    }
    if (root.matchMedia) {
      const mq = root.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', apply);
    }
    Object.assign(Theme, { apply, setDisplay, setAccent, setBrand, fields, display, accent, isDark, brand: () => ({ ...brand }) });
    apply();
  }

  if (node) module.exports = Theme;
  else root.Theme = Theme;
})(typeof window !== 'undefined' ? window : globalThis);
