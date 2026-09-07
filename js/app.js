// تدبر - Smart Quran memorization app
// Spaced repetition (SM-2) + active recall (MCQ / typing / progressive masking / voice recitation)
// instead of passive re-reading. All progress is stored locally (localStorage).

const API_BASE = "https://api.alquran.cloud/v1";
const AUDIO_CDN = "https://cdn.islamic.network/quran/audio"; // /{bitrate}/{reciterId}/{globalAyahNumber}.mp3
const WORD_MEANING_API = "https://api.quran.com/api/v4/verses/by_key"; // /{surah}:{ayah}?words=true
const STATE_KEY = "tadabbur_state_v1";
const ROUNDS_TO_MASTER = 3;

// This CDN doesn't serve every reciter at every bitrate - a handful of very
// popular ones 403 at 128kbps but work at 64kbps, and vice versa. Each entry
// records the bitrate actually verified working for that reciter's per-ayah
// files, not just a name people recognize.
const RECITERS = [
  { id: "ar.alafasy", name: "مشاري راشد العفاسي", bitrate: 128 },
  { id: "ar.husary", name: "محمود خليل الحصري", bitrate: 128 },
  { id: "ar.minshawi", name: "محمد صديق المنشاوي", bitrate: 128 },
  { id: "ar.mahermuaiqly", name: "ماهر المعيقلي", bitrate: 128 },
  { id: "ar.abdulbasitmurattal", name: "عبد الباسط عبد الصمد", bitrate: 64 },
  { id: "ar.abdurrahmaansudais", name: "عبد الرحمن السديس", bitrate: 64 },
];

const THEMES = [
  { id: "default", name: "أخضر هادئ (افتراضي)" },
  { id: "sepia", name: "صحراوي دافئ" },
  { id: "night", name: "أزرق ليلي" },
  { id: "forest", name: "أخضر داكن مريح" },
];

function audioSrcFor(globalAyahNumber) {
  const reciter = RECITERS.find((r) => r.id === state.reciter) || RECITERS[0];
  return `${AUDIO_CDN}/${reciter.bitrate}/${reciter.id}/${globalAyahNumber}.mp3`;
}

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
      parsed.reciter = parsed.reciter || RECITERS[0].id;
      parsed.theme = parsed.theme || THEMES[0].id;
      parsed.fontSize = parsed.fontSize || "medium";
      return parsed;
    }
  } catch (e) {
    console.warn("Failed to load state", e);
  }
  return {
    ayahs: {}, // key "surah:ayah" -> { surah, ayah, surahName, text, globalNumber, interval, repetition, ef, due, lastReviewed, added, learningStage, roundStreak, temporary }
    activity: {}, // "YYYY-MM-DD" -> true (for streak calculation)
    learningPointer: { surah: 1, ayah: 1 },
    dailyChallenge: { date: null, score: 0, total: 0 },
    reciter: RECITERS[0].id,
    theme: THEMES[0].id,
    fontSize: "medium",
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

// Quran text always fuses a leading waw/fa conjunction onto the next word
// ("\u0648\u064e\u064a\u064f\u0642\u0650\u064a\u0645\u0648\u0646\u064e" = "wa-yuqeemoona"), but a keyboard or speech engine
// often produces it as a separate token ("\u0648 \u064a\u0642\u064a\u0645\u0648\u0646"). Re-join such detached
// conjunctions before normalizing so this doesn't register as a mismatch.
function mergeDetachedConjunctions(text) {
  return (text || "").replace(/(^|\s)([\u0648\u0641])\s+(?=\S)/g, "$1$2");
}

// Strip tashkeel/waqf marks + normalize letter variants so typed/spoken answers
// match forgivingly. \p{Mn} catches every Unicode combining mark used in the
// Uthmani script (not just the basic harakat range: waqf signs, small-high
// marks, etc). Quran text also carries wasla alef (\u0671) which a normal
// keyboard never produces, so it must fold into \u0627 (alef) too.
//
// The Uthmani rasm often marks a long vowel with a "dagger alef" (\u0670)
// floating over a letter instead of writing it as a real \u0627 (e.g. "\u0623\u064F\u0648\u0644\u064E\u0670\u0626\u0650\u0643\u064E"
// = "ul\u00E2'ika"). Whether a person writes that vowel out as a real alef when
// typing/reciting varies by word and by habit (most drop it in "\u0627\u0644\u0631\u062d\u0645\u0646", many
// add it in "\u0623\u0648\u0644\u0626\u0643/\u0623\u0648\u0644\u0627\u0626\u0643"), so normalizeArabic keeps its one canonical form
// (dagger alef dropped) and normalizeArabicKeepingDaggerAlef offers the other;
// arabicWordsMatch below accepts either so both conventions read as correct.
function normalizeArabic(s) {
  return (s || "")
    .replace(/\p{Mn}/gu, "")
    .replace(/[\u0625\u0623\u0622\u0671\u0627]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    // Classical rasm spells the long vowel before a final \u0629 with \u0648 in a
    // handful of very common words (\u0627\u0644\u0635\u0644\u0648\u0629, \u0627\u0644\u0632\u0643\u0648\u0629, \u0627\u0644\u062d\u064A\u0648\u0629...). A typed or
    // spoken answer will use the modern spelling with \u0627, so fold that \u0648 back
    // to \u0627 once it's already sitting right before the (already-folded) \u0647.
    .replace(/\u0648(?=\u0647(?:\s|$))/g, "\u0627")
    .replace(/[^\u0621-\u064A\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArabicKeepingDaggerAlef(s) {
  return normalizeArabic((s || "").replace(/\u0670/g, "\u0627"));
}

// Accept either normalization convention (dagger alef dropped or spelled out)
// on either side of the comparison, since a typed/spoken answer and the
// Quran's own text don't reliably agree on which one they used.
function arabicWordsMatch(a, b) {
  const mergedA = mergeDetachedConjunctions(a);
  const mergedB = mergeDetachedConjunctions(b);
  const variantsA = [normalizeArabic(mergedA), normalizeArabicKeepingDaggerAlef(mergedA)];
  const variantsB = [normalizeArabic(mergedB), normalizeArabicKeepingDaggerAlef(mergedB)];
  return variantsA.some((va) => variantsB.includes(va));
}

// Some Quran text editions attach waqf (pause) annotations - "صلى"
// (continuing is preferable), "قلى" (pausing is preferable) and similar -
// as their own whitespace-separated token instead of a small superscript
// mark. Several of these are actually encoded as a *single* Unicode
// "small ligature" codepoint (Quranic annotation signs, U+06D6-U+06DC) that
// only *renders* as if it spelled out a word - as a combining mark (Mn) it
// carries no base letter of its own. A real word always has at least one
// base Arabic letter left after stripping combining marks; muqatta'at
// (the single disjointed letters that open some surahs, e.g. ص ق ن) are
// real letters (category Lo), never combining marks, so this never touches
// them. The exact-match set below is a belt-and-suspenders backup for the
// rarer case where an edition spells the annotation out with real letters.
const WAQF_ANNOTATION_TOKENS = new Set(["صلى", "قلى"]);
function stripWaqfTokens(words) {
  return words.filter((w) => {
    const stripped = w.replace(/\p{Mn}/gu, "");
    if (!stripped) return false; // pure combining-mark ligature - annotation, not a word
    return !WAQF_ANNOTATION_TOKENS.has(stripped);
  });
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

function looksLatinOnly(s) {
  return /^[A-Za-z0-9\s.,'’()\-]+$/.test((s || "").trim()) && /[A-Za-z]/.test(s);
}

async function fetchWordMeanings(surah, ayah) {
  const key = `${surah}:${ayah}`;
  if (wordMeaningsCache[key]) return wordMeaningsCache[key];

  let meanings = [];
  try {
    const res = await fetchWithTimeout(
      `${WORD_MEANING_API}/${key}?words=true&word_fields=text_uthmani&translation_fields=text&language=ar&word_translation_language=ar`,
      6000
    );
    const json = await res.json();
    const words = (json.verse && json.verse.words) || [];
    meanings = words
      .filter((w) => w.char_type_name === "word")
      .map((w) => ({ text: w.text_uthmani || w.text, meaning: (w.translation && w.translation.text) || "" }));
  } catch (e) {
    meanings = [];
  }

  // quran.com's word-by-word Arabic meanings aren't always available and can
  // silently fall back to English - if that happens, fall back ourselves to
  // a whole-ayah Arabic explanation so this feature never shows English.
  const gotArabic = meanings.length > 0 && meanings.some((m) => m.meaning && !looksLatinOnly(m.meaning));
  if (!gotArabic) {
    meanings = await fetchAyahTafsirFallback(surah, ayah);
  }

  wordMeaningsCache[key] = meanings;
  return meanings;
}

async function fetchAyahTafsirFallback(surah, ayah) {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/ayah/${surah}:${ayah}/ar.muyassar`, 6000);
    const json = await res.json();
    const text = json.data && json.data.text;
    if (!text) return [];
    return [{ text: "تفسير الآية", meaning: text, isWholeAyah: true }];
  } catch (e) {
    return [];
  }
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
  const masteredCount = items.filter((i) => i.learningStage === "srs" && !i.temporary).length;

  document.getElementById("stat-due").textContent = dueCount;
  document.getElementById("stat-new").textContent = learningCount;
  document.getElementById("stat-mastered").textContent = masteredCount;
  document.getElementById("stat-streak").textContent = computeStreak();

  document.getElementById("onboarding-panel").classList.toggle("show", items.length === 0);

  renderChallengeCard();

  const planList = document.getElementById("plan-list");
  planList.innerHTML = "";
  const srsItems = items.filter((i) => i.learningStage === "srs");
  if (srsItems.length === 0) {
    planList.innerHTML = `<p class="muted">لا توجد آيات في جدول المراجعة بعد. أكمل حفظ آية من تبويب "ابدأ الحفظ" لتظهر هنا.</p>`;
  } else {
    const bySurah = new Map();
    srsItems.forEach((item) => {
      if (!bySurah.has(item.surah)) bySurah.set(item.surah, { name: item.surahName || item.surah, items: [] });
      bySurah.get(item.surah).items.push(item);
    });
    [...bySurah.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([surahNum, group]) => {
        const items2 = [...group.items].sort((a, b) => a.ayah - b.ayah);
        const dueInGroup = items2.filter((i) => i.due <= today).length;
        const details = document.createElement("details");
        details.className = "plan-surah-group";
        const summary = document.createElement("summary");
        summary.className = "plan-surah-summary";
        summary.innerHTML = `
          <span class="plan-surah-name">📖 ${group.name}</span>
          <span class="plan-surah-meta">${items2.length} آية${dueInGroup ? ` <span class="badge due">${dueInGroup} مستحقة</span>` : ""}</span>
        `;
        details.appendChild(summary);
        const itemsContainer = document.createElement("div");
        itemsContainer.className = "plan-surah-items";
        items2.forEach((item) => itemsContainer.appendChild(buildPlanItemRow(item, today)));
        details.appendChild(itemsContainer);
        planList.appendChild(details);
      });
  }


  renderSurahProgress();
}

function buildPlanItemRow(item, today) {
  const div = document.createElement("div");
  div.className = "plan-item";
  let badge = "scheduled";
  let badgeText = `\u064a\u064f\u0633\u062a\u062d\u0642: ${item.due}`;
  if (item.due <= today) { badge = "due"; badgeText = "\u0645\u0633\u062a\u062d\u0642\u0629 \u0627\u0644\u0622\u0646"; }
  const tempBadge = item.temporary
    ? `<span class="badge temp" title="\u0644\u0627 \u062a\u064f\u062d\u062a\u0633\u0628 \u0636\u0645\u0646 \u0646\u0633\u0628\u0629 \u0627\u0644\u062a\u0642\u062f\u0645">\u0645\u0631\u0627\u062c\u0639\u0629 \u0645\u0624\u0642\u062a\u0629</span>`
    : "";
  div.innerHTML = `
    <span class="ref">\u0622\u064a\u0629 ${item.ayah}</span>
    <span class="snippet">${item.text || ""}</span>
    <span class="badge ${badge}">${badgeText}</span>
    ${tempBadge}
    <button class="icon-btn" title="\u0625\u0632\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u062e\u0637\u0629" data-key="${item.surah}:${item.ayah}">\u2715</button>
  `;
  div.querySelector(".icon-btn").addEventListener("click", (e) => {
    const key = e.currentTarget.dataset.key;
    delete state.ayahs[key];
    saveState();
    renderDashboard();
  });
  return div;
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
  items
    .filter((i) => !i.temporary)
    .forEach((i) => {
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

let selectedBrowseSurah = 1;
let selectedBrowseSurahName = "";

async function initBrowseTab() {
  const input = document.getElementById("surah-combo-input");
  const list = document.getElementById("surah-combo-list");
  try {
    const surahs = await fetchSurahList();

    function renderComboList(filterText) {
      const f = (filterText || "").trim().toLowerCase();
      const matches = surahs.filter(
        (s) => !f || String(s.number) === f || s.name.includes(filterText.trim()) || s.englishName.toLowerCase().includes(f)
      );
      list.innerHTML =
        matches
          .slice(0, 30)
          .map((s) => `<div class="combo-item" data-number="${s.number}">${s.number}. ${s.name} <span class="muted">(${s.englishName})</span></div>`)
          .join("") || `<div class="combo-empty muted">لا توجد نتائج</div>`;
      list.querySelectorAll(".combo-item").forEach((el) => {
        el.addEventListener("click", () => {
          const surahNumber = Number(el.dataset.number);
          const meta = surahs.find((s) => s.number === surahNumber);
          selectedBrowseSurah = surahNumber;
          selectedBrowseSurahName = meta.name;
          input.value = `${meta.number}. ${meta.name}`;
          list.classList.add("hidden");
          loadBrowseSurah(surahNumber);
        });
      });
    }

    input.addEventListener("focus", () => {
      renderComboList(input.dataset.selected ? "" : input.value);
      list.classList.remove("hidden");
    });
    input.addEventListener("input", () => {
      input.dataset.selected = "";
      renderComboList(input.value);
      list.classList.remove("hidden");
    });
    document.addEventListener("click", (e) => {
      if (!document.getElementById("surah-combo").contains(e.target)) list.classList.add("hidden");
    });

    const first = surahs[0];
    selectedBrowseSurah = first.number;
    selectedBrowseSurahName = first.name;
    input.value = `${first.number}. ${first.name}`;
    input.dataset.selected = "1";
    loadBrowseSurah(selectedBrowseSurah);
  } catch (e) {
    document.getElementById("surah-meta-info").textContent = "تعذّر تحميل قائمة السور. تحقق من الاتصال بالإنترنت.";
  }
}

async function loadBrowseSurah(surahNumber) {
  const metaInfo = document.getElementById("surah-meta-info");
  const titleEl = document.getElementById("browse-surah-title");
  metaInfo.textContent = "جاري التحميل...";
  try {
    const ayahs = await fetchSurahAyahs(surahNumber);
    const surahs = await fetchSurahList();
    const meta = surahs.find((s) => s.number === surahNumber);
    selectedBrowseSurahName = meta.name;
    titleEl.textContent = `معاينة آيات سورة ${meta.name}`;
    metaInfo.textContent = `عدد آيات السورة: ${ayahs.length}`;

    const fromInput = document.getElementById("ayah-from");
    const toInput = document.getElementById("ayah-to");
    fromInput.max = ayahs.length;
    toInput.max = ayahs.length;
    fromInput.value = 1;
    toInput.value = Math.min(5, ayahs.length);
    document.getElementById("ayah-search").value = "";

    renderBrowsePreview();
  } catch (e) {
    metaInfo.textContent = "تعذّر تحميل نص السورة. تحقق من الاتصال بالإنترنت.";
  }
}

function renderBrowsePreview() {
  const listEl = document.getElementById("browse-ayahs");
  const hint = document.getElementById("browse-preview-hint");
  const ayahs = surahAyahsCache[selectedBrowseSurah];
  if (!ayahs) return;

  const searchVal = document.getElementById("ayah-search").value.trim();
  let matches;
  if (searchVal) {
    const asNumber = Number(searchVal);
    // The Uthmani text is fully diacritized, so a plain typed word almost
    // never appears as a literal substring of it - normalize both sides
    // (strips tashkeel, folds letter variants) before comparing.
    const searchNorm = normalizeArabic(searchVal);
    matches = ayahs.filter((a) => a.numberInSurah === asNumber || normalizeArabic(a.text).includes(searchNorm));
    hint.textContent = `نتائج البحث عن "${searchVal}": ${matches.length} آية`;
  } else {
    const from = Number(document.getElementById("ayah-from").value) || 1;
    const to = Number(document.getElementById("ayah-to").value) || from;
    matches = ayahs.filter((a) => a.numberInSurah >= from && a.numberInSurah <= to);
    hint.textContent = `عرض الآيات من ${from} إلى ${to} (${matches.length} آية) — عدّل النطاق أعلاه أو استخدم البحث لعرض آيات أخرى`;
  }

  listEl.innerHTML = "";
  matches.slice(0, 50).forEach((a) => {
    const key = `${selectedBrowseSurah}:${a.numberInSurah}`;
    const already = !!state.ayahs[key];
    const row = document.createElement("div");
    row.className = "ayah-browse-item";
    row.innerHTML = `
      <div class="ayah-browse-head">
        <span class="ayah-num-chip">${a.numberInSurah}</span>
        <button class="btn ayah-add-btn" ${already ? "disabled" : ""}>${already ? "أُضيفت ✓" : "+ أضف"}</button>
      </div>
      <p class="ayah-browse-text">${a.text}</p>
    `;
    row.querySelector("button").addEventListener("click", (e) => {
      addAyahDirectlyToSrs(selectedBrowseSurah, selectedBrowseSurahName, a);
      e.target.textContent = "أُضيفت ✓";
      e.target.disabled = true;
      renderDashboard();
    });
    listEl.appendChild(row);
  });
}

document.getElementById("ayah-from").addEventListener("input", renderBrowsePreview);
document.getElementById("ayah-to").addEventListener("input", renderBrowsePreview);
document.getElementById("ayah-search").addEventListener("input", renderBrowsePreview);

// An ayah only counts toward real sequential progress in a surah if it
// immediately follows the last non-temporary ayah already memorized there.
// Anything else (jumping from ayah 6 to ayah 100) is still reviewable, but
// flagged "temporary" so it never inflates the surah's progress percentage.
function isContiguousAddition(surahNumber, ayahNumber) {
  const existingMax = Object.values(state.ayahs)
    .filter((i) => i.surah === surahNumber && i.learningStage === "srs" && !i.temporary)
    .reduce((m, i) => Math.max(m, i.ayah), 0);
  return ayahNumber === existingMax + 1;
}

function addAyahDirectlyToSrs(surahNumber, surahName, ayahObj) {
  const key = `${surahNumber}:${ayahObj.numberInSurah}`;
  if (state.ayahs[key]) return;
  const temporary = !isContiguousAddition(surahNumber, ayahObj.numberInSurah);
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
    temporary,
  };
  saveState();
  if (temporary) {
    showToast("أُضيفت كمراجعة مؤقتة فقط (فيها قفزة عن تسلسل حفظك في هذه السورة) — لن تُحتسب ضمن نسبة التقدم.");
  }
}

document.getElementById("btn-add-range").addEventListener("click", async () => {
  const surahNumber = selectedBrowseSurah;
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
    renderBrowsePreview();
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

// Speech recognition rarely returns words 1:1 with the reference text (it can
// drop, merge or mishear a word), so a strict positional compare marks nearly
// everything wrong after the first slip. Align both word lists with LCS
// instead, so a single missed word doesn't cascade into a false failure for
// the rest of the ayah.
function diffRecitation(correctText, transcript) {
  const correctWords = stripWaqfTokens(correctText.split(/\s+/));
  const saidWords = mergeDetachedConjunctions(transcript).split(/\s+/).filter(Boolean);

  const n = correctWords.length;
  const m = saidWords.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = arabicWordsMatch(correctWords[i], saidWords[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result = [];
  let i = 0;
  let j = 0;
  while (i < n) {
    if (j < m && arabicWordsMatch(correctWords[i], saidWords[j])) {
      result.push({ word: correctWords[i], ok: true });
      i++;
      j++;
    } else if (j < m && dp[i][j + 1] >= dp[i + 1][j]) {
      j++; // an extra/misheard word in the transcript - skip it
    } else {
      result.push({ word: correctWords[i], ok: false });
      i++;
    }
  }

  const correctCount = result.filter((r) => r.ok).length;
  const accuracy = n ? Math.round((correctCount / n) * 100) : 0;
  return { result, accuracy };
}

// ---------- Voice recitation modal ----------
// A half-screen modal (not a small inline box easy to scroll past) with a
// visible mic control, a live "listening" indicator, and - crucially - an
// editable transcript: speech recognition inevitably mishears a word here
// and there, so each recognized word is a chip the user can tap and correct
// by hand before scoring, rather than being stuck with whatever the engine
// guessed.

let voiceModalRecognition = null;
let voiceModalCorrectText = "";

function openVoiceModal(correctText) {
  if (!voiceSupported()) return;
  voiceModalCorrectText = correctText;
  resetVoiceModal();
  document.getElementById("voice-modal-overlay").classList.remove("hidden");
}

function closeVoiceModal() {
  if (voiceModalRecognition) {
    try { voiceModalRecognition.abort(); } catch (e) { /* already stopped */ }
    voiceModalRecognition = null;
  }
  document.getElementById("voice-modal-overlay").classList.add("hidden");
}

function resetVoiceModal() {
  if (voiceModalRecognition) {
    try { voiceModalRecognition.abort(); } catch (e) { /* already stopped */ }
    voiceModalRecognition = null;
  }
  document.getElementById("btn-voice-mic").classList.remove("listening");
  document.getElementById("voice-status-text").textContent = "اضغط على الميكروفون وابدأ بالتسميع";
  const wordsArea = document.getElementById("voice-words-area");
  wordsArea.innerHTML = "";
  wordsArea.classList.add("hidden");
  const scoreArea = document.getElementById("voice-score-area");
  scoreArea.innerHTML = "";
  scoreArea.classList.add("hidden");
  document.getElementById("voice-modal-actions").classList.add("hidden");
}

function startVoiceModalRecording() {
  resetVoiceModal();
  const micBtn = document.getElementById("btn-voice-mic");
  const statusText = document.getElementById("voice-status-text");
  micBtn.classList.add("listening");
  statusText.textContent = "🔴 يستمع الآن... اقرأ الآية بصوت واضح";

  const recognition = new SpeechRecognitionImpl();
  voiceModalRecognition = recognition;
  recognition.lang = "ar-SA";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = "";

  recognition.onresult = (e) => {
    let interim = "";
    for (let k = 0; k < e.results.length; k++) {
      const r = e.results[k];
      if (r.isFinal) finalTranscript += r[0].transcript + " ";
      else interim += r[0].transcript;
    }
    if (interim) statusText.textContent = interim;
  };
  recognition.onerror = (e) => {
    micBtn.classList.remove("listening");
    statusText.textContent = `تعذّر الاستماع (${e.error}). تأكد من السماح بالوصول للميكروفون وحاول مجددًا.`;
  };
  recognition.onend = () => {
    micBtn.classList.remove("listening");
    voiceModalRecognition = null;
    const transcript = mergeDetachedConjunctions(finalTranscript.trim());
    if (!transcript) {
      statusText.textContent = "لم يُسمع شيء، حاول مرة أخرى.";
      return;
    }
    showVoiceModalWords(transcript);
  };
  try {
    recognition.start();
  } catch (e) {
    micBtn.classList.remove("listening");
    statusText.textContent = "تعذّر بدء الاستماع.";
  }
}

function showVoiceModalWords(transcript) {
  document.getElementById("voice-status-text").textContent = "عدّل أي كلمة تظنّ أنها لم تُسمع بشكل صحيح، ثم اضغط تحقق:";
  const wordsArea = document.getElementById("voice-words-area");
  wordsArea.innerHTML = transcript
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `<span class="voice-word-chip" contenteditable="true">${w}</span>`)
    .join(" ");
  wordsArea.classList.remove("hidden");
  document.getElementById("voice-modal-actions").classList.remove("hidden");
}

function verifyVoiceModal() {
  const chips = [...document.getElementById("voice-words-area").querySelectorAll(".voice-word-chip")];
  const editedTranscript = chips.map((c) => c.textContent.trim()).filter(Boolean).join(" ");
  const { result, accuracy } = diffRecitation(voiceModalCorrectText, editedTranscript);
  const html = result.map((r) => `<span class="vr-word ${r.ok ? "ok" : "bad"}">${r.word}</span>`).join(" ");
  const scoreArea = document.getElementById("voice-score-area");
  scoreArea.innerHTML = `<p class="vr-text">${html}</p><p class="vr-score">دقة التسميع: ${accuracy}%</p>`;
  scoreArea.classList.remove("hidden");
  if (accuracy >= 85) { playSuccessSound(); showToast(randomEncouragement()); }
  else playErrorSound();
}

document.getElementById("btn-voice-mic").addEventListener("click", startVoiceModalRecording);
document.getElementById("btn-voice-retry").addEventListener("click", startVoiceModalRecording);
document.getElementById("btn-voice-verify").addEventListener("click", verifyVoiceModal);
document.getElementById("btn-voice-close").addEventListener("click", closeVoiceModal);
document.getElementById("voice-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "voice-modal-overlay") closeVoiceModal();
});

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
  learnWords = stripWaqfTokens(ayahObj.text.split(/\s+/));
  learnWordIndex = 0;
  learnMistakeThisRound = false;

  document.getElementById("learn-ref").textContent = `سورة ${meta.name} - الآية ${pointer.ayah}`;
  document.getElementById("learn-round-info").textContent = `الجولة ${(item.roundStreak || 0) + 1} من ${ROUNDS_TO_MASTER}`;
  updateRoundDots(item.roundStreak || 0);

  const audio = document.getElementById("learn-audio");
  audio.src = audioSrcFor(ayahObj.number);

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
  const isCorrect = arabicWordsMatch(input.value, correctWord);
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

// A single play/pause toggle button per audio player, instead of a play-only
// button with no way to stop it. Also surfaces a clear message (rather than
// silently doing nothing) when a specific reciter's file 404s/403s on the
// CDN, and lets the user recover the current ayah's src after a reciter
// change without needing to reload the page.
function setupAudioToggle(buttonId, audioId, playLabel) {
  const btn = document.getElementById(buttonId);
  const audio = document.getElementById(audioId);
  const setLabel = (label) => { btn.textContent = label; };

  btn.addEventListener("click", () => {
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.currentTime = 0;
      setLabel(playLabel);
    }
  });
  audio.addEventListener("playing", () => setLabel("⏹ إيقاف"));
  audio.addEventListener("pause", () => setLabel(playLabel));
  audio.addEventListener("ended", () => setLabel(playLabel));
  audio.addEventListener("error", () => {
    setLabel(playLabel);
    showToast("تعذّر تشغيل هذا القارئ لهذه الآية. جرّب قارئًا آخر من الإعدادات ⚙️", "error");
  });
}

setupAudioToggle("btn-learn-audio", "learn-audio", "🔊 استماع للآية");

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
    if (meanings[0].isWholeAyah) {
      container.innerHTML = `<p class="tafsir-fallback">${meanings[0].meaning}</p>`;
    } else {
      container.innerHTML = meanings
        .map((m) => `<div class="meaning-chip"><span class="mw-ar">${m.text}</span><span>${m.meaning || "—"}</span></div>`)
        .join("");
    }
  } catch (e) {
    container.innerHTML = `<p class="muted">تعذّر تحميل معاني الكلمات حاليًا.</p>`;
  }
});

document.getElementById("btn-learn-voice").addEventListener("click", () => {
  const item = state.ayahs[learnCurrentKey];
  if (!item) return;
  openVoiceModal(item.text);
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

  currentWords = stripWaqfTokens(item.text.split(/\s+/));
  maskLevel = 0;
  renderMaskedText();

  const audio = document.getElementById("review-audio");
  audio.src = audioSrcFor(item.globalNumber);

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

setupAudioToggle("btn-play-audio", "review-audio", "🔊 استماع");

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
  openVoiceModal(item.text);
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

// ---------- Settings (reciter + theme + font size) ----------

const FONT_SIZES = { small: "1.4rem", medium: "1.8rem", large: "2.2rem", xlarge: "2.6rem" };

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

function applyFontSize() {
  document.documentElement.style.setProperty("--ayah-font-size", FONT_SIZES[state.fontSize] || FONT_SIZES.medium);
}

// Update whichever ayah's audio element is currently loaded to the newly
// chosen reciter's file, instead of leaving the old reciter's src in place
// until the next ayah loads (which used to make it look like changing the
// reciter needed a page reload to take effect).
function refreshCurrentAudioSrc() {
  const learnItem = state.ayahs[learnCurrentKey];
  if (learnItem) {
    const learnAudio = document.getElementById("learn-audio");
    const wasPlaying = !learnAudio.paused;
    learnAudio.src = audioSrcFor(learnItem.globalNumber);
    if (wasPlaying) learnAudio.play().catch(() => {});
  }
  const reviewItem = reviewQueue[reviewIndex];
  if (reviewItem) {
    const reviewAudio = document.getElementById("review-audio");
    const wasPlaying = !reviewAudio.paused;
    reviewAudio.src = audioSrcFor(reviewItem.globalNumber);
    if (wasPlaying) reviewAudio.play().catch(() => {});
  }
}

function initSettingsPanel() {
  const overlay = document.getElementById("settings-overlay");
  const reciterSelect = document.getElementById("reciter-select");
  const themeSelect = document.getElementById("theme-select");
  const fontSizeSelect = document.getElementById("font-size-select");

  reciterSelect.innerHTML = RECITERS.map((r) => `<option value="${r.id}">${r.name}</option>`).join("");
  themeSelect.innerHTML = THEMES.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
  reciterSelect.value = state.reciter;
  themeSelect.value = state.theme;
  fontSizeSelect.value = state.fontSize;

  document.getElementById("btn-settings").addEventListener("click", () => overlay.classList.remove("hidden"));
  document.getElementById("btn-settings-close").addEventListener("click", () => overlay.classList.add("hidden"));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });

  reciterSelect.addEventListener("change", () => {
    state.reciter = reciterSelect.value;
    saveState();
    refreshCurrentAudioSrc();
    showToast("تم تغيير القارئ ✓", "success");
  });
  themeSelect.addEventListener("change", () => {
    state.theme = themeSelect.value;
    saveState();
    applyTheme();
  });
  fontSizeSelect.addEventListener("change", () => {
    state.fontSize = fontSizeSelect.value;
    saveState();
    applyFontSize();
  });
}

// ---------- PWA service worker ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ---------- Init ----------

applyTheme();
applyFontSize();
initSettingsPanel();
initBrowseTab();
renderDashboard();
