/**
 * SAMATRIC frontend: marks sheet + results. Talks to the API on the same origin.
 */
const API = '/api';
const STORAGE_KEY = 'samatric.marks.v1';
const ENGLISH = ['English Home Language', 'English First Additional Language'];
const MATHS = ['Mathematics', 'Mathematical Literacy', 'Technical Mathematics'];
const LO = 'Life Orientation';
const MAX_OTHER = 9;

const GROUP_LABELS = {
  language: 'Languages', science: 'Sciences', commerce: 'Commerce', humanities: 'Humanities',
  technical: 'Technology', arts: 'Arts', other: 'Services and consumer studies',
};
const STATUS_TEXT = {
  qualifies: 'courses you qualify for',
  close: 'courses within reach',
  check: 'courses to confirm with the university',
  not_eligible: 'courses you don\'t qualify for yet',
};

const $ = (sel) => document.querySelector(sel);
const state = {
  subjects: [],
  universities: new Map(),
  response: null,
  status: 'qualifies',
  live: false, // after the first check, edits re-run automatically
};

/** Tiny DOM helper: el('p', { class: 'x' }, 'text', childNode) */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') Object.assign(node.style, v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c instanceof Node ? c : String(c));
  return node;
}

async function api(path, options) {
  const res = await fetch(API + path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.errors?.join(' ') ?? body.error ?? `Request failed (${res.status}).`);
    err.errors = body.errors;
    throw err;
  }
  return body;
}

/* ------------------------------------------------------------------ */
/* Marks sheet                                                         */
/* ------------------------------------------------------------------ */
function otherSubjectOptions(selected, taken) {
  const select = el('select', { class: 'other-subject' });
  select.append(el('option', { value: '' }, 'Choose a subject'));
  const groups = new Map();
  for (const s of state.subjects) {
    if (ENGLISH.includes(s.name) || MATHS.includes(s.name) || s.name === LO) continue;
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s.name);
  }
  for (const [group, names] of groups) {
    const og = el('optgroup', { label: GROUP_LABELS[group] ?? group });
    for (const n of names) {
      og.append(el('option', { value: n, selected: n === selected ? '' : null, disabled: taken.has(n) && n !== selected ? '' : null }, n));
    }
    select.append(og);
  }
  return select;
}

function addRow(subject = '', mark = '') {
  const rows = $('#other-rows');
  if (rows.children.length >= MAX_OTHER) return;
  const row = $('#row-template').content.firstElementChild.cloneNode(true);
  const field = row.querySelector('.subject-field');
  field.querySelector('select').replaceWith(otherSubjectOptions(subject, takenSubjects()));
  row.querySelector('.other-mark').value = mark;
  row.querySelector('.remove').addEventListener('click', () => { row.remove(); onSheetChange(); });
  rows.append(row);
  $('#add-subject').hidden = rows.children.length >= MAX_OTHER;
  return row;
}

function takenSubjects() {
  return new Set([...document.querySelectorAll('.other-subject')].map((s) => s.value).filter(Boolean));
}

/** Keep other-subject dropdowns from offering subjects already chosen elsewhere. */
function refreshTaken() {
  const taken = takenSubjects();
  for (const select of document.querySelectorAll('.other-subject')) {
    for (const opt of select.querySelectorAll('option')) {
      if (opt.value) opt.disabled = taken.has(opt.value) && opt.value !== select.value;
    }
  }
}

function parseMark(input, required) {
  const raw = input.value.trim();
  input.removeAttribute('aria-invalid');
  if (raw === '') return required ? { error: 'missing' } : { value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    input.setAttribute('aria-invalid', 'true');
    return { error: 'range' };
  }
  return { value: n };
}

/** Read the sheet into { marks, errors, saved }. */
function readSheet() {
  const errors = [];
  const marks = {};
  const saved = {
    englishLevel: $('#english-level').value, englishMark: $('#english-mark').value,
    mathsType: $('#maths-type').value, mathsMark: $('#maths-mark').value,
    loMark: $('#lo-mark').value, others: [],
  };

  const fixed = [
    [saved.englishLevel, $('#english-mark'), true, 'English'],
    [saved.mathsType, $('#maths-mark'), true, 'maths'],
    [LO, $('#lo-mark'), false, 'Life Orientation'],
  ];
  for (const [subject, input, required, label] of fixed) {
    const r = parseMark(input, required);
    if (r.error === 'missing') errors.push(`Enter your ${label} mark.`);
    else if (r.error) errors.push(`${label} mark must be a whole number from 0 to 100.`);
    else if (r.value != null) marks[subject] = r.value;
  }

  for (const row of document.querySelectorAll('.row-other')) {
    const subject = row.querySelector('.other-subject').value;
    const input = row.querySelector('.other-mark');
    saved.others.push({ subject, mark: input.value });
    if (!subject) continue;
    const r = parseMark(input, true);
    if (r.error === 'missing') errors.push(`Enter a mark for ${subject}.`);
    else if (r.error) errors.push(`${subject} mark must be a whole number from 0 to 100.`);
    else marks[subject] = r.value;
  }

  for (const s of Object.keys(marks)) {
    if (s.endsWith(' Home Language') && marks[s.replace(' Home Language', ' First Additional Language')] != null) {
      errors.push(`You can't take ${s.replace(' Home Language', '')} at both Home Language and First Additional Language level.`);
    }
  }
  return { marks, errors, saved };
}

function showErrors(errors) {
  const box = $('#form-errors');
  box.hidden = errors.length === 0;
  box.replaceChildren(...errors.map((e, i) => (i ? [el('br'), e] : e)).flat());
}

function restoreSheet() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { saved = null; }
  if (!saved) { addRow(); addRow(); addRow(); addRow(); return false; }
  $('#english-level').value = saved.englishLevel ?? ENGLISH[0];
  $('#english-mark').value = saved.englishMark ?? '';
  $('#maths-type').value = saved.mathsType ?? MATHS[0];
  $('#maths-mark').value = saved.mathsMark ?? '';
  $('#lo-mark').value = saved.loMark ?? '';
  for (const o of saved.others ?? []) addRow(o.subject, o.mark);
  if (!saved.others?.length) addRow();
  refreshTaken();
  return Boolean(saved.englishMark && saved.mathsMark);
}

let debounce;
function onSheetChange() {
  refreshTaken();
  const { errors, saved } = readSheet();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* storage full or blocked */ }
  if (!state.live) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => { if (!errors.length) check(); else showErrors(errors); }, 400);
}

/* ------------------------------------------------------------------ */
/* Checking                                                            */
/* ------------------------------------------------------------------ */
async function check({ reveal = false } = {}) {
  const { marks, errors } = readSheet();
  showErrors(errors);
  if (errors.length) return;
  try {
    state.response = await api('/eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marks }),
    });
    state.live = true;
    renderResults();
    // On phones the results sit below the marks sheet: bring them into view after a deliberate check
    if (reveal && window.matchMedia('(max-width: 59.99rem)').matches) {
      const smooth = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
      $('#results-body').scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    }
  } catch (err) {
    showErrors(err.errors ?? [err.message]);
  }
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */
function renderAps() {
  const { apsByUniversity } = state.response;
  $('#aps-list').replaceChildren(...Object.entries(apsByUniversity).map(([uni, { aps, counted }]) => {
    const name = state.universities.get(uni)?.name ?? uni;
    return el('div', { class: 'aps-item' },
      el('span', { class: 'aps-value' }, aps),
      el('span', {}, 'APS at ', el('span', { class: 'aps-uni' }, name)),
      el('details', {},
        el('summary', {}, 'How this is worked out'),
        el('p', {}, counted.map((c) => `${c.subject} ${c.mark}% = ${c.points}`).join(', '),
          '. Life Orientation is not counted unless the university says so.')));
  }));
}

function syncFacultyOptions() {
  const uni = $('#filter-uni').value;
  const current = $('#filter-faculty').value;
  const seen = new Map();
  for (const r of state.response.results) {
    if (!r.faculty || (uni && r.university !== uni)) continue;
    seen.set(`${r.university}|${r.faculty}`, uni ? r.faculty : `${r.faculty} (${r.university})`);
  }
  const options = [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  $('#filter-faculty').replaceChildren(
    el('option', { value: '' }, 'All'),
    ...options.map(([v, label]) => el('option', { value: v, selected: v === current ? '' : null }, label)),
  );
}

function filtered() {
  const uni = $('#filter-uni').value;
  const faculty = $('#filter-faculty').value;
  const type = $('#filter-type').value;
  const q = $('#filter-search').value.trim().toLowerCase();
  return state.response.results.filter((r) =>
    (!uni || r.university === uni) &&
    (!faculty || `${r.university}|${r.faculty}` === faculty) &&
    (!type || r.qualificationType === type) &&
    (!q || r.name.toLowerCase().includes(q) || (r.faculty ?? '').toLowerCase().includes(q)));
}

function ruler(have, need, max) {
  const pct = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return el('div', { class: 'ruler', 'aria-hidden': 'true' },
    el('span', { class: 'have', style: { width: pct(have) } }),
    el('span', { class: 'need', style: { left: pct(have), width: `calc(${pct(need)} - ${pct(have)})` } }),
    el('span', { class: 'mark', style: { left: pct(need) } }));
}

function gapRulers(r) {
  const items = [];
  if (r.gaps.aps > 0) {
    const max = Math.max(42, r.requiredAps);
    items.push(el('div', {},
      el('div', { class: 'gap-label' }, el('span', {}, `APS: you have ${r.aps}, this course needs ${r.requiredAps}`),
        el('b', {}, `${r.gaps.aps} to go`)),
      ruler(r.aps, r.requiredAps, max)));
  }
  for (const g of r.gaps.subjects) {
    items.push(el('div', {},
      el('div', { class: 'gap-label' }, el('span', {}, `${g.subject}: you have ${g.has}%, this course needs ${g.need}%`),
        el('b', {}, `${g.shortfall}% to go`)),
      ruler(g.has, g.need, 100)));
  }
  return el('div', { class: 'gaps' }, items);
}

function formatDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function courseItem(r) {
  const uni = state.universities.get(r.university);
  const badge = r.requiredAps == null
    ? el('div', { class: 'aps-badge' }, el('strong', {}, r.aps), 'your APS')
    : el('div', { class: 'aps-badge' }, el('strong', {}, r.aps), `of ${r.requiredAps} needed`);

  const body = [];
  if (r.status === 'close') body.push(gapRulers(r));
  else if (r.reasons.length) body.push(el('ul', { class: 'reasons' }, r.reasons.map((x) => el('li', {}, x))));

  const foot = [];
  if (uni?.applicationUrl && r.status !== 'not_eligible') {
    foot.push(el('a', { class: 'apply', href: uni.applicationUrl, target: '_blank', rel: 'noopener' }, `Apply to ${uni.shortName}`));
  }
  const closes = formatDate(uni?.applicationsClose);
  if (closes && r.status !== 'not_eligible') foot.push(el('span', { class: 'closes' }, `Applications close ${closes}`));
  if (r.notes) foot.push(el('details', {}, el('summary', {}, 'Course notes'), el('p', {}, r.notes)));

  return el('li', { class: `course ${r.status}` },
    el('div', { class: 'course-head' },
      el('h3', {}, r.name),
      badge,
      el('p', { class: 'meta' }, [uni?.name ?? r.university, r.faculty].filter(Boolean).join(', '))),
    body,
    foot.length ? el('div', { class: 'course-foot' }, foot) : null);
}

function renderList() {
  const list = filtered();
  for (const tab of document.querySelectorAll('.tabs button')) {
    const n = list.filter((r) => r.status === tab.dataset.status).length;
    tab.querySelector('.count').textContent = n;
    tab.setAttribute('aria-selected', String(tab.dataset.status === state.status));
  }
  const shown = list.filter((r) => r.status === state.status);
  $('#result-count').textContent = shown.length
    ? `${shown.length} ${STATUS_TEXT[state.status]}`
    : `No ${STATUS_TEXT[state.status]} with these filters.`;
  $('#course-list').replaceChildren(...shown.map(courseItem));
}

function renderResults() {
  $('#empty-state').hidden = true;
  $('#results-body').hidden = false;
  renderAps();
  syncFacultyOptions();
  renderList();
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */
async function init() {
  try {
    const [subjects, universities] = await Promise.all([api('/subjects'), api('/universities')]);
    state.subjects = subjects;
    for (const u of universities) state.universities.set(u.shortName, u);
    $('#filter-uni').append(...universities.map((u) => el('option', { value: u.shortName }, u.name)));
  } catch {
    showErrors(['Can\'t reach the SAMATRIC server. Check that it is running, then reload the page.']);
    return;
  }

  const ready = restoreSheet();

  $('#add-subject').addEventListener('click', () => { addRow()?.querySelector('select').focus(); });
  $('#marks-form').addEventListener('input', onSheetChange);
  $('#marks-form').addEventListener('change', onSheetChange);
  $('#marks-form').addEventListener('submit', (e) => { e.preventDefault(); check({ reveal: true }); });

  for (const tab of document.querySelectorAll('.tabs button')) {
    tab.addEventListener('click', () => { state.status = tab.dataset.status; renderList(); });
  }
  $('#filter-uni').addEventListener('change', () => { syncFacultyOptions(); renderList(); });
  for (const id of ['#filter-faculty', '#filter-type']) $(id).addEventListener('change', renderList);
  $('#filter-search').addEventListener('input', renderList);

  if (ready) check();
}

init();
