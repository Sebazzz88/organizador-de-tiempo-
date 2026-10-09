/* Agendita — app para Android (Capacitor), by Sebastian. Hecho con cariño :) */
(() => {
  'use strict';

  /* ---------- Utilidades ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const toMin = t => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
  const dayDiff = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
  const at = (ds, time) => { const d = parseYmd(ds); const [h, m] = (time || '09:00').split(':').map(Number); d.setHours(h, m, 0, 0); return d; };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  const isYmd = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const validTime = s => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
  const todayS = () => ymd(new Date());
  const longDate = ds => parseYmd(ds).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  const REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- Capacitor ---------- */
  const Cap = window.Capacitor;
  const NATIVE = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const AppP = NATIVE && window.capacitorApp ? window.capacitorApp.App : null;
  // Puente nativo: bóveda cifrada (Android Keystore), avisos, permisos y widget.
  const AG = NATIVE && window.capacitorExports ? window.capacitorExports.registerPlugin('Agendita') : null;

  /* ---------- Datos ---------- */
  const CATS = {
    urgente:    { label: 'Urgente',    nick: 'hibisco', icon: 'i-hib',   emoji: '🌺', help: 'Tiene fecha límite hoy o mañana. Te aviso varias veces para que no se pase.' },
    importante: { label: 'Importante', nick: 'mango',   icon: 'i-mango', emoji: '🥭', help: 'Te hace crecer o es especial. Te aviso con tiempo para que llegues con calma.' },
    leve:       { label: 'Leve',       nick: 'laguna',  icon: 'i-wave',  emoji: '🌊', help: 'Puede esperar. Te aviso con suavidad, sin presión.' }
  };
  const ORDER = ['urgente', 'importante', 'leve'];
  const LEAD_PRESETS = [10080, 4320, 2880, 1440, 180, 60, 30, 0];
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  const WEEK = [
    { d: 1, s: 'L', one: 'lunes', many: 'lunes' }, { d: 2, s: 'M', one: 'martes', many: 'martes' },
    { d: 3, s: 'X', one: 'miércoles', many: 'miércoles' }, { d: 4, s: 'J', one: 'jueves', many: 'jueves' },
    { d: 5, s: 'V', one: 'viernes', many: 'viernes' }, { d: 6, s: 'S', one: 'sábado', many: 'sábados' },
    { d: 0, s: 'D', one: 'domingo', many: 'domingos' }
  ];
  const REPEAT = { none: 'Una vez', daily: 'Cada día', weekly: 'Cada semana', monthly: 'Cada mes', yearly: 'Cada año' };
  const KEY = 'jardin-app-v1';
  const APP = { version: '1.3', build: 4 };
  const VERSION_URL = 'https://raw.githubusercontent.com/Sebazzz88/organizador-de-tiempo-/main/version.json';
  const APK_PREFIX = 'https://github.com/Sebazzz88/organizador-de-tiempo-/raw/main/apk/';
  const HORIZON_DAYS = 21, MAX_NOTIFS = 400;
  const LIMITS = { tasks: 3000, fixed: 300, notes: 3000 };

  const DEFAULT_SETTINGS = () => ({
    name: '', onboarded: false, fixedAsked: false, lastVersion: '',
    brief: { on: true, time: '08:00' },
    quiet: { from: '22:30', to: '07:00' },
    cats: { urgente: { offsets: [2880, 1440, 60, 0] }, importante: { offsets: [2880, 0] }, leve: { offsets: [2880, 0] } },
    after: { hours: 1, repeat: false, skipFixed: true },
    pend: { on: true, afternoon: '18:00', evening: '21:30' }
  });
  const fresh = () => ({ v: 2, settings: DEFAULT_SETTINGS(), tasks: [], fixed: [], notes: {}, sync: null });

  function normalize(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.tasks)) return null;
    const out = fresh(), S = out.settings, st = s.settings || {};
    if (typeof st.name === 'string') S.name = st.name.trim().slice(0, 40);
    S.onboarded = !!st.onboarded; S.fixedAsked = !!st.fixedAsked;
    if (typeof st.lastVersion === 'string') S.lastVersion = st.lastVersion.slice(0, 20);
    if (st.brief) { S.brief.on = st.brief.on !== false; if (validTime(st.brief.time)) S.brief.time = st.brief.time; }
    else if (validTime(st.morning)) S.brief.time = st.morning;
    const q = st.quiet || { from: st.quietFrom, to: st.quietTo };
    if (validTime(q.from)) S.quiet.from = q.from;
    if (validTime(q.to)) S.quiet.to = q.to;
    for (const k of ORDER) {
      const o = st.cats && st.cats[k] && st.cats[k].offsets;
      if (Array.isArray(o)) S.cats[k].offsets = [...new Set(o.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 525600))].sort((a, b) => b - a);
    }
    if (st.after) {
      const h = Number(st.after.hours);
      if (Number.isInteger(h) && h >= 0 && h <= 24) S.after.hours = h;
      S.after.repeat = !!st.after.repeat; S.after.skipFixed = st.after.skipFixed !== false;
    }
    if (st.pend && typeof st.pend === 'object') {
      S.pend.on = st.pend.on !== false;
      if (validTime(st.pend.afternoon)) S.pend.afternoon = st.pend.afternoon;
      if (validTime(st.pend.evening)) S.pend.evening = st.pend.evening;
    }
    out.tasks = s.tasks.filter(t => t && !t.ex && typeof t.title === 'string' && isYmd(t.date) && CATS[t.cat]).slice(0, LIMITS.tasks).map(t => ({
      id: String(t.id || uid()).slice(0, 64), title: t.title.slice(0, 90), date: t.date, time: validTime(t.time) ? t.time : '09:00', cat: t.cat,
      repeat: REPEAT[t.repeat] ? t.repeat : 'none', key: !!t.key, note: typeof t.note === 'string' ? t.note.slice(0, 1000) : '',
      lead: Number.isInteger(t.lead) && t.lead >= 0 ? t.lead : null, done: t.done && typeof t.done === 'object' ? t.done : {}
    }));
    out.fixed = (Array.isArray(s.fixed) ? s.fixed : []).filter(f => f && typeof f.title === 'string').slice(0, LIMITS.fixed).map(f => ({
      id: String(f.id || uid()).slice(0, 64), title: f.title.slice(0, 90), time: validTime(f.time) ? f.time : '08:00', daily: f.daily !== false,
      days: Array.isArray(f.days) && f.days.length ? [...new Set(f.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b) : ALL_DAYS.slice(),
      start: isYmd(f.start) ? f.start : todayS(), done: f.done && typeof f.done === 'object' ? f.done : {}
    }));
    if (s.notes && typeof s.notes === 'object') for (const [k, v] of Object.entries(s.notes).slice(0, LIMITS.notes)) if (isYmd(k) && typeof v === 'string' && v.trim()) out.notes[k] = v.slice(0, 3000);
    if (s.sync && typeof s.sync === 'object') out.sync = s.sync;
    return out;
  }

  function loadLocal() { try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  let state = (AG ? null : normalize(loadLocal())) || fresh();
  // En el teléfono no se guarda nada hasta leer la bóveda, para no pisar los datos con un estado vacío.
  let loaded = !AG, saveChain = Promise.resolve();
  function persist() {
    if (!loaded) return;
    const raw = JSON.stringify(state);
    if (AG) {
      saveChain = saveChain.then(() => AG.saveState({ value: raw }))
        .catch(() => toast('No se pudo guardar', 'Inténtalo de nuevo. Si sigue pasando, copia tu respaldo en «Más».', 'urgente', 7000));
      return;
    }
    try { localStorage.setItem(KEY, raw); } catch (e) {}
  }
  function save() { persist(); scheduleSync(); }

  const t0 = new Date();
  const view = { tab: 'hoy', month: new Date(t0.getFullYear(), t0.getMonth(), 1), sel: ymd(t0), quickDay: 0 };

  function occursOn(t, ds) {
    if (ds < t.date) return false;
    if (ds === t.date) return true;
    const a = parseYmd(t.date), b = parseYmd(ds);
    switch (t.repeat) {
      case 'daily': return true;
      case 'weekly': return dayDiff(t.date, ds) % 7 === 0;
      case 'monthly': return a.getDate() === b.getDate();
      case 'yearly': return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
      default: return false;
    }
  }
  const tasksOn = ds => state.tasks.filter(t => occursOn(t, ds)).sort((x, y) => ORDER.indexOf(x.cat) - ORDER.indexOf(y.cat) || toMin(x.time) - toMin(y.time));
  const fixedOccurs = (f, ds) => ds >= f.start && (f.days || ALL_DAYS).includes(parseYmd(ds).getDay());
  const fixedOn = ds => state.fixed.filter(f => fixedOccurs(f, ds)).sort((a, b) => toMin(a.time) - toMin(b.time));
  // «Todos los días», «De lunes a viernes», «Los lunes y miércoles»…
  function daysText(days) {
    const k = (days || ALL_DAYS).slice().sort((a, b) => a - b).join();
    if (k === '0,1,2,3,4,5,6') return 'Todos los días';
    if (k === '1,2,3,4,5') return 'De lunes a viernes';
    if (k === '0,6') return 'Sábados y domingos';
    const names = WEEK.filter(w => days.includes(w.d)).map(w => w.many);
    return 'Los ' + (names.length > 1 ? names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1] : names[0]);
  }
  function daysPicker(id, days) {
    return `<div class="days-pick" id="${id}" role="group" aria-label="Días de la semana">${WEEK.map(w => `<button type="button" class="choice day-chip" data-wd="${w.d}" aria-pressed="${days.includes(w.d)}" aria-label="${w.one}">${w.s}</button>`).join('')}</div>
      <div class="mini-chips" data-days-for="${id}"><button type="button" data-p="all">Todos los días</button><button type="button" data-p="week">Lunes a viernes</button><button type="button" data-p="weekend">Fines de semana</button></div>`;
  }
  const readDays = id => $$(`#${id} [data-wd]`).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => Number(b.dataset.wd)).sort((a, b) => a - b);
  // Tocar un día lo marca o lo desmarca; los atajos eligen varios a la vez.
  document.addEventListener('click', e => {
    const chip = e.target.closest('.days-pick [data-wd]');
    if (chip) { chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true')); return; }
    const p = e.target.closest('[data-days-for] [data-p]'); if (!p) return;
    const want = { all: ALL_DAYS, week: [1, 2, 3, 4, 5], weekend: [0, 6] }[p.dataset.p];
    $$(`#${p.parentElement.dataset.daysFor} [data-wd]`).forEach(b => b.setAttribute('aria-pressed', String(want.includes(Number(b.dataset.wd)))));
  });
  const isDone = (t, ds) => !!(t.done && t.done[ds]);
  const hi = () => state.settings.name ? `, ${state.settings.name}` : '';
  const greetingAt = h => h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';

  function fmtLead(m) {
    if (m === 0) return 'a la hora';
    if (m % 10080 === 0) return plural(m / 10080, 'semana', 'semanas');
    if (m % 1440 === 0) return plural(m / 1440, 'día', 'días');
    if (m % 60 === 0) return plural(m / 60, 'hora', 'horas');
    return `${m} minutos`;
  }
  const leadChip = m => m === 0 ? 'A la hora' : `${cap(fmtLead(m))} antes`;
  function relDay(fromMs, ds) {
    const n = dayDiff(ymd(new Date(fromMs)), ds);
    if (n === 0) return 'hoy';
    if (n === 1) return 'mañana';
    if (n === 2) return 'pasado mañana';
    if (n === -1) return 'ayer';
    return 'el ' + longDate(ds);
  }

  /* ---------- Avisos en pantalla ---------- */
  function toast(title, body, cat, ms, action) {
    const box = $('#toasts');
    const icon = cat && CATS[cat] ? CATS[cat].icon : cat === 'fija' ? 'i-pin' : 'i-leaf';
    const el = document.createElement('div');
    el.className = 'toast ' + (cat || '');
    el.innerHTML = `<div class="tic"><svg><use href="#${icon}"/></svg></div><div><p class="t-title">${esc(title)}</p><p class="t-body">${esc(body)}</p>${action ? `<button type="button" class="t-act">${esc(action.label)}</button>` : ''}</div><button type="button" class="t-x" aria-label="Cerrar">×</button>`;
    el.querySelector('.t-x').addEventListener('click', () => el.remove());
    if (action) el.querySelector('.t-act').addEventListener('click', () => { el.remove(); action.fn(); });
    box.append(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => el.remove(), ms || 6000);
  }

  function burst(x, y) {
    if (REDUCE) return;
    const cols = ['var(--sprout)', 'var(--hib)', 'var(--mango)', 'var(--lagoon)'];
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('span'), a = Math.random() * 6.283, d = 28 + Math.random() * 44;
      p.className = 'petal';
      p.style.cssText = `left:${x}px;top:${y}px;background:${cols[i % 4]};--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d - 18).toFixed(1)}px;--r:${Math.round(Math.random() * 360)}deg`;
      document.body.append(p);
      setTimeout(() => p.remove(), 950);
    }
  }

  /* ---------- Hojas ---------- */
  const openSheets = [];
  function openSheet(id) {
    const el = $('#' + id); el.hidden = false;
    if (!openSheets.includes(id)) openSheets.push(id);
  }
  function closeSheet(id) {
    $('#' + id).hidden = true;
    const i = openSheets.indexOf(id); if (i >= 0) openSheets.splice(i, 1);
  }
  $$('.sheet').forEach(sh => sh.addEventListener('click', e => {
    if (e.target === sh || e.target.closest('[data-close]')) closeSheet(sh.id);
  }));

  function openReader({ eyebrow, title, text, mono, onEdit }) {
    $('#r-eyebrow').textContent = eyebrow || '';
    $('#r-head').textContent = title || '';
    const t = $('#r-text'); t.textContent = text || ''; t.classList.toggle('mono', !!mono);
    const ed = $('#r-edit'); ed.hidden = !onEdit; ed.onclick = onEdit ? () => { closeSheet('reader-sheet'); onEdit(); } : null;
    openSheet('reader-sheet');
  }

  let confirmFn = null;
  function confirmSheet(title, body, okLabel, fn) {
    $('#c-head').textContent = title; $('#c-body').textContent = body; $('#c-ok').textContent = okLabel;
    confirmFn = fn; openSheet('confirm-sheet');
  }
  $('#c-ok').addEventListener('click', () => { closeSheet('confirm-sheet'); if (confirmFn) confirmFn(); confirmFn = null; });

  /* ---------- Render: comunes ---------- */
  function renderNames() {
    const n = state.settings.name;
    $$('.name-slot').forEach(el => { el.textContent = n ? (el.dataset.prefix || '') + n : (el.dataset.fallback ?? ''); });
    $('#greet').textContent = greetingAt(new Date().getHours());
  }

  function taskLi(t, ds, fixed) {
    const done = isDone(t, ds);
    const meta = fixed
      ? `<span class="chip fija"><svg><use href="#i-pin"/></svg>Fija</span><span>${esc(t.time)}</span>${t.daily ? '<span>Aviso diario</span>' : ''}`
      : `<span class="chip ${t.cat}"><svg><use href="#${CATS[t.cat].icon}"/></svg>${CATS[t.cat].label}</span><span>${esc(t.time)}</span>` +
        (t.repeat !== 'none' ? `<span>${REPEAT[t.repeat]}</span>` : '') +
        (t.key ? '<span class="chip key"><svg><use href="#i-spark"/></svg>Fecha clave</span>' : '');
    return `<li class="task ${fixed ? 'fija' : t.cat}${done ? ' done' : ''}" data-id="${esc(t.id)}" data-fixed="${fixed ? 1 : 0}" data-ds="${ds}">
      <input type="checkbox" class="check" ${done ? 'checked' : ''} aria-label="Marcar «${esc(t.title)}» como hecha">
      <div>
        <button type="button" class="task-title" data-edit>${esc(t.title)}</button>
        <div class="task-meta">${meta}</div>
        ${!fixed && t.note ? `<p class="task-note">${esc(t.note)}</p><button type="button" class="more" data-read hidden>Leer nota completa</button>` : ''}
      </div>
      ${fixed ? '' : '<button type="button" class="del" data-del>Borrar</button>'}
    </li>`;
  }

  function listHTML(ds) {
    const fx = fixedOn(ds), ts = tasksOn(ds);
    if (!fx.length && !ts.length) return `<div class="empty"><b>Día libre</b>Disfrútalo, o agrega algo con «+ Tarea».</div>`;
    let h = '';
    if (ts.length) h += `<p class="section-label">Tareas</p><ul class="list">${ts.map(t => taskLi(t, ds, false)).join('')}</ul>`;
    if (fx.length) h += `<p class="section-label">Fijas</p><ul class="list">${fx.map(f => taskLi(f, ds, true)).join('')}</ul>`;
    return h;
  }

  function noteHTML(ds, compact) {
    const n = state.notes[ds];
    if (!n) return compact ? '' : `<button type="button" class="btn btn-quiet btn-sm" data-note-edit="${ds}"><svg><use href="#i-note"/></svg>Agregar nota a este día</button>`;
    return `<div class="note-card"><span class="badge"><svg><use href="#i-note"/></svg>Nota del día</span><p class="note-text">${esc(n)}</p>
      <div class="row"><button type="button" class="more" data-note-read="${ds}" hidden>Leer nota completa</button><button type="button" class="more" data-note-edit="${ds}">Editar nota</button></div></div>`;
  }

  function markOverflow(root) {
    $$('.task-note', root).forEach(p => { const b = p.nextElementSibling; if (b && b.matches('[data-read]')) b.hidden = !(p.scrollHeight > p.clientHeight + 2); });
    $$('.note-text', root).forEach(p => { const b = p.parentElement.querySelector('[data-note-read]'); if (b) b.hidden = !(p.scrollHeight > p.clientHeight + 2); });
  }

  /* ---------- Render: Hoy ---------- */
  function renderHoy() {
    const ds = todayS();
    const pend = tasksOn(ds).filter(t => !isDone(t, ds));
    const fxPend = fixedOn(ds).filter(f => !isDone(f, ds));
    const nU = pend.filter(t => t.cat === 'urgente').length;
    $('#today-lead').innerHTML = !pend.length && !fxPend.length
      ? 'No tienes nada pendiente para hoy. <b>Día libre</b> para lo que quieras.'
      : `Para hoy tienes <b>${plural(pend.length, 'tarea', 'tareas')}</b>${fxPend.length ? ` y <b>${plural(fxPend.length, 'fija', 'fijas')}</b>` : ''}.` +
        (nU ? ` Empieza por ${nU === 1 ? 'la urgente' : 'las urgentes'}.` : ' Un paso a la vez.');
    const key = state.tasks.filter(t => t.key).map(t => ({ t, d: nextOccurrence(t, ds) })).filter(x => x.d).sort((a, b) => a.d < b.d ? -1 : 1)[0];
    const ann = $('#announce');
    if (key) {
      const n = dayDiff(ds, key.d);
      ann.innerHTML = `<span class="a-txt">${n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : `En ${n} días`}: <b>${esc(key.t.title)}</b></span><svg><use href="#i-chev"/></svg>`;
      ann.dataset.ds = key.d;
    } else {
      ann.innerHTML = `<span class="a-txt">Escribe notas en los días de tu <b>calendario</b></span><svg><use href="#i-chev"/></svg>`;
      ann.dataset.ds = ds;
    }
    renderMocks();
    $('#today-list').innerHTML = listHTML(ds);
    $('#today-note').innerHTML = noteHTML(ds, true);

    const items = [];
    for (let i = 1; i <= 30 && items.length < 6; i++) {
      const d = ymd(addDays(new Date(), i));
      tasksOn(d).forEach(t => { if (!isDone(t, d) && items.length < 6) items.push({ t, d, i }); });
    }
    $('#upcoming').innerHTML = items.length ? items.map(({ t, d, i }) => `<li><span class="when">${i === 1 ? 'Mañana' : `En ${i} días`}</span>
      <span class="what">${esc(t.title)}<small>${esc(cap(longDate(d)))} · ${esc(t.time)}</small></span><svg class="ic c-${t.cat}" style="width:16px;height:16px;margin-left:auto"><use href="#${CATS[t.cat].icon}"/></svg></li>`).join('')
      : `<li class="muted" style="border-style:dashed">Nada anotado para los próximos días. Buen momento para lo importante.</li>`;
    renderGarden();
  }

  function whenShort(ms) {
    const d = new Date(ms), n = dayDiff(todayS(), ymd(d)), hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${n === 0 ? 'hoy' : n === 1 ? 'mañana' : d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' })}, ${hm}`;
  }
  function renderMocks() {
    const next = buildSchedule(Date.now()).slice(0, 2);
    const card = (x, cls) => `<div class="mock ${cls}"><div class="m-head"><img class="m-logo" src="img/logo-96.png" alt="">Agendita · ${esc(whenShort(x.at))}</div>
      <p class="m-title">${esc(x.title)}</p><p class="m-body">${esc(x.body)}</p></div>`;
    const box = $('#mock-stack');
    box.classList.toggle('single', next.length < 2);
    box.innerHTML = !next.length
      ? `<div class="mock front"><div class="m-head"><img class="m-logo" src="img/logo-96.png" alt="">Agendita</div><p class="m-title">Sin avisos por ahora</p><p class="m-body">Anota una tarea y aquí verás cuándo te la voy a recordar.</p></div>`
      : (next[1] ? card(next[1], 'back') : '') + card(next[0], 'front');
  }

  function plantSVG(n) {
    const k = Math.min(n, 14), stemTop = 150 - (16 + k * 7), leaves = Math.min(k, 12);
    let h = '';
    for (let i = 0; i < leaves; i++) {
      const y = 146 - (i + 1) * ((150 - stemTop) / (leaves + 1)), left = i % 2 === 0, x = left ? 76 : 104;
      h += `<ellipse cx="${x}" cy="${y.toFixed(1)}" rx="15" ry="7" fill="var(--sprout)" opacity="${(0.55 + i * 0.035).toFixed(2)}" transform="rotate(${left ? 28 : -28} ${x} ${y.toFixed(1)})"/>`;
    }
    const flower = n >= 9 ? `<use href="#i-hib" x="78" y="${stemTop - 14}" width="24" height="24" style="color:var(--hib)"/>` : '';
    const stem = n === 0 ? `<ellipse cx="90" cy="139" rx="7" ry="5" fill="var(--mango)"/><path d="M90 134q-1-7 5-10" stroke="var(--sprout)" stroke-width="2.5" fill="none" stroke-linecap="round"/>` : `<path d="M90 150 Q${n % 2 ? 94 : 86} ${(150 + stemTop) / 2} 90 ${stemTop}" stroke="var(--verdant)" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    return `<svg class="plant" viewBox="0 0 180 200" role="img" aria-label="Plantita de la semana"><ellipse cx="90" cy="190" rx="60" ry="6" fill="rgba(0,0,0,.35)"/>${stem}${h}${flower}<path d="M52 150h76l-10 40H62z" fill="var(--moss)" stroke="var(--lichen)" stroke-width="1.5" stroke-linejoin="round"/><rect x="48" y="144" width="84" height="12" rx="6" fill="var(--forest-2)" stroke="var(--lichen)" stroke-width="1.5"/></svg>`;
  }
  function renderGarden() {
    const days = [...Array(7)].map((_, i) => ymd(addDays(new Date(), i - 6)));
    let total = 0; const on = {};
    [...state.tasks, ...state.fixed].forEach(t => days.forEach(ds => { if (isDone(t, ds)) { total++; on[ds] = 1; } }));
    const stage = total === 0 ? 'Semillita' : total <= 3 ? 'Brote' : total <= 8 ? 'Plantita' : total <= 14 ? 'Hibisco en flor' : 'Palmera';
    $('#garden').innerHTML = `<p class="eyebrow">Tu plantita de la semana</p>${plantSVG(total)}<p class="stage">${stage}</p>
      <p class="muted">${total ? `${plural(total, 'tarea hecha', 'tareas hechas')} en los últimos 7 días.` : 'Marca tu primera tarea y verás cómo brota.'}</p>
      <div class="week" aria-label="Días con tareas hechas">${days.map(ds => `<span class="${on[ds] ? 'on' : ''}">${parseYmd(ds).toLocaleDateString('es', { weekday: 'narrow' })}</span>`).join('')}</div>`;
  }

  /* ---------- Render: Calendario ---------- */
  function renderCal() {
    const m = view.month;
    $('#month-label').textContent = cap(m.toLocaleDateString('es', { month: 'long', year: 'numeric' }));
    const offset = (m.getDay() + 6) % 7, dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const cells = Math.ceil((offset + dim) / 7) * 7, start = addDays(m, -offset), today = todayS();
    let h = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="cal-dow" aria-hidden="true">${d}</div>`).join('');
    for (let i = 0; i < cells; i++) {
      const d = addDays(start, i), ds = ymd(d), list = tasksOn(ds);
      const cats = ORDER.filter(k => list.some(t => t.cat === k));
      const hasFixed = state.fixed.some(f => fixedOccurs(f, ds)), hasKey = list.some(t => t.key), note = state.notes[ds];
      const label = `${longDate(ds)}, ${list.length ? plural(list.length, 'tarea', 'tareas') : 'sin tareas'}${note ? ', tiene nota' : ''}`;
      h += `<div class="cell${d.getMonth() !== m.getMonth() ? ' out' : ''}${ds === today ? ' today' : ''}${ds === view.sel ? ' sel' : ''}">
        <button type="button" class="day" data-date="${ds}" aria-label="${esc(label)}" aria-pressed="${ds === view.sel}">
          ${hasKey ? '<svg class="star" aria-hidden="true"><use href="#i-spark"/></svg>' : ''}
          <span class="num">${d.getDate()}</span>
          <span class="dots">${cats.map(k => `<i class="dot ${k}"></i>`).join('')}</span>
          ${hasFixed ? '<svg class="pin" aria-hidden="true"><use href="#i-pin"/></svg>' : ''}
          ${note ? `<span class="snip">${esc(note.split('\n')[0])}</span>` : ''}
        </button>
        ${note ? `<button type="button" class="note-dot" data-note-read="${ds}" aria-label="Leer la nota del ${esc(longDate(ds))}"><svg><use href="#i-note"/></svg></button>` : ''}
      </div>`;
    }
    $('#cal-grid').innerHTML = h;
  }

  function renderDay() {
    const ds = view.sel, n = dayDiff(todayS(), ds);
    const rel = n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : n === -1 ? 'Ayer' : '';
    $('#day-label').innerHTML = `${esc(cap(longDate(ds)))}${rel ? `<span class="badge">${rel}</span>` : ''}`;
    $('#day-note').innerHTML = noteHTML(ds, false);
    $('#day-list').innerHTML = listHTML(ds);
  }

  function nextOccurrence(t, fromDs) {
    const base = parseYmd(fromDs);
    for (let i = 0; i <= 400; i++) { const ds = ymd(addDays(base, i)); if (occursOn(t, ds)) return ds; }
    return null;
  }
  function renderKeys() {
    const today = todayS();
    const items = state.tasks.filter(t => t.key).map(t => ({ t, ds: nextOccurrence(t, today) })).filter(x => x.ds)
      .sort((a, b) => a.ds < b.ds ? -1 : 1).slice(0, 6);
    $('#key-list').innerHTML = items.length ? items.map(({ t, ds }) => {
      const n = dayDiff(today, ds);
      return `<li><svg class="ic c-${t.cat}" style="width:16px;height:16px"><use href="#i-spark"/></svg><span class="when">${n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : `En ${n} días`}</span>
        <span class="what">${esc(t.title)}<small>${esc(parseYmd(ds).toLocaleDateString('es', { day: 'numeric', month: 'long' }))} · ${REPEAT[t.repeat]}</small></span></li>`;
    }).join('') : `<li class="muted" style="border-style:dashed">Sin fechas clave. Al crear una tarea, activa «Es una fecha clave».</li>`;
  }

  /* ---------- Render: Fijas ---------- */
  function renderFijas() {
    $('#fixed-ask').hidden = state.settings.fixedAsked || state.fixed.length > 0;
    const list = [...state.fixed].sort((a, b) => toMin(a.time) - toMin(b.time));
    $('#fixed-list').innerHTML = list.length ? `<ul class="list">${list.map(f => `<li class="task fija" data-fid="${esc(f.id)}">
        <svg class="ic c-fija" style="margin-top:3px"><use href="#i-pin"/></svg>
        <div>
          <button type="button" class="task-title" data-fedit>${esc(f.title)}</button>
          <div class="task-meta"><span>${esc(daysText(f.days))} a las ${esc(f.time)}</span></div>
          <label class="switch small" style="margin-top:10px"><span>Avisarme esos días</span><input type="checkbox" data-fdaily ${f.daily ? 'checked' : ''}></label>
        </div>
        <button type="button" class="del" data-fdel>Eliminar</button>
      </li>`).join('')}</ul>`
      : `<div class="empty"><b>Sin tareas fijas</b>Cuando quieras, agrega lo que haces sí o sí y elige los días de la semana en que te toca.</div>`;
    $('#fixed-clear').hidden = !list.length;
  }

  /* ---------- Render: Avisos ---------- */
  function renderLeads() {
    $('#lead-cats').innerHTML = ORDER.map(k => {
      const offs = state.settings.cats[k].offsets;
      const all = [...new Set([...LEAD_PRESETS, ...offs])].sort((a, b) => b - a);
      return `<div class="field" style="gap:8px;margin-top:6px">
        <span class="chip ${k}" style="align-self:flex-start"><svg><use href="#${CATS[k].icon}"/></svg>${CATS[k].label}</span>
        <div class="choices">${all.map(o => `<button type="button" class="choice" data-lead-cat="${k}" data-lead="${o}" aria-pressed="${offs.includes(o)}">${leadChip(o)}</button>`).join('')}</div>
        <div class="row">
          <input class="input" type="number" min="1" max="90" value="5" inputmode="numeric" id="lc-n-${k}" aria-label="Cantidad para ${CATS[k].label}" style="width:80px;flex:none">
          <select class="input" id="lc-u-${k}" aria-label="Unidad para ${CATS[k].label}" style="width:auto;flex:1 1 120px"><option value="60">horas antes</option><option value="1440" selected>días antes</option><option value="10080">semanas antes</option></select>
          <button type="button" class="btn btn-quiet btn-sm" data-lead-add="${k}">Agregar</button>
        </div>
      </div>`;
    }).join('');
  }
  function hoursGrid(h) {
    return `<button type="button" class="choice wide" data-hours="0" aria-pressed="${h === 0}">No insistir</button>` +
      Array.from({ length: 24 }, (_, i) => i + 1).map(n => `<button type="button" class="choice" data-hours="${n}" aria-pressed="${h === n}" aria-label="${plural(n, 'hora', 'horas')} después">${n} h</button>`).join('');
  }
  function renderAfter() {
    const A = state.settings.after;
    $('#after-hours').innerHTML = hoursGrid(A.hours);
    $('#after-repeat').checked = A.repeat; $('#after-repeat').disabled = A.hours === 0;
    $('#after-skip-fixed').checked = A.skipFixed;
  }
  function renderAvisos() {
    renderLeads(); renderAfter();
    const S = state.settings;
    $('#brief-on').checked = S.brief.on; $('#brief-time').value = S.brief.time; $('#brief-time').disabled = !S.brief.on;
    $('#quiet-from').value = S.quiet.from; $('#quiet-to').value = S.quiet.to;
    renderPend();
    renderSyncInfo();
  }
  function renderPend() {
    const P = state.settings.pend;
    $('#pend-on').checked = P.on; $('#pend-afternoon').value = P.afternoon; $('#pend-evening').value = P.evening;
    $('#pend-afternoon').disabled = $('#pend-evening').disabled = !P.on;
  }
  function renderSyncInfo() {
    const s = state.sync, el = $('#sync-info');
    if (!s) { el.textContent = ''; return; }
    if (!s.count) { el.textContent = s.native ? 'No hay avisos programados por ahora.' : ''; return; }
    el.textContent = `${plural(s.count, 'aviso programado', 'avisos programados')}, hasta el ${new Date(s.until).toLocaleDateString('es', { day: 'numeric', month: 'long' })}. Se actualizan solos cada vez que abres la app.`;
  }

  /* ---------- Permisos ---------- */
  let permState = { disp: 'prompt', exact: null };
  async function refreshPerm() {
    let disp = 'prompt', exact = null;
    if (AG) {
      try { const r = await AG.checkNotif(); disp = r.display; exact = r.exact ? 'granted' : 'denied'; } catch (e) {}
    } else if ('Notification' in window) disp = Notification.permission === 'default' ? 'prompt' : Notification.permission;
    else disp = 'unsupported';
    permState = { disp, exact };
    $('#perm-banner').hidden = disp === 'granted' || disp === 'unsupported';
    const st = $('#perm-status'), act = $('#perm-actions');
    if (disp === 'granted') st.textContent = NATIVE ? 'Los avisos están activados. Te llegan aunque la app esté cerrada.' : 'Los avisos están activados mientras esta página esté abierta.';
    else if (disp === 'denied') st.textContent = 'Los avisos están bloqueados. Actívalos en los ajustes del teléfono: Ajustes › Aplicaciones › Agendita › Notificaciones.';
    else if (disp === 'unsupported') st.textContent = 'Aquí los avisos aparecen dentro de la app.';
    else st.textContent = 'Todavía no activas los avisos. Sin ellos no puedo recordarte tus tareas.';
    let h = '';
    if (disp !== 'granted' && disp !== 'unsupported') h += `<button class="btn btn-sprout btn-sm" type="button" data-action="perm">Activar avisos</button>`;
    if (exact === 'denied') h += `<button class="btn btn-quiet btn-sm" type="button" data-action="exact">Permitir avisos a la hora exacta</button>`;
    act.innerHTML = h;
    if (exact === 'denied') st.textContent += ' Para que lleguen a la hora justa, permite «Alarmas y recordatorios».';
  }
  async function requestPerm(silent) {
    if (AG) { try { await AG.requestNotif(); } catch (e) {} }
    else if ('Notification' in window) { try { const r = Notification.requestPermission(); if (r && r.then) await r; } catch (e) {} }
    await refreshPerm();
    scheduleSync(true);
    if (silent) return;
    if (permState.disp === 'granted') toast('Avisos activados', `Listo${hi()}. Te recordaré tus tareas a tiempo.`, null, 4500);
    else toast('Avisos sin activar', 'Puedes activarlos cuando quieras desde la pestaña «Avisos».', null, 5500);
  }

  /* ---------- Programación de avisos ---------- */
  function inQuietAt(ms) {
    const q = state.settings.quiet, a = toMin(q.from), b = toMin(q.to);
    if (a === b) return false;
    const d = new Date(ms), m = d.getHours() * 60 + d.getMinutes();
    return a < b ? (m >= a && m < b) : (m >= a || m < b);
  }
  function quietEnd(ms) {
    const [h, mi] = state.settings.quiet.to.split(':').map(Number), d = new Date(ms);
    const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi);
    if (+e <= ms) e.setDate(e.getDate() + 1);
    return +e;
  }
  function briefText(ds) {
    const c = { urgente: 0, importante: 0, leve: 0 };
    tasksOn(ds).filter(t => !isDone(t, ds)).forEach(t => c[t.cat]++);
    const f = fixedOn(ds).filter(x => !isDone(x, ds)).length;
    if (!c.urgente && !c.importante && !c.leve && !f) return 'Hoy no tienes tareas anotadas. Día tranquilo para lo que quieras.';
    return `Hoy tienes ${plural(c.urgente, 'urgente', 'urgentes')}, ${plural(c.importante, 'importante', 'importantes')}, ${plural(c.leve, 'leve', 'leves')} y ${plural(f, 'fija', 'fijas')}.` +
      (c.urgente ? ' Empieza por el hibisco.' : ' Un paso a la vez.');
  }
  const NOW_PHRASE = { urgente: 'Un paso a la vez, tú puedes.', importante: 'Buen momento para dedicarle tu atención.', leve: 'Cuando tengas un ratito, sin prisa.' };

  function buildSchedule(nowMs) {
    const S = state.settings, out = [], end = nowMs + HORIZON_DAYS * 864e5, today = new Date(nowMs), seen = new Set();
    const push = o => {
      if (o.at <= nowMs || o.at > end) return;
      const k = `${o.tid}|${o.at}`; if (seen.has(k)) return; seen.add(k); out.push(o);
    };
    const pushAfter = (t, ds, evt, fixed) => {
      const A = S.after; if (!A.hours) return;
      const n = A.repeat ? Math.max(1, Math.floor(24 / A.hours)) : 1;
      for (let k = 1; k <= n; k++) {
        let when = evt + k * A.hours * 3600e3;
        if (!fixed && t.cat !== 'urgente' && inQuietAt(when)) when = quietEnd(when);
        push({ tid: t.id, src: fixed ? 'fixed' : 'task', at: when, ds, kind: 'after', ch: 'insistir', title: `🔁 ¿Ya hiciste «${t.title}»?`,
          body: `Era ${relDay(when, ds)} a las ${t.time}. Si ya la hiciste, márcala en la app y dejo de recordártela.` });
      }
    };
    if (S.brief.on) for (let d = 0; d <= HORIZON_DAYS; d++) {
      const ds = ymd(addDays(today, d)), when = +at(ds, S.brief.time);
      push({ tid: 'brief', at: when, ds, kind: 'brief', ch: 'resumen', title: `☀️ ${greetingAt(toMin(S.brief.time) / 60)}${hi()}`, body: briefText(ds) });
    }
    const maxLead = Math.max(0, ...ORDER.flatMap(k => S.cats[k].offsets), ...state.tasks.map(t => t.lead || 0));
    const daysAhead = HORIZON_DAYS + Math.ceil(maxLead / 1440) + 1;
    for (let d = -1; d <= daysAhead; d++) {
      const ds = ymd(addDays(today, d));
      for (const t of state.tasks) {
        if (!occursOn(t, ds) || isDone(t, ds)) continue;
        const evt = +at(ds, t.time);
        const offs = t.lead != null ? [...new Set([t.lead, 0])] : S.cats[t.cat].offsets;
        for (const o of offs) {
          let when = evt - o * 60000;
          if (t.cat !== 'urgente' && inQuietAt(when)) { when = quietEnd(when); if (when > evt) continue; }
          const e = CATS[t.cat].emoji;
          const title = t.key ? (o ? `🌴 Fecha clave en ${fmtLead(o)}` : `🌴 Hoy: ${t.title}`) : (o ? `${e} ${CATS[t.cat].label} · faltan ${fmtLead(o)}` : `${e} Es hora: ${t.title}`);
          const body = (o ? `«${t.title}» es ${relDay(when, ds)} a las ${t.time}.` : NOW_PHRASE[t.cat]) + (t.note ? ` Nota: ${t.note.slice(0, 140)}` : '');
          push({ tid: t.id, src: 'task', at: when, ds, kind: o ? 'lead' : 'now', ch: t.cat, title, body });
        }
        pushAfter(t, ds, evt, false);
      }
      for (const f of state.fixed) {
        if (!fixedOccurs(f, ds) || isDone(f, ds) || !f.daily) continue;
        const evt = +at(ds, f.time);
        push({ tid: f.id, src: 'fixed', at: evt, ds, kind: 'fixed', ch: 'fijas', title: `📌 Tarea fija: ${f.title}`, body: `Hoy a las ${f.time}. Es de las que sí o sí. ¡Tú puedes${hi()}!` });
        if (!S.after.skipFixed) pushAfter(f, ds, evt, true);
      }
    }
    out.sort((a, b) => a.at - b.at);
    return out.slice(0, MAX_NOTIFS);
  }

  let syncTimer = null, syncChain = Promise.resolve(), webQueue = [], webLast = Date.now();
  function scheduleSync(now) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncChain = syncChain.then(doSync).catch(() => {}); }, now ? 0 : 700);
  }
  async function doSync() {
    const list = buildSchedule(Date.now());
    if (!AG) {
      webQueue = list;
      state.sync = { count: list.length, until: list.length ? list[list.length - 1].at : null, at: Date.now(), native: false };
      persist(); renderSyncInfo(); return;
    }
    let count = 0;
    try {
      const items = list.map((x, i) => ({ id: i + 1, at: x.at, kind: x.kind, ch: x.ch, src: x.src || 'task', tid: x.kind === 'brief' ? '' : x.tid, ds: x.ds, title: x.title, body: x.body }));
      count = (await AG.setSchedule({ items: JSON.stringify(items) })).count || 0;
    } catch (e) { count = 0; }
    state.sync = { count, until: list.length ? list[list.length - 1].at : null, at: Date.now(), native: true };
    persist(); renderSyncInfo();
  }
  function webTick() {
    if (AG) return;
    const now = Date.now();
    webQueue.filter(x => x.at > webLast && x.at <= now).forEach(x => {
      const cat = CATS[x.ch] ? x.ch : x.ch === 'fijas' ? 'fija' : null;
      toast(x.title, x.body, cat, 12000);
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification(x.title, { body: x.body }); } catch (e) {}
    });
    webLast = now;
  }

  async function testNotif() {
    if (AG) {
      if (permState.disp !== 'granted') { await requestPerm(true); if (permState.disp !== 'granted') { toast('Avisos sin activar', 'Primero activa los avisos para poder probarlos.', null, 5000); return; } }
      try {
        await AG.testNotification({ title: '🌺 Aviso de prueba', body: `Así te llegarán tus recordatorios${hi()}. ¡Todo funciona!` });
        toast('Aviso en camino', 'Llega en 5 segundos. Puedes cerrar la app para ver cómo aparece.', null, 5000);
      } catch (e) { toast('No se pudo enviar', 'Revisa que los avisos estén permitidos en los ajustes del teléfono.', 'urgente', 6000); }
    } else {
      toast('Aviso en camino', 'Llega en 5 segundos.', null, 4000);
      setTimeout(() => toast('🌺 Aviso de prueba', `Así te llegarán tus recordatorios${hi()}.`, 'urgente', 8000), 5000);
    }
  }

  /* ---------- Formulario de tarea ---------- */
  let tEdit = null, tCat = 'importante';
  function setTCat(c) {
    tCat = c;
    $$('#t-cat [data-cat]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === c)));
    $('#t-cat-help').textContent = CATS[c].help;
  }
  function setLeadUI(lead) {
    const sel = $('#t-lead'), custom = $('#t-lead-custom');
    if (lead == null) { sel.value = 'cat'; custom.hidden = true; return; }
    if ([...sel.options].some(o => o.value === String(lead))) { sel.value = String(lead); custom.hidden = true; return; }
    sel.value = 'custom'; custom.hidden = false;
    const u = lead % 10080 === 0 ? 10080 : lead % 1440 === 0 ? 1440 : 60;
    $('#t-lead-u').value = String(u); $('#t-lead-n').value = String(Math.max(1, Math.round(lead / u)));
  }
  function openTaskForm(task, ds) {
    tEdit = task ? task.id : null;
    $('#t-head').textContent = task ? 'Editar tarea' : 'Nueva tarea';
    $('#t-title').value = task ? task.title : '';
    $('#t-date').value = task ? task.date : (ds || view.sel);
    $('#t-time').value = task ? task.time : '09:00';
    $('#t-repeat').value = task ? (task.repeat === 'daily' ? 'none' : task.repeat) : 'none';
    $('#t-key').checked = task ? task.key : false;
    $('#t-note').value = task ? task.note : '';
    $('#t-error').textContent = '';
    setTCat(task ? task.cat : 'importante');
    setLeadUI(task ? task.lead : null);
    openSheet('task-sheet');
  }
  $('#t-cat').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) setTCat(b.dataset.cat); });
  $('#t-lead').addEventListener('change', e => { $('#t-lead-custom').hidden = e.target.value !== 'custom'; });
  $$('#task-form [data-pick]').forEach(box => box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (box.dataset.pick === 'date') $('#t-date').value = ymd(addDays(new Date(), Number(b.dataset.v)));
    else $('#t-time').value = b.dataset.v;
  }));
  $('#task-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#t-title').value.trim(), date = $('#t-date').value, time = $('#t-time').value || '09:00';
    const err = $('#t-error');
    if (!title) { err.textContent = 'Escribe qué tienes que hacer.'; $('#t-title').focus(); return; }
    if (!isYmd(date)) { err.textContent = 'Elige el día de la tarea.'; $('#t-date').focus(); return; }
    let lead = null; const lv = $('#t-lead').value;
    if (lv === 'custom') {
      const n = Number($('#t-lead-n').value);
      if (!Number.isInteger(n) || n < 1 || n > 90) { err.textContent = 'La anticipación debe ser un número entre 1 y 90.'; $('#t-lead-n').focus(); return; }
      lead = n * Number($('#t-lead-u').value);
    } else if (lv !== 'cat') lead = Number(lv);
    const data = { title, date, time, cat: tCat, repeat: $('#t-repeat').value, key: $('#t-key').checked, note: $('#t-note').value.trim(), lead };
    if (tEdit) { const t = state.tasks.find(x => x.id === tEdit); if (t) Object.assign(t, data); }
    else state.tasks.push({ id: uid(), done: {}, ...data });
    save(); closeSheet('task-sheet');
    view.sel = date; const d = parseYmd(date); view.month = new Date(d.getFullYear(), d.getMonth(), 1);
    renderAll();
    toast(tEdit ? 'Tarea actualizada' : 'Tarea guardada', `«${title}» quedó para ${relDay(Date.now(), date)} a las ${time}.`, data.cat, 4500);
  });

  /* ---------- Formulario de tarea fija ---------- */
  let fEdit = null, fDaily = true;
  function setFDaily(v) { fDaily = v; $$('#f-daily [data-v]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === '1') === v))); }
  function openFixedForm(f) {
    fEdit = f ? f.id : null;
    $('#f-head').textContent = f ? 'Editar tarea fija' : 'Nueva tarea fija';
    $('#f-title').value = f ? f.title : '';
    $('#f-time').value = f ? f.time : '08:00';
    $('#f-error').textContent = '';
    setFDaily(f ? f.daily : true);
    $('#f-days-box').innerHTML = daysPicker('f-days', f ? f.days : []);
    openSheet('fixed-sheet');
  }
  $('#f-daily').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) setFDaily(b.dataset.v === '1'); });
  $('#fixed-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#f-title').value.trim(), time = $('#f-time').value || '08:00';
    if (!title) { $('#f-error').textContent = 'Escribe qué tienes que hacer sí o sí.'; $('#f-title').focus(); return; }
    const days = readDays('f-days');
    if (!days.length) { $('#f-error').textContent = 'Elige al menos un día de la semana.'; return; }
    if (fEdit) { const f = state.fixed.find(x => x.id === fEdit); if (f) Object.assign(f, { title, time, daily: fDaily, days }); }
    else state.fixed.push({ id: uid(), title, time, daily: fDaily, days, start: todayS(), done: {} });
    state.settings.fixedAsked = true;
    save(); closeSheet('fixed-sheet'); renderAll();
    toast(fEdit ? 'Tarea fija actualizada' : 'Tarea fija agregada', fDaily ? `${daysText(days)} a las ${time}. Te aviso esos días.` : `${daysText(days)} en tu calendario, sin aviso.`, 'fija', 4500);
  });

  /* ---------- Notas del día ---------- */
  let noteDs = null;
  function openNoteForm(ds) {
    noteDs = ds;
    $('#n-date').textContent = cap(longDate(ds));
    $('#n-text').value = state.notes[ds] || '';
    $('#n-delete').hidden = !state.notes[ds];
    openSheet('note-sheet');
  }
  function readNote(ds) {
    openReader({ eyebrow: 'Nota del día', title: cap(longDate(ds)), text: state.notes[ds] || '', onEdit: () => openNoteForm(ds) });
  }
  $('#note-form').addEventListener('submit', e => {
    e.preventDefault();
    const txt = $('#n-text').value.trim();
    if (txt) state.notes[noteDs] = txt; else delete state.notes[noteDs];
    save(); closeSheet('note-sheet'); renderAll();
    toast(txt ? 'Nota guardada' : 'Nota borrada', txt ? `Quedó en el ${longDate(noteDs)}.` : 'Ese día ya no tiene nota.', null, 3500);
  });
  $('#n-delete').addEventListener('click', () => {
    const old = state.notes[noteDs], ds = noteDs;
    delete state.notes[ds]; save(); closeSheet('note-sheet'); renderAll();
    toast('Nota borrada', `Se borró la nota del ${longDate(ds)}.`, null, 7000, { label: 'Deshacer', fn: () => { state.notes[ds] = old; save(); renderAll(); } });
  });

  /* ---------- Anotar rápido ---------- */
  const qHint = $('#q-hint'), Q_HINT = qHint.textContent;
  let hintTimer;
  function hint(msg) {
    qHint.textContent = msg; qHint.classList.add('nudge');
    clearTimeout(hintTimer); hintTimer = setTimeout(() => { qHint.textContent = Q_HINT; qHint.classList.remove('nudge'); }, 3500);
  }
  $('#quick-day').addEventListener('click', e => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    view.quickDay = Number(b.dataset.d);
    $$('#quick-day [data-d]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
  function quickAdd(cat) {
    const inp = $('#q-title'), title = inp.value.trim();
    if (!title) { hint('Primero escribe qué tienes que hacer.'); inp.focus(); return; }
    const ds = ymd(addDays(new Date(), view.quickDay));
    const time = view.quickDay === 0 ? pad(Math.min(new Date().getHours() + 1, 23)) + ':00' : '09:00';
    state.tasks.push({ id: uid(), title, date: ds, time, cat, repeat: 'none', key: false, note: '', lead: null, done: {} });
    save(); inp.value = ''; renderAll();
    toast('¡Anotada!', `«${title}» quedó para ${view.quickDay ? 'mañana' : 'hoy'} a las ${time}. Toca su nombre si quieres cambiar algo.`, cat, 5500);
  }
  $('#quick-card').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) quickAdd(b.dataset.q); });
  $('#q-title').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.target.value.trim()) return;
    hint('Ahora toca su categoría: urgente, importante o leve.');
    const q = $('#quick-card'); q.classList.remove('pulse'); void q.offsetWidth; q.classList.add('pulse');
  });

  /* ---------- Interacciones generales ---------- */
  const CHEERS = ['Una flor más para tu plantita.', 'Pasito a pasito. Bien hecho.', 'Eso ya no te pesa. A respirar.', 'Lo lograste. Date un momento para notarlo.'];
  const DONE_MSGS = [
    '¡Bien hecho{n}! Completaste todo lo de hoy 🌺', '¡Lo lograste{n}! Hoy no quedó nada pendiente. A descansar 🌴',
    'Día completo{n}. Cada tarea hecha es una flor nueva 🌸', '¡Qué orgullo{n}! Terminaste todas tus tareas de hoy ✨',
    'Todo listo por hoy{n}. Te ganaste un rato para ti 🥭', '¡Misión cumplida{n}! Hoy fuiste imparable 🌿',
    '¡Hoy brillaste{n}! No quedó ninguna tarea pendiente 🌞', 'Tareas completas{n}. Paso a paso se construyen grandes cosas 🌱',
    '¡Excelente{n}! Cerraste el día con todo hecho 🌊', '¡Felicitaciones{n}! Tu lista de hoy quedó en cero 🎉'
  ];
  // Bolsa mezclada: no repite un mensaje hasta haber usado todos.
  const bags = {};
  function fromBag(name, list) {
    let b = bags[name];
    if (!b || !b.length) {
      b = list.map((_, i) => i);
      for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
      if (bags[name + '_last'] === b[b.length - 1] && b.length > 1) [b[0], b[b.length - 1]] = [b[b.length - 1], b[0]];
      bags[name] = b;
    }
    const i = b.pop(); bags[name + '_last'] = i;
    return list[i];
  }
  const findItem = li => (li.dataset.fixed === '1' ? state.fixed : state.tasks).find(x => x.id === li.dataset.id);

  document.addEventListener('change', e => {
    const el = e.target;
    if (el.matches('.task .check')) {
      const li = el.closest('.task'), t = findItem(li), ds = li.dataset.ds; if (!t) return;
      t.done = t.done || {};
      if (el.checked) {
        t.done[ds] = 1;
        const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2);
        const today = todayS(), all = [...tasksOn(today), ...fixedOn(today)];
        if (ds === today && all.length && all.every(x => isDone(x, today))) toast('¡Bien hecho!', fromBag('logros', DONE_MSGS).replace('{n}', hi()), null, 6000);
        else toast('¡Hecho!', fromBag('animo', CHEERS), null, 3500);
      } else delete t.done[ds];
      save(); renderAll(); return;
    }
    if (el.matches('[data-fdaily]')) {
      const f = state.fixed.find(x => x.id === el.closest('[data-fid]').dataset.fid); if (!f) return;
      f.daily = el.checked; save();
      toast(f.daily ? 'Aviso diario activado' : 'Aviso diario apagado', f.daily ? `Te aviso de «${f.title}»: ${daysText(f.days).toLowerCase()} a las ${f.time}.` : `«${f.title}» sigue en tu calendario, sin aviso.`, 'fija', 4000);
    }
  });

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (a) {
      const act = a.dataset.action;
      if (act === 'perm') requestPerm();
      else if (act === 'exact' && AG) AG.openExactSettings().catch(() => {});
      else if (act === 'new-task') openTaskForm(null, view.tab === 'cal' ? view.sel : todayS());
      else if (act === 'new-fixed') openFixedForm(null);
      else if (act === 'tour') startTour();
      return;
    }
    const day = e.target.closest('.day[data-date]');
    if (day) {
      view.sel = day.dataset.date; const d = parseYmd(view.sel);
      if (d.getMonth() !== view.month.getMonth() || d.getFullYear() !== view.month.getFullYear()) view.month = new Date(d.getFullYear(), d.getMonth(), 1);
      renderCal(); renderDay(); markOverflow($('#day-card'));
      if (window.innerWidth < 700) $('#day-card').scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    const nr = e.target.closest('[data-note-read]'); if (nr) { readNote(nr.dataset.noteRead); return; }
    const ne = e.target.closest('[data-note-edit]'); if (ne) { openNoteForm(ne.dataset.noteEdit); return; }
    const lic = e.target.closest('[data-license]');
    if (lic) {
      fetch(lic.dataset.license).then(r => r.text()).then(t => openReader({ eyebrow: 'Licencia', title: lic.textContent, text: t, mono: true }))
        .catch(() => toast('No se pudo abrir', 'No encontré el texto de esa licencia.', null, 4000));
      return;
    }
    const li = e.target.closest('.task[data-id]');
    if (li) {
      const t = findItem(li); if (!t) return;
      const fixed = li.dataset.fixed === '1';
      if (e.target.closest('[data-edit]')) { fixed ? openFixedForm(t) : openTaskForm(t); return; }
      if (e.target.closest('[data-read]')) { openReader({ eyebrow: 'Nota de la tarea', title: t.title, text: t.note, onEdit: () => openTaskForm(t) }); return; }
      if (e.target.closest('[data-del]')) {
        const idx = state.tasks.indexOf(t); state.tasks.splice(idx, 1); save(); renderAll();
        toast('Tarea borrada', t.repeat !== 'none' ? `«${t.title}» salió del calendario, con todas sus repeticiones.` : `«${t.title}» salió del calendario.`, null, 8000,
          { label: 'Deshacer', fn: () => { state.tasks.splice(Math.min(idx, state.tasks.length), 0, t); save(); renderAll(); } });
      }
      return;
    }
    const fli = e.target.closest('[data-fid]');
    if (fli) {
      const f = state.fixed.find(x => x.id === fli.dataset.fid); if (!f) return;
      if (e.target.closest('[data-fedit]')) openFixedForm(f);
      else if (e.target.closest('[data-fdel]')) {
        const idx = state.fixed.indexOf(f); state.fixed.splice(idx, 1); save(); renderAll();
        toast('Tarea fija eliminada', `«${f.title}» ya no aparece en tu calendario.`, 'fija', 8000,
          { label: 'Deshacer', fn: () => { state.fixed.splice(Math.min(idx, state.fixed.length), 0, f); save(); renderAll(); } });
      }
    }
  });

  $$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#announce').addEventListener('click', e => {
    const ds = e.currentTarget.dataset.ds; if (!isYmd(ds)) return;
    view.sel = ds; const d = parseYmd(ds); view.month = new Date(d.getFullYear(), d.getMonth(), 1);
    showTab('cal'); renderCal(); renderDay(); markOverflow($('#day-card'));
  });
  $('#prev-m').addEventListener('click', () => { view.month = new Date(view.month.getFullYear(), view.month.getMonth() - 1, 1); renderCal(); });
  $('#next-m').addEventListener('click', () => { view.month = new Date(view.month.getFullYear(), view.month.getMonth() + 1, 1); renderCal(); });
  $('#go-today').addEventListener('click', () => { const n = new Date(); view.month = new Date(n.getFullYear(), n.getMonth(), 1); view.sel = ymd(n); renderCal(); renderDay(); markOverflow($('#day-card')); });

  $('#fixed-yes').addEventListener('click', () => { state.settings.fixedAsked = true; save(); renderFijas(); openFixedForm(null); });
  $('#fixed-no').addEventListener('click', () => {
    state.settings.fixedAsked = true; save(); renderFijas();
    toast('Está bien', 'Cuando quieras, toca «Agregar tarea fija».', 'fija', 4500);
  });
  $('#fixed-clear').addEventListener('click', () => confirmSheet('¿Eliminar todas las tareas fijas?', 'Se quitarán del calendario y dejarás de recibir sus avisos.', 'Eliminar todas', () => {
    const old = state.fixed; state.fixed = []; save(); renderAll();
    toast('Tareas fijas eliminadas', `Se eliminaron ${plural(old.length, 'tarea fija', 'tareas fijas')}.`, 'fija', 8000, { label: 'Deshacer', fn: () => { state.fixed = old; save(); renderAll(); } });
  }));

  // Avisos: anticipación
  $('#lead-cats').addEventListener('click', e => {
    const b = e.target.closest('[data-lead]');
    if (b) {
      const c = state.settings.cats[b.dataset.leadCat], v = Number(b.dataset.lead);
      c.offsets = c.offsets.includes(v) ? c.offsets.filter(x => x !== v) : [...c.offsets, v].sort((x, y) => y - x);
      save(); b.setAttribute('aria-pressed', String(c.offsets.includes(v)));
      if (!c.offsets.length) toast('Sin avisos previos', `Las tareas de tipo ${CATS[b.dataset.leadCat].label.toLowerCase()} no tendrán avisos, salvo las que tengan su propia anticipación.`, b.dataset.leadCat, 5500);
      return;
    }
    const add = e.target.closest('[data-lead-add]');
    if (add) {
      const k = add.dataset.leadAdd, n = Number($('#lc-n-' + k).value), u = Number($('#lc-u-' + k).value);
      if (!Number.isInteger(n) || n < 1 || n > 90) { toast('Revisa el número', 'Escribe una cantidad entre 1 y 90.', null, 4000); return; }
      const v = n * u, c = state.settings.cats[k];
      if (!c.offsets.includes(v)) c.offsets = [...c.offsets, v].sort((x, y) => y - x);
      save(); renderLeads();
      toast('Anticipación agregada', `${CATS[k].label}: te aviso ${fmtLead(v)} antes.`, k, 4000);
    }
  });
  // Avisos: después del evento
  $('#after-hours').addEventListener('click', e => {
    const b = e.target.closest('[data-hours]'); if (!b) return;
    state.settings.after.hours = Number(b.dataset.hours); save(); renderAfter();
  });
  $('#after-repeat').addEventListener('change', e => { state.settings.after.repeat = e.target.checked; save(); });
  $('#after-skip-fixed').addEventListener('change', e => { state.settings.after.skipFixed = e.target.checked; save(); });
  $('#brief-on').addEventListener('change', e => { state.settings.brief.on = e.target.checked; $('#brief-time').disabled = !e.target.checked; save(); });
  $('#brief-time').addEventListener('change', e => { if (validTime(e.target.value)) { state.settings.brief.time = e.target.value; save(); } });
  $('#quiet-from').addEventListener('change', e => { if (validTime(e.target.value)) { state.settings.quiet.from = e.target.value; save(); } });
  $('#quiet-to').addEventListener('change', e => { if (validTime(e.target.value)) { state.settings.quiet.to = e.target.value; save(); } });
  $('#test-notif').addEventListener('click', testNotif);
  $('#pend-on').addEventListener('change', e => { state.settings.pend.on = e.target.checked; renderPend(); save(); });
  $('#pend-afternoon').addEventListener('change', e => { if (validTime(e.target.value)) { state.settings.pend.afternoon = e.target.value; save(); } });
  $('#pend-evening').addEventListener('change', e => { if (validTime(e.target.value)) { state.settings.pend.evening = e.target.value; save(); } });

  // Más
  $('#s-name').addEventListener('input', e => { state.settings.name = e.target.value.trim().slice(0, 40); persist(); renderNames(); scheduleSync(); });
  const BACKUP_TAG = 'AGENDITA-CIFRADO-1';
  const te = new TextEncoder(), td = new TextDecoder();
  const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = str => Uint8Array.from(atob(str), ch => ch.charCodeAt(0));
  async function backupKey(pass, salt) {
    const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptBackup(text, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(BACKUP_TAG) }, await backupKey(pass, salt), te.encode(text)));
    const all = new Uint8Array(28 + ct.length); all.set(salt); all.set(iv, 16); all.set(ct, 28);
    return BACKUP_TAG + '.' + toB64(all);
  }
  async function decryptBackup(text, pass) {
    const all = fromB64(text.slice(BACKUP_TAG.length + 1));
    if (all.length < 45) throw new Error('corto');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(16, 28), additionalData: te.encode(BACKUP_TAG) }, await backupKey(pass, all.subarray(0, 16)), all.subarray(28));
    return td.decode(plain);
  }
  $('#copy-backup').addEventListener('click', async () => {
    const pass = $('#backup-pass').value;
    if (pass.length < 8) { toast('Falta la contraseña', 'Escribe una contraseña de al menos 8 caracteres para cifrar tu respaldo.', null, 6000); $('#backup-pass').focus(); return; }
    if (!window.crypto || !crypto.subtle) { toast('No se puede cifrar aquí', 'Este navegador no permite cifrar el respaldo.', 'urgente', 6000); return; }
    let text;
    try { text = await encryptBackup(JSON.stringify({ app: 'agendita', ...state, sync: null }), pass); }
    catch (e) { toast('No se pudo cifrar', 'Inténtalo de nuevo.', 'urgente', 5000); return; }
    const ta = $('#backup-text');
    const fallback = () => { ta.value = text; ta.focus(); ta.select(); toast('Respaldo cifrado listo', 'Quedó seleccionado en el recuadro. Cópialo y guárdalo. Sin tu contraseña nadie puede leerlo.', null, 7000); };
    $('#backup-pass').value = '';
    try { navigator.clipboard.writeText(text).then(() => toast('Respaldo cifrado copiado', 'Guárdalo en tus notas. Para restaurarlo necesitarás la misma contraseña.', null, 6000), fallback); }
    catch (e) { fallback(); }
  });
  $('#restore-backup').addEventListener('click', async () => {
    const raw = $('#backup-text').value.trim();
    if (!raw) { toast('Falta el respaldo', 'Pega primero el texto de tu respaldo en el recuadro.', null, 5000); return; }
    if (raw.length > 5000000) { toast('Respaldo demasiado grande', 'Revisa que hayas pegado solo tu respaldo de Agendita.', 'urgente', 6000); return; }
    let json = raw;
    if (raw.startsWith(BACKUP_TAG + '.')) {
      try { json = await decryptBackup(raw, $('#backup-pass').value); }
      catch (e) { toast('No se pudo abrir el respaldo', 'La contraseña no coincide o el texto está incompleto.', 'urgente', 7000); return; }
    }
    let s = null; try { s = normalize(JSON.parse(json)); } catch (e) {}
    if (!s) { toast('No se pudo restaurar', 'El texto no parece un respaldo de Agendita. Revisa que esté completo.', 'urgente', 7000); return; }
    s.settings.onboarded = true; state = s; save(); renderAll(); renderAvisos(); $('#backup-text').value = ''; $('#backup-pass').value = '';
    toast('Respaldo restaurado', `Volvieron ${plural(state.tasks.length, 'tarea', 'tareas')} y ${plural(state.fixed.length, 'tarea fija', 'tareas fijas')}.`, null, 5000);
  });

  /* ---------- Pestañas ---------- */
  const TABS = { hoy: 's-hoy', cal: 's-cal', fijas: 's-fijas', avisos: 's-avisos', mas: 's-mas' };
  function showTab(name, keepScroll) {
    view.tab = name;
    for (const [k, id] of Object.entries(TABS)) $('#' + id).hidden = k !== name;
    $$('.tab').forEach(b => { if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('.tabbar .tabs').style.setProperty('--i', Object.keys(TABS).indexOf(name));
    $('.tabbar').classList.remove('compact');
    $('.fab').hidden = !(name === 'hoy' || name === 'cal');
    if (!keepScroll) window.scrollTo(0, 0);
    requestAnimationFrame(() => markOverflow(document));
    if (name === 'avisos') refreshPerm();
  }

  function renderAll() {
    renderNames(); renderHoy(); renderCal(); renderDay(); renderKeys(); renderFijas();
    requestAnimationFrame(() => markOverflow(document));
  }

  /* ---------- Bienvenida ---------- */
  const ONB = { i: 0, wantFixed: false, added: [], lead: 2880, hours: 1, repeat: false, skipFixed: true };
  function onbSteps() {
    const s = ['hola', 'avisos', 'fijas-q'];
    if (ONB.wantFixed) { s.push('fijas-add'); if (ONB.added.length) s.push('fijas-daily'); }
    return s.concat(['lead', 'after', 'listo']);
  }
  const icon = id => `<div class="big-ic"><svg><use href="#${id}"/></svg></div>`;
  const back = () => ONB.i > 0 ? `<button type="button" class="link-btn" data-onb="back" style="align-self:flex-start">Atrás</button>` : '';
  const ONB_VIEWS = {
    hola: () => `<img class="logo-lg" src="img/logo-256.png" alt="Logo de Agendita"><h2>¡Hola! Qué bueno tenerte aquí</h2>
      <p class="sub">Agendita te recuerda tus tareas con cariño y sin agobios. Te haré unas preguntas rápidas para dejarla a tu gusto.</p>
      <p class="greeting" style="font-size:20px">Agendita, by Sebastian · hecho con cariño :)</p>
      <div class="field"><label for="onb-name">¿Cómo te llamas?</label><input class="input" id="onb-name" type="text" maxlength="40" autocomplete="off" value="${esc(state.settings.name)}" placeholder="Tu nombre"></div>
      <div class="onb-actions"><button class="btn btn-sprout btn-block" type="button" data-onb="name">Siguiente</button></div>`,
    avisos: () => `${icon('i-bell')}<h2>¿Te aviso de tus tareas?</h2>
      <p class="sub">Necesito tu permiso para enviarte recordatorios, incluso con la app cerrada. Puedes cambiarlo después.</p>
      <div class="onb-actions"><button class="btn btn-sprout btn-block" type="button" data-onb="perm">Activar avisos</button><button class="btn btn-quiet btn-block" type="button" data-onb="next">Ahora no</button></div>${back()}`,
    'fijas-q': () => `${icon('i-pin')}<h2>¿Quieres fijar tareas que sí o sí tienes que hacer?</h2>
      <p class="sub">Tú eliges los días de la semana en que te tocan, y se marcan en esos días de todo el año. Por ejemplo: los lunes a las 18:00, clases de baile. No es obligatorio.</p>
      <div class="onb-actions"><button class="btn btn-sprout btn-block" type="button" data-onb="fixed-yes">Sí, quiero fijar</button><button class="btn btn-quiet btn-block" type="button" data-onb="fixed-no">No, por ahora</button></div>${back()}`,
    'fijas-add': () => `${icon('i-pin')}<h2>Agrega tus tareas fijas</h2>
      <p class="sub">Escribe la tarea, elige la hora y los días en que te toca, y toca «Agregar». Puedes agregar varias.</p>
      <div class="grid2" style="grid-template-columns:minmax(0,1fr) 136px"><input class="input" id="onb-ftitle" type="text" maxlength="90" placeholder="Ej. Clases de baile" aria-label="Tarea fija" autocomplete="off"><input class="input" id="onb-ftime" type="time" value="08:00" aria-label="Hora"></div>
      <div class="field"><span class="lbl">¿Qué días te toca?</span>${daysPicker('onb-fdays', [])}</div>
      <p class="error" id="onb-ferror"></p>
      <button class="btn btn-quiet" type="button" data-onb="fixed-add"><svg><use href="#i-plus"/></svg>Agregar</button>
      <ul class="mini-list">${ONB.added.map(id => { const f = state.fixed.find(x => x.id === id); return f ? `<li><span>${esc(f.title)} · ${esc(daysText(f.days).toLowerCase())} · ${esc(f.time)}</span><button type="button" class="link-btn" data-onb-rm="${esc(f.id)}">Quitar</button></li>` : ''; }).join('')}</ul>
      <div class="onb-actions"><button class="btn btn-sprout btn-block" type="button" data-onb="next">${ONB.added.length ? 'Listo' : 'Saltar por ahora'}</button></div>${back()}`,
    'fijas-daily': () => `${icon('i-bell')}<h2>¿Quieres que te avise los días que te tocan estas tareas?</h2>
      <ul class="mini-list">${ONB.added.map(id => { const f = state.fixed.find(x => x.id === id); return f ? `<li><span>${esc(f.title)}</span><span class="muted">${esc(daysText(f.days))} · ${esc(f.time)}</span></li>` : ''; }).join('')}</ul>
      <p class="sub">Puedes cambiarlo para cada tarea en la pestaña «Fijas».</p>
      <div class="onb-actions"><button class="btn btn-sprout btn-block" type="button" data-onb="daily-yes">Sí, avísame</button><button class="btn btn-quiet btn-block" type="button" data-onb="daily-no">No, solo mostrarlas</button></div>${back()}`,
    lead: () => `${icon('i-clock')}<h2>¿Con cuánta anticipación te aviso?</h2>
      <p class="sub">Te aviso antes de la fecha y otra vez a la hora. Luego puedes ajustarlo por tipo de tarea, o en cada tarea.</p>
      <div class="choices">${[1440, 2880, 4320, 10080, 180, 60].map(v => `<button type="button" class="choice" data-onb-lead="${v}" aria-pressed="${ONB.lead === v}">${cap(fmtLead(v))} antes</button>`).join('')}</div>
      <div class="row"><input class="input" id="onb-ln" type="number" min="1" max="90" value="5" inputmode="numeric" aria-label="Cantidad" style="width:80px;flex:none">
        <select class="input" id="onb-lu" aria-label="Unidad" style="width:auto;flex:1 1 120px"><option value="60">horas antes</option><option value="1440" selected>días antes</option><option value="10080">semanas antes</option></select>
        <button class="btn btn-quiet btn-sm" type="button" data-onb="lead-custom">Usar esta</button></div>
      <p class="muted" id="onb-lead-label">Elegido: ${fmtLead(ONB.lead)} antes.</p>
      <div class="onb-actions"><button class="btn btn-sprout btn-block" type="button" data-onb="lead-ok">Siguiente</button></div>${back()}`,
    after: () => `${icon('i-repeat')}<h2>Si no marcas una tarea como hecha, ¿cuántas horas después te la recuerdo?</h2>
      <div class="hours" id="onb-hours">${hoursGrid(ONB.hours)}</div>
      <label class="switch" for="onb-repeat"><span>Repetir cada vez que pase ese tiempo, hasta que la marque (máximo 24 horas)</span><input type="checkbox" id="onb-repeat" ${ONB.repeat ? 'checked' : ''}></label>
      <label class="switch" for="onb-skip"><span>No insistir con mis tareas fijas</span><input type="checkbox" id="onb-skip" ${ONB.skipFixed ? 'checked' : ''}></label>
      <div class="onb-actions"><button class="btn btn-sprout btn-block" type="button" data-onb="after-ok">Siguiente</button></div>${back()}`,
    listo: () => `${icon('i-spark')}<h2>¡Todo listo${esc(hi())}!</h2>
      <p class="sub">Tu agendita ya está lista. ¿Quieres que te muestre cómo se usa en un minuto?</p>
      <div class="onb-actions"><button class="btn btn-sprout btn-block" type="button" data-onb="finish-tour">Ver el recorrido</button><button class="btn btn-quiet btn-block" type="button" data-onb="finish">Empezar</button></div>${back()}`
  };
  function renderOnb() {
    const steps = onbSteps(); ONB.i = Math.min(ONB.i, steps.length - 1);
    $('#onb-card').innerHTML = ONB_VIEWS[steps[ONB.i]]();
    $('#onb-dots').innerHTML = steps.map((_, k) => `<i class="${k === ONB.i ? 'on' : ''}"></i>`).join('');
    $('#onb').scrollTop = 0;
  }
  function startOnb() { ONB.i = 0; $('#onb').hidden = false; renderOnb(); }
  const onbNext = () => { ONB.i++; renderOnb(); };
  function finishOnb(tour) {
    const S = state.settings;
    S.onboarded = true; S.lastVersion = APP.version;
    save(); $('#onb').hidden = true; renderAll(); renderAvisos(); showTab('hoy');
    if (tour) startTour();
  }
  function onbAddFixed() {
    const t = $('#onb-ftitle'), title = t.value.trim(), time = $('#onb-ftime').value || '08:00';
    if (!title) { t.focus(); return; }
    const days = readDays('onb-fdays');
    if (!days.length) { $('#onb-ferror').textContent = 'Elige al menos un día de la semana.'; return; }
    const f = { id: uid(), title, time, daily: true, days, start: todayS(), done: {} };
    state.fixed.push(f); ONB.added.push(f.id); persist(); renderOnb();
    setTimeout(() => { const n = $('#onb-ftitle'); if (n) n.focus(); }, 30);
  }
  $('#onb').addEventListener('click', async e => {
    const rm = e.target.closest('[data-onb-rm]');
    if (rm) { state.fixed = state.fixed.filter(f => f.id !== rm.dataset.onbRm); ONB.added = ONB.added.filter(id => id !== rm.dataset.onbRm); persist(); renderOnb(); return; }
    const ld = e.target.closest('[data-onb-lead]');
    if (ld) { ONB.lead = Number(ld.dataset.onbLead); $$('[data-onb-lead]').forEach(b => b.setAttribute('aria-pressed', String(b === ld))); $('#onb-lead-label').textContent = `Elegido: ${fmtLead(ONB.lead)} antes.`; return; }
    const hb = e.target.closest('#onb-hours [data-hours]');
    if (hb) { ONB.hours = Number(hb.dataset.hours); $('#onb-hours').innerHTML = hoursGrid(ONB.hours); return; }
    const b = e.target.closest('[data-onb]'); if (!b) return;
    const act = b.dataset.onb, S = state.settings;
    if (act === 'back') { ONB.i = Math.max(0, ONB.i - 1); renderOnb(); }
    else if (act === 'next') onbNext();
    else if (act === 'name') { S.name = $('#onb-name').value.trim().slice(0, 40); persist(); renderNames(); onbNext(); }
    else if (act === 'perm') { await requestPerm(true); onbNext(); }
    else if (act === 'fixed-yes') { ONB.wantFixed = true; S.fixedAsked = true; persist(); onbNext(); }
    else if (act === 'fixed-no') { ONB.wantFixed = false; S.fixedAsked = true; persist(); onbNext(); }
    else if (act === 'fixed-add') onbAddFixed();
    else if (act === 'daily-yes' || act === 'daily-no') { ONB.added.forEach(id => { const f = state.fixed.find(x => x.id === id); if (f) f.daily = act === 'daily-yes'; }); persist(); onbNext(); }
    else if (act === 'lead-custom') {
      const n = Number($('#onb-ln').value), u = Number($('#onb-lu').value);
      if (!Number.isInteger(n) || n < 1 || n > 90) { toast('Revisa el número', 'Escribe una cantidad entre 1 y 90.', null, 4000); return; }
      ONB.lead = n * u; $$('[data-onb-lead]').forEach(x => x.setAttribute('aria-pressed', String(Number(x.dataset.onbLead) === ONB.lead)));
      $('#onb-lead-label').textContent = `Elegido: ${fmtLead(ONB.lead)} antes.`;
    }
    else if (act === 'lead-ok') {
      for (const k of ORDER) S.cats[k].offsets = [...new Set([ONB.lead, ...(k === 'urgente' ? [60] : []), 0])].sort((x, y) => y - x);
      persist(); onbNext();
    }
    else if (act === 'after-ok') {
      S.after = { hours: ONB.hours, repeat: $('#onb-repeat').checked, skipFixed: $('#onb-skip').checked };
      persist(); onbNext();
    }
    else if (act === 'finish') finishOnb(false);
    else if (act === 'finish-tour') finishOnb(true);
  });
  $('#onb').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'onb-ftitle') { e.preventDefault(); onbAddFixed(); }
    else if (e.target.id === 'onb-name') { e.preventDefault(); $('[data-onb="name"]').click(); }
  });

  /* ---------- Recorrido guiado ---------- */
  const TOUR = [
    { tab: 'hoy', sel: null, title: 'Un recorrido de un minuto', body: 'Te muestro lo básico. Puedes salir cuando quieras con «Saltar».' },
    { tab: 'hoy', sel: '#quick-card', title: 'Anota en un segundo', body: 'Escribe la tarea, elige hoy o mañana y toca su categoría.' },
    { tab: 'hoy', sel: '#today-list-card', title: 'Marca lo que terminas', body: 'Toca el circulito cuando acabes. Dejo de recordártela y tu plantita crece.' },
    { tab: 'hoy', sel: '.fab', title: 'Más detalles', body: 'Con este botón eliges día, hora, cuánta anticipación quieres y si la tarea se repite.' },
    { tab: 'cal', sel: '#cal-grid', title: 'Tu calendario', body: 'Los puntitos son tus tareas, el alfiler marca las fijas y el papelito amarillo abre la nota del día.' },
    { tab: 'cal', sel: '#day-card', title: 'Notas en tus días', body: 'Toca un día para ver sus tareas y escribirle una nota. Si es larga, la abres completa con un toque.' },
    { tab: 'fijas', sel: '#fixed-card', title: 'Tareas fijas', body: 'Lo que haces sí o sí, en los días de la semana que elijas. Se marca en esos días de todo el año y puedes pedir un aviso.' },
    { tab: 'avisos', sel: '#lead-card', title: 'Con cuánta anticipación', body: 'Elige cuándo te aviso antes de cada tipo de tarea: 2 días, 1 hora o lo que prefieras.' },
    { tab: 'avisos', sel: '#after-card', title: 'Cada cuánto te insisto', body: 'Si no marcas una tarea, te la recuerdo las horas que elijas después, de 1 a 24.' },
    { tab: 'hoy', sel: '.tabbar', title: 'Muévete por la app', body: 'Desde aquí pasas entre Hoy, Calendario, Fijas, Avisos y Más.' },
    { tab: 'hoy', sel: null, title: '¡Todo listo!', body: 'Si se te olvida algo, en «Más › Cómo se usa» puedes repetir este recorrido.' }
  ];
  const tour = { i: 0, el: $('#tour'), spot: $('#tour-spot'), pop: $('#tour-pop') };
  function placeTour() {
    const s = TOUR[tour.i], t = s.sel && $(s.sel), pop = tour.pop, spot = tour.spot;
    const vw = window.innerWidth, vh = window.innerHeight, m = 16, pw = pop.offsetWidth, ph = pop.offsetHeight;
    if (!t) {
      spot.classList.add('none'); spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
      pop.style.left = `${Math.max(m, (vw - pw) / 2)}px`; pop.style.top = `${Math.max(m, (vh - ph) / 2)}px`; return;
    }
    spot.classList.remove('none');
    const r = t.getBoundingClientRect(), pd = 6, top = Math.max(r.top - pd, 4), bottom = Math.min(r.bottom + pd, vh - 4);
    spot.style.cssText = `left:${Math.max(4, r.left - pd)}px;top:${top}px;width:${Math.min(vw - 8, r.width + pd * 2)}px;height:${Math.max(0, bottom - top)}px`;
    let y;
    if (vh - bottom >= ph + m + 12) y = bottom + 12; else if (top >= ph + m + 12) y = top - ph - 12; else y = vh - ph - m - 80;
    pop.style.left = `${Math.min(Math.max(m, r.left + r.width / 2 - pw / 2), vw - pw - m)}px`;
    pop.style.top = `${Math.max(m, y)}px`;
  }
  function showStep() {
    const s = TOUR[tour.i];
    if (view.tab !== s.tab) showTab(s.tab);
    $('#tour-step').textContent = `Paso ${tour.i + 1} de ${TOUR.length}`;
    $('#tour-title').textContent = s.title; $('#tour-body').textContent = s.body;
    $('#tour-prev').hidden = tour.i === 0;
    $('#tour-next').textContent = tour.i === TOUR.length - 1 ? '¡A empezar!' : 'Siguiente';
    const t = s.sel && $(s.sel);
    if (t && getComputedStyle(t).position !== 'fixed') { t.scrollIntoView({ block: 'center', behavior: REDUCE ? 'auto' : 'smooth' }); setTimeout(placeTour, REDUCE ? 30 : 450); }
    placeTour();
  }
  function startTour() { tour.i = 0; tour.el.hidden = false; showStep(); }
  function endTour() { tour.el.hidden = true; showTab('hoy'); }
  $('#tour-next').addEventListener('click', () => { if (tour.i < TOUR.length - 1) { tour.i++; showStep(); } else endTour(); });
  $('#tour-prev').addEventListener('click', () => { if (tour.i > 0) { tour.i--; showStep(); } });
  $('#tour-skip').addEventListener('click', endTour);
  let tourRaf;
  const replaceTour = () => { if (tour.el.hidden) return; cancelAnimationFrame(tourRaf); tourRaf = requestAnimationFrame(placeTour); };
  window.addEventListener('scroll', replaceTour, { passive: true });
  window.addEventListener('resize', replaceTour);

  /* ---------- Barra de pestañas: se encoge al bajar y se expande al subir ---------- */
  let lastScrollY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY, dy = y - lastScrollY;
    if (Math.abs(dy) < 8) return;
    $('.tabbar').classList.toggle('compact', dy > 0 && y > 80);
    lastScrollY = y;
  }, { passive: true });
  // Permite el efecto de presionar (:active) en los botones de vidrio al tocarlos.
  document.addEventListener('touchstart', () => {}, { passive: true });

  /* ---------- Actualizaciones ---------- */
  async function checkUpdate() {
    const btn = $('#check-update'), out = $('#update-status'), get = $('#get-update');
    btn.disabled = true; get.hidden = true; out.textContent = 'Buscando…';
    try {
      const r = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('http ' + r.status);
      const v = await r.json();
      if (Number(v.versionCode) > APP.build && typeof v.apk === 'string' && v.apk.startsWith(APK_PREFIX) && /^[\w./-]+$/.test(v.apk.slice(APK_PREFIX.length))) {
        out.textContent = `Hay una versión nueva: ${String(v.versionName).slice(0, 20)}. ${String(v.notes || '').slice(0, 300)} Al descargarla, ábrela y toca «Actualizar». Tus tareas se conservan.`;
        get.href = v.apk; get.hidden = false;
      } else {
        out.textContent = `Ya tienes la versión más reciente (${APP.version}).`;
      }
    } catch (e) {
      out.textContent = 'No pude revisar. Comprueba tu conexión a internet e inténtalo de nuevo.';
    }
    btn.disabled = false;
  }
  $('#check-update').addEventListener('click', checkUpdate);

  /* ---------- Botón atrás de Android ---------- */
  function closeTop() {
    if (!tour.el.hidden) { endTour(); return true; }
    if (openSheets.length) { closeSheet(openSheets[openSheets.length - 1]); return true; }
    if (!$('#onb').hidden && ONB.i > 0) { ONB.i--; renderOnb(); return true; }
    return false;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTop(); });

  /* ---------- Fondo tropical ---------- */
  function jungle() {
    const c = $('#bg'); if (!c || !c.getContext) return;
    const ctx = c.getContext('2d');
    let w = 0, h = 0, dpr = 1, layer = null, flies = [], last = 0, running = false;
    function frond(g, x, y, ang, len, bend, col) {
      const N = 30; let px = x, py = y, dir = ang; const pts = [];
      for (let i = 0; i <= N; i++) { pts.push([px, py, dir]); px += Math.cos(dir) * len / N; py += Math.sin(dir) * len / N; dir += bend / N; }
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); pts.forEach(p => g.lineTo(p[0], p[1])); g.stroke();
      for (let i = 3; i < N; i++) {
        const [bx, by, d] = pts[i], t = i / N, L = len * 0.34 * Math.sin(Math.PI * (0.12 + 0.88 * t)) * (1 - 0.35 * t);
        for (const side of [-1, 1]) {
          const a = d + side * (1.05 - 0.35 * t), tx = bx + Math.cos(a) * L, ty = by + Math.sin(a) * L + L * 0.18;
          const mx = (bx + tx) / 2, my = (by + ty) / 2, nx = -Math.sin(a) * L * 0.1, ny = Math.cos(a) * L * 0.1;
          g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(mx + nx, my + ny, tx, ty); g.quadraticCurveTo(mx - nx, my - ny, bx, by); g.fill();
        }
      }
    }
    function build() {
      dpr = Math.min(window.devicePixelRatio || 1, 2); w = window.innerWidth; h = window.innerHeight;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      layer = document.createElement('canvas'); layer.width = c.width; layer.height = c.height;
      const g = layer.getContext('2d'); g.scale(dpr, dpr);
      const L = Math.max(200, Math.min(Math.max(w, h) * 0.42, 440));
      frond(g, w + 30, h * 0.04, Math.PI - 0.2, L, -0.9, 'rgba(39,63,43,.85)');
      frond(g, -30, h * 0.42, -0.25, L * 0.85, 0.7, 'rgba(30,52,34,.75)');
      frond(g, w + 30, h * 0.72, Math.PI + 0.3, L * 0.9, 0.8, 'rgba(30,52,34,.8)');
      frond(g, w * 0.15, h + 30, -Math.PI / 2 + 0.35, L * 0.8, 0.6, 'rgba(39,63,43,.6)');
      flies = [...Array(w > 600 ? 26 : 16)].map(() => ({ x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 1.6, p: Math.random() * 6.28, s: 0.4 + Math.random() * 0.8, vx: (Math.random() - .5) * .12, vy: (Math.random() - .5) * .08 }));
    }
    function draw(t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(layer, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const f of flies) {
        const a = 0.25 + 0.75 * Math.max(0, Math.sin(f.p + t / 1000 * f.s));
        if (!REDUCE) { f.x += f.vx; f.y += f.vy; if (f.x < 0) f.x = w; if (f.x > w) f.x = 0; if (f.y < 0) f.y = h; if (f.y > h) f.y = 0; }
        ctx.beginPath(); ctx.fillStyle = `rgba(104,239,63,${(a * 0.16).toFixed(3)})`; ctx.arc(f.x, f.y, f.r * 4, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = `rgba(190,255,160,${a.toFixed(3)})`; ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
      }
    }
    function loop(t) {
      if (!running) return;
      if (t - last > 40) { draw(t); last = t; }
      requestAnimationFrame(loop);
    }
    function start() { if (REDUCE) { draw(0); return; } if (!running) { running = true; requestAnimationFrame(loop); } }
    build(); start();
    document.addEventListener('visibilitychange', () => { if (document.hidden) running = false; else start(); });
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { build(); draw(performance.now()); }, 150); });
  }

  /* ---------- Inicio ---------- */
  async function bootStore() {
    if (!AG) return;
    try {
      // Si el Keystore falla un momento (por ejemplo, recién encendido el teléfono), se reintenta antes de rendirse,
      // para no empezar vacío y sobrescribir los datos cifrados.
      let r = null;
      for (let i = 0; i < 4; i++) {
        try { r = await AG.loadState(); } catch (e) { r = { unreadable: true }; }
        if (!r || !r.unreadable) break;
        await new Promise(ok => setTimeout(ok, 500 * (i + 1)));
      }
      let s = null, migrated = false;
      try { s = r && r.value ? normalize(JSON.parse(r.value)) : null; } catch (e) { s = null; }
      if (!s) {
        // Versiones anteriores guardaban sin cifrar: se pasan a la bóveda y luego se borran.
        let legacy = loadLocal();
        if (!legacy) { try { const p = await AG.legacyPreferences(); legacy = p && p.value ? JSON.parse(p.value) : null; } catch (e) {} }
        s = normalize(legacy); migrated = !!s;
      }
      if (r && r.unreadable && !s) toast('No pude leer tus datos', 'Tus datos guardados no se pudieron descifrar. Si tienes un respaldo, restáuralo en Más › Tus datos.', 'urgente', 12000);
      state = s || fresh(); loaded = true;
      if (migrated) await AG.saveState({ value: JSON.stringify(state) });
      try { localStorage.removeItem(KEY); } catch (e) {}
      await AG.clearLegacy();
    } catch (e) { loaded = true; }
  }
  async function reloadState() {
    if (!AG || !loaded) return;
    try { const r = await AG.loadState(); const s = r && r.value ? normalize(JSON.parse(r.value)) : null; if (s) state = s; } catch (e) {}
  }

  async function init() {
    jungle();
    renderAll(); renderAvisos(); showTab('hoy');
    $('#s-name').value = state.settings.name;
    await bootStore();
    renderAll(); renderAvisos(); $('#s-name').value = state.settings.name;
    await refreshPerm();
    if (!state.settings.onboarded) startOnb();
    scheduleSync(true);
    if (AppP) {
      try {
        const info = await AppP.getInfo();
        if (info.version) APP.version = info.version;
        if (Number(info.build)) APP.build = Number(info.build);
      } catch (e) {}
    }
    $('#app-version').textContent = APP.version; $('#app-version-2').textContent = APP.version;
    // Novedades: se muestran una vez, solo a quien ya usaba la app antes de actualizar.
    if (state.settings.lastVersion !== APP.version) {
      if (state.settings.onboarded) toast(`Novedades de la versión ${APP.version}`, 'Ahora tienes un widget para la pantalla de inicio: muestra tus tareas de hoy y puedes marcarlas con ✓. Además, tus datos se guardan cifrados y te aviso por la tarde si te quedan pendientes. Para agregar el widget: mantén presionada la pantalla de inicio › Widgets › Agendita.', null, 11000);
      state.settings.lastVersion = APP.version; persist();
    }
    if (AppP) {
      AppP.addListener('backButton', () => {
        if (closeTop()) return;
        if (view.tab !== 'hoy') { showTab('hoy'); return; }
        AppP.exitApp();
      });
      AppP.addListener('resume', async () => { await reloadState(); renderAll(); refreshPerm(); scheduleSync(); });
    }
    if (AG) {
      // El widget marcó una tarea: se vuelven a leer los datos.
      AG.addListener('stateChanged', async () => { await reloadState(); renderAll(); scheduleSync(); });
      // Se tocó un aviso: se abre el calendario en ese día.
      AG.addListener('open', a => {
        const ds = a && a.ds;
        if (!ds || !isYmd(ds)) return;
        view.sel = ds; const d = parseYmd(ds); view.month = new Date(d.getFullYear(), d.getMonth(), 1);
        showTab('cal'); renderCal(); renderDay(); markOverflow($('#day-card'));
      });
    }
    setInterval(() => { webTick(); }, 20000);
    let lastDay = todayS();
    setInterval(() => { if (todayS() !== lastDay) { lastDay = todayS(); renderAll(); scheduleSync(); } }, 60000);
  }
  init();
})();
