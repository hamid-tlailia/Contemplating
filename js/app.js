// حافظ - Smart Quran memorization app
// Core idea: spaced repetition (SM-2) + active recall (progressive word masking)
// instead of passive re-reading. All progress is stored locally (localStorage).

const API_BASE = "https://api.alquran.cloud/v1";
const AUDIO_BASE = "https://cdn.islamic.network/quran/audio/128/ar.alafasy"; // {globalAyahNumber}.mp3
const STATE_KEY = "hafiz_state_v1";

// ---------- State ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load state", e);
  }
  return {
    ayahs: {}, // key "surah:ayah" -> { surah, ayah, text, globalNumber, interval, repetition, ef, due, lastReviewed, added }
    activity: {}, // "YYYY-MM-DD" -> true (for streak calculation)
  };
}

function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save state", e);
  }
}

const state = loadState();

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function markActivityToday() {
  state.activity[todayISO()] = true;
  saveState();
}

function computeStreak() {
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (state.activity[key]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// ---------- SM-2 spaced repetition ----------
// quality: 0 = complete blackout, 3 = hard recall, 4 = good, 5 = easy
function sm2Schedule(item, quality) {
  if (quality < 3) {
    item.repetition = 0;
    item.interval = 1;
  } else {
    item.repetition = (item.repetition || 0) + 1;
    if (item.repetition === 1) item.interval = 1;
    else if (item.repetition === 2) item.interval = 6;
    else item.interval = Math.round((item.interval || 1) * (item.ef || 2.5));
  }

  let ef = (item.ef || 2.5) + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ef < 1.3) ef = 1.3;
  item.ef = ef;

  const due = new Date();
  due.setDate(due.getDate() + item.interval);
  item.due = due.toISOString().slice(0, 10);
  item.lastReviewed = todayISO();
  return item;
}

function isMastered(item) {
  return (item.repetition || 0) >= 4 && (item.interval || 0) >= 21;
}

// ---------- API helpers ----------

let surahListCache = null;
const surahAyahsCache = {}; // surahNumber -> [{numberInSurah, text, number(global)}]

async function fetchSurahList() {
  if (surahListCache) return surahListCache;
  const res = await fetch(`${API_BASE}/surah`);
  const json = await res.json();
  surahListCache = json.data;
  return surahListCache;
}

async function fetchSurahAyahs(surahNumber) {
  if (surahAyahsCache[surahNumber]) return surahAyahsCache[surahNumber];
  const res = await fetch(`${API_BASE}/surah/${surahNumber}/quran-uthmani`);
  const json = await res.json();
  surahAyahsCache[surahNumber] = json.data.ayahs;
  return surahAyahsCache[surahNumber];
}

// ---------- Tabs ----------

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
  if (tab === "dashboard") renderDashboard();
  if (tab === "review") startReviewSession();
}

// ---------- Dashboard ----------

function renderDashboard() {
  const items = Object.values(state.ayahs);
  const today = todayISO();
  const dueCount = items.filter((i) => i.due <= today).length;
  const newCount = items.filter((i) => !i.lastReviewed).length;
  const masteredCount = items.filter(isMastered).length;

  document.getElementById("stat-due").textContent = dueCount;
  document.getElementById("stat-new").textContent = newCount;
  document.getElementById("stat-mastered").textContent = masteredCount;
  document.getElementById("stat-streak").textContent = computeStreak();

  const planList = document.getElementById("plan-list");
  planList.innerHTML = "";
  const sorted = [...items].sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  if (sorted.length === 0) {
    planList.innerHTML = `<p class="muted">لم تُضِف آيات بعد. اذهب إلى تبويب "تصفح وإضافة" للبدء.</p>`;
  }
  sorted.slice(0, 30).forEach((item) => {
    const div = document.createElement("div");
    div.className = "plan-item";
    let badge = "scheduled";
    let badgeText = `يُستحق: ${item.due}`;
    if (!item.lastReviewed) { badge = "new"; badgeText = "جديدة"; }
    else if (item.due <= today) { badge = "due"; badgeText = "مستحقة الآن"; }
    div.innerHTML = `
      <span class="ref">${item.surahName || item.surah}:${item.ayah}</span>
      <span class="snippet">${item.text || ""}</span>
      <span class="badge ${badge}">${badgeText}</span>
      <button class="icon-btn" title="إزالة من الخطة" data-key="${item.surah}:${item.ayah}">✕</button>
    `;
    div.querySelector(".icon-btn").addEventListener("click", (e) => {
      const key = e.currentTarget.dataset.key;
      delete state.ayahs[key];
      saveState();
      renderDashboard();
    });
    planList.appendChild(div);
  });

  renderSurahProgress();
}

async function renderSurahProgress() {
  const container = document.getElementById("surah-progress");
  const items = Object.values(state.ayahs);
  if (items.length === 0) {
    container.innerHTML = `<p class="muted">لا يوجد تقدم بعد.</p>`;
    return;
  }
  const bySurah = {};
  items.forEach((i) => {
    bySurah[i.surah] = bySurah[i.surah] || { total: 0, mastered: 0, name: i.surahName };
    bySurah[i.surah].total++;
    if (isMastered(i)) bySurah[i.surah].mastered++;
  });

  let surahs = surahListCache;
  if (!surahs) {
    try { surahs = await fetchSurahList(); } catch (e) { surahs = null; }
  }

  container.innerHTML = "";
  Object.keys(bySurah).sort((a, b) => a - b).forEach((surahNum) => {
    const info = bySurah[surahNum];
    const meta = surahs ? surahs.find((s) => s.number === Number(surahNum)) : null;
    const totalInSurah = meta ? meta.numberOfAyahs : info.total;
    const name = meta ? meta.name : (info.name || surahNum);
    const pct = Math.round((info.mastered / totalInSurah) * 100);
    const row = document.createElement("div");
    row.className = "surah-progress-row";
    row.innerHTML = `
      <span class="name">${name}</span>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span class="pct">${pct}%</span>
    `;
    container.appendChild(row);
  });
}

// ---------- Browse / Add ----------

async function initBrowseTab() {
  const select = document.getElementById("surah-select");
  try {
    const surahs = await fetchSurahList();
    select.innerHTML = surahs
      .map((s) => `<option value="${s.number}">${s.number}. ${s.name} (${s.englishName})</option>`)
      .join("");
    select.addEventListener("change", () => loadBrowseSurah(Number(select.value)));
    loadBrowseSurah(Number(select.value));
  } catch (e) {
    document.getElementById("surah-meta-info").textContent = "تعذّر تحميل قائمة السور. تحقق من الاتصال بالإنترنت.";
  }
}

async function loadBrowseSurah(surahNumber) {
  const metaInfo = document.getElementById("surah-meta-info");
  const titleEl = document.getElementById("browse-surah-title");
  const listEl = document.getElementById("browse-ayahs");
  metaInfo.textContent = "جاري التحميل...";
  listEl.innerHTML = "";
  try {
    const ayahs = await fetchSurahAyahs(surahNumber);
    const surahs = await fetchSurahList();
    const meta = surahs.find((s) => s.number === surahNumber);
    titleEl.textContent = `سورة ${meta.name}`;
    metaInfo.textContent = `عدد الآيات: ${ayahs.length}`;
    document.getElementById("ayah-from").max = ayahs.length;
    document.getElementById("ayah-to").max = ayahs.length;
    document.getElementById("ayah-to").value = ayahs.length >= 1 ? Math.min(5, ayahs.length) : 1;

    ayahs.forEach((a) => {
      const key = `${surahNumber}:${a.numberInSurah}`;
      const already = !!state.ayahs[key];
      const row = document.createElement("div");
      row.className = "ayah-browse-item";
      row.innerHTML = `
        <span class="ayah-num-chip">${a.numberInSurah}</span>
        <span class="ayah-browse-text">${a.text}</span>
        <button class="btn ayah-add-btn" ${already ? "disabled" : ""}>${already ? "أُضيفت ✓" : "+ أضف"}</button>
      `;
      row.querySelector("button").addEventListener("click", (e) => {
        addAyahToPlan(surahNumber, meta.name, a);
        e.target.textContent = "أُضيفت ✓";
        e.target.disabled = true;
      });
      listEl.appendChild(row);
    });
  } catch (e) {
    metaInfo.textContent = "تعذّر تحميل نص السورة. تحقق من الاتصال بالإنترنت.";
  }
}

function addAyahToPlan(surahNumber, surahName, ayahObj) {
  const key = `${surahNumber}:${ayahObj.numberInSurah}`;
  if (state.ayahs[key]) return;
  state.ayahs[key] = {
    surah: surahNumber,
    surahName,
    ayah: ayahObj.numberInSurah,
    globalNumber: ayahObj.number,
    text: ayahObj.text,
    interval: 0,
    repetition: 0,
    ef: 2.5,
    due: todayISO(),
    lastReviewed: null,
    added: todayISO(),
  };
  saveState();
}

document.getElementById("btn-add-range").addEventListener("click", async () => {
  const surahNumber = Number(document.getElementById("surah-select").value);
  const from = Number(document.getElementById("ayah-from").value);
  const to = Number(document.getElementById("ayah-to").value);
  if (!surahNumber || !from || !to || from > to) return;
  try {
    const ayahs = await fetchSurahAyahs(surahNumber);
    const surahs = await fetchSurahList();
    const meta = surahs.find((s) => s.number === surahNumber);
    ayahs
      .filter((a) => a.numberInSurah >= from && a.numberInSurah <= to)
      .forEach((a) => addAyahToPlan(surahNumber, meta.name, a));
    loadBrowseSurah(surahNumber);
    renderDashboard();
    alert(`تمت إضافة الآيات من ${from} إلى ${to} إلى خطة الحفظ.`);
  } catch (e) {
    alert("حدث خطأ أثناء الإضافة. تحقق من الاتصال بالإنترنت.");
  }
});

// ---------- Review session ----------

let reviewQueue = [];
let reviewIndex = 0;
let currentWords = [];
let maskLevel = 0; // 0 = none masked ... up to full mask

function getDueQueue() {
  const today = todayISO();
  return Object.values(state.ayahs)
    .filter((i) => i.due <= today)
    .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
}

function startReviewSession() {
  reviewQueue = getDueQueue();
  reviewIndex = 0;
  const empty = document.getElementById("review-empty");
  const session = document.getElementById("review-session");
  if (reviewQueue.length === 0) {
    empty.classList.remove("hidden");
    session.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  session.classList.remove("hidden");
  loadReviewItem();
}

function loadReviewItem() {
  const item = reviewQueue[reviewIndex];
  document.getElementById("review-position").textContent = `${reviewIndex + 1} / ${reviewQueue.length}`;
  document.getElementById("review-progress-fill").style.width = `${((reviewIndex) / reviewQueue.length) * 100}%`;
  document.getElementById("review-ref").textContent = `سورة ${item.surahName || item.surah} - الآية ${item.ayah}`;

  currentWords = item.text.split(/\s+/);
  maskLevel = 0;
  renderMaskedText();

  const audio = document.getElementById("review-audio");
  audio.src = `${AUDIO_BASE}/${item.globalNumber}.mp3`;

  document.getElementById("grade-controls").classList.add("hidden");
  document.getElementById("reveal-controls").classList.remove("hidden");
}

function renderMaskedText() {
  const container = document.getElementById("review-text");
  const n = currentWords.length;
  const hiddenIndices = new Set();
  if (maskLevel > 0) {
    const fractionToHide = Math.min(maskLevel * 0.34, 1);
    const countToHide = Math.round(n * fractionToHide);
    const indices = [...Array(n).keys()];
    // Deterministic shuffle based on maskLevel so re-render is stable within a level
    let seed = maskLevel * 9973;
    for (let i = indices.length - 1; i > 0; i--) {
      seed = (seed * 16807) % 2147483647;
      const j = seed % (i + 1);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    indices.slice(0, countToHide).forEach((idx) => hiddenIndices.add(idx));
  }

  container.innerHTML = currentWords
    .map((w, idx) => {
      if (hiddenIndices.has(idx)) {
        return `<span class="word masked" data-idx="${idx}">${w}</span>`;
      }
      return `<span class="word">${w}</span>`;
    })
    .join(" ");

  container.querySelectorAll(".word.masked").forEach((el) => {
    el.addEventListener("click", () => {
      el.classList.remove("masked");
    });
  });
}

document.getElementById("btn-play-audio").addEventListener("click", () => {
  const audio = document.getElementById("review-audio");
  audio.play().catch(() => {});
});

document.getElementById("btn-mask-more").addEventListener("click", () => {
  maskLevel = Math.min(maskLevel + 1, 3);
  renderMaskedText();
});

document.getElementById("btn-mask-reset").addEventListener("click", () => {
  maskLevel = 0;
  renderMaskedText();
});

document.getElementById("btn-reveal").addEventListener("click", () => {
  // Reveal full text for confirmation, then show grading buttons
  maskLevel = 0;
  renderMaskedText();
  document.getElementById("grade-controls").classList.remove("hidden");
  document.getElementById("reveal-controls").classList.add("hidden");
});

document.querySelectorAll(".grade-buttons button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const quality = Number(btn.dataset.quality);
    const item = reviewQueue[reviewIndex];
    const key = `${item.surah}:${item.ayah}`;
    sm2Schedule(state.ayahs[key], quality);
    saveState();
    markActivityToday();

    reviewIndex++;
    if (reviewIndex >= reviewQueue.length) {
      document.getElementById("review-progress-fill").style.width = `100%`;
      document.getElementById("review-empty").innerHTML = `<p>👏 أحسنت! أنهيت جلسة المراجعة لهذا اليوم.</p>`;
      document.getElementById("review-empty").classList.remove("hidden");
      document.getElementById("review-session").classList.add("hidden");
    } else {
      loadReviewItem();
    }
  });
});

// ---------- Init ----------

initBrowseTab();
renderDashboard();
