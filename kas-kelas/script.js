// ================= KONFIGURASI =================
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbxJoYSTSB8Esfed6dZr25afVLKzh1ypP8vsQnPhA3079BaDzW-bea633uZI1MwZ9y8/exec",
  REFRESH_INTERVAL: 10000,
  TIMEOUT: 25000,
  RECENT_COUNT: 6
};

const state = { data: null, sig: "", loading: false, busy: false, first: true, sem: 1, chart: null, timer: null,
  fs: { q: "", status: "all" }, fe: { q: "", cat: "all" } };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

// ================= FORMAT =================
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
function formatCurrency(n) { return rupiah.format(Number(n) || 0).replace(/\u00A0/g, " "); }
function formatDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? m[3] + " " + MONTHS[+m[2] - 1] + " " + m[1] : "-";
}
const short = (n) => (n >= 1000 ? String(n / 1000).replace(".", ",") + "rb" : String(n));
const clock = (d) => [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
const todayYMD = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const pct = (v) => Math.round((v || 0) * 100) + "%";

// ================= UI =================
function showToast(msg, type = "info") {
  const icons = { success: "circle-check", error: "circle-xmark", info: "circle-info" };
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.innerHTML = `<i class="fa-solid fa-${icons[type]}"></i><span>${esc(msg)}</span>`;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 3500);
}
function showLoading() {
  document.querySelectorAll(".stat,#chartBox").forEach((e) => e.classList.add("skel"));
  const sk = '<div class="sk-row"></div>'.repeat(4);
  $("#recent").innerHTML = sk; $("#exList").innerHTML = sk; $("#stTable").innerHTML = "<tbody><tr><td>" + sk + "</td></tr></tbody>";
}
function hideLoading() { document.querySelectorAll(".skel").forEach((e) => e.classList.remove("skel")); }
function updateConnectionStatus(s) {
  const map = { ok: ["circle-check", "Terhubung"], updating: ["circle-notch fa-spin", "Memperbarui"], error: ["circle-exclamation", "Gangguan koneksi"] };
  const el = $("#status");
  el.className = "status " + s;
  el.innerHTML = `<i class="fa-solid fa-${map[s][0]}"></i><b>${map[s][1]}</b>`;
  $("#errorBanner").hidden = s !== "error";
}
const emptyHTML = (t, p, i = "folder-open") => `<div class="empty"><i class="fa-solid fa-${i}"></i><h3>${t}</h3><p>${p}</p></div>`;

// ================= API =================
async function apiRequest(options) {
  if (!CONFIG.API_URL || CONFIG.API_URL.startsWith("YOUR_")) throw new Error("API_URL belum diatur");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT);
  try {
    const res = await fetch(CONFIG.API_URL, { ...options, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || typeof data.success !== "boolean") throw new Error("Respons tidak valid");
    return data;
  } finally { clearTimeout(t); }
}
const postAction = (payload) => apiRequest({ method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });

function markSynced() { $("#lastSync").innerHTML = `<i class="fa-regular fa-clock"></i> Terakhir diperbarui ${clock(new Date())}`; }

async function fetchData(manual = false) {
  if (state.loading) return;
  state.loading = true;
  $("#refreshBtn").classList.add("spin");
  updateConnectionStatus("updating");
  try {
    const data = await apiRequest({ method: "GET" });
    if (!data.success) throw new Error(data.message || "Gagal");
    applyData(data);
    updateConnectionStatus("ok"); markSynced();
    if (manual) showToast("Data berhasil diperbarui.", "success");
  } catch (err) {
    console.error("fetchData:", err);
    updateConnectionStatus("error");
    if (manual || state.first) showToast("Gagal terhubung ke server.", "error");
    if (state.first) { hideLoading(); $("#recent").innerHTML = emptyHTML("Data belum tersedia", "Tidak dapat mengambil data terbaru.", "plug-circle-xmark"); $("#exList").innerHTML = ""; $("#stTable").innerHTML = ""; }
  } finally {
    state.loading = false; state.first = false;
    $("#refreshBtn").classList.remove("spin");
  }
}

function applyData(d) {
  const { lastUpdate, ...rest } = d;
  const sig = JSON.stringify(rest);
  const changed = sig !== state.sig;
  state.sig = sig; state.data = d; hideLoading();
  if (changed) renderAll();
}
function refreshDashboard() { renderAll(); }
function renderAll() { renderSummary(); renderChart(); renderRecentExpenses(); renderStudents(); renderExpenses(); fillForms(); }

// ================= RENDER =================
function renderSummary() {
  const { summary: s, meta: m } = state.data;
  $("#meta").innerHTML = `<i class="fa-solid fa-school"></i> Kelas ${esc(m.className)} • ${esc(m.year)} • ${m.students} siswa • Iuran ${formatCurrency(m.fee)}/bulan`;
  $("#sBalance").textContent = formatCurrency(s.balance);
  $("#sCollected").textContent = formatCurrency(s.collected);
  $("#sCollectedT").textContent = pct(s.percent) + " dari target";
  $("#sExpense").textContent = formatCurrency(s.expense);
  $("#sExpenseT").textContent = s.expenseCount + " pengeluaran";
  $("#sTarget").textContent = formatCurrency(s.target);
  $("#sTargetT").textContent = "Kurang " + formatCurrency(Math.max(s.target - s.collected, 0));
  $("#progBar").style.width = Math.min(s.percent * 100, 100) + "%";
}

function renderChart() {
  if (typeof Chart === "undefined") return;
  const ms = state.data.months;
  if (state.chart) state.chart.destroy();
  Chart.defaults.color = "#A1A1AA";
  state.chart = new Chart($("#chart"), {
    data: { labels: ms.map((m) => m.name.slice(0, 3)), datasets: [
      { type: "bar", label: "Terkumpul", data: ms.map((m) => m.collected), backgroundColor: "#F87171", borderRadius: 6, order: 2 },
      { type: "line", label: "Target", data: ms.map((m) => m.target), borderColor: "#A1A1AA", borderDash: [6, 4], pointRadius: 0, borderWidth: 2, order: 1 } ] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
      plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + formatCurrency(c.parsed.y) } } },
      scales: { y: { beginAtZero: true, grid: { color: "rgba(255,255,255,.06)" }, ticks: { callback: (v) => (v >= 1e6 ? "Rp " + v / 1e6 + " jt" : "Rp " + v / 1e3 + " rb") } }, x: { grid: { display: false } } } }
  });
}

const byNewest = (a, b) => b.date.localeCompare(a.date) || b.no - a.no;
function expItem(e) {
  return `<div class="tx expense"><div class="ti"><i class="fa-solid fa-receipt"></i></div>
    <div class="d"><b>${esc(e.description)}</b><span>${formatDate(e.date)}${e.person ? " • " + esc(e.person) : ""}</span><span class="badge cat"><i class="fa-solid fa-tag"></i> ${esc(e.category)}</span></div>
    <div class="r"><span class="amt">- ${formatCurrency(e.amount)}</span></div></div>`;
}
function renderRecentExpenses() {
  const l = [...state.data.expenses].sort(byNewest).slice(0, CONFIG.RECENT_COUNT);
  $("#recent").innerHTML = l.length ? l.map(expItem).join("") : emptyHTML("Belum ada pengeluaran", "Tambahkan pengeluaran pertama untuk mulai mencatat.");
}

function filterStudents() {
  const q = state.fs.q.trim().toLowerCase();
  return state.data.semesters[state.sem].students.filter((s) => (!q || s.name.toLowerCase().includes(q)) && (state.fs.status === "all" || s.status === state.fs.status));
}
function renderStudents() {
  const sm = state.data.semesters[state.sem], fee = state.data.meta.fee, list = filterStudents();
  $("#semInfo").textContent = `${sm.months[0]} – ${sm.months[sm.months.length - 1]} • Target per siswa ${formatCurrency(fee * sm.months.length)} • Terkumpul ${formatCurrency(sm.total)} dari ${formatCurrency(sm.target)} (${pct(sm.target ? sm.total / sm.target : 0)})`;
  if (!sm.students.length) { $("#stTable").innerHTML = "<tbody><tr><td>" + emptyHTML("Belum ada data siswa", "Isi data siswa di Google Sheets.", "users") + "</td></tr></tbody>"; return; }
  const cell = (v) => v >= fee ? '<td class="full" title="Lunas bulan ini"><i class="fa-solid fa-check" aria-label="Lunas"></i></td>' : v > 0 ? `<td class="part" title="${formatCurrency(v)}">${short(v)}</td>` : '<td class="none" title="Belum bayar">–</td>';
  const head = `<thead><tr><th class="nm">Nama Siswa</th>${sm.months.map((m) => `<th>${m.slice(0, 3)}</th>`).join("")}<th>Total</th><th>Status</th></tr></thead>`;
  const rows = list.map((s) => `<tr><td class="nm"><i>${s.no}</i>${esc(s.name)}</td>${s.payments.map(cell).join("")}<td>${formatCurrency(s.total)}</td>
    <td><span class="pill ${s.status === "LUNAS" ? "ok" : "no"}"><i class="fa-solid fa-${s.status === "LUNAS" ? "circle-check" : "hourglass-half"}"></i>${s.status === "LUNAS" ? "Lunas" : "Belum lunas"}</span></td></tr>`).join("");
  const foot = `<tfoot><tr><td class="nm">Terkumpul</td>${sm.totals.map((t) => `<td>${short(t)}</td>`).join("")}<td>${formatCurrency(sm.total)}</td><td></td></tr>
    <tr><td class="nm">Target</td>${sm.months.map(() => `<td>${short(sm.monthTarget)}</td>`).join("")}<td>${formatCurrency(sm.target)}</td><td></td></tr>
    <tr><td class="nm">Capaian</td>${sm.totals.map((t) => `<td>${pct(sm.monthTarget ? t / sm.monthTarget : 0)}</td>`).join("")}<td>${pct(sm.target ? sm.total / sm.target : 0)}</td><td></td></tr></tfoot>`;
  $("#stTable").innerHTML = head + `<tbody>${rows || `<tr><td colspan="${sm.months.length + 3}">${emptyHTML("Tidak ada hasil", "Ubah pencarian atau filter.", "magnifying-glass")}</td></tr>`}</tbody>` + foot;
}

function renderExpenses() {
  const all = state.data.expenses, q = state.fe.q.trim().toLowerCase();
  const cats = [...new Set(all.map((e) => e.category))].sort(), sel = $("#exCat");
  sel.innerHTML = '<option value="all">Semua kategori</option>' + cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  if (!cats.includes(state.fe.cat)) state.fe.cat = "all";
  sel.value = state.fe.cat;
  const list = all.filter((e) => (state.fe.cat === "all" || e.category === state.fe.cat) && (!q || (e.description + " " + e.category + " " + e.person).toLowerCase().includes(q))).sort(byNewest);
  $("#exCount").textContent = all.length ? `${list.length} pengeluaran • ${formatCurrency(list.reduce((a, e) => a + e.amount, 0))}` : "";
  $("#exList").innerHTML = !all.length ? emptyHTML("Belum ada pengeluaran", "Tambahkan pengeluaran pertama untuk mulai mencatat.") : list.length ? list.map(expItem).join("") : emptyHTML("Tidak ada hasil", "Ubah pencarian atau filter.", "magnifying-glass");
}

// ================= FORM =================
const parseAmount = (s) => { const d = String(s).replace(/\D/g, ""); return d ? Number(d) : NaN; };
function bad(id, msg) {
  const el = $("#" + id), er = el.parentElement.querySelector(".err");
  if (er) er.textContent = msg || "";
  el.classList.toggle("bad", !!msg);
  return !msg;
}
function currentPaid() {
  const d = state.data; if (!d) return null;
  const sm = d.semesters[$("#pSem").value], s = sm.students.find((x) => String(x.no) === $("#pStudent").value), i = sm.months.indexOf($("#pMonth").value);
  return s && i >= 0 ? { paid: s.payments[i], fee: d.meta.fee } : null;
}
function updateHint() {
  const c = currentPaid();
  $("#payHint").textContent = c ? `Sudah dibayar ${formatCurrency(c.paid)} • sisa ${formatCurrency(Math.max(c.fee - c.paid, 0))}` : "";
}
function fillForms() {
  const sm = state.data.semesters[$("#pSem").value], mSel = $("#pMonth"), sSel = $("#pStudent"), cm = mSel.value, cs = sSel.value;
  mSel.innerHTML = sm.months.map((m) => `<option>${m}</option>`).join(""); if (sm.months.includes(cm)) mSel.value = cm;
  sSel.innerHTML = '<option value="">Pilih siswa</option>' + sm.students.map((s) => `<option value="${s.no}">${s.no}. ${esc(s.name)}</option>`).join(""); if (cs) sSel.value = cs;
  updateHint();
}

async function submitAction(form, payload, okMsg, failMsg, onDone) {
  if (state.busy) return; // cegah klik ganda
  state.busy = true;
  const btn = form.querySelector("button[type=submit]"), html = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Menyimpan…</span>';
  try {
    const d = await postAction(payload);
    if (!d.success) { showToast(d.message || failMsg, "error"); return; }
    showToast(okMsg, "success"); onDone(); state.first = false; applyData(d); updateConnectionStatus("ok"); markSynced();
  } catch (err) {
    console.error("submit:", err);
    showToast(err.name === "AbortError" ? "Server terlalu lama merespons. Coba lagi." : failMsg, "error");
  } finally { state.busy = false; btn.disabled = false; btn.innerHTML = html; }
}

function handlePaymentSubmit(e) {
  e.preventDefault();
  const amount = parseAmount($("#pAmount").value), c = currentPaid();
  const ok = [bad("pStudent", $("#pStudent").value ? "" : "Pilih siswa."),
    bad("pAmount", isNaN(amount) || amount <= 0 ? "Masukkan nominal lebih dari 0." : c && c.paid + amount > c.fee ? "Melebihi iuran bulanan (sisa " + formatCurrency(c.fee - c.paid) + ")." : "")].every(Boolean);
  if (!ok) return;
  submitAction(e.target, { action: "payment", semester: Number($("#pSem").value), month: $("#pMonth").value, studentNo: Number($("#pStudent").value), amount },
    "Pembayaran berhasil dicatat.", "Pembayaran gagal dicatat.", () => { $("#pAmount").value = ""; });
}
function handleExpenseSubmit(e) {
  e.preventDefault();
  const date = $("#eDate").value, desc = $("#eDesc").value.trim(), amount = parseAmount($("#eAmount").value);
  const ok = [bad("eDate", /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date)) ? "" : "Tanggal tidak valid."),
    bad("eDesc", desc ? "" : "Keterangan wajib diisi."),
    bad("eAmount", isNaN(amount) || amount <= 0 ? "Masukkan nominal lebih dari 0." : "")].every(Boolean);
  if (!ok) return;
  submitAction(e.target, { action: "expense", date, description: desc, category: $("#eCat").value, amount, person: $("#ePerson").value.trim() },
    "Pengeluaran berhasil ditambahkan.", "Pengeluaran gagal ditambahkan.", () => { $("#eDesc").value = ""; $("#eAmount").value = ""; $("#eDate").value = todayYMD(); });
}

// ================= EVENTS / INIT =================
function startAutoRefresh() {
  clearInterval(state.timer);
  state.timer = setInterval(() => { if (!document.hidden && !state.busy) fetchData(); }, CONFIG.REFRESH_INTERVAL);
}
const money = (e) => { const n = parseAmount(e.target.value); e.target.value = isNaN(n) ? "" : formatCurrency(n); };
const guard = (fn) => () => { if (state.data) fn(); };

function bindEvents() {
  $("#refreshBtn").addEventListener("click", () => fetchData(true));
  $("#payForm").addEventListener("submit", handlePaymentSubmit);
  $("#expForm").addEventListener("submit", handleExpenseSubmit);
  $("#pAmount").addEventListener("input", money); $("#eAmount").addEventListener("input", money);
  $("#pSem").addEventListener("change", guard(fillForms));
  $("#pMonth").addEventListener("change", guard(updateHint)); $("#pStudent").addEventListener("change", guard(updateHint));
  $("#semTabs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.sem = Number(b.dataset.s);
    document.querySelectorAll("#semTabs button").forEach((x) => x.classList.toggle("on", x === b));
    if (state.data) renderStudents();
  });
  $("#stSearch").addEventListener("input", (e) => { state.fs.q = e.target.value; guard(renderStudents)(); });
  $("#stFilter").addEventListener("change", (e) => { state.fs.status = e.target.value; guard(renderStudents)(); });
  $("#exSearch").addEventListener("input", (e) => { state.fe.q = e.target.value; guard(renderExpenses)(); });
  $("#exCat").addEventListener("change", (e) => { state.fe.cat = e.target.value; guard(renderExpenses)(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) fetchData(); });
  window.addEventListener("online", () => fetchData());
  window.addEventListener("offline", () => updateConnectionStatus("error"));
  const links = [...document.querySelectorAll(".nav a")];
  const io = new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + x.target.id)); }), { rootMargin: "-40% 0px -55% 0px" });
  document.querySelectorAll("main section").forEach((s) => io.observe(s));
}

function initApp() {
  $("#eDate").value = todayYMD();
  bindEvents(); showLoading(); fetchData(); startAutoRefresh();
}
document.addEventListener("DOMContentLoaded", initApp);
