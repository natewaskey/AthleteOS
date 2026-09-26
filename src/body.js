/*
 * Clickable front/back body map rendered as inline SVG.
 * Each region carries data-area="<id>"; app.js handles clicks (cycling severity).
 * Right/left are the athlete's own sides: on the front view their right is on the viewer's left.
 */
(function (root) {
  'use strict';

  // [areaId, svg element, attributes]. Coordinates are in a 160x352 viewBox.
  const LIMBS = (side, x) => ({ side, x });
  const FRONT = [
    ['head', 'ellipse', { cx: 80, cy: 28, rx: 17, ry: 21 }],
    ['neck', 'rect', { x: 72, y: 47, width: 16, height: 12, rx: 4 }],
    ['chest', 'rect', { x: 60, y: 60, width: 40, height: 34, rx: 10 }],
    ['abs', 'rect', { x: 62, y: 96, width: 36, height: 50, rx: 9 }],
    ['hips', 'rect', { x: 60, y: 148, width: 40, height: 24, rx: 10 }],
    ...sides([LIMBS('r', 0), LIMBS('l', 1)], (s, i) => [
      [`shoulder-${s}`, 'ellipse', { cx: [49, 111][i], cy: 70, rx: 13, ry: 11 }],
      [`bicep-${s}`, 'rect', { x: [34, 111][i], y: 80, width: 15, height: 42, rx: 7.5 }],
      [`forearm-${s}`, 'rect', { x: [29, 117][i], y: 125, width: 14, height: 44, rx: 7 }],
      [`wrist-${s}`, 'ellipse', { cx: [35, 125][i], cy: 180, rx: 8, ry: 10 }],
      [`quad-${s}`, 'rect', { x: [59, 81][i], y: 174, width: 20, height: 70, rx: 10 }],
      [`knee-${s}`, 'ellipse', { cx: [69, 91][i], cy: 254, rx: 10, ry: 9 }],
      [`shin-${s}`, 'rect', { x: [61, 83][i], y: 265, width: 16, height: 62, rx: 8 }],
      [`ankle-${s}`, 'ellipse', { cx: [69, 91][i], cy: 338, rx: 11, ry: 8 }],
    ]),
  ];

  // Back view is mirrored: the athlete's left is now on the viewer's left.
  const BACK = [
    ['head', 'ellipse', { cx: 80, cy: 28, rx: 17, ry: 21 }],
    ['neck', 'rect', { x: 72, y: 47, width: 16, height: 12, rx: 4 }],
    ['upper-back', 'rect', { x: 60, y: 60, width: 40, height: 40, rx: 10 }],
    ['lower-back', 'rect', { x: 62, y: 102, width: 36, height: 44, rx: 9 }],
    ['glutes', 'rect', { x: 60, y: 148, width: 40, height: 30, rx: 12 }],
    ...sides([LIMBS('l', 0), LIMBS('r', 1)], (s, i) => [
      [`shoulder-${s}`, 'ellipse', { cx: [49, 111][i], cy: 70, rx: 13, ry: 11 }],
      [`tricep-${s}`, 'rect', { x: [34, 111][i], y: 80, width: 15, height: 42, rx: 7.5 }],
      [`forearm-${s}`, 'rect', { x: [29, 117][i], y: 125, width: 14, height: 44, rx: 7 }],
      [`wrist-${s}`, 'ellipse', { cx: [35, 125][i], cy: 180, rx: 8, ry: 10 }],
      [`hamstring-${s}`, 'rect', { x: [59, 81][i], y: 180, width: 20, height: 64, rx: 10 }],
      [`knee-${s}`, 'ellipse', { cx: [69, 91][i], cy: 254, rx: 10, ry: 9 }],
      [`calf-${s}`, 'rect', { x: [61, 83][i], y: 265, width: 16, height: 62, rx: 8 }],
      [`ankle-${s}`, 'ellipse', { cx: [69, 91][i], cy: 338, rx: 11, ry: 8 }],
    ]),
  ];

  function sides(list, fn) {
    return list.flatMap((l) => fn(l.side, l.x));
  }

  function figure(shapes, title, leftLabel, rightLabel, areas, labels, interactive) {
    const Core = root.Core;
    const body = shapes
      .map(([id, tag, attrs]) => {
        const lvl = areas[id] || 0;
        const label = `${labels[id]}: ${Core.SORENESS_LEVELS[lvl]}`;
        const a = Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ');
        const extra = interactive ? ` role="button" tabindex="0" aria-label="${label}"` : '';
        return `<${tag} ${a} class="area lvl-${lvl}" data-area="${id}"${extra}><title>${label}</title></${tag}>`;
      })
      .join('');
    return `<figure class="body-fig">
      <svg viewBox="0 0 160 352" class="body-svg${interactive ? ' interactive' : ''}" role="group" aria-label="${title} view">${body}</svg>
      <figcaption><span>${leftLabel}</span><strong>${title}</strong><span>${rightLabel}</span></figcaption>
    </figure>`;
  }

  /* areas: { areaId: level 1-3 }. interactive adds focus/keyboard affordances. */
  function render(areas = {}, { interactive = false } = {}) {
    const labels = root.Core.BODY_AREA_LABEL;
    return `<div class="bodymap">
      ${figure(FRONT, 'Front', 'R', 'L', areas, labels, interactive)}
      ${figure(BACK, 'Back', 'L', 'R', areas, labels, interactive)}
    </div>`;
  }

  function legend() {
    return `<div class="body-legend">
      <span><i class="lvl-1"></i>Mild / tight</span><span><i class="lvl-2"></i>Sore</span><span><i class="lvl-3"></i>Pain</span>
    </div>`;
  }

  root.BodyMap = { render, legend };
})(typeof window !== 'undefined' ? window : globalThis);
