// Daily team report - step 2 of 3: turns team-report-data.pl's JSON into one
// Excel workbook per team, plus the email (subject, HTML, text) that carries it.
//
//   node ops/reports/build-team-report.cjs <data.json> <out dir>
//
// Writes <out dir>/<file>.xlsx per team and <out dir>/manifest.json, which
// step 3 (send-team-reports.pl) reads to send each workbook to its leader.
//
// Each workbook has three sheets:
//   Summary        one row per member: the day's figures and what is pending
//   Work Done      every action of the period, member by member, with product and status
//   Pending Bugs   developers: open bugs assigned to them
//   / Re-test      testers: their bugs fixed and waiting for re-test
'use strict';
const fs = require('fs');
const path = require('path');
const ExcelJS = require(path.join(__dirname, '../../backend/node_modules/exceljs'));

const [, , dataFile, outDir] = process.argv;
if (!dataFile || !outDir) {
  console.error('Usage: node build-team-report.cjs <data.json> <out dir>');
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

// The app's palette (backend/src/lib/bugExport.ts).
const BRAND = 'FF0D6875';
const BRAND_PALE = 'FFE6F3F4';
const ZEBRA = 'FFF8FAFC';
const MUTED = 'FF64748B';
const BORDER = 'FFE2E8F0';
const SEVERITY_FILL = { Critical: 'FFFFE4E6', Major: 'FFFFEDD5', Minor: 'FFFEF3C7', Trivial: 'FFF1F5F9' };
const SEVERITY = { blocker: 'Critical', critical: 'Critical', major: 'Major', normal: 'Minor', minor: 'Minor', trivial: 'Trivial', enhancement: 'Enhancement' };
const PRIORITY = { Highest: 'P0', High: 'P1', Normal: 'P2', Low: 'P3', Lowest: 'P3', '---': '-' };

const severityOf = (b) => (b.severity === 'minor' && /^Low(est)?$/.test(b.priority) ? 'Trivial' : SEVERITY[b.severity] || b.severity);
const priorityOf = (b) => PRIORITY[b.priority] || b.priority;
const statusOf = (b) => (b.resolution ? `${b.status} (${b.resolution})` : b.status);
// The title without its leading tracker tags ([KP-1A2B3C], [MT-123], [KPV2-...]), cut to a readable length.
const titleOf = (b) => {
  const t = b.title.replace(/^(\s*\[[A-Z0-9]+-[^\]]*\])+\s*/, '');
  return t.length > 110 ? t.slice(0, 107).replace(/\s+\S*$/, '') + '...' : t;
};
const isTop = (b) => /^(blocker|critical)$/.test(b.severity) || b.priority === 'Highest';
const day = (s) => s.slice(0, 10);
const daysBetween = (from, to) => Math.max(0, Math.round((Date.parse(day(to)) - Date.parse(day(from))) / 86400000));
// The period: one day, or several (Monday's report covers Saturday and Sunday).
const start = data.start || data.date;
const end = data.end || data.date;
const multiDay = start !== end;
const fmt = (d, o) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', o);
const longDate = multiDay
  ? `${fmt(start, { weekday: 'long' })} ${fmt(start, { day: 'numeric', month: 'long' })} to ${fmt(end, { weekday: 'long' })} ${fmt(end, { day: 'numeric', month: 'long', year: 'numeric' })}`
  : `${fmt(end, { weekday: 'long' })} ${fmt(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
const shortDate = multiDay
  ? `${fmt(start, { day: 'numeric', month: 'short' })} - ${fmt(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
  : fmt(end, { day: 'numeric', month: 'short', year: 'numeric' });
const periodWord = multiDay ? (new Date(`${start}T00:00:00`).getDay() === 6 ? 'over the weekend' : 'in this period') : 'yesterday';
const fileDate = multiDay ? `${start} to ${end}` : end;
const bugUrl = (id) => `${data.app_url}/bugs/${id}`;
const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- styling helpers
const thin = { style: 'thin', color: { argb: BORDER } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

function title(ws, text, sub, width) {
  ws.mergeCells(1, 1, 1, width);
  const t = ws.getCell(1, 1);
  t.value = text;
  t.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  t.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, width);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { size: 10, color: { argb: MUTED } };
  s.alignment = { indent: 1 };
}

function header(ws, rowNo, labels) {
  const row = ws.getRow(rowNo);
  labels.forEach((label, i) => {
    const c = row.getCell(i + 1);
    c.value = label;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = box;
  });
  row.height = 32;
}

function bodyRow(ws, rowNo, values, { zebra, numeric = [] } = {}) {
  const row = ws.getRow(rowNo);
  values.forEach((v, i) => {
    const c = row.getCell(i + 1);
    c.value = v;
    c.border = box;
    c.alignment = { vertical: 'top', wrapText: true, horizontal: numeric.includes(i) ? 'center' : 'left' };
    if (zebra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
  });
  return row;
}

function link(cell, id) {
  cell.value = { text: `#${id}`, hyperlink: bugUrl(id), tooltip: 'Open in the Bug Tracker' };
  cell.font = { color: { argb: BRAND }, underline: true };
}

function severityCell(cell, bug) {
  const sev = severityOf(bug);
  cell.value = sev;
  if (SEVERITY_FILL[sev]) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SEVERITY_FILL[sev] } };
}

function emptyNote(ws, rowNo, width, text) {
  ws.mergeCells(rowNo, 1, rowNo, width);
  const c = ws.getCell(rowNo, 1);
  c.value = text;
  c.font = { italic: true, color: { argb: MUTED } };
  c.alignment = { indent: 1 };
}

// ---------------------------------------------------------------- per team
const isTester = (t) => t.kind === 'tester';

function summaryColumns(t) {
  return isTester(t)
    ? [
        ['Member', 24], ['Email', 30], ['Bugs worked on', 12], ['Bugs filed', 11], ['Closed (verified)', 12],
        ['Reopened', 11], ['Comments', 11], ['Waiting for re-test', 13], ['Their open bugs', 12], ['Activity', 16],
      ]
    : [
        ['Member', 24], ['Email', 30], ['Bugs worked on', 12], ['Fixed / sent for review', 14], ['Came back reopened', 13],
        ['Comments', 11], ['Pending (open, assigned)', 14], ['Top priority pending', 13], ['Oldest pending (days)', 13], ['Activity', 16],
      ];
}

function summaryValues(t, m) {
  const activity = m.worked ? 'Active' : 'No activity';
  if (isTester(t)) return [m.name, m.email, m.worked, m.filed, m.closed, m.reopened, m.comments, m.retest.length, m.open_reported, activity];
  const oldest = m.pending.length ? Math.max(...m.pending.map((id) => daysBetween(data.bugs[id].created, end))) : 0;
  return [m.name, m.email, m.worked, m.fixed, m.reopened, m.comments, m.pending.length, m.top_priority, oldest, activity];
}

function buildSummary(wb, t) {
  const ws = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 7 }], properties: { tabColor: { argb: BRAND } } });
  const cols = summaryColumns(t);
  cols.forEach(([, w], i) => (ws.getColumn(i + 1).width = w));
  title(ws, `${t.name} - ${multiDay ? 'Weekend' : 'Daily'} Team Report`, `${longDate}   |   Team leader: ${t.leader ? t.leader.name : '-'}   |   ${t.members.length} members   |   Generated ${data.generated}`, cols.length);

  // Team totals, as tiles.
  const totals = t.members.map((m) => summaryValues(t, m));
  const sum = (i) => totals.reduce((n, r) => n + (Number(r[i]) || 0), 0);
  const tiles = isTester(t)
    ? [['Bugs worked on', sum(2)], ['Bugs filed', sum(3)], ['Closed (verified)', sum(4)], ['Reopened', sum(5)], ['Waiting for re-test', sum(7)]]
    : [['Bugs worked on', sum(2)], ['Fixed / for review', sum(3)], ['Came back reopened', sum(4)], ['Pending', sum(6)], ['Top priority pending', sum(7)]];
  tiles.forEach(([label, value], i) => {
    const col = i * 2 + 1;
    ws.mergeCells(4, col, 4, col + 1);
    ws.mergeCells(5, col, 5, col + 1);
    const l = ws.getCell(4, col);
    const v = ws.getCell(5, col);
    l.value = label;
    l.font = { size: 9, color: { argb: MUTED } };
    v.value = value;
    v.font = { bold: true, size: 18, color: { argb: BRAND } };
    for (const c of [l, v]) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PALE } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  });
  ws.getRow(5).height = 28;

  header(ws, 7, cols.map(([label]) => label));
  totals.forEach((values, i) => {
    const row = bodyRow(ws, 8 + i, values, { zebra: i % 2 === 1, numeric: [2, 3, 4, 5, 6, 7, 8] });
    const act = row.getCell(cols.length);
    act.font = values[2] ? { bold: true, color: { argb: 'FF047857' } } : { color: { argb: MUTED } };
  });
  const totalRow = bodyRow(ws, 8 + totals.length, ['Team total', '', ...cols.slice(2, -1).map((_, i) => (isTester(t) || i !== 6 ? sum(i + 2) : '')), ''], { numeric: [2, 3, 4, 5, 6, 7, 8] });
  totalRow.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PALE } };
  });
  if (!t.members.length) emptyNote(ws, 8, cols.length, 'This team has no members yet.');

  const notes = isTester(t)
    ? [
        'Bugs worked on: different bugs the member filed, changed or commented on that day.',
        'Closed (verified): bugs they re-tested and moved to CLOSED. Reopened: bugs they sent back to the developer.',
        'Waiting for re-test: bugs they reported that are RESOLVED and need their check. Their open bugs: bugs they reported that are still open.',
      ]
    : [
        'Bugs worked on: different bugs the member changed or commented on that day.',
        'Fixed / sent for review: bugs they moved to RESOLVED or IN_REVIEW. Came back reopened: their bugs a tester reopened that day.',
        'Pending: open bugs assigned to them now. Top priority: Critical severity or P0 priority. Oldest pending: days since the oldest of those was filed.',
      ];
  notes.map((n) => (multiDay ? n.replace(/that day/g, 'in this period') : n)).forEach((n, i) => {
    const r = 10 + t.members.length + i;
    ws.mergeCells(r, 1, r, cols.length);
    const c = ws.getCell(r, 1);
    c.value = n;
    c.font = { size: 9, italic: true, color: { argb: MUTED } };
  });
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function buildWork(wb, t) {
  const ws = wb.addWorksheet('Work Done', { views: [{ state: 'frozen', ySplit: 3 }] });
  const cols = [['Member', 20], [multiDay ? 'When' : 'Time', multiDay ? 13 : 8], ['Bug', 9], ['Title', 46], ['Product', 26], ['Component', 20], ['What they did', 52], ['Status now', 16], ['Severity', 11], ['Priority', 9]];
  cols.forEach(([, w], i) => (ws.getColumn(i + 1).width = w));
  title(ws, `${t.name} - what each member did`, `${longDate}. Every bug a member filed, changed or commented on, in time order. Click a bug number to open it.`, cols.length);
  header(ws, 3, cols.map(([l]) => l));
  let r = 4;
  let shade = false;
  for (const m of t.members) {
    if (!m.events.length) continue;
    shade = !shade;
    for (const e of m.events) {
      const b = data.bugs[e.bug];
      const row = bodyRow(ws, r, [m.name, multiDay ? `${fmt(e.time.slice(0, 10), { weekday: 'short' })} ${e.time.slice(11, 16)}` : e.time.slice(11, 16), '', titleOf(b), b.product, b.component, e.action, statusOf(b), '', priorityOf(b)], { zebra: shade, numeric: [1, 2, 9] });
      link(row.getCell(3), b.id);
      severityCell(row.getCell(9), b);
      row.getCell(1).font = { bold: true };
      r++;
    }
  }
  if (r === 4) emptyNote(ws, 4, cols.length, multiDay ? 'No activity was recorded for this team in this period.' : 'No activity was recorded for this team on this day.');
  else ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: r - 1, column: cols.length } };
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function buildPending(wb, t) {
  const tester = isTester(t);
  const ws = wb.addWorksheet(tester ? 'Waiting for Re-test' : 'Pending Bugs', { views: [{ state: 'frozen', ySplit: 3 }] });
  const cols = tester
    ? [['Member', 20], ['Bug', 9], ['Title', 50], ['Product', 22], ['Component', 18], ['Fixed by', 20], ['Waiting (days)', 10], ['Severity', 11], ['Priority', 9]]
    : [['Member', 20], ['Bug', 9], ['Title', 50], ['Product', 22], ['Component', 18], ['Status', 16], ['Age (days)', 9], ['Severity', 11], ['Priority', 9], ['Last updated', 12]];
  cols.forEach(([, w], i) => (ws.getColumn(i + 1).width = w));
  title(
    ws,
    tester ? `${t.name} - bugs waiting for re-test` : `${t.name} - pending bugs`,
    tester
      ? `As of ${data.generated}. Bugs each member reported that developers have fixed (RESOLVED) - oldest first.`
      : `As of ${data.generated}. Open bugs assigned to each member - top priority first, then oldest.`,
    cols.length
  );
  header(ws, 3, cols.map(([l]) => l));
  let r = 4;
  let shade = false;
  for (const m of t.members) {
    const ids = tester ? m.retest : m.pending;
    if (!ids.length) continue;
    shade = !shade;
    const bugs = ids.map((id) => data.bugs[id]).filter(Boolean);
    if (!tester) bugs.sort((a, b) => Number(isTop(b)) - Number(isTop(a)) || a.created.localeCompare(b.created));
    for (const b of bugs) {
      const values = tester
        ? [m.name, '', titleOf(b), b.product, b.component, b.assignee, daysBetween(b.changed, end), '', priorityOf(b)]
        : [m.name, '', titleOf(b), b.product, b.component, b.status, daysBetween(b.created, end), '', priorityOf(b), day(b.changed)];
      const row = bodyRow(ws, r, values, { zebra: shade, numeric: tester ? [1, 6, 8] : [1, 6, 8, 9] });
      link(row.getCell(2), b.id);
      severityCell(row.getCell(8), b);
      row.getCell(1).font = { bold: true };
      if (!tester && isTop(b)) row.getCell(3).font = { bold: true, color: { argb: 'FFBE123C' } };
      r++;
    }
  }
  if (r === 4) emptyNote(ws, 4, cols.length, tester ? 'Nothing is waiting for re-test.' : 'No open bugs are assigned to this team.');
  else ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: r - 1, column: cols.length } };
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

// ---------------------------------------------------------------- email body
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function email(t, file) {
  const cols = summaryColumns(t);
  const pick = isTester(t) ? [0, 2, 3, 4, 5, 7] : [0, 2, 3, 4, 6, 7];
  const rows = t.members.map((m) => summaryValues(t, m));
  const first = t.leader ? t.leader.name.split(/\s+/)[0] : 'Team leader';
  const th = pick.map((i) => `<th style="padding:6px 10px;background:#0d6875;color:#fff;font-size:12px;text-align:${i ? 'center' : 'left'};">${esc(cols[i][0])}</th>`).join('');
  const trs = rows
    .map((r, n) => `<tr style="background:${n % 2 ? '#f8fafc' : '#fff'};">${pick
      .map((i) => `<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:${i ? 'center' : 'left'};color:${!i && !r[2] ? '#94a3b8' : '#0f172a'};">${esc(r[i])}</td>`)
      .join('')}</tr>`)
    .join('');
  const html = `<html><body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:20px 12px;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:12px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
<tr><td style="padding:20px 22px 6px 22px;">
<div style="font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#0d6875;">${multiDay ? 'Weekend' : 'Daily'} team report</div>
<div style="font-size:20px;font-weight:700;margin-top:6px;">${esc(t.name)}</div>
<div style="font-size:13px;color:#64748b;margin-top:2px;">${esc(longDate)}</div>
</td></tr>
<tr><td style="padding:10px 22px 0 22px;font-size:14px;">Hi ${esc(first)}, here is what your team did ${periodWord}.</td></tr>
<tr><td style="padding:12px 22px 0 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${th}</tr>${trs || `<tr><td style="padding:8px;color:#64748b;">No members yet.</td></tr>`}</table>
</td></tr>
<tr><td style="padding:14px 22px 22px 22px;font-size:13px;color:#334155;">The attached Excel file has the full details: <b>Summary</b>, <b>Work Done</b> (every bug, product and status) and <b>${isTester(t) ? 'Waiting for Re-test' : 'Pending Bugs'}</b>.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `${multiDay ? 'Weekend' : 'Daily'} team report: ${t.name}`,
    longDate,
    '',
    `Hi ${first}, here is what your team did ${periodWord}.`,
    '',
    ...rows.map((r) => `  ${r[0]}: ${pick.slice(1).map((i) => `${cols[i][0]} ${r[i]}`).join(', ')}`),
    '',
    `Full details are in the attached Excel file: ${file}`,
  ].join('\n');
  return { html, text };
}

// ---------------------------------------------------------------- build all
(async () => {
  const manifest = [];
  for (const t of data.teams) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bug Tracker';
    wb.created = new Date();
    buildSummary(wb, t);
    buildWork(wb, t);
    buildPending(wb, t);
    const file = `Team report - ${safeName(t.name)} - ${fileDate}.xlsx`;
    await wb.xlsx.writeFile(path.join(outDir, file));
    const { html, text } = email(t, file);
    manifest.push({ team: t.name, leader: t.leader, subject: `${multiDay ? 'Weekend' : 'Daily'} team report - ${t.name} - ${shortDate}`, file, html, text });
    console.log(`built ${file}`);
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ date: data.date, reports: manifest }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
