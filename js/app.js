// تدبر - Smart Quran memorization app
// Spaced repetition (SM-2) + active recall (MCQ / typing / progressive masking / voice recitation)
// instead of passive re-reading. All progress is stored locally (localStorage).

const API_BASE = "https://api.alquran.cloud/v1";
const AUDIO_BASE = "https://cdn.islamic.network/quran/audio/128/ar.alafasy"; // {globalAyahNumber}.mp3
const WORD_MEANING_API = "https://api.quran.com/api/v4/verses/by_key"; // /{surah}:{ayah}?words=true
const STATE_KEY = "tadabbur_state_v1";
const ROUNDS_TO_MASTER = 3;

const ENCOURAGEMENTS = [
  "أحسنت! ثبّت الله ما حفظت 🌿",
  "ما شاء الله، استمر ولا تتوقف ✨",
  "كل كلمة تحفظها نور يزداد في قلبك 📖",
  "«خيركم من تعلّم القرآن وعلّمه» — واصل الطريق 🤍",
  "رائع! خطوة أخرى نحو الختمة 🌙",
  "بارك الله فيك، لا تنقطع عن الورد اليومي 🔥",
];

function randomEncouragement() {
  return ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
}

// ---------- State ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.ayahs = parsed.ayahs || {};
      parsed.activity = parsed.activity || {};
      parsed.learningPointer = parsed.learningPointer || { surah: 1, ayah: 1 };
      parsed.dailyChallenge = parsed.dailyChallenge || { date: null, score: 0, total: 0 };
      return parsed;
    }
  } catch (e) {
    console.warn("Failed to load state", e);
  }
  return {
    ayahs: {}, // key "surah:ayah" -> { surah, ayah, surahName, text, globalNumber, interval, repetition, ef, due, lastReviewed, added, learningStage, roundStreak }
    activity: {}, // "YYYY-MM-DD" -> true (for streak calculation)
    learningPointer: { surah: 1, ayah: 1 },
    dailyChallenge: { date: null, score: 0, total: 0 },
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

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Strip tashkeel + normalize letter variants so typed/spoken answers match forgivingly.
function normalizeArabic(s) {
  return (s || "")
    .replace(/[ً-ٰٟۖ-ۭ]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^ء-ي\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

// ---------- API helpers ----------

let surahListCache = null;
const surahAyahsCache = {}; // surahNumber -> [{numberInSurah, text, number(global)}]
const wordMeaningsCache = {}; // "surah:ayah" -> [{text, meaning}]

async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSurahList() {
  if (surahListCache) return surahListCache;
  const res = await fetchWithTimeout(`${API_BASE}/surah`);
  const json = await res.json();
  surahListCache = json.data;
  return surahListCache;
}

async function fetchSurahAyahs(surahNumber) {
  if (surahAyahsCache[surahNumber]) return surahAyahsCache[surahNumber];
  const res = await fetchWithTimeout(`${API_BASE}/surah/${surahNumber}/quran-uthmani`);
  const json = await res.json();
  surahAyahsCache[surahNumber] = json.data.ayahs;
  return surahAyahsCache[surahNumber];
}

async function fetchWordMeanings(surah, ayah) {
  const key = `${surah}:${ayah}`;
  if (wordMeaningsCache[key]) return wordMeaningsCache[key];
  const res = await fetchWithTimeout(`${WORD_MEANING_API}/${key}?words=true&word_fields=text_uthmani&translation_fields=text`, 6000);
  const json = await res.json();
  const words = (json.verse && json.verse.words) || [];
  const meanings = words
    .filter((w) => w.char_type_name === "word")
    .map((w) => ({ text: w.text_uthmani || w.text, meaning: (w.translation && w.translation.text) || "" }));
  wordMeaningsCache[key] = meanings;
  return meanings;
}

// ---------- Toasts ----------

function showToast(message, type) {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = "toast" + (type ? ` toast-${type}` : "");
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3400);
}

// ---------- Sound effects (Web Audio, no external files) ----------

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  return audioCtx;
}

function playTone(freq, duration, type) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    /* ignore audio failures */
  }
}

function playSuccessSound() {
  playTone(880, 0.12);
  setTimeout(() => playTone(1180, 0.16), 90);
}
function playMasterySound() {
  [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => playTone(f, 0.18), i * 100));
}
function playErrorSound() {
  playTone(180, 0.22, "sawtooth");
}

// ---------- Confetti ----------

function fireConfetti(big) {
  const canvas = document.getElementById("confetti-canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ["#1f6f5c", "#d6ab5c", "#b98b2a", "#3fae91", "#ece7d9"];
  const count = big ? 160 : 70;
  const particles = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 100,
    r: 4 + Math.random() * 5,
    c: colors[Math.floor(Math.random() * colors.length)],
    vy: 2 + Math.random() * 3.5,
    vx: -2 + Math.random() * 4,
    rot: Math.random() * 360,
    vr: -8 + Math.random() * 16,
  }));
  let frame = 0;
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6);
      ctx.restore();
    });
    frame++;
    if (frame < 110) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  tick();
}

// ---------- Tabs ----------

document.querySelectorAll("[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
  if (tab === "dashboard") renderDashboard();
  if (tab === "review" && !isChallengeMode) startReviewSession();
  if (tab === "learn") loadLearnAyah();
}

// ---------- Dashboard ----------

function renderDashboard() {
  const items = Object.values(state.ayahs);
  const today = todayISO();
  const dueCount = items.filter((i) => i.learningStage === "srs" && i.due <= today).length;
  const learningCount = items.filter((i) => i.learningStage === "learning").length;
  const masteredCount = items.filter((i) => i.learningStage === "srs").length;

  document.getElementById("stat-due").textContent = dueCount;
  document.getElementById("stat-new").textContent = learningCount;
  document.getElementById("stat-mastered").textContent = masteredCount;
  document.getElementById("stat-streak").textContent = computeStreak();

  document.getElementById("onboarding-panel").classList.toggle("show", items.length === 0);

  renderChallengeCard();

  const planList = document.getElementById("plan-list");
  planList.innerHTML = "";
  const srsItems = items.filter((i) => i.learningStage === "srs");
  const sorted = [...srsItems].sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  if (sorted.length === 0) {
    planList.innerHTML = `<p class="muted">لا توجد آيات في جدول المراجعة بعد. أكمل حفظ آية من تبويب "ابدأ الحفظ" لتظهر هنا.</p>`;
  }
  sorted.slice(0, 30).forEach((item) => {
    const div = document.createElement("div");
    div.className = "plan-item";
    let badge = "scheduled";
    let badgeText = `يُستحق: ${item.due}`;
    if (item.due <= today) { badge = "due"; badgeText = "مستحقة الآن"; }
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

function renderChallengeCard() {
  const card = document.getElementById("challenge-card");
  const desc = document.getElementById("challenge-desc");
  const btn = document.getElementById("btn-start-challenge");
  const masteredCount = Object.values(state.ayahs).filter((i) => i.learningStage === "srs").length;
  const doneToday = state.dailyChallenge.date === todayISO();

  if (masteredCount === 0) {
    card.classList.remove("done");
    desc.textContent = "احفظ آية واحدة على الأقل لتفعيل تحدي التعاهد اليومي المفاجئ.";
    btn.disabled = true;
    btn.textContent = "أكمل حفظ آية أولاً";
    return;
  }
  btn.disabled = false;
  if (doneToday) {
    card.classList.add("done");
    desc.textContent = `أنجزت تحدي اليوم بنتيجة ${state.dailyChallenge.score}/${state.dailyChallenge.total} 🎉 عد غدًا لتحدٍ جديد.`;
    btn.textContent = "أعد التحدي";
  } else {
    card.classList.remove("done");
    desc.textContent = 'اختبر نفسك بآيات عشوائية مما حفظت — «تعاهدوا هذا القرآن فوالذي نفسي بيده لهو أشد تفلتًا من الإبل في عقلها».';
    btn.textContent = "ابدأ التحدي المفاجئ";
  }
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
    if (i.learningStage === "srs") bySurah[i.surah].mastered++;
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

document.getElementById("btn-start-challenge").addEventListener("click", startDailyChallenge);

// ---------- Browse / Add (manual, advanced) ----------

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
        addAyahDirectlyToSrs(surahNumber, meta.name, a);
        e.target.textContent = "أُضيفت ✓";
        e.target.disabled = true;
      });
      listEl.appendChild(row);
    });
  } catch (e) {
    metaInfo.textContent = "تعذّر تحميل نص السورة. تحقق من الاتصال بالإنترنت.";
  }
}

function addAyahDirectlyToSrs(surahNumber, surahName, ayahObj) {
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
    learningStage: "srs",
    roundStreak: 0,
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
      .forEach((a) => addAyahDirectlyToSrs(surahNumber, meta.name, a));
    loadBrowseSurah(surahNumber);
    renderDashboard();
    showToast(`تمت إضافة الآيات من ${from} إلى ${to} إلى خطة المراجعة.`, "success");
  } catch (e) {
    showToast("حدث خطأ أثناء الإضافة. تحقق من الاتصال بالإنترنت.", "error");
  }
});

// ---------- Voice recitation (Web Speech API) ----------

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

function voiceSupported() {
  return !!SpeechRecognitionImpl;
}

function diffRecitation(correctText, transcript) {
  const correctWords = correctText.split(/\s+/);
  const saidWords = normalizeArabic(transcript).split(/\s+/).filter(Boolean);
  let correctCount = 0;
  const result = correctWords.map((w, i) => {
    const ok = saidWords[i] !== undefined && normalizeArabic(saidWords[i]) === normalizeArabic(w);
    if (ok) correctCount++;
    return { word: w, ok };
  });
  const accuracy = correctWords.length ? Math.round((correctCount / correctWords.length) * 100) : 0;
  return { result, accuracy };
}

function runVoiceTest(correctText, resultContainer) {
  if (!voiceSupported()) return;
  resultContainer.classList.remove("hidden");
  resultContainer.classList.add("listening");
  resultContainer.innerHTML = `<p>🎤 استمع الآن... اقرأ الآية بصوت واضح</p>`;

  const recognition = new SpeechRecognitionImpl();
  recognition.lang = "ar-SA";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (e) => {
    resultContainer.classList.remove("listening");
    const transcript = e.results[0][0].transcript;
    const { result, accuracy } = diffRecitation(correctText, transcript);
    const html = result
      .map((r) => `<span class="vr-word ${r.ok ? "ok" : "bad"}">${r.word}</span>`)
      .join(" ");
    resultContainer.innerHTML = `
      <p class="vr-text">${html}</p>
      <p class="vr-score">دقة التسميع: ${accuracy}%</p>
    `;
    if (accuracy >= 85) { playSuccessSound(); showToast(randomEncouragement()); }
    else playErrorSound();
  };
  recognition.onerror = (e) => {
    resultContainer.classList.remove("listening");
    resultContainer.innerHTML = `<p class="muted">تعذّر الاستماع (${e.error}). تأكد من السماح بالوصول للميكروفون وحاول مجددًا.</p>`;
  };
  recognition.onend = () => resultContainer.classList.remove("listening");
  try {
    recognition.start();
  } catch (e) {
    resultContainer.innerHTML = `<p class="muted">تعذّر بدء الاستماع.</p>`;
  }
}

if (!voiceSupported()) {
  document.getElementById("btn-learn-voice").title = "غير مدعوم في هذا المتصفح";
} else {
  document.getElementById("btn-learn-voice").classList.remove("hidden");
  document.getElementById("btn-review-voice").classList.remove("hidden");
}

// ---------- Learn tab (guided sequential memorization: Al-Fatiha first) ----------

let learnCurrentKey = null;
let learnWords = [];
let learnWordIndex = 0;
let learnMistakeThisRound = false;
let learnMode = "mcq"; // 'mcq' | 'type'

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    learnMode = btn.dataset.mode;
    document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
    renderLearnRound();
  });
});

function getOrCreateLearningItem(surahNumber, surahName, ayahObj) {
  const key = `${surahNumber}:${ayahObj.numberInSurah}`;
  if (!state.ayahs[key]) {
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
      learningStage: "learning",
      roundStreak: 0,
    };
    saveState();
  }
  return state.ayahs[key];
}

async function loadLearnAyah() {
  const pointer = state.learningPointer;
  document.getElementById("learn-meanings").classList.add("hidden");
  document.getElementById("learn-meanings").innerHTML = "";
  document.getElementById("voice-result").classList.add("hidden");

  let ayahs, surahs, meta;
  try {
    ayahs = await fetchSurahAyahs(pointer.surah);
    surahs = await fetchSurahList();
    meta = surahs.find((s) => s.number === pointer.surah);
  } catch (e) {
    document.getElementById("learn-ref").textContent = "تعذّر تحميل الآية";
    document.getElementById("learn-round-info").textContent = "تحقق من اتصالك بالإنترنت وحاول مجددًا.";
    return;
  }

  let ayahObj = ayahs.find((a) => a.numberInSurah === pointer.ayah);
  if (!ayahObj) {
    // surah finished -> advance to next surah
    if (pointer.surah < 114) {
      state.learningPointer = { surah: pointer.surah + 1, ayah: 1 };
      saveState();
      return loadLearnAyah();
    }
    document.getElementById("learn-ref").textContent = "🎉 أتممت حفظ القرآن كاملاً!";
    document.getElementById("learn-round-info").textContent = "ما شاء الله تبارك الله";
    document.getElementById("mcq-options").innerHTML = "";
    return;
  }

  const item = getOrCreateLearningItem(pointer.surah, meta.name, ayahObj);
  learnCurrentKey = `${pointer.surah}:${pointer.ayah}`;
  learnWords = ayahObj.text.split(/\s+/);
  learnWordIndex = 0;
  learnMistakeThisRound = false;

  document.getElementById("learn-ref").textContent = `سورة ${meta.name} - الآية ${pointer.ayah}`;
  document.getElementById("learn-round-info").textContent = `الجولة ${(item.roundStreak || 0) + 1} من ${ROUNDS_TO_MASTER}`;
  updateRoundDots(item.roundStreak || 0);

  const audio = document.getElementById("learn-audio");
  audio.src = `${AUDIO_BASE}/${ayahObj.number}.mp3`;

  renderLearnRound();
}

function updateRoundDots(streak) {
  document.querySelectorAll("#round-dots .dot").forEach((dot, i) => {
    dot.classList.toggle("filled", i < streak);
  });
}

function renderLearnRound() {
  const container = document.getElementById("learn-text");
  container.innerHTML = learnWords
    .map((w, idx) => {
      if (idx < learnWordIndex) return `<span class="word">${w}</span>`;
      if (idx === learnWordIndex) return `<span class="word blank" id="learn-blank">${w}</span>`;
      return `<span class="word masked">${w}</span>`;
    })
    .join(" ");

  const mcqContainer = document.getElementById("mcq-options");
  const typeContainer = document.getElementById("type-answer");
  mcqContainer.innerHTML = "";
  mcqContainer.classList.toggle("hidden", learnMode !== "mcq");
  typeContainer.classList.toggle("hidden", learnMode !== "type");

  if (learnMode === "mcq") {
    const correctWord = learnWords[learnWordIndex];
    const options = buildMcqOptions(correctWord, learnWords);
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "mcq-btn";
      btn.textContent = opt;
      btn.addEventListener("click", () => handleLearnAnswer(opt === correctWord, btn));
      mcqContainer.appendChild(btn);
    });
  } else {
    const input = document.getElementById("type-input");
    input.value = "";
    input.className = "";
    input.focus();
  }
}

const COMMON_QURAN_WORDS = [
  "اللَّهِ", "الرَّحْمَٰنِ", "الرَّحِيمِ", "رَبِّ", "الْعَالَمِينَ", "يَوْمِ", "الدِّينِ",
  "نَعْبُدُ", "نَسْتَعِينُ", "اهْدِنَا", "الصِّرَاطَ", "الْمُسْتَقِيمَ", "الَّذِينَ", "أَنْعَمْتَ",
  "عَلَيْهِمْ", "غَيْرِ", "الْمَغْضُوبِ", "الضَّالِّينَ", "قُلْ", "هُوَ", "أَحَدٌ",
];

function buildMcqOptions(correctWord, ayahWords) {
  const usedNorms = new Set([normalizeArabic(correctWord)]);
  const pool = [];
  function addCandidate(w) {
    const n = normalizeArabic(w);
    if (n && !usedNorms.has(n)) {
      usedNorms.add(n);
      pool.push(w);
    }
  }
  ayahWords.forEach(addCandidate);
  const surahWords = surahAyahsCache[state.learningPointer.surah];
  if (surahWords) {
    shuffleArray(surahWords).forEach((a) => a.text.split(/\s+/).forEach(addCandidate));
  }
  const distractors = shuffleArray(pool).slice(0, 3);
  let fallbackIdx = 0;
  while (distractors.length < 3 && fallbackIdx < COMMON_QURAN_WORDS.length) {
    const candidate = COMMON_QURAN_WORDS[fallbackIdx++];
    const n = normalizeArabic(candidate);
    if (!usedNorms.has(n)) {
      usedNorms.add(n);
      distractors.push(candidate);
    }
  }
  return shuffleArray([correctWord, ...distractors]);
}

function handleLearnAnswer(isCorrect, sourceEl) {
  const blank = document.getElementById("learn-blank");
  if (isCorrect) {
    playSuccessSound();
    if (sourceEl) sourceEl.classList.add("correct");
    if (blank) {
      blank.classList.remove("blank");
      blank.classList.add("correct-flash");
      blank.textContent = learnWords[learnWordIndex];
    }
    document.querySelectorAll(".mcq-btn").forEach((b) => (b.disabled = true));
    setTimeout(() => advanceLearnWord(), 550);
  } else {
    playErrorSound();
    learnMistakeThisRound = true;
    if (sourceEl) sourceEl.classList.add("wrong");
    if (blank) blank.classList.add("wrong-flash");
    setTimeout(() => blank && blank.classList.remove("wrong-flash"), 400);
  }
}

document.getElementById("btn-type-submit").addEventListener("click", submitTypedAnswer);
document.getElementById("type-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitTypedAnswer();
});

function submitTypedAnswer() {
  const input = document.getElementById("type-input");
  const correctWord = learnWords[learnWordIndex];
  const isCorrect = normalizeArabic(input.value) === normalizeArabic(correctWord);
  input.className = isCorrect ? "correct" : "wrong";
  handleLearnAnswer(isCorrect, null);
  if (!isCorrect) setTimeout(() => { input.value = ""; input.className = ""; }, 500);
}

function advanceLearnWord() {
  learnWordIndex++;
  if (learnWordIndex >= learnWords.length) {
    completeLearnRound();
  } else {
    renderLearnRound();
  }
}

function completeLearnRound() {
  const item = state.ayahs[learnCurrentKey];
  if (!learnMistakeThisRound) {
    item.roundStreak = (item.roundStreak || 0) + 1;
  } else {
    item.roundStreak = 0;
  }
  saveState();

  if (item.roundStreak >= ROUNDS_TO_MASTER) {
    masterCurrentLearningAyah(item);
  } else {
    showToast(learnMistakeThisRound ? "قريب جدًا! أعد المحاولة من جديد 💪" : `أحسنت! جولة ${item.roundStreak} من ${ROUNDS_TO_MASTER} ✅`, learnMistakeThisRound ? undefined : "success");
    if (!learnMistakeThisRound) fireConfetti(false);
    setTimeout(() => loadLearnAyah(), 900);
  }
}

function masterCurrentLearningAyah(item) {
  item.learningStage = "srs";
  sm2Schedule(item, 4);
  markActivityToday();
  saveState();
  fireConfetti(true);
  playMasterySound();
  showToast(`🌟 أتقنت آية ${item.surahName} : ${item.ayah}! ${randomEncouragement()}`, "success");

  // advance the sequential learning pointer to the next ayah
  const nextAyah = item.ayah + 1;
  state.learningPointer = { surah: item.surah, ayah: nextAyah };
  saveState();
  setTimeout(() => loadLearnAyah(), 1400);
}

document.getElementById("btn-learn-audio").addEventListener("click", () => {
  document.getElementById("learn-audio").play().catch(() => {});
});

document.getElementById("btn-learn-meanings").addEventListener("click", async () => {
  const container = document.getElementById("learn-meanings");
  if (!container.classList.contains("hidden")) {
    container.classList.add("hidden");
    return;
  }
  container.classList.remove("hidden");
  container.innerHTML = `<p class="muted">جاري تحميل المعاني...</p>`;
  const pointer = state.learningPointer;
  try {
    const meanings = await fetchWordMeanings(pointer.surah, pointer.ayah);
    if (!meanings.length) throw new Error("empty");
    container.innerHTML = meanings
      .map((m) => `<div class="meaning-chip"><span class="mw-ar">${m.text}</span><span>${m.meaning || "—"}</span></div>`)
      .join("");
  } catch (e) {
    container.innerHTML = `<p class="muted">تعذّر تحميل معاني الكلمات حاليًا.</p>`;
  }
});

document.getElementById("btn-learn-voice").addEventListener("click", () => {
  const item = state.ayahs[learnCurrentKey];
  if (!item) return;
  runVoiceTest(item.text, document.getElementById("voice-result"));
});

// ---------- Daily Ta'ahud challenge ----------

let isChallengeMode = false;

function startDailyChallenge() {
  const mastered = Object.values(state.ayahs).filter((i) => i.learningStage === "srs");
  if (mastered.length === 0) return;
  reviewQueue = shuffleArray(mastered).slice(0, Math.min(5, mastered.length));
  reviewIndex = 0;
  isChallengeMode = true;
  challengeCorrectCount = 0;
  switchTab("review");
  document.getElementById("challenge-banner").classList.remove("hidden");
  document.getElementById("review-empty").classList.add("hidden");
  document.getElementById("review-session").classList.remove("hidden");
  loadReviewItem();
}

// ---------- Review session (spaced-repetition due queue) ----------

let reviewQueue = [];
let reviewIndex = 0;
let currentWords = [];
let maskLevel = 0; // 0 = none masked ... up to full mask
let challengeCorrectCount = 0;

function getDueQueue() {
  const today = todayISO();
  return Object.values(state.ayahs)
    .filter((i) => i.learningStage === "srs" && i.due <= today)
    .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
}

function startReviewSession() {
  isChallengeMode = false;
  document.getElementById("challenge-banner").classList.add("hidden");
  reviewQueue = getDueQueue();
  reviewIndex = 0;
  const empty = document.getElementById("review-empty");
  const session = document.getElementById("review-session");
  if (reviewQueue.length === 0) {
    empty.innerHTML = `<p>🎉 لا توجد آيات تحتاج مراجعة الآن.</p><p class="muted">أضف آيات جديدة من تبويب "ابدأ الحفظ" أو عد لاحقًا حين يحين موعد المراجعة.</p>`;
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
  document.getElementById("review-voice-result").classList.add("hidden");
}

function renderMaskedText() {
  const container = document.getElementById("review-text");
  const n = currentWords.length;
  const hiddenIndices = new Set();
  if (maskLevel > 0) {
    const fractionToHide = Math.min(maskLevel * 0.34, 1);
    const countToHide = Math.round(n * fractionToHide);
    const indices = [...Array(n).keys()];
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
      if (hiddenIndices.has(idx)) return `<span class="word masked" data-idx="${idx}">${w}</span>`;
      return `<span class="word">${w}</span>`;
    })
    .join(" ");

  container.querySelectorAll(".word.masked").forEach((el) => {
    el.addEventListener("click", () => el.classList.remove("masked"));
  });
}

document.getElementById("btn-play-audio").addEventListener("click", () => {
  document.getElementById("review-audio").play().catch(() => {});
});

document.getElementById("btn-mask-more").addEventListener("click", () => {
  maskLevel = Math.min(maskLevel + 1, 3);
  renderMaskedText();
});

document.getElementById("btn-mask-reset").addEventListener("click", () => {
  maskLevel = 0;
  renderMaskedText();
});

document.getElementById("btn-review-voice").addEventListener("click", () => {
  const item = reviewQueue[reviewIndex];
  if (!item) return;
  runVoiceTest(item.text, document.getElementById("review-voice-result"));
});

document.getElementById("btn-reveal").addEventListener("click", () => {
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
    if (quality >= 4) challengeCorrectCount++;

    reviewIndex++;
    if (reviewIndex >= reviewQueue.length) {
      document.getElementById("review-progress-fill").style.width = `100%`;
      finishReviewOrChallenge();
    } else {
      loadReviewItem();
    }
  });
});

function finishReviewOrChallenge() {
  const empty = document.getElementById("review-empty");
  const session = document.getElementById("review-session");
  if (isChallengeMode) {
    state.dailyChallenge = { date: todayISO(), score: challengeCorrectCount, total: reviewQueue.length };
    saveState();
    fireConfetti(true);
    playMasterySound();
    empty.innerHTML = `<p>⚡ انتهى تحدي تعاهد اليوم!</p><p class="muted">نتيجتك: ${challengeCorrectCount} من ${reviewQueue.length} — ${randomEncouragement()}</p>`;
    isChallengeMode = false;
    document.getElementById("challenge-banner").classList.add("hidden");
  } else {
    fireConfetti(false);
    showToast(randomEncouragement(), "success");
    empty.innerHTML = `<p>👏 أحسنت! أنهيت جلسة المراجعة لهذا اليوم.</p>`;
  }
  empty.classList.remove("hidden");
  session.classList.add("hidden");
}

// ---------- PWA service worker ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ---------- Init ----------

initBrowseTab();
renderDashboard();
