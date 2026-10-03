/** Kas Kelas - Google Apps Script API
 *  Membaca & menulis ke sheet: "Semester 1 (Agt-Des)", "Semester 2 (Jan-Jun)", "Pengeluaran Kas"
 *  Semua total dihitung ULANG di server dari data mentah (bukan dari rumus di sheet). */
const SPREADSHEET_ID = '1MF6eRasDHeRxZa-0rOzQ9R3qUvOnB2Sq'; // ganti jika spreadsheet kamu berbeda
const CLASS_NAME = 'X.I';
const YEAR = '2026/2027';
const FEE = 30000; // iuran per siswa per bulan
const TZ = 'Asia/Jakarta';
const EXPENSE_SHEET = 'Pengeluaran Kas';
const SEMESTERS = {
  1: { sheet: 'Semester 1 (Agt-Des)', months: ['Agustus', 'September', 'Oktober', 'November', 'Desember'] },
  2: { sheet: 'Semester 2 (Jan-Jun)', months: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'] }
};
// Sel tanggal di sheet pengeluaran yang terbaca sebagai tanggal Excel/US (mm/dd) tertukar hari-bulan,
// mis. 12/08/2026 terbaca 8 Des. Set false jika tanggal di sheet kamu sudah benar.
const FIX_SWAPPED_DATES = true;

function doGet() {
  try { return formatResponse(buildDashboard()); }
  catch (err) { console.error(err); return formatResponse({ success: false, message: 'Terjadi kesalahan pada server.' }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    let body;
    try { body = JSON.parse(e.postData.contents); } catch (x) { return formatResponse({ success: false, message: 'Format data tidak valid.' }); }
    const r = body && body.action === 'payment' ? addPayment(body) : body && body.action === 'expense' ? addExpense(body) : { ok: false, message: 'Aksi tidak dikenal.' };
    if (!r.ok) return formatResponse({ success: false, message: r.message });
    const res = buildDashboard(); res.message = r.message;
    return formatResponse(res);
  } catch (err) {
    console.error(err);
    return formatResponse({ success: false, message: 'Terjadi kesalahan pada server.' });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

function getSheet(name) {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sh) throw new Error('Sheet tidak ditemukan: ' + name);
  return sh;
}
function toNum(v) { const n = Number(v); return v !== '' && isFinite(n) ? n : 0; }
function p2(n) { return ('0' + n).slice(-2); }

function parseDate(v) {
  let m;
  if (v instanceof Date) {
    m = Utilities.formatDate(v, TZ, 'yyyy-MM-dd').split('-').map(Number);
    return FIX_SWAPPED_DATES && m[2] <= 12 ? m[0] + '-' + p2(m[2]) + '-' + p2(m[1]) : m.map((x, i) => i ? p2(x) : x).join('-');
  }
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return m ? m[3] + '-' + p2(m[2]) + '-' + p2(m[1]) : '';
}

// ---------- BACA DATA ----------
function getSemester(no) {
  const cfg = SEMESTERS[no], n = cfg.months.length, sh = getSheet(cfg.sheet), last = sh.getLastRow();
  const students = [];
  if (last >= 5) sh.getRange(5, 1, last - 4, 3 + n).getValues().forEach(r => {
    if (typeof r[0] !== 'number' || !String(r[2]).trim()) return;
    const payments = r.slice(3, 3 + n).map(toNum), total = payments.reduce((a, b) => a + b, 0), target = FEE * n;
    students.push({ no: r[0], name: String(r[2]).trim(), payments: payments, total: total, target: target, status: total >= target ? 'LUNAS' : 'BELUM LUNAS' });
  });
  const totals = cfg.months.map((_, i) => students.reduce((a, s) => a + s.payments[i], 0));
  return { name: 'Semester ' + no, months: cfg.months, students: students, totals: totals,
    monthTarget: FEE * students.length, total: totals.reduce((a, b) => a + b, 0), target: FEE * students.length * n };
}

function getExpenses() {
  const sh = getSheet(EXPENSE_SHEET), last = sh.getLastRow();
  if (last < 4) return [];
  return sh.getRange(4, 1, last - 3, 6).getValues()
    .filter(r => typeof r[0] === 'number' && toNum(r[4]) > 0)
    .map(r => ({ no: r[0], date: parseDate(r[1]), description: String(r[2]).trim(), category: String(r[3] || '').trim() || 'Lainnya', amount: toNum(r[4]), person: String(r[5] || '').trim() }));
}

function calculateSummary(sems, expenses) {
  const target = sems[1].target + sems[2].target, collected = sems[1].total + sems[2].total;
  const expense = expenses.reduce((a, e) => a + e.amount, 0);
  return { target: target, collected: collected, expense: expense, balance: calculateBalance(collected, expense),
    percent: target ? collected / target : 0, expenseCount: expenses.length };
}
function calculateBalance(collected, expense) { return collected - expense; }

function buildDashboard() {
  const sems = { 1: getSemester(1), 2: getSemester(2) }, expenses = getExpenses();
  const months = [];
  [1, 2].forEach(k => sems[k].months.forEach((m, i) => months.push({ name: m, semester: k, target: sems[k].monthTarget, collected: sems[k].totals[i] })));
  return { success: true, meta: { className: CLASS_NAME, year: YEAR, fee: FEE, students: sems[1].students.length },
    summary: calculateSummary(sems, expenses), months: months, semesters: sems, expenses: expenses,
    lastUpdate: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX") };
}

// ---------- TULIS DATA ----------
function validateDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim()); if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
}
function validAmount(a) { return a !== '' && a !== null && a !== undefined && isFinite(Number(a)) && Number(a) > 0 && Number(a) <= 1e10; }
function safeText(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }

function addPayment(d) {
  const cfg = SEMESTERS[d.semester];
  if (!cfg) return { ok: false, message: 'Semester tidak valid.' };
  const mi = cfg.months.indexOf(d.month);
  if (mi < 0) return { ok: false, message: 'Bulan tidak valid.' };
  if (!validAmount(d.amount)) return { ok: false, message: 'Nominal harus lebih dari 0.' };
  const amount = Math.round(Number(d.amount)), sh = getSheet(cfg.sheet), last = sh.getLastRow();
  const nos = last >= 5 ? sh.getRange(5, 1, last - 4, 1).getValues() : [];
  const idx = nos.findIndex(r => typeof r[0] === 'number' && r[0] === Number(d.studentNo));
  if (idx < 0) return { ok: false, message: 'Siswa tidak ditemukan.' };
  const cell = sh.getRange(5 + idx, 4 + mi), now = toNum(cell.getValue());
  if (now + amount > FEE) return { ok: false, message: 'Melebihi iuran bulanan. Sisa yang perlu dibayar Rp ' + (FEE - now) + '.' };
  cell.setValue(now + amount);
  SpreadsheetApp.flush();
  return { ok: true, message: 'Pembayaran berhasil dicatat.' };
}

function addExpense(d) {
  const desc = String(d.description || '').trim(), cat = String(d.category || '').trim() || 'Lainnya', person = String(d.person || '').trim();
  if (!validateDate(d.date)) return { ok: false, message: 'Tanggal tidak valid.' };
  if (!desc) return { ok: false, message: 'Keterangan wajib diisi.' };
  if (desc.length > 200 || cat.length > 50 || person.length > 50) return { ok: false, message: 'Teks terlalu panjang.' };
  if (!validAmount(d.amount)) return { ok: false, message: 'Nominal harus lebih dari 0.' };
  const sh = getSheet(EXPENSE_SHEET), last = Math.max(sh.getLastRow(), 3);
  const nos = sh.getRange(1, 1, last, 1).getValues();
  let lastData = 3, no = 0;
  nos.forEach((r, i) => { if (i >= 3 && typeof r[0] === 'number') { lastData = i + 1; no = r[0]; } });
  sh.insertRowAfter(lastData); // sisipkan di bawah data terakhir, baris TOTAL tetap di bawah
  const row = lastData + 1;
  sh.getRange(row, 2).setNumberFormat('@');
  sh.getRange(row, 1, 1, 6).setValues([[no + 1, String(d.date).trim(), safeText(desc), safeText(cat), Math.round(Number(d.amount)), safeText(person)]]);
  SpreadsheetApp.flush();
  return { ok: true, message: 'Pengeluaran berhasil ditambahkan.' };
}

function formatResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
