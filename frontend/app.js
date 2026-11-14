/**
 * SAMATRIC frontend: a small hub with three views (check, search, improve), switched by the
 * URL hash (#check, #search, #improve). Talks to the API on the same origin. No build step.
 */
import { MODE } from './config.js';

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
  close: 'courses you are close to',
  check: 'courses where you meet the minimums (no score cut-off published)',
  not_eligible: 'courses you don\'t qualify for yet',
};
const VIEWS = ['check', 'search', 'improve', 'course'];
const STATUS_LABEL = {
  qualifies: 'You qualify', close: 'Almost there', check: 'Meets minimums', not_eligible: 'Not yet',
};
const QUAL_LABEL = {
  bachelor: 'Degree', diploma: 'Diploma', advanced_diploma: 'Advanced diploma',
  higher_certificate: 'Higher certificate', other: 'Other',
};
const PAGE_SIZE = 30;
const SAVED_KEY = 'samatric.saved.v1';
const MAX_SAVED = 20;
const THEME_KEY = 'samatric.theme';

const $ = (sel) => document.querySelector(sel);
const state = {
  subjects: [],
  universities: new Map(),
  response: null,
  ready: false, // subjects and universities loaded
  intakeYear: null,
  applyingFor: null,
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
  let status;
  let body;
  if (MODE === 'static') {
    const { staticRequest } = await import('./static-api.js');
    ({ status, body } = await staticRequest(path, options));
  } else {
    const res = await fetch(API + path, options);
    status = res.status;
    body = await res.json().catch(() => ({}));
  }
  if (status >= 400) {
    const err = new Error(body.errors?.join(' ') ?? body.error ?? `Request failed (${status}).`);
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
/** Banner above every view while requirements come from last year's prospectuses. */
function showProvisionalNotice() {
  const box = $('#provisional-notice');
  box.hidden = !provisional();
  if (box.hidden) return;
  box.replaceChildren(
    el('strong', {}, `Waiting for the ${state.applyingFor} prospectuses. `),
    `Requirements and scores shown are from the ${state.intakeYear} prospectuses, so use them as a guide. `
    + `We update each university as its ${state.applyingFor} prospectus comes out.`);
}

/** Load (or reload) the university list: full names, closing dates, apply links and the filter options. */
async function loadUniversities() {
  const universities = await api('/universities');
  state.universities.clear();
  for (const u of universities) state.universities.set(u.shortName, u);
  const filter = $('#filter-uni');
  const chosen = filter.value;
  filter.querySelectorAll('option[value]:not([value=""])').forEach((o) => o.remove());
  filter.append(...universities.map((u) => el('option', { value: u.shortName }, u.name)));
  filter.value = chosen;
}

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
    state.intakeYear = state.response.intakeYear;
    // The page may have loaded before new universities were added: refresh names and closing dates
    if (Object.keys(state.response.apsByUniversity).some((code) => !state.universities.has(code))) {
      await loadUniversities();
    }
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
/** "English First Additional Language 55% = 4 (always counted), ..." */
function working(counted, lockedLabel) {
  return counted.map((c) => `${c.subject} ${c.mark}% = ${c.points}${c.locked ? ` (${lockedLabel})` : ''}`).join(', ');
}

/** True when an ISO date (YYYY-MM-DD) is before today on this device. */
function isPast(iso) {
  if (!iso) return false;
  const today = new Date();
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return iso < local;
}

/** Closing-date sentence and apply-button label for a university. */
/** True while the data is last year's (new prospectuses not out yet). */
function provisional() { return state.applyingFor != null && state.intakeYear != null && state.applyingFor > state.intakeYear; }

function applyInfo(code, iso) {
  if (provisional()) {
    return { text: `${state.applyingFor} closing date not published yet`, button: `${code} website` };
  }
  const date = formatDate(iso);
  if (!date) return { text: 'Closing date: check the university website', button: `Apply to ${code}` };
  if (isPast(iso)) {
    return {
      text: `${state.intakeYear ?? ''} applications closed on ${date}. Check the website for next year's dates.`.trim(),
      button: `${code} applications page`,
      closed: true,
    };
  }
  return { text: `Applications close ${date}`, button: `Apply to ${code}` };
}

function countBy(results, uni, status) {
  return results.filter((r) => r.university === uni && r.status === status).length;
}

/** What a university calls its admission score (UCT "FPS", NMU "AS"); "APS" by default. */
function scoreLabel(code) { return state.universities.get(code)?.scoreLabel ?? 'APS'; }

function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

/** One card per university: APS, how many courses fit, and how to apply. */
function renderUniCards() {
  const { apsByUniversity, results } = state.response;
  const cards = Object.entries(apsByUniversity).map(([code, { aps, counted }]) => {
    const uni = state.universities.get(code);
    const yes = countBy(results, code, 'qualifies');
    const close = countBy(results, code, 'close');
    const info = applyInfo(code, uni?.applicationsClose);
    // General date passed, but a faculty is still open (e.g. DUT extended Applied Sciences and Engineering)
    const stillOpen = (uni?.periods ?? []).filter((p) => p.closesOn && !isPast(p.closesOn));
    if (info.closed && stillOpen.length) {
      const last = stillOpen.reduce((m, p) => (p.closesOn > m.closesOn ? p : m));
      info.text = `Most programmes closed on ${formatDate(uni.applicationsClose)}. Some are still open until ${formatDate(last.closesOn)}.`;
      info.button = `Apply to ${code}`;
      info.closed = false;
    }
    const show = el('button', { type: 'button', class: 'link-button' }, `Show ${code} courses`);
    show.addEventListener('click', () => {
      $('#filter-uni').value = code;
      syncFacultyOptions();
      renderList();
      $('#course-list').scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    return el('article', { class: 'uni-card' },
      el('div', { class: 'uni-card-top' },
        el('h3', {}, uni?.name ?? code),
        el('p', { class: 'uni-aps' }, el('strong', {}, aps), el('span', {}, `your ${scoreLabel(code)}`))),
      el('p', { class: 'uni-counts' },
        el('span', { class: 'n-yes' }, plural(yes, 'course')), ' you qualify for',
        close ? [', ', el('span', { class: 'n-close' }, `${close} more`), ' almost there'] : null),
      el('p', { class: `uni-closes${info.closed ? ' closed' : ''}` }, info.text),
      el('div', { class: 'uni-actions' },
        uni?.applicationUrl
          ? el('a', { class: info.closed ? 'btn-secondary' : 'btn-apply', href: uni.applicationUrl, target: '_blank', rel: 'noopener' }, info.button)
          : null,
        show),
      el('details', {},
        el('summary', {}, `How your ${scoreLabel(code)} is worked out`),
        el('p', {}, working(counted, 'always counted'),
          '. Life Orientation is not counted unless the university says so.')));
  });
  $('#uni-cards').replaceChildren(...cards);

  const { marks } = readSheet();
  const extra = Object.keys(marks).filter((s) => s !== LO).length > 6;
  $('#aps-note').hidden = !extra;
  $('#aps-note').textContent = 'You have more than six subjects. Each course counts the subjects it requires first, '
    + 'then your best others, so a course can show a different score from the one above.';
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
      el('div', { class: 'gap-label' }, el('span', {}, `${scoreLabel(r.university)}: you have ${r.aps}, need ${r.requiredAps}`),
        el('b', {}, `${r.gaps.aps} ${r.gaps.aps === 1 ? 'point' : 'points'} to go`)),
      ruler(r.aps, r.requiredAps, max)));
  }
  for (const g of r.gaps.subjects) {
    items.push(el('div', {},
      el('div', { class: 'gap-label' }, el('span', {}, `${g.subject}: you have ${g.has}%, need ${g.need}%`),
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
    ? el('div', { class: 'aps-badge' }, el('strong', {}, r.aps), `your ${scoreLabel(r.university)}`)
    : el('div', { class: 'aps-badge' }, el('strong', {}, r.aps), `of ${r.requiredAps} needed`);

  const body = [];
  if (r.status === 'close') body.push(gapRulers(r));
  else if (r.reasons.length) body.push(el('ul', { class: 'reasons' }, r.reasons.map((x) => el('li', {}, x))));

  const foot = [];
  const closes = r.closesOn ?? uni?.periods?.find((p) => p.label === r.faculty)?.closesOn ?? uni?.applicationsClose;
  const info = applyInfo(r.university, closes);
  if (uni?.applicationUrl && r.status !== 'not_eligible') {
    foot.push(el('a', { class: 'apply', href: uni.applicationUrl, target: '_blank', rel: 'noopener' }, info.button));
  }
  if (closes && r.status !== 'not_eligible') {
    foot.push(el('span', { class: `closes${info.closed ? ' closed' : ''}` }, info.closed ? `Closed ${formatDate(closes)}` : info.text));
  }
  const uniAps = state.response.apsByUniversity[r.university]?.aps;
  if (r.apsWorking && r.aps !== uniAps) {
    foot.push(el('details', {}, el('summary', {}, `How this course's ${scoreLabel(r.university)} is worked out`),
      el('p', {}, working(r.apsWorking, 'required by this course'),
        '. Required subjects are counted first, then your best other subjects.')));
  }
  foot.push(saveButton(r.courseId, r.name));
  if (r.notes) foot.push(el('details', {}, el('summary', {}, 'Course notes'), el('p', {}, r.notes)));

  return el('li', { class: `course ${r.status}` },
    el('div', { class: 'course-head' },
      el('h3', {}, el('a', { href: `#course/${r.courseId}` }, r.name)),
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
  renderUniCards();
  syncFacultyOptions();
  renderList();
  if (search.ready) renderSearch();
  if (currentView() === 'improve') renderImprove();
}

/* ------------------------------------------------------------------ */
/* Search courses                                                      */
/* ------------------------------------------------------------------ */
const search = { q: '', uni: '', type: '', faculty: '', offset: 0, total: 0, results: [], facets: null, ready: false };

/** Eligibility result for a course, if the learner has checked their marks. */
function resultFor(courseId) {
  return state.response?.results.find((r) => r.courseId === courseId) ?? null;
}

function statusBadge(status) {
  return el('span', { class: `status-badge ${status}` }, STATUS_LABEL[status]);
}

function apsNeededText(c) {
  const label = scoreLabel(c.universityShortName);
  if (c.minAps != null) return `${label} ${c.minAps}`;
  if (c.minApsMathsLit != null) return `${label} ${c.minApsMathsLit} (Maths Lit)`;
  if (c.minApsTechMaths != null) return `${label} ${c.minApsTechMaths} (Tech Maths)`;
  return `${label} not stated`;
}

function qualText(c) {
  return [QUAL_LABEL[c.qualificationType] ?? c.qualificationType, c.isExtended ? 'extended' : null,
    c.durationYears ? `${c.durationYears} ${c.durationYears === 1 ? 'year' : 'years'}` : null].filter(Boolean).join(', ');
}

function searchRow(c) {
  const r = resultFor(c.courseId);
  return el('li', { class: 's-item' },
    saveButton(c.courseId, c.name),
    el('a', { class: 's-row', href: `#course/${c.courseId}` },
      el('span', { class: 's-main' },
        el('span', { class: 's-name' }, c.name),
        el('span', { class: 's-meta' }, `${c.universityName ?? c.universityShortName}. ${qualText(c)}`)),
      el('span', { class: 's-side' },
        el('span', { class: 's-aps' }, apsNeededText(c)),
        r ? statusBadge(r.status) : null)));
}

function syncSearchFaculties() {
  const current = $('#s-faculty').value;
  const list = (search.facets?.faculties ?? []).filter((f) => !search.uni || f.university === search.uni);
  $('#s-faculty').replaceChildren(
    el('option', { value: '' }, 'All'),
    ...list.map((f) => {
      const label = search.uni ? f.faculty : `${f.faculty} (${f.university})`;
      return el('option', { value: f.faculty, selected: f.faculty === current ? '' : null }, label);
    }),
  );
  if (![...$('#s-faculty').options].some((o) => o.value === current)) $('#s-faculty').value = '';
}

let searchSeq = 0;
async function runSearch({ append = false } = {}) {
  const seq = ++searchSeq;
  if (!append) search.offset = 0;
  const params = new URLSearchParams({ limit: PAGE_SIZE, offset: search.offset });
  if (search.q) params.set('q', search.q);
  if (search.uni) params.set('uni', search.uni);
  if (search.type) params.set('type', search.type);
  if (search.faculty) params.set('faculty', search.faculty);
  try {
    const body = await api(`/courses?${params}`);
    if (seq !== searchSeq) return; // a newer search has started
    search.total = body.total;
    search.results = append ? [...search.results, ...body.results] : body.results;
    renderSearch();
  } catch (err) {
    $('#s-count').textContent = err.message;
  }
}

function renderSearch() {
  const { total, results, q } = search;
  $('#s-count').textContent = total === 0
    ? `No courses match${q ? ` "${q}"` : ''}. Try a shorter word, like "eng" or "teach".`
    : `${total} ${total === 1 ? 'course' : 'courses'}${q ? ` for "${q}"` : ''}`;
  $('#s-list').replaceChildren(...results.map(searchRow));
  $('#s-more').hidden = results.length >= total;
  $('#s-marks-hint').hidden = Boolean(state.response) || total === 0;
}

async function openSearch() {
  if (search.ready) { renderSearch(); return; }
  search.ready = true;
  $('#s-uni').append(...[...state.universities.values()].map((u) => el('option', { value: u.shortName }, u.name)));
  try { search.facets = await api('/courses/facets'); } catch { search.facets = { faculties: [] }; }
  syncSearchFaculties();

  let t;
  $('#s-q').addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { search.q = $('#s-q').value.trim(); runSearch(); }, 200);
  });
  $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); $('#s-q').blur(); });
  $('#s-uni').addEventListener('change', () => { search.uni = $('#s-uni').value; syncSearchFaculties(); search.faculty = $('#s-faculty').value; runSearch(); });
  $('#s-type').addEventListener('change', () => { search.type = $('#s-type').value; runSearch(); });
  $('#s-faculty').addEventListener('change', () => { search.faculty = $('#s-faculty').value; runSearch(); });
  $('#s-more').addEventListener('click', () => { search.offset = search.results.length; runSearch({ append: true }); });
  await runSearch();
}

/* ------------------------------------------------------------------ */
/* Course page                                                         */
/* ------------------------------------------------------------------ */
const LANG_LEVEL = / (Home Language|First Additional Language)$/;

/** One requirement group in plain words. Long language lists collapse to the group's description. */
function requirementText(g) {
  const opts = g.options;
  const samePct = opts.every((o) => o.minPercent === opts[0].minPercent);
  const n = g.minCount ?? 1;

  if (opts.length > 4 && samePct && opts.every((o) => LANG_LEVEL.test(o.subject))) {
    return { text: `${g.description}: ${opts[0].minPercent}%`, list: opts.map((o) => o.subject) };
  }
  // "English Home Language or First Additional Language 60%"
  if (opts.length === 2 && samePct && n === 1) {
    const [a, b] = opts.map((o) => o.subject);
    const base = (s) => s.replace(LANG_LEVEL, '');
    if (LANG_LEVEL.test(a) && LANG_LEVEL.test(b) && base(a) === base(b)) {
      return { text: `${base(a)} (Home or First Additional Language): ${opts[0].minPercent}%` };
    }
  }
  const parts = opts.map((o) => `${o.subject} ${o.minPercent}%`);
  if (n > 1) return { text: `At least ${n} of: ${parts.join(', ')}` };
  return { text: parts.length > 1 ? `${parts.slice(0, -1).join(', ')} or ${parts.at(-1)}` : parts[0] };
}

function apsFacts(c) {
  const rows = [['With Mathematics', c.minAps]];
  rows.push(['With Maths Literacy', c.minApsMathsLit]);
  rows.push(['With Technical Maths', c.minApsTechMaths]);
  return rows.map(([label, v]) => el('li', {}, el('span', {}, label),
    el('b', { class: v == null ? 'muted' : null }, v == null ? (label.endsWith('Mathematics') ? 'not stated' : 'not accepted') : v)));
}

function courseWorking(r) {
  if (!r?.apsWorking) return null;
  return el('details', {}, el('summary', {}, `How your ${scoreLabel(r.university)} for this course is worked out`),
    el('p', {}, working(r.apsWorking, 'required by this course'),
      '. Required subjects are counted first, then your best other subjects.'));
}

async function improveFor(courseId) {
  const { marks, errors } = readSheet();
  if (errors.length || !Object.keys(marks).length) return null;
  try {
    const body = await api('/improve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marks, courseIds: [courseId] }),
    });
    return body.plans[0] ?? null;
  } catch { return null; }
}

function yourChances(c, r, plan) {
  if (!r) {
    return el('section', { class: 'chances' },
      el('h2', {}, 'Your chances'),
      el('p', {}, 'Enter your marks under ', el('a', { href: '#check' }, 'Check my marks'),
        ' and come back to see if you qualify, and what to improve if you don\'t yet.'));
  }
  const items = [el('div', { class: 'chances-head' }, statusBadge(r.status),
    el('span', { class: 'chances-aps' }, r.requiredAps == null ? `Your ${scoreLabel(c.universityShortName)}: ${r.aps}` : `Your ${scoreLabel(c.universityShortName)}: ${r.aps} of ${r.requiredAps}`))];
  if (r.status === 'close') items.push(gapRulers(r));
  else if (r.reasons.length && r.status !== 'qualifies') items.push(el('ul', { class: 'reasons' }, r.reasons.map((x) => el('li', {}, x))));

  if (plan && r.status !== 'qualifies') {
    items.push(el('div', { class: 'plan' },
      el('h3', {}, plan.reachable ? 'How to get in' : 'What stands in the way'),
      el('p', {}, plan.summary),
      plan.reachable && plan.changes.length
        ? el('ul', { class: 'plan-list' }, plan.changes.map((ch) =>
          el('li', {}, el('b', {}, `${ch.subject}`), ` ${ch.from}% to ${ch.to}%`,
            el('span', { class: 'muted' }, ` (${ch.reasons.join(', ')})`))))
        : null));
  }
  const w = courseWorking(r);
  if (w) items.push(w);
  return el('section', { class: `chances ${r.status}` }, el('h2', {}, 'Your chances'), items);
}

async function openCourse(id) {
  const box = $('#course-detail');
  box.replaceChildren(el('p', { class: 'muted' }, 'Loading course...'));
  let c;
  try { c = await api(`/courses/${id}`); } catch (err) {
    box.replaceChildren(el('p', {}, 'This course could not be found. '), el('a', { href: '#search' }, 'Search courses'));
    return;
  }
  if (currentView() !== 'course') return;
  document.title = `${c.name} | SAMATRIC`;
  const r = resultFor(c.courseId);
  const plan = r && r.status !== 'qualifies' ? await improveFor(c.courseId) : null;
  const info = applyInfo(c.universityShortName, c.applicationsClose);

  box.replaceChildren(
    el('a', { class: 'back', href: '#search' }, 'Back to search'),
    el('div', { class: 'detail-title' }, el('h1', {}, c.name), saveButton(c.courseId, c.name)),
    el('p', { class: 'detail-meta' }, [c.universityName, c.faculty].filter(Boolean).join(', ')),
    el('p', { class: 'detail-qual' }, qualText(c)),

    yourChances(c, r, plan),

    el('section', {},
      el('h2', {}, `${scoreLabel(c.universityShortName)} needed`),
      el('ul', { class: 'facts' }, apsFacts(c)),
      c.apsRule ? el('p', { class: 'muted small' },
        `${c.universityShortName} counts your best ${c.apsRule.subjectsCounted} subjects`,
        c.apsRule.includeLo || c.includeLo ? ', including Life Orientation' : ', not counting Life Orientation',
        c.apsRule.mustCount?.length ? `. ${c.apsRule.mustCount.map((slot) => slot.map((x) => x.replace(LANG_LEVEL, '')).filter((x, i, a) => a.indexOf(x) === i).join(' or ')).join(', ')} always counts` : '',
        '.') : null),

    el('section', {},
      el('h2', {}, 'Subjects needed'),
      c.requirements.length
        ? el('ul', { class: 'req-list' }, c.requirements.map((g) => {
          const { text, list } = requirementText(g);
          return el('li', {}, text, list ? el('details', {}, el('summary', {}, 'Show the list'), el('p', {}, list.join(', '))) : null);
        }))
        : el('p', { class: 'muted' }, 'The prospectus lists no specific subjects.'),
      c.nscPassRequired ? el('p', { class: 'muted small' },
        `You also need a ${{ bachelor: 'Bachelor', diploma: 'Diploma', higher_certificate: 'Higher Certificate' }[c.nscPassRequired]} pass in matric.`) : null),

    c.notes ? el('section', {}, el('h2', {}, 'Notes from the prospectus'), el('p', {}, c.notes)) : null,

    el('section', { class: 'apply-box' },
      el('h2', {}, `Apply to ${c.universityShortName}`),
      el('p', {}, `${info.text}.`.replace('..', '.')),
      c.applicationUrl ? el('a', { class: info.closed ? 'btn-secondary' : 'btn-apply', href: c.applicationUrl, target: '_blank', rel: 'noopener' }, info.button) : null),

    el('p', { class: 'muted small source' },
      `Source: ${c.universityShortName} undergraduate prospectus ${state.intakeYear ?? ''}${c.sourceRef ? `, ${c.sourceRef.replace(/^Prospectus \d{4} /, '')}` : ''}. Always confirm with the university before applying.`),
  );
  box.querySelector('h1').setAttribute('tabindex', '-1');
  box.querySelector('h1').focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ */
/* Saved courses ("My courses")                                        */
/* ------------------------------------------------------------------ */
function loadSaved() {
  try {
    const ids = JSON.parse(localStorage.getItem(SAVED_KEY));
    return Array.isArray(ids) ? ids.filter(Number.isInteger).slice(0, MAX_SAVED) : [];
  } catch { return []; }
}
let saved = [];

function storeSaved() {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved)); } catch { /* storage blocked */ }
  for (const b of document.querySelectorAll('.save-btn')) syncSaveButton(b);
  const n = saved.length;
  const badge = $('#saved-count');
  badge.textContent = n;
  badge.hidden = n === 0;
}

const isSaved = (id) => saved.includes(id);

function syncSaveButton(btn) {
  const on = isSaved(Number(btn.dataset.id));
  btn.setAttribute('aria-pressed', String(on));
  btn.querySelector('.save-label').textContent = on ? 'Saved' : 'Save';
}

function toggleSaved(id) {
  if (isSaved(id)) saved = saved.filter((x) => x !== id);
  else if (saved.length >= MAX_SAVED) { alert(`You can save up to ${MAX_SAVED} courses. Remove one first.`); return; }
  else saved = [...saved, id];
  storeSaved();
  if (currentView() === 'improve') renderImprove();
}

function saveButton(courseId, name) {
  const btn = el('button', { type: 'button', class: 'save-btn', 'data-id': courseId, 'aria-label': `Save ${name}` },
    svgStar(), el('span', { class: 'save-label' }, 'Save'));
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleSaved(courseId); });
  syncSaveButton(btn);
  return btn;
}

function svgStar() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z');
  svg.append(path);
  return svg;
}

/* ------------------------------------------------------------------ */
/* Improve                                                             */
/* ------------------------------------------------------------------ */
/**
 * One plan that gets the learner into every saved course they can reach: for each subject,
 * the highest mark any single course needs. Raising a mark never lowers an APS, so meeting
 * the highest target meets all of them.
 */
function combinedPlan(plans) {
  const bySubject = new Map();
  for (const p of plans) {
    if (!p.reachable) continue;
    for (const ch of p.changes) {
      const cur = bySubject.get(ch.subject) ?? { subject: ch.subject, from: ch.from, to: ch.from, courses: [] };
      cur.to = Math.max(cur.to, ch.to);
      cur.courses.push(p.name);
      bySubject.set(ch.subject, cur);
    }
  }
  return [...bySubject.values()]
    .map((x) => ({ ...x, increase: x.to - x.from }))
    .sort((a, b) => b.courses.length - a.courses.length || a.increase - b.increase);
}

let improveSeq = 0;
async function renderImprove() {
  const box = $('#improve-body');
  const seq = ++improveSeq;
  if (!saved.length) {
    box.replaceChildren(el('div', { class: 'empty-state' },
      el('p', {}, el('strong', {}, 'No saved courses yet.')),
      el('p', { class: 'muted' }, 'Open any course and tap Save. Saved courses show up here with what to improve for each one.'),
      el('a', { class: 'btn-secondary', href: '#search' }, 'Search courses')));
    return;
  }

  const { marks, errors } = readSheet();
  const hasMarks = !errors.length && Object.keys(marks).length > 0;
  let plans = null;
  let courses = null;
  try {
    if (hasMarks) {
      plans = (await api('/improve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks, courseIds: saved }),
      })).plans;
    } else {
      courses = await Promise.all(saved.map((id) => api(`/courses/${id}`).catch(() => null)));
    }
  } catch (err) {
    box.replaceChildren(el('p', { class: 'form-errors' }, err.message));
    return;
  }
  if (seq !== improveSeq) return;

  if (!hasMarks) {
    box.replaceChildren(
      el('p', { class: 's-hint' }, 'Enter your marks under ', el('a', { href: '#check' }, 'Check my marks'),
        ' to see what to improve for each course.'),
      el('h2', { class: 'block-title' }, `My courses (${saved.length})`),
      el('ol', { class: 'my-courses' }, courses.filter(Boolean).map((c) => el('li', { class: 'my-course' },
        el('div', { class: 'my-course-head' },
          el('h3', {}, el('a', { href: `#course/${c.courseId}` }, c.name)),
          saveButton(c.courseId, c.name)),
        el('p', { class: 'meta' }, `${c.universityName}. ${apsNeededText(c)}`)))));
    return;
  }

  const unis = state.universities;
  const reachable = plans.filter((p) => p.reachable && p.changes.length);
  const already = plans.filter((p) => p.status === 'qualifies');
  const focus = combinedPlan(plans);

  const summary = el('section', { class: 'focus' },
    el('h2', {}, 'Your focus'),
    el('p', { class: 'focus-tally' },
      el('span', { class: 'n-yes' }, `${already.length} of ${plans.length}`), ' saved courses you already qualify for',
      reachable.length ? [', ', el('span', { class: 'n-close' }, `${reachable.length}`), ' you can reach with better marks'] : null,
      '.'),
    focus.length
      ? [
        el('p', {}, 'Raise these marks to get into every saved course you can reach:'),
        el('ol', { class: 'focus-list' }, focus.map((f) => el('li', {},
          el('div', { class: 'focus-row' },
            el('span', { class: 'focus-subject' }, f.subject),
            el('span', { class: 'focus-marks' }, `${f.from}% to ${f.to}%`, el('b', {}, ` +${f.increase}%`))),
          el('div', { class: 'focus-why muted' },
            f.courses.length === 1 ? `Helps with ${f.courses[0]}` : `Helps with ${f.courses.length} of your courses`),
          ruler(f.from, f.to, 100)))),
      ]
      : el('p', { class: 'muted' }, already.length === plans.length
        ? 'You qualify for all your saved courses. Apply before the closing dates.'
        : 'None of your other saved courses can be reached by raising marks alone. See each course below.'));

  const list = el('ol', { class: 'my-courses' }, plans.map((p) => {
    const uni = unis.get(p.university);
    return el('li', { class: `my-course ${p.status}` },
      el('div', { class: 'my-course-head' },
        el('h3', {}, el('a', { href: `#course/${p.courseId}` }, p.name)),
        saveButton(p.courseId, p.name)),
      el('p', { class: 'meta' }, statusBadge(p.status), ` ${uni?.name ?? p.university}. `,
        p.requiredAps == null ? `Your ${scoreLabel(p.university)} ${p.currentAps}` : `Your ${scoreLabel(p.university)} ${p.currentAps}, needs ${p.requiredAps}`),
      el('p', { class: 'my-course-plan' }, p.summary),
      p.reachable && p.changes.length
        ? el('ul', { class: 'plan-list' }, p.changes.map((ch) =>
          el('li', {}, el('b', {}, ch.subject), ` ${ch.from}% to ${ch.to}%`)))
        : null);
  }));

  box.replaceChildren(summary, el('h2', { class: 'block-title' }, `My courses (${saved.length})`), list);
}

/* ------------------------------------------------------------------ */
/* Hub navigation and theme                                            */
/* ------------------------------------------------------------------ */
function currentView() {
  const name = location.hash.replace('#', '').split('/')[0];
  return VIEWS.includes(name) ? name : 'check';
}

function showView() {
  const name = currentView();
  const navName = name === 'course' ? 'search' : name;
  for (const v of document.querySelectorAll('.view')) v.hidden = v.dataset.view !== name;
  for (const a of document.querySelectorAll('.hub-nav a')) {
    if (a.dataset.view === navName) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = { check: 'Check my marks', search: 'Search courses', improve: 'Improve', course: 'Course' }[name] + ' | SAMATRIC';
  if (!state.ready) return;
  if (name === 'search') openSearch();
  if (name === 'course') openCourse(Number(location.hash.split('/')[1]));
  if (name === 'improve') renderImprove();
}

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  $('#theme-toggle').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* storage blocked */ }
  applyTheme(saved);
  $('#theme-toggle').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked */ }
    applyTheme(next);
  });
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */
async function init() {
  initTheme();
  saved = loadSaved();
  storeSaved();
  showView();
  window.addEventListener('hashchange', () => { showView(); window.scrollTo(0, 0); });

  try {
    const [subjects, health] = await Promise.all([api('/subjects'), api('/health'), loadUniversities()]);
    state.intakeYear = health.intakeYear;
    state.applyingFor = health.applyingFor ?? health.intakeYear;
    showProvisionalNotice();
    state.subjects = subjects;
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

  state.ready = true;
  if (ready) await check();
  showView();
}

init();
