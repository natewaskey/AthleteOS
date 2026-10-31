/*
 * Line icons for the whole app, and the swap that turns emoji in the interface into those icons.
 * Emoji stay in the data (sports, goals, exercise types, calendar exports) so nothing else has to
 * change; when they reach the screen they are drawn as one consistent outline icon instead.
 * What people type themselves (messages, notes, form fields) is left alone.
 */
(function (root) {
  'use strict';

  // 24x24 outline paths, drawn with stroke="currentColor".
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    strength: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
    jump: '<path d="M12 21v-4M8 21h8"/><path d="M12 13V4M8 8l4-4 4 4"/>',
    run: '<circle cx="14" cy="4.5" r="1.8"/><path d="m6 20 3.5-5 3 2.5V22M8 11l3-3.5 3 1.5 2 3h3M11 7.5 9.5 14"/>',
    bike: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16 10 8h5l3 8M9 8h3M12 16l2.5-5"/>',
    swim: '<path d="M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><path d="m7 13 4-4 3 3M16 7.5a1.5 1.5 0 1 0 0-.01"/>',
    mobility: '<circle cx="12" cy="4.5" r="1.8"/><path d="M4 11c3 1 5 1 8 1s5 0 8-1M12 12v4l-4 5M12 16l4 5"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M3.5 9.5c3 1 5 3.5 6 8M20.5 9.5c-3 1-5 3.5-6 8M12 3v6"/>',
    video: '<rect x="2.5" y="6" width="13.5" height="12" rx="2"/><path d="m16 10 5.5-3v10L16 14z"/>',
    camera: '<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8"/>',
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.4 3.6-8.3.5 2 1.6 3 2.6 3.4C12.2 6.7 13.4 4.4 15 3c.4 3 3.5 5.5 3.5 10 0 4.6-2.8 8-6.5 8z"/>',
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15.5l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.5 9.5"/>',
    clipboard: '<rect x="5" y="4.5" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M18.5 7l1.5-1.5"/>',
    bandage: '<rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M10.5 10.5h.01M13.5 13.5h.01M13.5 10.5h.01M10.5 13.5h.01"/>',
    ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
    scale: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    bars: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10"/>',
    medal: '<circle cx="12" cy="15" r="5.5"/><path d="M8.5 10.5 6 3h4l2 4.5L14 3h4l-2.5 7.5"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M22 20a7 7 0 0 0-4-6.3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/>',
    megaphone: '<path d="M3 10v4h3l9 5V5L6 10zM18 9a4 4 0 0 1 0 6"/>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3.5 3.5-3.5 7.5H17"/>',
    leaf: '<path d="M5 19C5 10 10 5 20 4c-1 10-6 15-15 15zM5 19l7-7"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    printer: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
    wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L21 13l-8 8-3-3 6.5-6.5zM3 21l6-6"/><path d="M14.5 6.5 17 4a4 4 0 0 1 3 3l-2.5 2.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7c-2.5 0-4-1-5.5-3L3 15a1.5 1.5 0 0 1 2.5-1.5L8 16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
    signal: '<path d="M12 12v9M8.5 8.5a5 5 0 0 1 7 0M5.5 5.5a9 9 0 0 1 13 0"/><circle cx="12" cy="12" r="1"/>',
    heart: '<path d="M19.5 13.5c1.3-1.4 2.5-3 2.5-5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .6-4.5 2-1.5-1.4-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2 1.2 3.6 2.5 5L12 21z"/>',
    pulse: '<path d="M3 12h4l2-4 4 8 2-4h6"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    stop: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
    dot: '<circle cx="12" cy="12" r="4"/>',
    down: '<path d="M12 4v14M6 12l6 6 6-6M5 21h14"/>',
    right: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    up: '<path d="M12 20V6M6 12l6-6 6 6"/>',
    repeat: '<path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4"/>',
    undo: '<path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
    pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    pill: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m8.5 8.5 7 7"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5zM4 19.5A1.5 1.5 0 0 0 5.5 21H20"/>',
    folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2.5h9a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 15l-3-3c1.5-4.5 5-9 13-9 0 8-4.5 11.5-9 13z"/><circle cx="15" cy="9" r="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    square: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
    mountain: '<path d="m2 20 7-12 4 6 3-4 6 10z"/>',
    snow: '<path d="M12 2v20M4 7l16 10M20 7 4 17"/>',
    ice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9l3 3M13 15l3-3"/>',
    bath: '<path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM6 12V5.5A2.5 2.5 0 0 1 10.5 4M6 20l-1 2M18 20l1 2"/>',
    sofa: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2zM5 18v2M19 18v2"/>',
    bus: '<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M8 18v3M16 18v3M8 14.5h.01M16 14.5h.01"/>',
    climb: '<path d="M6 21 18 3M9 16.5h5M11.5 12.5h5M14 8.5h5"/>',
    lungs: '<path d="M12 4v8M12 12c-1 0-2 1-2 2M12 12c1 0 2 1 2 2M8.5 7C6 7 4 12 4 16.5 4 19 5.5 20 7.5 20c2 0 2.5-2 2.5-4V9.5A2.5 2.5 0 0 0 8.5 7zM15.5 7C18 7 20 12 20 16.5c0 2.5-1.5 3.5-3.5 3.5S14 18 14 16V9.5A2.5 2.5 0 0 1 15.5 7z"/>',
    shoe: '<path d="M2 17h20v-2c0-1.5-1-2.5-3-3l-5-1.5L11 6H7l-1 3H3a1 1 0 0 0-1 1z"/><path d="M2 17v2h20v-2"/>',
    dna: '<path d="M7 3c0 6 10 6 10 12M17 3c0 3-2.5 4.5-5 6M7 21c0-3 2.5-4.5 5-6M17 21c0-2-1-3.5-2.5-4.5M8 7h8M8 17h8"/>',
    cake: '<path d="M4 21h16v-8H4zM4 16c2 1.5 4 1.5 5.3 0 1.4 1.5 4 1.5 5.4 0 1.3 1.5 3.3 1.5 5.3 0M12 13V9M12 6.5a1 1 0 0 0 0-2.5"/>',
    face1: '<circle cx="12" cy="12" r="9"/><path d="M8.5 16.5c1-1.5 2.2-2 3.5-2s2.5.5 3.5 2M8.5 9.5l2 1M15.5 9.5l-2 1"/>',
    face2: '<circle cx="12" cy="12" r="9"/><path d="M9 16c1-.8 2-1.2 3-1.2s2 .4 3 1.2M9 10h.01M15 10h.01"/>',
    face3: '<circle cx="12" cy="12" r="9"/><path d="M8.5 15.5h7M9 10h.01M15 10h.01"/>',
    face4: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2M9 10h.01M15 10h.01"/>',
    face5: '<circle cx="12" cy="12" r="9"/><path d="M7.5 13.5h9c-.5 2.5-2.3 4-4.5 4s-4-1.5-4.5-4zM8 9.5l1.5-1 1.5 1M13 9.5l1.5-1 1.5 1"/>',
    ghost: '<path d="M5 21V10a7 7 0 0 1 14 0v11l-2.5-2-2.3 2-2.2-2-2.2 2-2.3-2zM9.5 10.5h.01M14.5 10.5h.01"/>',
    hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/>',
    watch: '<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6l1-3.5h4L15 6M9 18l1 3.5h4L15 18M12 9.5V12l1.5 1.5"/>',
    star: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9z"/>',
  };

  // Emoji (without the variation selector) -> icon name.
  const E = {};
  const add = (name, list) => list.split(' ').forEach((e) => (E[e] = name));
  add('strength', '🏋 💪 🧱 🏋‍♀ 🏋‍♂');
  add('jump', '🦘 🤸 🪜');
  add('run', '🏃 🚶 🏃‍♀ 🏃‍♂ 💃');
  add('shoe', '👟 🥾');
  add('bike', '🚴 🚵 🚲');
  add('swim', '🏊 🤽 🚣 🌊 🏄');
  add('mobility', '🧘 🙆 🧍 🦵');
  add('bath', '🛁');
  add('sofa', '🛋');
  add('ball', '🏈 🏀 ⚽ ⚾ 🥎 🏐 🏒 🏑 🥍 🏉 🎾 🏓 ⛳ 🤼 🥊 🥋 🏂 ⛷ ⛸');
  add('video', '🎥 📹 🎬');
  add('camera', '📷');
  add('target', '🎯');
  add('flame', '🔥');
  add('sparkle', '✨ 🎉 🤩 🙌 🌸');
  add('rocket', '🚀');
  add('checkCircle', '✅ 👍');
  add('clipboard', '📋 📝');
  add('doc', '📄 📓');
  add('folder', '🗂 📥');
  add('book', '📖');
  add('timer', '⏱ ⏰');
  add('hourglass', '⏳');
  add('watch', '⌚');
  add('bandage', '🩹 🤕 🤒');
  add('pill', '💊');
  add('ruler', '📐 📏');
  add('scale', '⚖');
  add('bolt', '⚡ 💥');
  add('shield', '🛡');
  add('chart', '📈');
  add('bars', '📊');
  add('calendar', '📅 🗓 📆');
  add('cap', '🎓');
  add('lock', '🔒');
  add('flask', '🔬 🧪');
  add('dna', '🧬');
  add('medal', '🥇 🥈 🥉 🏅');
  add('trophy', '🏆');
  add('users', '👥 👪 🤝');
  add('mic', '🎙');
  add('megaphone', '📣');
  add('drop', '💧 💦');
  add('food', '🍽 🍝 🥗 🍑');
  add('leaf', '🌱');
  add('compass', '🧭');
  add('ghost', '👻');
  add('printer', '🖨');
  add('wrench', '🔧');
  add('gear', '⚙');
  add('hand', '👋 👏');
  add('sun', '🌅 ☀');
  add('moon', '😴 🌙 💤');
  add('brain', '🧠');
  add('phone', '📲 📱 📞');
  add('link', '🔗');
  add('flag', '🏟 📌');
  add('signal', '📡');
  add('cake', '🎂');
  add('heart', '❤ 💚 🫀');
  add('lungs', '🫁');
  add('wind', '💨 🌬');
  add('alert', '⚠');
  add('stop', '🛑 ⛔');
  add('dot', '🔴 🟠 🔸');
  add('down', '⬇');
  add('up', '⬆');
  add('right', '➡');
  add('repeat', '🔁 🔄 🔀');
  add('mail', '✉');
  add('chat', '💬');
  add('search', '🔎');
  add('bulb', '💡');
  add('mountain', '⛰');
  add('ice', '🧊');
  add('bus', '🚌');
  add('climb', '🧗');
  add('home', '🏠');
  add('star', '⭐ 🌟');
  add('face1', '😫 😣 😵');
  add('face2', '😕');
  add('face3', '😐');
  add('face4', '🙂 😌');
  add('face5', '😁 😄');
  add('pause', '⏸');
  add('play', '▶ ⏵ ⏯');
  add('square', '⏹');
  add('plus', '🔟');

  // Any pictographic emoji, including skin tones, gender joins and flags. Plain symbols such as ✓ ✕ ✎ → stay text.
  const RE = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}️?)*/gu;
  const KEEP = new Set(['✓', '✕', '✗', '✎', '✏', '❚', '↗', '↩', '↪', '©', '®', '™', '‼', '↔', '↕']);
  const clean = (e) => e.replace(/️/g, '').replace(/\p{Emoji_Modifier}/gu, '');
  const nameFor = (e) => {
    const c = clean(e);
    return E[c] || E[c.split('‍')[0]] || null;
  };

  const svg = (name, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.dot}</svg>`;
  const has = (s) => (RE.lastIndex = 0, RE.test(s));

  // Text without emoji (for places that can't hold an icon: options, titles, tooltips).
  function strip(s) {
    return String(s).replace(RE, (m) => (KEEP.has(clean(m)) ? m : '')).replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
  }

  const Icons = { paths: P, svg, nameFor, strip, has, RE };
  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = Icons;
    return;
  }
  root.Icons = Icons;

  // ---------- turn emoji on screen into icons ----------

  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'CODE', 'PRE', 'svg', 'CANVAS']);
  const userText = (el) => el.closest('[contenteditable], .msg-text, .no-icons');
  const NS = 'http://www.w3.org/2000/svg';

  function iconNode(e) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'ei');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = P[nameFor(e)] || P.dot;
    return s;
  }

  function swapText(node) {
    const text = node.nodeValue;
    if (!text || !has(text)) return;
    const parent = node.parentNode;
    if (!parent || parent.nodeType !== 1) return;
    if (SKIP.has(parent.nodeName) || userText(parent)) return;
    const frag = document.createDocumentFragment();
    let last = 0;
    RE.lastIndex = 0;
    let m;
    let changed = false;
    while ((m = RE.exec(text))) {
      if (KEEP.has(clean(m[0]))) continue;
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      frag.appendChild(iconNode(m[0]));
      last = m.index + m[0].length;
      changed = true;
    }
    if (!changed) return;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    parent.replaceChild(frag, node);
  }

  const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
  function swapAttrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && has(v)) el.setAttribute(a, strip(v));
    }
    if (el.nodeName === 'OPTION' && has(el.textContent)) el.textContent = strip(el.textContent);
  }

  function scan(rootEl) {
    if (!rootEl) return;
    if (rootEl.nodeType === 3) return swapText(rootEl);
    if (rootEl.nodeType !== 1) return;
    swapAttrs(rootEl);
    if (SKIP.has(rootEl.nodeName) && rootEl.nodeName !== 'SELECT') return;
    rootEl.querySelectorAll('[title], [aria-label], [placeholder], [alt], option').forEach(swapAttrs);
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(swapText);
  }

  function start() {
    scan(document.body);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') swapText(m.target);
        else if (m.type === 'attributes') swapAttrs(m.target);
        else m.addedNodes.forEach(scan);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  Icons.scan = scan;
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})(typeof window !== 'undefined' ? window : globalThis);
