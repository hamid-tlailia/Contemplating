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
// The first reciter is always free; the rest are a points purchase (see
// renderReciterGrid) - once bought with points spent, a reciter stays
// unlocked. Themes, fonts, and backgrounds below are the exact same kind of
// purchase (see purchaseOrSelect), just cosmetic instead of audio.
const RECITERS = [
  { id: "ar.alafasy", name: "مشاري راشد العفاسي", bitrate: 128, points: 0 },
  { id: "ar.husary", name: "محمود خليل الحصري", bitrate: 128, points: 40 },
  { id: "ar.minshawi", name: "محمد صديق المنشاوي", bitrate: 128, points: 40 },
  { id: "ar.mahermuaiqly", name: "ماهر المعيقلي", bitrate: 128, points: 60 },
  { id: "ar.abdulbasitmurattal", name: "عبد الباسط عبد الصمد", bitrate: 64, points: 60 },
  { id: "ar.abdurrahmaansudais", name: "عبد الرحمن السديس", bitrate: 64, points: 80 },
];

const THEMES = [
  { id: "default", name: "أخضر هادئ", points: 0 },
  { id: "sepia", name: "صحراوي دافئ", points: 50 },
  { id: "night", name: "أزرق ليلي", points: 150 },
  { id: "forest", name: "أخضر داكن مريح", points: 300 },
  { id: "embroidered", name: "مطرز فاخر", points: 400 },
];

// Ayah text font - a purely typographic choice, unlocked and applied the
// same way as a theme (see applyFont/renderFontGrid).
const FONTS = [
  { id: "amiri", name: "أميري (تقليدي)", family: "'Amiri', serif", points: 0 },
  { id: "scheherazade", name: "شهرزاد", family: "'Scheherazade New', serif", points: 30 },
  { id: "lateef", name: "لطيف", family: "'Lateef', serif", points: 30 },
  { id: "arefruqaa", name: "عارف رقعة", family: "'Aref Ruqaa', serif", points: 60 },
  { id: "reemkufi", name: "ريم كوفي", family: "'Reem Kufi', sans-serif", points: 60 },
];

// A decorative background pattern behind the whole app (CSS-only - no
// external images to keep this offline-friendly and licensing-free),
// selected/purchased exactly like a theme or font (see applyBackground).
const BACKGROUNDS = [
  { id: "default", name: "النجمة الافتراضية", points: 0 },
  { id: "geometric-gold", name: "زخرفة ذهبية", points: 40 },
  { id: "waves", name: "أمواج هادئة", points: 60 },
  { id: "stars-scatter", name: "سماء مرصّعة", points: 80 },
];

// Kept deliberately modest - these are a motivational layer on top of real
// memorization work, not a reward loop, so unlocking a reciter/theme/font/
// background should take sustained use, not a single session.
const POINTS = {
  masterAyah: 6,
  reviewEasy: 2,
  reviewGood: 2,
  reviewHard: 1,
  reviewAgain: 0,
  dailyChallenge: 10,
  // Paid for turning up and finishing the day's wird, whatever its size.
  // Rewarding effort rather than output is the one shape of reward that
  // doesn't erode the motivation it's meant to support.
  wirdComplete: 4,
};

// Small inline icon set matching the bottom-nav's stroke style, used instead
// of emoji on buttons where an emoji reads as inconsistent/childish next to
// the app's own iconography.
const ICONS = {
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v15H6.5a2.5 2.5 0 0 0 0 5H20"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-6.5 0-10-7-10-7a19.7 19.7 0 0 1 4.22-5.36M9.9 4.24A10.6 10.6 0 0 1 12 4c6.5 0 10 7 10 7a19.6 19.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M2 2l20 20"/></svg>',
  volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l14-8Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2 21 6l-4 4"/><path d="M3 12v-1a4 4 0 0 1 4-4h14"/><path d="M7 22 3 18l4-4"/><path d="M21 12v1a4 4 0 0 1-4 4H3"/></svg>',
  spinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity=".28"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.05V17h6v-.25c0-.85.4-1.55 1-2.05A7 7 0 0 0 12 2Z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v4"/><path d="M8 23h8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  flash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>',
  checkDone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-11"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  xCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  optionsList: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2"/><path d="M11 6h9"/><circle cx="5" cy="12" r="2"/><path d="M11 12h9"/><circle cx="5" cy="18" r="2"/><path d="M11 18h9"/></svg>',
  coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>',
};
function iconLabel(iconKey, text) {
  return `<span class="icon-label">${ICONS[iconKey]}<span>${text}</span></span>`;
}

// An SVG icon instead of the 🪙 emoji: emoji glyphs carry their own baked-in
// internal artwork (some renderers even draw a "1" on the coin face) whose
// vertical position within its own box is outside CSS's control, so no
// amount of align-items/line-height ever lines it up with the point count
// reliably across devices - a plain stroke icon we draw ourselves does.
document.getElementById("header-coin-icon").innerHTML = ICONS.coin;

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

// A day's review load is capped by default. Spaced repetition piles up
// silently - a fortnight away and 80 ayahs come due at once - and that
// backlog, not the reviewing itself, is what makes people abandon a review
// schedule. Whatever doesn't fit today simply stays due and comes back
// tomorrow, oldest first; the cap is a default, not a cage (0 removes it,
// and "تابع المراجعة" below carries on past it whenever the person wants).
const REVIEW_DAILY_CAP_DEFAULT = 20;

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
      parsed.font = parsed.font || FONTS[0].id;
      parsed.background = parsed.background || BACKGROUNDS[0].id;
      parsed.fontSize = parsed.fontSize || "medium";
      parsed.points = parsed.points || 0;
      parsed.wirdTarget = parsed.wirdTarget || 5;
      parsed.wirdTargetType = parsed.wirdTargetType || "ayahs";
      parsed.dailyCounts = parsed.dailyCounts || {};
      parsed.dailyPageCounts = parsed.dailyPageCounts || {};
      parsed.unlockedReciters = parsed.unlockedReciters || [RECITERS[0].id];
      // Anyone upgrading from the old cumulative-points-earned theme unlock
      // keeps whichever theme they had active (even if it wouldn't be
      // affordable to re-buy today) rather than being reset to default.
      parsed.unlockedThemes = parsed.unlockedThemes || [THEMES[0].id, parsed.theme];
      parsed.unlockedFonts = parsed.unlockedFonts || [FONTS[0].id];
      parsed.unlockedBackgrounds = parsed.unlockedBackgrounds || [BACKGROUNDS[0].id];
      parsed.mushafPointer = parsed.mushafPointer || null; // {surah, ayah} - where the Mushaf reader should resume next
      parsed.reviewDailyCap = parsed.reviewDailyCap == null ? REVIEW_DAILY_CAP_DEFAULT : parsed.reviewDailyCap;
      parsed.reviewCounts = parsed.reviewCounts || {};
      parsed.wirdPlan = parsed.wirdPlan || null;
      parsed.autoVaryModes = parsed.autoVaryModes !== false;
      parsed.ageMode = parsed.ageMode || "adult";
      parsed.wirdRewardedDate = parsed.wirdRewardedDate || null;
      parsed.masteredCounts = parsed.masteredCounts || {};
      parsed.colorScheme = parsed.colorScheme || "system";
      parsed.mushafReader = parsed.mushafReader || null;
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
    font: FONTS[0].id,
    background: BACKGROUNDS[0].id,
    fontSize: "medium",
    colorScheme: "system", // "system" | "light" | "dark" - only the default theme follows it
    mushafReader: null, // {ayahs, index} - what the fullscreen reader is showing, so /mushaf survives a refresh
    points: 0,
    wirdTarget: 5,
    wirdTargetType: "ayahs", // "ayahs" | "pages" - which unit wirdTarget is measured in
    dailyCounts: {}, // "YYYY-MM-DD" -> number of ayahs mastered/reviewed/read that day
    dailyPageCounts: {}, // "YYYY-MM-DD" -> number of Mushaf pages read that day
    unlockedReciters: [RECITERS[0].id],
    unlockedThemes: [THEMES[0].id],
    unlockedFonts: [FONTS[0].id],
    unlockedBackgrounds: [BACKGROUNDS[0].id],
    mushafPointer: null, // {surah, ayah} - where the Mushaf reader should resume next
    reviewDailyCap: REVIEW_DAILY_CAP_DEFAULT, // 0 = no cap
    reviewCounts: {}, // "YYYY-MM-DD" -> ayahs graded in a review session that day
    wirdPlan: null, // {anchor, time:"HH:MM", place} - the when/where commitment
    autoVaryModes: true, // rotate the test mode across an ayah's three rounds
    ageMode: "adult", // which age profile's defaults are in force
    wirdRewardedDate: null, // the day the wird-completion reward was last paid
    masteredCounts: {}, // "YYYY-MM-DD" -> ayahs newly mastered that day
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

function formatArabicDate(iso) {
  return new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T00:00:00`));
}

// Days for the first ~2 weeks, weeks up to ~2 months, months beyond that -
// so a brand-new streak reads "3 أيام" rather than an odd "0 أسابيع", and a
// years-long one reads in months rather than a triple-digit day count.
function formatDurationSince(iso) {
  const start = new Date(`${iso}T00:00:00`);
  const days = Math.max(0, Math.round((new Date() - start) / 86400000));
  if (days === 0) return "اليوم";
  if (days < 14) return `${days} ${days === 1 ? "يوم" : days === 2 ? "يومان" : "أيام"}`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `${weeks} ${weeks === 1 ? "أسبوع" : weeks === 2 ? "أسبوعان" : "أسابيع"}`;
  }
  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? "شهر" : months === 2 ? "شهران" : "أشهر"}`;
}

function markActivityToday() {
  const today = todayISO();
  state.activity[today] = true;
  state.dailyCounts[today] = (state.dailyCounts[today] || 0) + 1;
  saveState();
  checkWirdCompletionReward();
}

function intervalText(days) {
  if (!days || days <= 1) return "غدًا";
  if (days === 2) return "بعد يومين";
  if (days <= 10) return `بعد ${days} أيام`;
  return `بعد ${days} يومًا`;
}

// Where this ayah sits in its surah - the thing a person actually wants to
// know after mastering one, and something a points total can never say.
function surahMasteredProgress(surahNumber) {
  const done = Object.values(state.ayahs).filter(
    (i) => i.surah === surahNumber && i.learningStage === "srs" && !i.temporary
  ).length;
  const meta = (surahListCache || []).find((s) => s.number === surahNumber);
  return meta ? `${done} من ${meta.numberOfAyahs} في السورة` : `${done} آية من السورة`;
}

// Paid once a day, for finishing the day's wird - not for how much was in
// it. Two ayahs on a hard day earns exactly what ten earns on an easy one,
// because what is being encouraged is coming back, not output.
function checkWirdCompletionReward() {
  const today = todayISO();
  if (state.wirdRewardedDate === today) return;
  const type = state.wirdTargetType || "ayahs";
  const counts = type === "pages" ? state.dailyPageCounts : state.dailyCounts;
  const target = state.wirdTarget || 5;
  if ((counts[today] || 0) < target) return;
  state.wirdRewardedDate = today;
  saveState();
  addPoints(POINTS.wirdComplete);
  renderWirdPlanCard();
  showToast(
    state.wirdPlan ? "🤝 وفّيت بعهد اليوم" : "🌙 أتممت ورد اليوم",
    "success",
    `${activeDaysThisWeek()} من 7 أيام هذا الأسبوع · +${POINTS.wirdComplete}`
  );
}

// Points are a pure motivational layer - they never gate any actual
// memorization feature, only the cosmetic purchases in the settings panel
// (theme/font/background/reciter - see purchaseOrSelect). Awarding them
// here (rather than scattering literal numbers at each call site) keeps
// the "what earns points" list in one place.
function addPoints(amount) {
  if (!amount) return;
  state.points += amount;
  saveState();
  renderPointsDisplay();
}

// Shared click-purchase flow for every cosmetic collectible grid (reciters,
// themes, fonts, backgrounds): selecting an already-owned item is free and
// instant, selecting a locked one spends points behind a confirm dialog (or
// explains the shortfall) - unlike the old cumulative-points-earned theme
// unlock, points are actually spent and stay spent.
function purchaseOrSelect(item, ownedList, { onSelect, confirmTitle, unlockedNoun, thisNoun }) {
  if (ownedList.includes(item.id)) {
    onSelect(item.id);
    saveState();
    return;
  }
  if (state.points >= item.points) {
    showConfirmModal(
      confirmTitle,
      `افتح "${item.name}" مقابل ${item.points} 🪙 (رصيدك: ${state.points})؟`,
      `أنفق ${item.points} 🪙 وافتحه`,
      () => {
        state.points -= item.points;
        ownedList.push(item.id);
        onSelect(item.id);
        saveState();
        renderPointsDisplay();
        fireConfetti(true);
        showToast(`🔓 فتحت ${unlockedNoun}: "${item.name}"!`, "success");
      }
    );
  } else {
    showToast(`🪙 يتطلب فتح ${thisNoun} ${item.points} نقطة ولا تملك ما يكفي (رصيدك: ${state.points}).`, "error");
  }
}

function renderPointsDisplay() {
  const el = document.getElementById("points-display");
  if (el) el.textContent = state.points;
  const headerEl = document.getElementById("header-points-value");
  if (headerEl) headerEl.textContent = state.points;
}

// Two changes from a plain consecutive-day count, both about the streak
// serving the person rather than the other way round:
//
//   * a day that hasn't been used YET doesn't end the streak. Opening the
//     app at breakfast used to show 0 after a month of daily work, which
//     is both false and exactly the message least likely to get someone to
//     sit down and revise.
//   * one missed day is forgiven (never two in a row). Losing a long
//     streak to a single busy day is the point where people stop opening
//     the app at all; the streak survives, and the week strip still shows
//     the gap honestly.
function computeStreak() {
  let streak = 0;
  let forgiven = 0;
  const cursor = new Date();
  if (!state.activity[cursor.toISOString().slice(0, 10)]) cursor.setDate(cursor.getDate() - 1);
  let lastWasGap = false;
  while (streak < 3650) {
    const key = cursor.toISOString().slice(0, 10);
    if (state.activity[key]) {
      streak++;
      lastWasGap = false;
    } else {
      // one grace day per full week earned, and never two adjacent
      const allowed = 1 + Math.floor(streak / 7);
      if (streak === 0 || lastWasGap || forgiven >= allowed) break;
      forgiven++;
      lastWasGap = true;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Days actually used out of the last 7 - the honest number behind a
// forgiven streak, and the one a weekly goal is measured against.
function activeDaysThisWeek() {
  let n = 0;
  const cursor = new Date();
  for (let i = 0; i < 7; i++) {
    if (state.activity[cursor.toISOString().slice(0, 10)]) n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
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

// Comparing a typed answer with the Quran's text is comparing two different
// orthographies. The Uthmani rasm and the spelling people actually type
// disagree systematically - not by exceptions that could be listed in a
// dictionary, but by rules:
//
//   ٱلصَّلَوٰةَ / الصلاة      a long ā carried by و or ى plus a dagger alef
//   ٱلسَّمَٰوَٰتِ / السماوات    a dagger alef standing in for a written alef
//   إِبْرَٰهِۦمَ / إبراهيم      a superscript small yeh/waw standing for a full letter
//   شَيْـًۭٔا / شيئًا          a bare hamza on a tatweel instead of on a seat
//   ٱلَّيْلِ / الليل           a shadda where the modern spelling doubles the letter
//   أُو۟لُوا۟ / أولو           the silent alef after a final و
//
// So this normalizes both sides by those rules rather than matching literally.
// Where a rule is genuinely ambiguous - a dagger alef after و/ى can mean
// either "this letter IS the alef" (الصلوة) or "put an alef after it"
// (السمٰوٰت) - both readings are produced and either may match. Measured
// against the API's own modern-spelling edition, word for word across every
// ayah in the Quran: 1.56% of words failed to match before any of this, 0.08%
// after the first pass, and none now.
const ARABIC_SUPERSCRIPT_LETTERS = { "\u06E5": "\u0648", "\u06E6": "\u064A", "\u06E7": "\u064A", "\u06E8": "\u0646" };

function normalizeArabic(s) {
  return (s || "")
    .replace(/\p{Mn}/gu, "")
    .replace(/\u0640/g, "") // tatweel: a stretch of the pen, never a letter
    .replace(/[\u0621\u0624\u0626]/g, "")
    .replace(/[\u0625\u0623\u0622\u0671\u0627]/g, "\u0627")
    // The Uthmani rasm often writes a hamza with no seat at all where the
    // modern spelling gives it one (ء ؤ ئ) - and almost nobody types the
    // seat the same way twice. Dropped on both sides like a diacritic.
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    // Everything that is not a letter goes here, BEFORE the rules below that
    // look for the end of a word: a superscript letter left dangling past the
    // final \u0647 (\u0639\u064e\u062f\u064f\u0648\u0651\u0650\u0647\u0650\u06e6) hid that end from them.
    .replace(/[^\u0621-\u064A\s]/g, "")
    // Classical rasm spells the long vowel before a final \u0629 with \u0648 in a
    // handful of very common words (\u0627\u0644\u0635\u0644\u0648\u0629, \u0627\u0644\u0632\u0643\u0648\u0629, \u0627\u0644\u062d\u064a\u0648\u0629...). A typed or
    // spoken answer will use the modern spelling with \u0627, so fold that \u0648 back
    // to \u0627 once it's already sitting right before the (already-folded) \u0647.
    .replace(/\u0648(?=\u0647(?:\s|$))/g, "\u0627")
    // The silent alef after a plural-verb waw, written in the rasm and
    // dropped in modern spelling (أُو۟لُوا۟ / أولو، يَتْلُوا۟ / يتلو).
    .replace(/\u0648\u0627(?=\s|$)/g, "\u0648")
    // The rasm writes one yeh where the modern spelling writes the two it
    // hears (\u064a\u064f\u062d\u0652\u0649\u0650 / \u064a\u064f\u062d\u0652\u064a\u0650\u064a, \u0644\u064e\u0645\u064f\u062d\u0652\u0649\u0650 / \u0644\u064e\u0645\u064f\u062d\u0652\u064a\u0650\u064a).
    .replace(/\u064A\u064A(?=\s|$)/g, "\u064A")
    // Writing a shadda out can leave three of a letter where the modern
    // spelling already had two; two is the most Arabic ever writes. And a
    // doubled alef is never written at all - it only appears here when a
    // rasm alef meets one this produced (ٱلرِّبَوٰا۟ / الربا).
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/\u0627\u0627/g, "\u0627")
    .replace(/\s+/g, " ")
    .trim();
}

// What is left once the rules above have done their work. Checked word for
// word against the modern-spelling edition of all 6,236 ayahs: these are the
// only places in the Quran where the two orthographies differ by something no
// rule explains, so they are listed rather than guessed at. Keys are the
// rasm's normalized form; a \u0648/\u0641/\u0644/\u0628/\u0643 in front of a whole-word key is allowed for.
const RASM_SPELLING_SWAPS = [
  ["\u0628\u0635\u0637", "\u0628\u0633\u0637"],      // \u0628\u064e\u0635\u0652\u0637\u064e\u0629\u064b / \u0628\u0633\u0637\u0629\u060c \u0648\u064e\u064a\u064e\u0628\u0652\u0635\u064f\u0637\u064f / \u0648\u064a\u0628\u0633\u0637
  ["\u0635\u064A\u0637\u0631", "\u0633\u064A\u0637\u0631"], // \u0627\u0644\u0645\u064f\u0635\u064e\u064a\u0652\u0637\u0650\u0631\u064f\u0648\u0646\u064e / \u0627\u0644\u0645\u0633\u064a\u0637\u0631\u0648\u0646\u060c \u0628\u0650\u0645\u064f\u0635\u064e\u064a\u0652\u0637\u0650\u0631\u064d / \u0628\u0645\u0633\u064a\u0637\u0631
];
const RASM_WORD_SWAPS = new Map([
  // A final alef the modern spelling writes as an alef maqsura. Nothing in
  // the rasm says which word takes which, and folding every final alef into
  // \u0649 would make \u0623\u0646\u0632\u0644\u0646\u0627 the same word as \u0623\u0646\u0632\u0644\u0646\u064a - so, by word.
  ["\u0631\u0627", "\u0631\u064A"],           // \u0631\u064e\u0621\u064e\u0627 / \u0631\u0623\u0649
  ["\u062A\u0631\u0627", "\u062A\u0631\u0627\u064A"],      // \u062a\u064e\u0631\u064e\u0670\u0653\u0621\u064e\u0627 / \u062a\u0631\u0627\u0621\u0649
  ["\u0627\u0642\u0635\u0627", "\u0627\u0642\u0635\u064A"],   // \u0623\u064e\u0642\u0652\u0635\u064e\u0627 / \u0623\u0642\u0635\u0649
  ["\u0627\u0644\u0627\u0642\u0635\u0627", "\u0627\u0644\u0627\u0642\u0635\u064A"], // \u0627\u0644\u0623\u064e\u0642\u0652\u0635\u064e\u0627 / \u0627\u0644\u0623\u0642\u0635\u0649
  ["\u0644\u062F\u0627", "\u0644\u062F\u064A"],         // \u0644\u064e\u062f\u064e\u0627 / \u0644\u062f\u0649
  ["\u0637\u063A\u0627", "\u0637\u063A\u064A"],         // \u0637\u064e\u063a\u064e\u0627 / \u0637\u063a\u0649
  ["\u062A\u062A\u0631\u0627", "\u062A\u062A\u0631\u064A"],     // \u062a\u064e\u062a\u0652\u0631\u064e\u0627 / \u062a\u062a\u0631\u0649
  ["\u0646\u0627", "\u0646\u0627\u064A"],           // \u0648\u064e\u0646\u064e\u0640\u064e\u0654\u0627 / \u0648\u0646\u0623\u0649
  // And four one-off spellings.
  ["\u0644\u064A\u0643\u0647", "\u0627\u0644\u064A\u0643\u0647"],   // \u0644\u0652\u0640\u064e\u0654\u064a\u0643\u064e\u0629\u0650 / \u0627\u0644\u0623\u064a\u0643\u0629 - written both ways in the Quran itself
  ["\u0644\u062A\u062E\u0630\u062A", "\u0644\u0627\u062A\u062E\u0630\u062A"], // \u0644\u064e\u062a\u064e\u0651\u062e\u064e\u0630\u0652\u062a\u064e / \u0644\u0627\u062a\u062e\u0630\u062a
  ["\u064A\u0628\u0646\u0645", "\u064A\u0627\u0628\u0646\u0645"],   // \u064a\u064e\u0628\u0652\u0646\u064e\u0624\u064f\u0645\u064e\u0651 / \u064a\u0627 \u0627\u0628\u0646 \u0623\u0645\u0651
  ["\u0648\u0644\u0644\u0648", "\u0648\u0646\u0644\u0648"],     // \u0648\u064e\u0623\u064e\u0644\u064e\u0651\u0648\u0650 / \u0648\u0623\u0646 \u0644\u0648
]);

// Every reading of a word that the two orthographies could plausibly agree
// on. Small set, cached: this runs inside the recitation diff's DP, which
// calls it O(n*m) times per ayah.
const arabicVariantCache = new Map();
function arabicWordVariants(word, spokenElision = false) {
  const key = (spokenElision ? "s\u0000" : "w\u0000") + word;
  const cached = arabicVariantCache.get(key);
  if (cached) return cached;
  const merged = mergeDetachedConjunctions(word);
  // Each axis below is a place where the two orthographies can be read two
  // ways. Every combination is produced; a match on any one of them is a
  // match.
  const axes = [
    // A superscript small waw/yeh is a letter in some words (إِبْرَٰهِۦمَ /
    // إبراهيم، دَاوُۥدَ / داوود) and silent in others (بِهِۦ / به).
    (w) => [w, w.replace(/[\u06E5-\u06E8]/g, (c) => ARABIC_SUPERSCRIPT_LETTERS[c])],
    // A dagger alef either stands in for a written alef (ٱلسَّمَٰوَٰتِ /
    // السماوات), or - when it sits on a و/ى - means that letter IS the alef
    // (ٱلصَّلَوٰةَ / الصلاة), or is simply not written at all (ٱلرَّحْمَٰنِ /
    // الرحمن). A word can carry more than one, and they need not be read the
    // same way: يَٰمُوسَىٰ is يا موسى - the first written out, the second not -
    // so each one is decided on its own rather than all of them together.
    (w) => {
      let forms = [w];
      for (let pass = 0; pass < 4 && forms.some((f) => f.includes("\u0670")); pass++) {
        forms = forms.flatMap((f) => {
          const at = f.indexOf("\u0670");
          if (at < 0) return [f];
          const before = f.slice(0, at);
          const after = f.slice(at + 1);
          const carrier = f[at - 1];
          const readings = [before + after, before + "\u0627" + after];
          if (carrier === "\u0648" || carrier === "\u0649") readings.push(before.slice(0, -1) + "\u0627" + after);
          return readings;
        });
      }
      return forms;
    },
    // A shadda IS a doubled letter, and the two spellings disagree about
    // writing it out: the rasm has ٱلَّيْلِ where the modern has اللَّيْلِ.
    // Never for a word's first letter, where the shadda belongs to an
    // assimilated word before it (مِن رَّبِّهِمْ) the modern text lacks.
    (w) => [w, w.replace(/(\S)([\u0621-\u064A])([\u064B-\u0650\u0652-\u065F\u0670]*)\u0651/g, "$1$2$3$2")],
    // \u0633\u0623\u0644 after a one-letter prefix is the one place the rasm drops the alef
    // of a connecting hamza the modern spelling writes: \u0641\u064e\u0633\u0652\u0640\u064e\u0654\u0644\u0652 / \u0641\u0627\u0633\u0623\u0644\u060c
    // \u0648\u064e\u0633\u0652\u0640\u064e\u0654\u0644\u0652\u0647\u064f\u0645\u0652 / \u0648\u0627\u0633\u0623\u0644\u0647\u0645. Narrow on purpose: dropping that alef wherever
    // it appears would make \u0648\u0627\u0639\u0645\u0644\u0648\u0627 the same word as \u0648\u0639\u0645\u0644\u0648\u0627, and \u0643\u0627\u0641\u0631 as \u0643\u0641\u0631.
    (w) => [w, w.replace(/^([\u0648\u0641\u0644\u0628\u0643])([\u064B-\u0652\u0670]*)\u0627(?=\u0633[\u064B-\u0652\u0670]*[\u0621\u0623\u0624\u0626\u0654])/, "$1$2")],
    // Where the modern spelling seats a medial hamza on an alef
    // (يَسْأَلُونَ), the rasm writes the hamza alone with nothing under it
    // (يَسْـَٔلُونَ). Only medial: a word-initial أ/إ is written in both, and
    // dropping it would fold أمر into مر.
    (w) => [w, w.replace(/(\S)[\u0623\u0625]/g, "$1").replace(/(\S)[\u0623\u0625]/g, "$1")],
    // A letter carrying the small round zero is not pronounced (U+06DF always,
    // U+06E0 only when the reading runs on). Sometimes the modern spelling
    // drops it too (\u0648\u064e\u062b\u064e\u0645\u064f\u0648\u062f\u064e\u0627\u06df / \u0648\u062b\u0645\u0648\u062f\u060c \u0633\u064e\u0623\u064f\u0648\u06df\u0631\u0650\u064a\u0643\u064f\u0645\u0652 / \u0633\u0623\u0631\u064a\u0643\u0645) and
    // sometimes it keeps it (\u0623\u064f\u0648\u06df\u0644\u064e\u0670\u0653\u0626\u0650\u0643\u064e / \u0623\u0648\u0644\u0626\u0643), so both readings stand.
    (w) => [w, w.replace(/[\u0621-\u064A][\u064B-\u0652\u0670]*[\u06DF\u06E0]/g, "")],
    // The rasm joins some words the modern spelling writes apart - above all
    // the vocative يا (يَٰبَنِىٓ, يَٰٓأَيُّهَا, يَٰقَوْمِ). Only user input ever
    // carries a space here, since the ayah's own words are split on
    // whitespace, so this is what lets "يا بني" be typed for يَٰبَنِىٓ.
    (w) => [w, w.replace(/\s+/g, "")],
  ];
  // Heard, not written: واو الجماعة with its silent alef (تَكْتُمُوا۟) is
  // joined to what follows it in recitation, its vowel is not a syllable of
  // its own, and speech engines return تكتم. That is a fact about listening,
  // so it is allowed only when comparing a recitation - typing تكتم for
  // تَكْتُمُوا۟ is still a missing letter, and still wrong.
  if (spokenElision) {
    axes.push((w) => [w, w.replace(/\u0648[\u064B-\u065F\u0670]*\u0627(?=[\u064B-\u065F\u0670\u06D6-\u06ED]*$)/g, "")]);
  }
  let forms = [merged];
  // Deduplicated at every step: an axis that doesn't apply returns the form
  // unchanged, and without this each of them would double the list anyway -
  // 2^axes identical copies of a word nothing touched.
  for (const axis of axes) forms = [...new Set(forms.flatMap(axis))];
  const variants = new Set(forms.map(normalizeArabic));
  for (const v of [...variants]) {
    for (const [rasm, modern] of RASM_SPELLING_SWAPS) if (v.includes(rasm)) variants.add(v.split(rasm).join(modern));
    const whole = RASM_WORD_SWAPS.get(v);
    if (whole) variants.add(whole);
    if (v.length > 1 && "\u0648\u0641\u0644\u0628\u0643".includes(v[0])) {
      const prefixed = RASM_WORD_SWAPS.get(v.slice(1));
      if (prefixed) variants.add(v[0] + prefixed);
    }
  }
  variants.delete("");
  const list = [...variants];
  if (arabicVariantCache.size > 8000) arabicVariantCache.clear();
  arabicVariantCache.set(key, list);
  return list;
}

function arabicWordsMatch(a, b, { spokenElision = false } = {}) {
  const variantsA = arabicWordVariants(a, spokenElision);
  const variantsB = arabicWordVariants(b, spokenElision);
  return variantsA.some((va) => variantsB.includes(va));
}

// The rasm drops the yeh of a منقوص word and of the speaker's own ياء -
// أَطِيعُونِ is read أطيعوني, وَعِيدِ is وعيدي, يَٰعِبَادِ is يا عبادي - and it is
// pronounced, so an answer that writes it is not a mistake. One direction
// only: the answer may carry a yeh the ayah's word ends a kasra without, and
// never the reverse, which would let عبادي pass for عِبَادَ.
function answerMatchesQuranWord(quranWord, answer, opts) {
  if (arabicWordsMatch(quranWord, answer, opts)) return true;
  if (!/\u064A\s*$/.test(answer || "") || !/\u0650[\u06D6-\u06ED]*$/.test(quranWord || "")) return false;
  return arabicWordsMatch(quranWord, answer.replace(/\u064A(?=\s*$)/, ""), opts);
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

// Annotation codepoints that print as their own visible symbol rather than
// as a mark on a letter, and so end up looking like text:
//
//   U+0600-U+0605  Arabic number signs (bracket verse/sajdah numbers)
//   U+0610-U+0617  honorific ligatures (عليه السلام, رضي الله عنه, ...)
//   U+06D6-U+06DC  the waqf/wasl ligatures  ۖ ۗ ۘ ۙ ۚ ۛ ۜ
//   U+06DD         end of ayah  ۝
//   U+06DE         start of rub el hizb  ۞   <- the lone "*" that turned up
//                                              as a multiple-choice option
//   U+06E9         place of sajdah  ۩
//   U+FD3E/U+FD3F  ornate parentheses
//
// Deliberately NOT here: the harakat, the dagger alef (U+0670) and the
// small recitation marks (U+06DF-U+06E8) - those belong to the word and
// removing them would change how it is read.
const QURAN_ANNOTATION_RE = /[\u0600-\u0605\u0610-\u0617\u06D6-\u06DE\u06E9\uFD3E\uFD3F]/g;

// The words of an ayah as something to memorize: annotation stripped from
// inside each word, and any token that was nothing but annotation dropped.
// A real word always has at least one base Arabic letter left after
// combining marks are removed; muqatta'at (the disjointed letters opening
// some surahs, e.g. ص ق ن) are real letters (category Lo), never combining
// marks, so this never touches them.
function stripWaqfTokens(words) {
  return words
    .map((w) => w.replace(QURAN_ANNOTATION_RE, "").trim())
    .filter((w) => {
      const stripped = w.replace(/\p{Mn}/gu, "");
      if (!stripped) return false; // pure combining-mark ligature - annotation, not a word
      return !WAQF_ANNOTATION_TOKENS.has(stripped);
    });
}

// Same, straight from an ayah's raw text.
function quranWords(text) {
  return stripWaqfTokens(String(text || "").split(/\s+/));
}

// The ayah as one clean string, for the places that print it as prose
// rather than word by word. The Mushaf reader deliberately does NOT use
// this: there the annotation is the point - it's a reading view, and ۞
// marks where a hizb begins.
function cleanAyahText(text) {
  return quranWords(text).join(" ");
}

// New memorization outruns review very easily: adding an ayah takes one
// session, keeping it takes months of them, and the app used to let the
// two grow completely independently until the review queue was a wall. The
// traditional حفظ:مراجعة balance is about one new ayah to five reviewed,
// which is roughly what the schedule actually costs, so that is what gets
// measured - and shown, not enforced. A person who wants to push on today
// still can; they just do it knowing.
const NEW_TO_REVIEW_RATIO = 5;

function todaysBalance() {
  const today = todayISO();
  const learned = state.masteredCounts[today] || 0;
  const reviewed = state.reviewCounts[today] || 0;
  return { learned, reviewed, owed: Math.max(0, learned * NEW_TO_REVIEW_RATIO - reviewed) };
}

// ---------- Age profiles ----------
//
// The same drill does not fit a seven-year-old and a seventy-year-old.
// What actually differs by age, and is worth acting on:
//
//   children     attention is measured in minutes, memorization is by ear,
//                and writing an ayah is a handwriting exercise, not a recall
//                one - so: a small daily target, larger text, no typing
//                round;
//   teenagers    the standard drill, at a normal pace;
//   adults       the same, with the largest realistic daily load;
//   older adults encoding is slower and needs shorter gaps, not more
//                repetitions crammed into one sitting - so: a smaller daily
//                target, the largest text, no typing round, and review
//                intervals held tighter than SM-2 would set them.
//
// Everything a profile sets stays editable afterwards: it fills in sensible
// starting values, it doesn't lock anything.
const AGE_MODES = [
  {
    id: "child", label: "طفل", hint: "٥ - ١١ سنة", emoji: "🧒",
    wirdTarget: 2, reviewDailyCap: 10, fontSize: "large",
    modes: ["mcq", "partial"], intervalFactor: 0.8,
    note: "ورد يومي صغير، خط أكبر، بلا جولة كتابة، ومراجعة أقرب.",
  },
  {
    id: "teen", label: "يافع", hint: "١٢ - ١٧ سنة", emoji: "🧑",
    wirdTarget: 5, reviewDailyCap: 20, fontSize: "medium",
    modes: ["mcq", "partial", "type"], intervalFactor: 1,
    note: "الجولات الثلاث كاملة بوتيرة معتادة.",
  },
  {
    id: "adult", label: "بالغ", hint: "١٨ - ٥٩ سنة", emoji: "🧔",
    wirdTarget: 5, reviewDailyCap: 20, fontSize: "medium",
    modes: ["mcq", "partial", "type"], intervalFactor: 1,
    note: "الإعداد المتوازن: الجولات الثلاث وسقف مراجعة كامل.",
  },
  {
    id: "senior", label: "كبير السن", hint: "٦٠ سنة فأكثر", emoji: "🧓",
    wirdTarget: 3, reviewDailyCap: 15, fontSize: "xlarge",
    modes: ["mcq", "partial"], intervalFactor: 0.7,
    note: "خط أكبر ما يكون، بلا جولة كتابة، وتباعد أقصر بين المراجعات.",
  },
];

function ageProfile() {
  return AGE_MODES.find((m) => m.id === state.ageMode) || AGE_MODES[2];
}

function applyAgeMode(id) {
  const profile = AGE_MODES.find((m) => m.id === id);
  if (!profile) return;
  state.ageMode = profile.id;
  state.wirdTarget = profile.wirdTarget;
  state.reviewDailyCap = profile.reviewDailyCap;
  state.fontSize = profile.fontSize;
  learnModeManualOverride = false;
  saveState();
  applyFontSize();
  renderAgeModeGrids();
  renderDashboard();
  const fontSizeSelect = document.getElementById("font-size-select");
  if (fontSizeSelect) fontSizeSelect.value = state.fontSize;
  const capSelect = document.getElementById("review-cap-select");
  if (capSelect) capSelect.value = String(state.reviewDailyCap);
  const wirdInput = document.getElementById("wird-target-input");
  if (wirdInput) wirdInput.value = state.wirdTarget;
  if (document.getElementById("tab-learn").classList.contains("active")) loadLearnAyah();
  showToast(`${profile.emoji} ${profile.note}`, "success");
}

function renderAgeModeGrids() {
  ["settings-age-grid", "onboarding-age-grid"].forEach((id) => {
    const grid = document.getElementById(id);
    if (!grid) return;
    grid.innerHTML = "";
    AGE_MODES.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `age-mode-btn${m.id === state.ageMode ? " active" : ""}`;
      btn.innerHTML = `<span class="age-mode-emoji">${m.emoji}</span><span class="age-mode-label">${m.label}</span><span class="age-mode-hint">${m.hint}</span>`;
      btn.addEventListener("click", () => applyAgeMode(m.id));
      grid.appendChild(btn);
    });
  });
  const note = document.getElementById("age-mode-note");
  if (note) note.textContent = ageProfile().note;
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

  // Slower encoding wants shorter gaps, not longer sittings, so the older
  // profile pulls every interval in (see AGE_MODES). Applied to the final
  // interval rather than to the ease factor, so it can be changed or
  // undone by switching profile without having permanently skewed the
  // per-ayah ease that SM-2 has been learning.
  const factor = ageProfile().intervalFactor || 1;
  if (factor !== 1) item.interval = Math.max(1, Math.round(item.interval * factor));

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

// Quick-facts strip (revelation place, ayah count, English name) - all of it
// already sits in the surah list response we fetch anyway, so this is a
// pure formatting helper rather than a new API call.
function renderSurahInfoCaption(elementId, meta) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (!meta) { el.textContent = ""; return; }
  const place = meta.revelationType === "Meccan" ? "مكية" : meta.revelationType === "Medinan" ? "مدنية" : meta.revelationType;
  el.textContent = `${place} · ${meta.numberOfAyahs} آية · ${meta.englishName} (${meta.englishNameTranslation})`;
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
  // silently fall back to English per word rather than for the whole verse -
  // requiring every non-empty meaning to be Arabic (not just "at least one",
  // which one stray Arabic word/number was enough to satisfy while the rest
  // stayed in English) so a partial mix never reaches the screen; any English
  // leak at all falls back to a whole-ayah Arabic explanation instead.
  const nonEmpty = meanings.filter((m) => m.meaning);
  const gotArabic = nonEmpty.length > 0 && nonEmpty.every((m) => !looksLatinOnly(m.meaning));
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

// `note` is the secondary line: what was learned, when it comes back, and
// the points last and smallest. The headline is the accomplishment - the
// number is a footnote to it, not the message itself.
function showToast(message, type, note) {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = "toast" + (type ? ` toast-${type}` : "");
  const main = document.createElement("div");
  main.textContent = message;
  el.appendChild(main);
  if (note) {
    const sub = document.createElement("div");
    sub.className = "toast-note";
    sub.textContent = note;
    el.appendChild(sub);
  }
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

// Buttons only: the route also lives in an attribute on <html> (see
// index.html), and a listener on that would switch tabs on every click in
// the app.
document.querySelectorAll("button[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// This is a plain HTML/CSS/JS app - no framework and no build step - so the
// routing a React app gets from a router is done here, over the History API,
// which is what those routers use underneath anyway:
//
//   * every tab has its own address (/learn, /review, ...), so it can be
//     linked, bookmarked and shared;
//   * moving between them never loads a document - the panels are already in
//     the page, and only the URL and which one is shown change;
//   * a refresh reopens the tab in the address bar, and reopens it in the
//     first painted frame: the route is stamped on <html> by an inline script
//     in the document head (see index.html), long before this file runs, so
//     the dashboard is never briefly on screen first;
//   * the phone's back button walks back through the tabs instead of leaving
//     the app.
//
// Each tab also keeps its own scroll position, the way separate pages would.
const TAB_ROUTES = ["dashboard", "learn", "browse", "review"];

// Two of the overlays are pages of their own rather than passing dialogs:
// they have an address, a refresh reopens them where they were, and the
// phone's back button closes them instead of leaving the app. They layer
// over a tab, so their address carries both - /learn/settings, /review/mushaf
// - and closing one returns to the tab it was opened from.
const OVERLAY_ROUTES = {
  settings: {
    open: () => document.getElementById("settings-overlay").classList.remove("modal-closed"),
    close: () => document.getElementById("settings-overlay").classList.add("modal-closed"),
    // Nothing to reload: the settings sheet is markup, which is why it can
    // also be opened before the first paint (see index.html).
    restorable: () => true,
  },
  mushaf: {
    open: () => showMushafReader(),
    close: () => hideMushafReader(),
    // The reader shows what was actually loaded into it, and that is kept
    // with the rest of the app's state - so a refresh reopens the same
    // pages at the same one, offline included. Nothing kept, nothing to
    // reopen, and the address falls back to the tab underneath.
    restorable: () => !!(state.mushafReader && state.mushafReader.ayahs && state.mushafReader.ayahs.length),
  },
};

// Dialogs that are part of a flow rather than a place: they own no address,
// but back still has to close them rather than navigate out from under one.
const TRANSIENT_MODALS = [
  { id: "voice-modal-overlay", close: () => closeVoiceModal() },
  { id: "tasmee-overlay", close: () => closeTasmeeSession() },
  { id: "info-modal-overlay", close: () => closeInfoModal() },
];

const tabScrollPositions = {};
let pendingScrollRestoreTab = null; // set to a tab name to have switchTab return to where that tab was left
let currentTabName = document.documentElement.dataset.route || "dashboard";
// Overlays stack - the settings sheet opens over the reader without closing
// it - so the address carries them in order: /mushaf/settings is the reader
// with settings on top of it.
let overlayStack = [];
let pushedDepth = 0; // how many of the open overlays this app pushed history entries for

// The app is served from the root in production, but not necessarily in a
// test or a preview, so a route is built from wherever index.html sits
// rather than assumed to be "/learn".
const ROUTE_BASE = (() => {
  const segs = location.pathname.split("/");
  while (segs.length > 1) {
    const last = segs[segs.length - 1];
    if (last === "" || last === "index.html" || TAB_ROUTES.includes(last) || OVERLAY_ROUTES[last]) segs.pop();
    else break;
  }
  return segs.join("/") + "/";
})();

function routeFor(tab, overlays) {
  const parts = tab && tab !== "dashboard" ? [tab] : [];
  return ROUTE_BASE + parts.concat(overlays || []).join("/") + location.search;
}

function parseRoute() {
  let tab = "dashboard";
  const overlays = [];
  location.pathname.split("/").filter(Boolean).forEach((seg) => {
    if (TAB_ROUTES.includes(seg)) tab = seg;
    else if (OVERLAY_ROUTES[seg] && !overlays.includes(seg)) overlays.push(seg);
  });
  if (tab === "dashboard") {
    const legacy = (location.hash || "").replace(/^#\/?/, ""); // #learn, from before these were paths
    if (TAB_ROUTES.includes(legacy)) tab = legacy;
  }
  return { tab, overlays };
}

// file:// has no origin to push to, and a browser that refuses the write
// should cost the app nothing but its address bar.
function writeRoute(tab, overlays, replace) {
  try {
    history[replace ? "replaceState" : "pushState"]({ tab, overlays }, "", routeFor(tab, overlays));
  } catch (e) {
    location.hash = (overlays && overlays[overlays.length - 1]) || tab;
  }
}

// The DOM half, with no history of its own - what both a deliberate open and
// a back button end up calling. Anything open that the new list doesn't name
// is closed, innermost first; anything named that isn't open is opened.
function applyOverlays(list) {
  const next = list || [];
  for (let i = overlayStack.length - 1; i >= 0; i--) {
    if (!next.includes(overlayStack[i])) OVERLAY_ROUTES[overlayStack[i]].close();
  }
  next.forEach((name) => { if (!overlayStack.includes(name)) OVERLAY_ROUTES[name].open(); });
  overlayStack = next.slice();
  pushedDepth = Math.min(pushedDepth, overlayStack.length);
  if (overlayStack.length) document.documentElement.dataset.overlay = overlayStack.join(" ");
  else delete document.documentElement.dataset.overlay;
}

function openOverlay(name) {
  if (overlayStack.includes(name)) return;
  const next = overlayStack.concat(name);
  writeRoute(currentTabName, next, false);
  pushedDepth = next.length;
  applyOverlays(next);
}

// Closing the top one goes back rather than forward, so the entry its opening
// pushed is popped instead of stacked on - one press of the phone's back
// button then leaves it exactly as the ✕ does. When the app was opened
// straight onto this address there is nothing behind it to go back to, so the
// address is rewritten in place instead.
function closeOverlay(name) {
  const i = overlayStack.indexOf(name);
  if (i < 0) {
    OVERLAY_ROUTES[name].close();
    return;
  }
  if (i === overlayStack.length - 1 && pushedDepth >= overlayStack.length) {
    history.back(); // popstate does the closing
    return;
  }
  const next = overlayStack.slice(0, i);
  applyOverlays(next);
  writeRoute(currentTabName, next, true);
}

function switchTab(tab, { fromHistory = false } = {}) {
  tabScrollPositions[currentTabName] = window.scrollY;
  // Replacing rather than pushing when the tab hasn't changed: a session
  // restarted in place (finishing a review, say) is not a second page to
  // press back through.
  if (!fromHistory) writeRoute(tab, overlayStack, tab === currentTabName);
  currentTabName = tab;
  document.documentElement.dataset.route = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
  if (tab === "dashboard") renderDashboard();
  if (tab === "review" && !isChallengeMode && !isEphemeralReview) startReviewSession();
  if (tab === "learn") loadLearnAyah();
  // Opening a tab starts at its top. The remembered per-tab offset is only
  // restored when something explicitly asks for it (finishing a review
  // opened from a dashboard row - see finishReviewOrChallenge); applying it
  // to every switch meant walking into a tab already scrolled down, with
  // the header half cut off at the top.
  const restoreTo = pendingScrollRestoreTab === tab ? tabScrollPositions[tab] || 0 : 0;
  pendingScrollRestoreTab = null;
  // A tab's content can still be loading (async fetches in loadLearnAyah/
  // the browse tab) when switchTab returns, so the scroll is applied once
  // rendering has had a moment to settle instead of immediately, or it can
  // land wrong against not-yet-final content height.
  setTimeout(() => window.scrollTo(0, restoreTo), 60);
}

// Back and forward move between tabs and overlays, and never reload the
// document.
window.addEventListener("popstate", () => {
  // A dialog that is part of a flow gets the press first: leaving the tab
  // out from under an open one is never what back was meant to do. The
  // address it just left is pushed back, so nothing else moves.
  const openDialog = TRANSIENT_MODALS.find((m) => {
    const el = document.getElementById(m.id);
    return el && !el.classList.contains("modal-closed");
  });
  if (openDialog) {
    openDialog.close();
    writeRoute(currentTabName, overlayStack, false);
    return;
  }
  const { tab, overlays } = parseRoute();
  if (tab !== currentTabName) switchTab(tab, { fromHistory: true });
  const openable = overlays.filter((name) => OVERLAY_ROUTES[name].restorable());
  if (openable.join("/") !== overlayStack.join("/")) applyOverlays(openable);
  if (openable.length !== overlays.length) writeRoute(tab, openable, true);
});

// ---------- Dashboard ----------

const openPlanGroups = new Set(); // surah numbers currently expanded in the plan list

function renderDashboard() {
  const items = Object.values(state.ayahs);
  const today = todayISO();
  // The stat shows what's actually being asked of today, not the whole
  // backlog: a four-figure "due" count is a reason to close the app.
  const totalDue = items.filter((i) => i.learningStage === "srs" && i.due <= today).length;
  const dueCount = Math.min(totalDue, reviewsLeftToday());
  const learningCount = items.filter((i) => i.learningStage === "learning").length;
  const masteredCount = items.filter((i) => i.learningStage === "srs" && !i.temporary).length;

  document.getElementById("stat-due").textContent = dueCount;
  const deferredEl = document.getElementById("stat-due-deferred");
  if (deferredEl) {
    const deferred = totalDue - dueCount;
    // No "+" and no "/" in these chips: a lone neutral character between a
    // number and Arabic text gets reordered by the bidi algorithm and lands
    // on the wrong side ("+25" rendering as "25+").
    deferredEl.textContent = deferred > 0 ? `${deferred} مؤجلة` : "";
    deferredEl.classList.toggle("hidden", deferred <= 0);
  }
  const weekEl = document.getElementById("stat-week");
  if (weekEl) weekEl.textContent = `${activeDaysThisWeek()} من 7 أيام`;
  renderReviewBadge();

  const balanceEl = document.getElementById("balance-note");
  if (balanceEl) {
    const { learned, reviewed, owed } = todaysBalance();
    balanceEl.classList.toggle("hidden", learned === 0 && reviewed === 0);
    balanceEl.classList.toggle("out-of-balance", owed > 0);
    balanceEl.textContent = owed > 0
      ? `⚖️ اليوم: ${learned} حفظ جديد · ${reviewed} مراجعة — الميزان يميل نحو الجديد.`
      : `⚖️ اليوم: ${learned} حفظ جديد · ${reviewed} مراجعة — ميزان متّزن.`;
  }
  document.getElementById("stat-new").textContent = learningCount;
  document.getElementById("stat-mastered").textContent = masteredCount;
  document.getElementById("stat-streak").textContent = computeStreak();

  const TOTAL_QURAN_AYAHS = 6236;
  const overallPct = Math.min(100, (masteredCount / TOTAL_QURAN_AYAHS) * 100);
  document.getElementById("overall-progress-fill").style.width = `${overallPct}%`;
  document.getElementById("overall-progress-text").textContent =
    `${masteredCount} / ${TOTAL_QURAN_AYAHS} (${overallPct.toFixed(1)}%)`;

  const sinceEl = document.getElementById("memorization-since-text");
  const firstAdded = items.reduce((min, i) => (!min || i.added < min ? i.added : min), null);
  sinceEl.textContent = firstAdded
    ? `تحفظ منذ ${formatArabicDate(firstAdded)} (${formatDurationSince(firstAdded)})`
    : "";

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
        // renderDashboard rebuilds this list from scratch on every call (a
        // review grading, an ayah added, etc.), which without this defaults
        // every group back to closed - including ones the person just
        // opened - leaving the arrow (which does track the real [open]
        // state correctly) pointing the "open" way on a group that then
        // immediately looks and acts closed again.
        details.open = openPlanGroups.has(surahNum);
        details.addEventListener("toggle", () => {
          if (details.open) openPlanGroups.add(surahNum);
          else openPlanGroups.delete(surahNum);
        });
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
  renderWirdCard();
  renderWirdPlanCard();
  renderMeaningOfTheDay();
}

// Two-letter abbreviations (matches Intl's own ar-locale "narrow" weekday
// format) rather than a single letter - single letters like ح/خ/ج look too
// similar to tell apart at a glance in a small circle.
const WIRD_DAY_FULL = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]; // Sun..Sat, matches Date#getDay()

// ---------- The when/where commitment ("عهد الورد") ----------
//
// An intention with no time and no place attached decays into "some day":
// naming both, once, is what turns the wird into something that happens.
// The app can't schedule a notification for a closed page without a server
// (and this one deliberately has none), so the reminder is handed to the
// phone's own calendar as a repeating event - which survives the app being
// shut, reinstalled, or offline.
const WIRD_ANCHORS = [
  { id: "fajr", label: "بعد الفجر", time: "05:30" },
  { id: "dhuhr", label: "بعد الظهر", time: "13:00" },
  { id: "asr", label: "بعد العصر", time: "16:30" },
  { id: "maghrib", label: "بعد المغرب", time: "18:45" },
  { id: "isha", label: "بعد العشاء", time: "20:30" },
  { id: "custom", label: "وقت أختاره", time: "07:00" },
];

let wirdPlanDraftAnchor = "fajr";

function wirdPlanSentence(plan) {
  const anchor = WIRD_ANCHORS.find((a) => a.id === plan.anchor) || WIRD_ANCHORS[0];
  const when = plan.anchor === "custom" ? `الساعة ${plan.time}` : `${anchor.label} (${plan.time})`;
  const where = plan.place ? ` ${plan.place}` : "";
  return `سأحفظ وردي ${when}${where}.`;
}

function renderWirdPlanCard() {
  const view = document.getElementById("wird-plan-view");
  const form = document.getElementById("wird-plan-form");
  if (!view || !form) return;
  const plan = state.wirdPlan;

  const anchors = document.getElementById("wird-plan-anchors");
  if (!anchors.childElementCount) {
    WIRD_ANCHORS.forEach((a) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wird-anchor-btn";
      btn.dataset.anchor = a.id;
      btn.textContent = a.label;
      btn.addEventListener("click", () => {
        wirdPlanDraftAnchor = a.id;
        // The clock time follows the chosen anchor unless it's the free
        // one - a rough default the person can correct, since the app has
        // no location and so no real prayer times.
        if (a.id !== "custom") document.getElementById("wird-plan-time").value = a.time;
        renderWirdPlanAnchors();
      });
      anchors.appendChild(btn);
    });
  }

  if (!plan) {
    view.classList.add("hidden");
    form.classList.remove("hidden");
    document.getElementById("btn-wird-plan-cancel").classList.add("hidden");
    renderWirdPlanAnchors();
    return;
  }

  form.classList.add("hidden");
  view.classList.remove("hidden");
  document.getElementById("wird-plan-sentence").textContent = wirdPlanSentence(plan);

  // Held to today only, and phrased as a nudge rather than a scolding: a
  // missed commitment that greets you as a failure is one you stop making.
  const type = state.wirdTargetType || "ayahs";
  const counts = type === "pages" ? state.dailyPageCounts : state.dailyCounts;
  const done = (counts[todayISO()] || 0) >= (state.wirdTarget || 5);
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const statusEl = document.getElementById("wird-plan-status");
  if (done) statusEl.textContent = "✅ وفّيت بعهد اليوم. بارك الله فيك.";
  else if (nowHM >= plan.time) statusEl.textContent = "حان موعدك — ورد اليوم ما زال ينتظرك 🌿";
  else statusEl.textContent = "موعدك لم يحن بعد.";

  // A commitment kept isn't a commitment finished: it's daily, so the moment
  // today's is done the card names tomorrow's rather than sitting on a tick.
  // Both ways out are offered - adjust that appointment, or make a fresh
  // commitment altogether.
  const anchor = WIRD_ANCHORS.find((a) => a.id === plan.anchor) || WIRD_ANCHORS[0];
  const when = plan.anchor === "custom" ? `الساعة ${plan.time}` : `${anchor.label} (${plan.time})`;
  const nextEl = document.getElementById("wird-plan-next");
  nextEl.textContent = `🗓️ موعدك القادم: غدًا ${when}${plan.place ? ` ${plan.place}` : ""}`;
  nextEl.classList.toggle("hidden", !done);
  document.getElementById("btn-wird-plan-start").classList.toggle("hidden", done);
  document.getElementById("btn-wird-plan-new").classList.toggle("hidden", !done);
  document.getElementById("btn-wird-plan-edit").textContent = done ? "عدّل موعد الغد" : "تعديل العهد";
  renderWirdPlanAnchors();
}

function renderWirdPlanAnchors() {
  document.querySelectorAll("#wird-plan-anchors .wird-anchor-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.anchor === wirdPlanDraftAnchor);
  });
}

function openWirdPlanForm(fresh = false) {
  const plan = fresh ? null : state.wirdPlan;
  wirdPlanDraftAnchor = (plan && plan.anchor) || "fajr";
  document.getElementById("wird-plan-time").value = (plan && plan.time) || "05:30";
  document.getElementById("wird-plan-place").value = (plan && plan.place) || "";
  document.getElementById("wird-plan-view").classList.add("hidden");
  document.getElementById("wird-plan-form").classList.remove("hidden");
  document.getElementById("btn-wird-plan-cancel").classList.toggle("hidden", !state.wirdPlan);
  renderWirdPlanAnchors();
}

function saveWirdPlan() {
  const time = document.getElementById("wird-plan-time").value || "05:30";
  const place = document.getElementById("wird-plan-place").value.trim();
  state.wirdPlan = { anchor: wirdPlanDraftAnchor, time, place, created: todayISO() };
  saveState();
  renderWirdPlanCard();
  showToast(`🤝 ${wirdPlanSentence(state.wirdPlan)}`, "success");
}

// A daily repeating calendar event, written as a local ("floating") time so
// it fires at the same hour wherever the phone is.
function wirdPlanICS(plan) {
  const [h, m] = plan.time.split(":");
  const start = new Date();
  start.setHours(Number(h), Number(m), 0, 0);
  if (start < new Date()) start.setDate(start.getDate() + 1);
  const local = (d) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T` +
    `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  // Folding long lines is part of the format; the description is the
  // commitment itself, so it's what the reminder actually says.
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tadabbur//Wird//AR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:wird-${Date.now()}@tadabbur`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${local(start)}`,
    `DURATION:PT20M`,
    "RRULE:FREQ=DAILY",
    "SUMMARY:ورد الحفظ - تدبر",
    `DESCRIPTION:${wirdPlanSentence(plan)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT5M",
    "ACTION:DISPLAY",
    "DESCRIPTION:اقترب موعد وردك",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadWirdPlanICS() {
  if (!state.wirdPlan) return;
  const blob = new Blob([wirdPlanICS(state.wirdPlan)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wird-tadabbur.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("افتح الملف الذي نُزّل لإضافة التذكير اليومي إلى تقويم جوالك 📅", "success");
}

document.getElementById("btn-wird-plan-save").addEventListener("click", saveWirdPlan);
document.getElementById("btn-wird-plan-edit").addEventListener("click", () => openWirdPlanForm());
document.getElementById("btn-wird-plan-new").addEventListener("click", () => openWirdPlanForm(true));
document.getElementById("btn-wird-plan-cancel").addEventListener("click", renderWirdPlanCard);
document.getElementById("btn-wird-plan-ics").addEventListener("click", downloadWirdPlanICS);
document.getElementById("btn-wird-plan-start").addEventListener("click", () => openTodaysWirdReading());

// One word from the ayah being learned, with its meaning, on the dashboard.
// The point is what the visible daily "reward" is: the app's own answer to
// "what did I get out of today" should be something understood, not a
// number of coins. Same word all day (seeded by the date) so it reads as a
// thing to learn rather than a slot machine, and the card simply stays
// hidden when the meanings can't be fetched.
let meaningOfTheDayKey = null;
async function renderMeaningOfTheDay() {
  const card = document.getElementById("meaning-day-card");
  if (!card) return;
  const pointer = state.learningPointer;
  if (!pointer) return;
  const key = `${todayISO()}|${pointer.surah}:${pointer.ayah}`;
  if (key === meaningOfTheDayKey) return; // already showing this one
  meaningOfTheDayKey = key;

  let meanings = [];
  try {
    meanings = await fetchWordMeanings(pointer.surah, pointer.ayah);
  } catch (e) {
    meanings = [];
  }
  const usable = (meanings || []).filter((m) => m.text && m.meaning);
  if (!usable.length) {
    card.classList.add("hidden");
    return;
  }
  const seed = todayISO().split("-").reduce((n, part) => n + Number(part), pointer.ayah);
  const pick = usable[seed % usable.length];
  document.getElementById("meaning-day-word").textContent = pick.text;
  document.getElementById("meaning-day-meaning").textContent = pick.meaning;
  const meta = (surahListCache || []).find((x) => x.number === pointer.surah);
  document.getElementById("meaning-day-ref").textContent =
    `من ${meta ? meta.name : `سورة ${pointer.surah}`} - الآية ${pointer.ayah}`;
  card.classList.remove("hidden");
}

function renderWirdCard() {
  const type = state.wirdTargetType || "ayahs";
  const counts = type === "pages" ? state.dailyPageCounts : state.dailyCounts;
  const target = state.wirdTarget || 5;
  const today = todayISO();
  const todayCount = counts[today] || 0;
  const pct = Math.min(100, Math.round((todayCount / target) * 100));

  const ring = document.getElementById("wird-ring");
  if (ring) ring.style.background = `conic-gradient(var(--primary) ${pct}%, var(--border) ${pct}%)`;

  const countText = document.getElementById("wird-count-text");
  if (countText) countText.textContent = `${todayCount}/${target}`;

  const todayDateEl = document.getElementById("wird-today-date");
  if (todayDateEl) todayDateEl.textContent = formatArabicDate(today);

  const weekEl = document.getElementById("wird-week");
  if (weekEl) {
    weekEl.innerHTML = "";
    let todayEl = null;
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const count = counts[iso] || 0;
      const met = count >= target;
      const isToday = iso === today;
      const dayEl = document.createElement("div");
      dayEl.className = `wird-day${met ? " met" : ""}${isToday ? " today" : ""}`;
      dayEl.title = `${iso}: ${count}/${target}`;
      dayEl.textContent = WIRD_DAY_FULL[d.getDay()];
      weekEl.appendChild(dayEl);
      if (isToday) todayEl = dayEl;
    }
    // Full names don't all fit at once, so the strip scrolls - but today
    // should never be the part that scrolls out of sight by default.
    // scrollIntoView scrolls EVERY scrollable ancestor, the page included,
    // so on load this quietly dragged the whole document down to the wird
    // card - the app opened already scrolled past its own header. Restoring
    // the page's own offset right after (the scroll is instant, so this is
    // the same frame) keeps the strip centred without moving the page.
    if (todayEl) {
      const pageY = window.scrollY;
      const pageX = window.scrollX;
      todayEl.scrollIntoView({ behavior: "instant", inline: "center", block: "nearest" });
      window.scrollTo(pageX, pageY);
    }
  }
}

const ARABIC_INDIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
function toArabicIndicDigits(n) {
  return String(n).replace(/[0-9]/g, (d) => ARABIC_INDIC_DIGITS[Number(d)]);
}

// A way to log the daily wird from reading the Mushaf directly, instead of
// only being able to bump dailyCounts by memorizing/reviewing - some days
// the wird is just reading, not new memorization. Reading happens in a
// fullscreen, distraction-free reader (see openMushafReader below) rather
// than inline on the dashboard.
let selectedMushafSurah = null;
let mushafInputMode = "range"; // "range" | "page"

document.querySelectorAll(".mushaf-mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    mushafInputMode = btn.dataset.mushafMode;
    document.querySelectorAll(".mushaf-mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("mushaf-range-controls").classList.toggle("hidden", mushafInputMode !== "range");
    document.getElementById("mushaf-page-controls").classList.toggle("hidden", mushafInputMode !== "page");
  });
});

async function initMushafCard() {
  const loadBtn = document.getElementById("btn-mushaf-load");
  loadBtn.innerHTML = iconLabel("book", "عرض للقراءة");

  try {
    const surahs = await fetchSurahList();
    const startSurah = defaultMushafSurah(surahs);
    setupSurahCombo("mushaf-surah-combo", "mushaf-surah-combo-input", "mushaf-surah-combo-list", surahs, (surahNumber) => {
      updateMushafDefaultRange(surahNumber);
    }).setValue(startSurah);
    await updateMushafDefaultRange(startSurah);
  } catch (e) {
    document.getElementById("mushaf-surah-combo-input").placeholder = "تعذّر تحميل قائمة السور";
  }

  document.getElementById("mushaf-from").addEventListener("input", async () => {
    if (!selectedMushafSurah) return;
    try {
      const ayahs = await fetchSurahAyahs(selectedMushafSurah);
      const from = Math.max(1, Math.min(Number(document.getElementById("mushaf-from").value) || 1, ayahs.length));
      document.getElementById("mushaf-to").value = computeMushafTo(ayahs, from);
    } catch (e) {
      // leave whatever's there
    }
  });

  loadBtn.addEventListener("click", openTodaysWirdReading);
}

// Opens the fullscreen reader on whatever the reading card is currently
// set to. Shared by that card's own button and by the dashboard's quick
// "ابدأ ورد اليوم" shortcut, so the shortcut can't drift from the card.
async function openTodaysWirdReading() {
  if (mushafInputMode === "page") {
    const pageNumber = Number(document.getElementById("mushaf-page-input").value);
    if (!pageNumber || pageNumber < 1 || pageNumber > 604) {
      showToast("أدخل رقم صفحة صحيح بين 1 و604.", "error");
      return;
    }
    // A page-number jump should still cover the daily wird plan (e.g. a
    // 2-page target starting from the requested page), matching what
    // range mode already does from an ayah - not just the single page
    // typed in, which read as ignoring the plan entirely.
    const pageCount = state.wirdTargetType === "pages" ? Math.max(1, state.wirdTarget || 1) : 1;
    try {
      const ayahs = [];
      for (let p = pageNumber; p < pageNumber + pageCount && p <= 604; p++) {
        const res = await fetchWithTimeout(`${API_BASE}/page/${p}/quran-uthmani`, 8000);
        const json = await res.json();
        (json.data.ayahs || []).forEach((a) => ayahs.push({ ...a, surahNumberForReader: a.surah.number }));
      }
      if (ayahs.length === 0) return;
      openMushafReader(ayahs);
    } catch (e) {
      showToast("تعذّر تحميل الصفحة. تحقق من الاتصال بالإنترنت.", "error");
    }
    return;
  }
  const surahNumber = selectedMushafSurah;
  const from = Number(document.getElementById("mushaf-from").value) || 1;
  const to = Number(document.getElementById("mushaf-to").value) || from;
  if (!surahNumber || from > to) return;
  try {
    const ayahs = await fetchSurahAyahs(surahNumber);
    const matches = ayahs
      .filter((a) => a.numberInSurah >= from && a.numberInSurah <= to)
      .map((a) => ({ ...a, surahNumberForReader: surahNumber }));
    if (matches.length === 0) return;
    openMushafReader(matches);
  } catch (e) {
    showToast("تعذّر تحميل النص. تحقق من الاتصال بالإنترنت.", "error");
  }
}

// Resume wherever the last Mushaf-reading session left off; otherwise
// default to wherever memorization currently stands, so this doesn't reset
// to Al-Fatiha every time regardless of how far the person has progressed.
function defaultMushafSurah(surahs) {
  if (state.mushafPointer && surahs.some((s) => s.number === state.mushafPointer.surah)) {
    return state.mushafPointer.surah;
  }
  if (surahs.some((s) => s.number === state.learningPointer.surah)) {
    return state.learningPointer.surah;
  }
  return surahs[0].number;
}

// How many ayahs the daily wird plan actually asks for, starting from a
// given ayah (N ayahs, or however many ayahs the next N real Mushaf pages
// hold) - shared by the default-range calculation and by manually editing
// the "from" field, so either path keeps "to" in sync with the daily target.
function computeMushafTo(ayahs, from) {
  if (state.wirdTargetType === "pages") {
    const pages = groupAyahsIntoMushafPages(ayahs);
    let fromPageIdx = pages.findIndex((p) => p.ayahs[p.ayahs.length - 1].numberInSurah >= from);
    if (fromPageIdx === -1) fromPageIdx = 0;
    const pageCount = Math.max(1, Math.min(state.wirdTarget || 1, pages.length - fromPageIdx));
    const lastPage = pages[fromPageIdx + pageCount - 1];
    return lastPage.ayahs[lastPage.ayahs.length - 1].numberInSurah;
  }
  return Math.min(from + (state.wirdTarget || 5) - 1, ayahs.length);
}

// Defaults the from/to range to wherever this surah's reading should pick
// up (see defaultMushafSurah) and how far the wird plan says to go from
// there, instead of an arbitrary fixed 1-5.
async function updateMushafDefaultRange(surahNumber) {
  selectedMushafSurah = surahNumber;
  if (!surahNumber) return;
  const fromInput = document.getElementById("mushaf-from");
  const toInput = document.getElementById("mushaf-to");
  try {
    const ayahs = await fetchSurahAyahs(surahNumber);
    fromInput.max = ayahs.length;
    toInput.max = ayahs.length;
    let from;
    if (state.mushafPointer && state.mushafPointer.surah === surahNumber) {
      from = Math.min(state.mushafPointer.ayah, ayahs.length);
    } else if (surahNumber === state.learningPointer.surah) {
      from = Math.min(state.learningPointer.ayah, ayahs.length);
    } else {
      from = 1;
    }
    fromInput.value = from;
    toInput.value = computeMushafTo(ayahs, from);
  } catch (e) {
    // leave whatever values are already there
  }
}

// ---------- Fullscreen Mushaf reader ----------
// Paginated by the real Madani Mushaf page number the API already tags
// each ayah with (so a page holds exactly as many ayahs as an actual
// printed page, not an arbitrary chunk). Every page displayed this
// session is credited to today's wird in one batch once "نعم، أنهيت" is
// confirmed - see finishMushafReading.

let mushafPages = [];
let mushafPageIndex = 0;
let mushafVisitedPages = new Set(); // pages actually displayed this session - only credited on "نعم، أنهيت"

// Every surah but At-Tawbah (9) has the Quran's Uthmani text carrying
// "بسم الله الرحمن الرحيم" glued onto the START of ayah 1's own text - real
// for real for Al-Fatiha, where it IS ayah 1, but everywhere else it's just
// the surah's opening formula and not part of ayah 1's wording at all.
const BISMILLAH_NORMALIZED = normalizeArabic("بسم الله الرحمن الرحيم");
function splitBismillah(text) {
  const words = text.split(/\s+/);
  const first4 = words.slice(0, 4).join(" ");
  if (normalizeArabic(first4) === BISMILLAH_NORMALIZED) {
    return { bismillah: first4, rest: words.slice(4).join(" ") };
  }
  return { bismillah: null, rest: text };
}

function groupAyahsIntoMushafPages(ayahs) {
  const pages = [];
  let current = null;
  ayahs.forEach((a) => {
    const pageNumber = a.page || 1;
    if (!current || current.pageNumber !== pageNumber) {
      current = { pageNumber, ayahs: [] };
      pages.push(current);
    }
    current.ayahs.push(a);
  });
  return pages;
}

// ayahs must each carry a surahNumberForReader (see the two loadBtn paths
// above) - reading by page number can cross a surah boundary within a
// single page, so the reader can't assume one surah for the whole session.
// What the reader is showing is kept with the rest of the app's state, not
// only in memory: that is what lets /mushaf survive a refresh - and it is
// the text itself rather than a page number, so reopening needs no network
// and works offline. Only the fields the reader draws from are kept.
const MUSHAF_READER_MAX_AYAHS = 400;
function rememberMushafReader(ayahs, index) {
  if (!ayahs || ayahs.length > MUSHAF_READER_MAX_AYAHS) {
    state.mushafReader = null;
  } else {
    state.mushafReader = {
      index: index || 0,
      ayahs: ayahs.map((a) => ({
        text: a.text,
        page: a.page,
        numberInSurah: a.numberInSurah,
        surahNumberForReader: a.surahNumberForReader,
      })),
    };
  }
  saveState();
}

function openMushafReader(ayahs) {
  rememberMushafReader(ayahs, 0);
  openOverlay("mushaf");
  // A reading longer than the cap isn't kept, so it can't be reopened from
  // its address - but it still has to open now, from what it was handed.
  if (!state.mushafReader) {
    mushafPages = groupAyahsIntoMushafPages(ayahs);
    mushafPageIndex = 0;
    mushafVisitedPages = new Set();
    renderMushafReaderPage();
  }
}

// The DOM half, driven by what was kept - reached both by opening the reader
// and by landing on /mushaf.
function showMushafReader() {
  const kept = state.mushafReader;
  if (kept) {
    mushafPages = groupAyahsIntoMushafPages(kept.ayahs);
    mushafPageIndex = Math.min(kept.index || 0, mushafPages.length - 1);
    mushafVisitedPages = new Set();
  }
  document.getElementById("mushaf-reader-overlay").classList.remove("modal-closed");
  if (mushafPages.length) renderMushafReaderPage();
}

function hideMushafReader() {
  document.getElementById("mushaf-reader-overlay").classList.add("modal-closed");
  state.mushafReader = null;
  saveState();
}

function closeMushafReader() {
  closeOverlay("mushaf");
}

function renderMushafReaderPage() {
  const page = mushafPages[mushafPageIndex];
  mushafVisitedPages.add(page.pageNumber);
  let bismillahHTML = "";
  const bodyHTML = page.ayahs
    .map((a) => {
      let text = a.text;
      if (a.numberInSurah === 1 && a.surahNumberForReader !== 1) {
        const { bismillah, rest } = splitBismillah(text);
        if (bismillah) {
          // A span (not a <p>, which browsers won't let nest inside the
          // outer #mushaf-reader-text <p> without auto-correcting the DOM)
          bismillahHTML = `<span class="mushaf-bismillah">${bismillah}</span>`;
          text = rest;
        }
      }
      return `${text} <span class="ayah-number-badge">${toArabicIndicDigits(a.numberInSurah)}</span>`;
    })
    .join(" ");
  document.getElementById("mushaf-reader-text").innerHTML = bismillahHTML + bodyHTML;
  document.getElementById("mushaf-reader-page-label").textContent = `الصفحة ${mushafPageIndex + 1} من ${mushafPages.length}`;
  document.getElementById("mushaf-reader-body").scrollTop = 0;
  rememberMushafPage();

  // No point showing a "previous" button that can't go anywhere on the
  // first page, rather than showing it just disabled.
  const prevBtn = document.getElementById("btn-mushaf-reader-prev");
  prevBtn.classList.toggle("hidden", mushafPageIndex === 0);
  // "previous" sits on the right (backward, toward where reading started)
  // and "next" on the left (forward, matching RTL reading direction) - the
  // chevrons point the same way their button sits relative to the other.
  prevBtn.innerHTML = iconLabel("chevronRight", "الصفحة السابقة");
  const isLast = mushafPageIndex === mushafPages.length - 1;
  document.getElementById("btn-mushaf-reader-next").innerHTML = isLast
    ? iconLabel("checkDone", "أنهيت القراءة")
    : iconLabel("chevronLeft", "الصفحة التالية");
}

function goToNextMushafPage() {
  if (mushafPageIndex < mushafPages.length - 1) {
    mushafPageIndex++;
    renderMushafReaderPage();
  } else {
    // Nothing is credited to the wird for having merely turned pages -
    // only an explicit "نعم، أنهيت" here commits the whole session, so
    // reaching the last page while just browsing (or closing without
    // confirming) never silently counts as having read it.
    showConfirmModal(
      "إنهاء القراءة",
      "هل أنهيت قراءة اليوم؟ سيُضاف ما قرأته إلى ورد اليوم.",
      "نعم، أنهيت",
      finishMushafReading
    );
  }
}

async function finishMushafReading() {
  const visitedPages = mushafPages.filter((p) => mushafVisitedPages.has(p.pageNumber));
  const totalAyahs = visitedPages.reduce((sum, p) => sum + p.ayahs.length, 0);
  const today = todayISO();
  state.dailyCounts[today] = (state.dailyCounts[today] || 0) + totalAyahs;
  state.dailyPageCounts[today] = (state.dailyPageCounts[today] || 0) + visitedPages.length;

  // Remember where this session left off, so the reading card resumes from
  // there next time instead of always restarting from ayah 1 - rolling over
  // to the next surah's ayah 1 if this one is now fully read.
  const lastPage = visitedPages[visitedPages.length - 1];
  if (lastPage) {
    const lastAyah = lastPage.ayahs[lastPage.ayahs.length - 1];
    const lastSurah = lastAyah.surahNumberForReader;
    try {
      const surahs = await fetchSurahList();
      const meta = surahs.find((s) => s.number === lastSurah);
      const finishedSurah = meta && lastAyah.numberInSurah >= meta.numberOfAyahs;
      state.mushafPointer = finishedSurah
        ? { surah: Math.min(lastSurah + 1, 114), ayah: 1 }
        : { surah: lastSurah, ayah: lastAyah.numberInSurah + 1 };
    } catch (e) {
      state.mushafPointer = { surah: lastSurah, ayah: lastAyah.numberInSurah + 1 };
    }
  }

  saveState();
  renderWirdCard();
  closeMushafReader();
  checkWirdCompletionReward();

  const type = state.wirdTargetType || "ayahs";
  const counts = type === "pages" ? state.dailyPageCounts : state.dailyCounts;
  const target = state.wirdTarget || 5;
  const total = counts[today] || 0;
  if (total > target) {
    const surplus = total - target;
    const bonus = surplus * (type === "pages" ? 2 : 1);
    addPoints(bonus);
    // A long-lived toast (see .toast timing) that layers above the modal
    // stack (toast-container's z-index), so it stays visible even though
    // the person was mid-modal when this fired, not just after closing it.
    showToast(`🎉 تجاوزت هدف اليوم بـ ${surplus} ${type === "pages" ? "صفحة" : "آية"}`, "success", `+${bonus}`);
  } else {
    showToast("🌙 أُضيفت قراءتك ضمن ورد اليوم.", "success");
  }
}

function goToPrevMushafPage() {
  if (mushafPageIndex === 0) return;
  mushafPageIndex--;
  renderMushafReaderPage();
}

// Which page is open is part of where the reader is, so a refresh returns to
// the page being read rather than the first one.
function rememberMushafPage() {
  if (state.mushafReader) { state.mushafReader.index = mushafPageIndex; saveState(); }
}

document.getElementById("btn-mushaf-reader-next").addEventListener("click", goToNextMushafPage);
document.getElementById("btn-mushaf-reader-prev").addEventListener("click", goToPrevMushafPage);
document.getElementById("btn-mushaf-reader-close").addEventListener("click", closeMushafReader);

// Swipe right (finger moves toward the right) turns to the next page, to
// match how a physical Mushaf/RTL reading app turns pages forward.
(() => {
  const body = document.getElementById("mushaf-reader-body");
  let touchStartX = null;
  body.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; });
  body.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) < 50) return;
    if (dx > 0) goToNextMushafPage();
    else goToPrevMushafPage();
  });
})();

function initWirdCard() {
  const input = document.getElementById("wird-target-input");
  if (!input) return;
  input.value = state.wirdTarget || 5;

  const typeBtns = [...document.querySelectorAll(".wird-type-btn")];
  const unitLabel = document.getElementById("wird-target-unit");
  function updateTypeUI() {
    const type = state.wirdTargetType || "ayahs";
    typeBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.type === type));
    if (unitLabel) unitLabel.textContent = type === "pages" ? "صفحة/يوم" : "آية/يوم";
  }
  updateTypeUI();

  typeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.type === state.wirdTargetType) return;
      state.wirdTargetType = btn.dataset.type;
      saveState();
      updateTypeUI();
      renderWirdCard();
      updateMushafDefaultRange();
    });
  });

  input.addEventListener("change", () => {
    state.wirdTarget = Math.max(1, Math.min(604, Number(input.value) || 5));
    saveState();
    renderWirdCard();
    updateMushafDefaultRange();
  });
}

function buildPlanItemRow(item, today) {
  const div = document.createElement("div");
  const isDue = item.due <= today;
  div.className = `plan-item${isDue ? " due-now" : ""}`;
  let badge = "scheduled";
  let badgeText = `\u064a\u064f\u0633\u062a\u062d\u0642: ${item.due}`;
  if (isDue) { badge = "due"; badgeText = "\u0645\u0633\u062a\u062d\u0642\u0629 \u0627\u0644\u0622\u0646"; }
  const tempBadge = item.temporary
    ? `<span class="badge temp" title="\u0644\u0627 \u062a\u064f\u062d\u062a\u0633\u0628 \u0636\u0645\u0646 \u0646\u0633\u0628\u0629 \u0627\u0644\u062a\u0642\u062f\u0645">\u0645\u0631\u0627\u062c\u0639\u0629 \u0645\u0624\u0642\u062a\u0629</span>`
    : "";
  const reviewBtn = isDue ? `<button class="btn btn-review-now">${iconLabel("check", "\u0631\u0627\u062c\u0639\u0647\u0627 \u0627\u0644\u0622\u0646")}</button>` : "";
  div.innerHTML = `
    <span class="ref">\u0622\u064a\u0629 ${item.ayah}</span>
    <span class="snippet">${cleanAyahText(item.text)}</span>
    <span class="badge ${badge}">${badgeText}</span>
    ${tempBadge}
    ${reviewBtn}
    <button class="icon-btn" title="\u0625\u0632\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u062e\u0637\u0629" data-key="${item.surah}:${item.ayah}">\u2715</button>
  `;
  div.querySelector(".icon-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const key = e.currentTarget.dataset.key;
    delete state.ayahs[key];
    saveState();
    renderDashboard();
  });
  if (isDue) {
    div.addEventListener("click", () => startSingleItemReview(item));
  }
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
    btn.textContent = "احفظ آية أولًا";
    return;
  }
  btn.disabled = false;
  if (doneToday) {
    card.classList.add("done");
    desc.textContent = `أنجزت تحدي اليوم بنتيجة ${state.dailyChallenge.score}/${state.dailyChallenge.total} 🎉 عد غدًا لتحدٍ جديد.`;
    btn.textContent = "⚡ أعد التحدي";
  } else {
    card.classList.remove("done");
    desc.textContent = 'اختبر نفسك بآيات عشوائية مما حفظت — «تعاهدوا هذا القرآن فوالذي نفسي بيده لهو أشد تفلتًا من الإبل في عقلها».';
    btn.textContent = "⚡ ابدأ التحدي";
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

// Straight into today's reading from the top of the dashboard, instead of
// scrolling down to the reading card to press its button. If that card
// hasn't managed to load a surah yet (offline on a first run, say), fall
// back to bringing it into view rather than doing nothing.
document.getElementById("btn-quick-wird").addEventListener("click", () => {
  if (mushafInputMode === "range" && !selectedMushafSurah) {
    document.querySelector(".mushaf-card").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  openTodaysWirdReading();
});

// ---------- Browse / Add (manual, advanced) ----------

let selectedBrowseSurah = 1;
let selectedBrowseSurahName = "";

document.getElementById("ayah-search-icon").innerHTML = ICONS.search;

// A searchable surah combobox - replaces a native <select>, which on
// mobile browsers (especially Android Chrome) takes over the whole screen
// with a plain OS list instead of a small in-page dropdown. Shared between
// the browse tab and the Mushaf reading card instead of each rolling its
// own copy of the same filter/select/outside-click logic.
function setupSurahCombo(containerId, inputId, listId, surahs, onSelect) {
  const container = document.getElementById(containerId);
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);

  function renderComboList(filterText) {
    const f = (filterText || "").trim().toLowerCase();
    // Surah names come fully vowelled ("سُورَةُ الحَجِّ") and nobody types them
    // that way, so both sides are normalized before comparing - the same
    // normalization the answer checker uses (diacritics dropped, alef and
    // ya and ta-marbuta folded), which also makes "الحج" find "الحجّ".
    const fNorm = normalizeArabic(filterText || "").trim();
    const matches = surahs.filter(
      (s) =>
        !f ||
        String(s.number) === f ||
        (fNorm && normalizeArabic(s.name).includes(fNorm)) ||
        s.englishName.toLowerCase().includes(f)
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
        setValue(surahNumber);
        list.classList.add("hidden");
        onSelect(surahNumber, meta);
      });
    });
  }

  function setValue(surahNumber) {
    const meta = surahs.find((s) => s.number === surahNumber);
    if (!meta) return;
    input.value = `${meta.number}. ${meta.name}`;
    input.dataset.selected = "1";
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
    if (!container.contains(e.target)) list.classList.add("hidden");
  });

  return { setValue };
}

async function initBrowseTab() {
  try {
    const surahs = await fetchSurahList();
    setupSurahCombo("surah-combo", "surah-combo-input", "surah-combo-list", surahs, (surahNumber, meta) => {
      selectedBrowseSurah = surahNumber;
      selectedBrowseSurahName = meta.name;
      loadBrowseSurah(surahNumber);
    }).setValue(surahs[0].number);

    selectedBrowseSurah = surahs[0].number;
    selectedBrowseSurahName = surahs[0].name;
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
    titleEl.textContent = `معاينة آيات ${meta.name}`;
    metaInfo.textContent = `عدد آيات السورة: ${ayahs.length}`;
    renderSurahInfoCaption("browse-surah-info", meta);

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

// The add button's icon/label tells the person what will happen before they
// click it, instead of both paths looking like a plain "+ أضف": a contiguous
// ayah joins the memorization plan for real, while a jump ahead only opens a
// one-off practice round (see handleAddAyahClick / startEphemeralReview).
function buildAyahRow(surahNumber, surahName, ayahObj, showSurahBadge) {
  const key = `${surahNumber}:${ayahObj.numberInSurah}`;
  const already = !!state.ayahs[key];
  const contiguous = isContiguousAddition(surahNumber, ayahObj.numberInSurah);
  let btnClass = "btn ayah-add-btn";
  let btnHTML, btnTitle;
  if (already) {
    btnHTML = iconLabel("checkDone", "أُضيفت");
    btnTitle = "أُضيفت بالفعل إلى خطتك";
  } else if (contiguous) {
    btnHTML = iconLabel("plus", "أضف للخطة");
    btnTitle = "تُضاف بشكل دائم إلى خطة حفظك";
  } else {
    btnClass += " jump";
    btnHTML = iconLabel("flash", `جرّب الآن (${JUMP_REVIEW_COST}🪙)`);
    btnTitle = state.points >= JUMP_REVIEW_COST
      ? `مراجعة مؤقتة لآية واحدة فقط مقابل ${JUMP_REVIEW_COST} نقطة - لن تُضاف إلى خطتك`
      : `يتطلب ${JUMP_REVIEW_COST} نقطة ولا تملك ما يكفي (تملك ${state.points})`;
  }
  const row = document.createElement("div");
  row.className = "ayah-browse-item";
  row.innerHTML = `
    <div class="ayah-browse-head">
      <span class="ayah-browse-head-left">
        ${showSurahBadge ? `<span class="ayah-browse-surah-badge">${surahName}</span>` : ""}
        <span class="ayah-num-chip">${ayahObj.numberInSurah}</span>
      </span>
      <button class="${btnClass}" ${already ? "disabled" : ""} title="${btnTitle}">${btnHTML}</button>
    </div>
    <p class="ayah-browse-text">${cleanAyahText(ayahObj.text)}</p>
  `;
  row.querySelector("button").addEventListener("click", (e) => {
    handleAddAyahClick(surahNumber, surahName, ayahObj, e.currentTarget);
  });
  return row;
}

// A single ayah reaches the review queue in one of two ways: it's the next
// one in this surah's memorization sequence (added for real, free), or it's
// a jump the person found through search/browsing - a detour outside their
// memorization plan, so it costs points and opens as a one-off practice
// round that's never written to state.ayahs, so it can never clutter the
// dashboard no matter how many times it's used.
const JUMP_REVIEW_COST = 5;

function handleAddAyahClick(surahNumber, surahName, ayahObj, buttonEl) {
  if (isContiguousAddition(surahNumber, ayahObj.numberInSurah)) {
    addAyahDirectlyToSrs(surahNumber, surahName, ayahObj);
    buttonEl.innerHTML = iconLabel("checkDone", "أُضيفت");
    buttonEl.disabled = true;
    renderDashboard();
    updateAddRangeButton(); // the range may be fully in the plan now
  } else if (state.points >= JUMP_REVIEW_COST) {
    showConfirmModal(
      "قفزة عن تسلسل حفظك",
      `هذه الآية ليست ضمن تسلسل حفظك الحالي. تجربتها الآن كمراجعة مؤقتة تكلّف ${JUMP_REVIEW_COST} 🪙 (رصيدك: ${state.points}).`,
      `أنفق ${JUMP_REVIEW_COST} 🪙 وجرّبها`,
      () => {
        state.points -= JUMP_REVIEW_COST;
        saveState();
        renderPointsDisplay();
        startEphemeralReview(surahNumber, surahName, ayahObj);
      }
    );
  } else {
    showToast(`🪙 تجربة هذه الآية تتطلب ${JUMP_REVIEW_COST} نقطة ولا تملك ما يكفي (رصيدك: ${state.points}). أكمل حفظك بالتسلسل لتجمع المزيد.`, "error");
  }
}

// Browsing a surah range sits behind an accordion (it's the default view
// and can get long), while any search - a specific ayah number or a phrase
// - is what the person is actively looking for right now, so it's shown
// flat and open instead of needing an extra click to reveal.
function showBrowseResults(mode) {
  document.getElementById("browse-results-range").classList.toggle("hidden", mode !== "range");
  document.getElementById("browse-results-search").classList.toggle("hidden", mode !== "search");
}

function renderBrowsePreview() {
  const ayahs = surahAyahsCache[selectedBrowseSurah];
  if (!ayahs) return;

  const searchVal = document.getElementById("ayah-search").value.trim();
  if (searchVal) {
    // A plain number jumps within the currently open surah instantly; any
    // other text is handled by performGlobalAyahSearch instead (searching
    // only the pre-selected surah would force the person to already know
    // which surah an ayah is in before they could find it).
    const asNumber = Number(searchVal);
    const matches = ayahs.filter((a) => a.numberInSurah === asNumber);
    showBrowseResults("search");
    document.getElementById("browse-search-hint").textContent = `آية رقم ${searchVal} من ${selectedBrowseSurahName}`;
    const listEl = document.getElementById("browse-ayahs-search");
    listEl.innerHTML = "";
    matches.slice(0, 50).forEach((a) => listEl.appendChild(buildAyahRow(selectedBrowseSurah, selectedBrowseSurahName, a, false)));
    return;
  }

  const { ayahs: matches, from, to } = browseRangeAyahs();
  showBrowseResults("range");
  document.getElementById("browse-range-summary").textContent = `عرض الآيات من ${from} إلى ${to} (${ayahCountLabel(matches.length)})`;
  const listEl = document.getElementById("browse-ayahs-range");
  listEl.innerHTML = "";
  matches.slice(0, 50).forEach((a) => listEl.appendChild(buildAyahRow(selectedBrowseSurah, selectedBrowseSurahName, a, false)));
  updateAddRangeButton();
}

// The button says what pressing it would actually do - how many ayahs are
// really left to add, and what the jumps among them cost - and steps aside
// when the range is already in the plan, which is most of the time once a
// surah has been added.
function updateAddRangeButton() {
  const btn = document.getElementById("btn-add-range");
  if (!btn) return;
  const { ayahs: list } = browseRangeAyahs();
  if (!list.length) {
    btn.disabled = true;
    btn.textContent = "لا توجد آيات في هذا النطاق";
    return;
  }
  const plan = planRangeAddition(selectedBrowseSurah, list);
  const toAdd = plan.contiguous.length + plan.jumps.length;
  if (!toAdd) {
    btn.disabled = true;
    btn.textContent = list.length === 1 ? "هذه الآية في خطتك بالفعل" : "كل آيات هذا النطاق في خطتك";
    return;
  }
  btn.disabled = false;
  btn.textContent = plan.cost
    ? `إضافة ${ayahCountLabel(toAdd)} إلى الخطة — ${plan.cost} 🪙`
    : `إضافة ${ayahCountLabel(toAdd)} إلى الخطة`;
}

// Searches the whole Quran (not just the pre-selected surah) via
// alquran.cloud's own search endpoint, so a person can find an ayah by a
// phrase they remember without first having to know - or guess - which
// surah it's in.
async function performGlobalAyahSearch(query) {
  showBrowseResults("search");
  const hint = document.getElementById("browse-search-hint");
  const listEl = document.getElementById("browse-ayahs-search");
  hint.textContent = `جاري البحث عن "${query}" في القرآن الكريم كاملاً...`;
  listEl.innerHTML = "";
  try {
    const res = await fetchWithTimeout(`${API_BASE}/search/${encodeURIComponent(query)}/all/quran-uthmani`, 8000);
    const json = await res.json();
    const matches = (json.data && json.data.matches) || [];
    hint.textContent = `نتائج البحث عن "${query}" في كل القرآن: ${matches.length} آية`;
    listEl.innerHTML = "";
    if (matches.length === 0) {
      listEl.innerHTML = `<p class="muted">لم يُعثر على هذه العبارة في القرآن الكريم.</p>`;
      return;
    }
    matches.slice(0, 30).forEach((m) => {
      const ayahObj = { numberInSurah: m.numberInSurah, number: m.number, text: m.text };
      listEl.appendChild(buildAyahRow(m.surah.number, m.surah.name, ayahObj, true));
    });
  } catch (e) {
    hint.textContent = "تعذّر البحث في القرآن الكريم. تحقق من الاتصال بالإنترنت.";
  }
}

let browseSearchDebounceTimer = null;
document.getElementById("ayah-from").addEventListener("input", renderBrowsePreview);
document.getElementById("ayah-to").addEventListener("input", renderBrowsePreview);
// Written back once the field is left rather than on every keystroke, so
// typing "12" in a surah of 20 isn't cut to "1" halfway through - but a
// number the surah doesn't have never survives being looked at.
["ayah-from", "ayah-to"].forEach((id) => {
  document.getElementById(id).addEventListener("change", () => {
    const ayahs = surahAyahsCache[selectedBrowseSurah];
    if (!ayahs) return;
    const { from, to } = browseRangeBounds(ayahs.length);
    document.getElementById("ayah-from").value = from;
    document.getElementById("ayah-to").value = to;
    renderBrowsePreview();
  });
});
document.getElementById("ayah-search").addEventListener("input", () => {
  clearTimeout(browseSearchDebounceTimer);
  const val = document.getElementById("ayah-search").value.trim();
  if (!val || /^\d+$/.test(val)) {
    renderBrowsePreview();
    return;
  }
  browseSearchDebounceTimer = setTimeout(() => performGlobalAyahSearch(val), 450);
});

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

// Arabic counts a pair, and a few, differently from a lot.
function ayahCountLabel(n) {
  if (n === 1) return "آية واحدة";
  if (n === 2) return "آيتان";
  if (n <= 10) return `${n} آيات`;
  return `${n} آية`;
}

// The range inputs are what the person typed, which can be anything - the
// surah's own length is the truth. Both ends are pulled back into it, and
// "from" is never past "to".
function browseRangeBounds(ayahCount) {
  const clamp = (v, fallback) => {
    const n = Math.floor(Number(v));
    if (!n || n < 1) return fallback;
    return Math.min(n, ayahCount);
  };
  const from = clamp(document.getElementById("ayah-from").value, 1);
  const to = Math.max(from, clamp(document.getElementById("ayah-to").value, from));
  return { from, to };
}

function browseRangeAyahs() {
  const ayahs = surahAyahsCache[selectedBrowseSurah];
  if (!ayahs) return { ayahs: [], from: 1, to: 1, count: 0 };
  const { from, to } = browseRangeBounds(ayahs.length);
  return { ayahs: ayahs.filter((a) => a.numberInSurah >= from && a.numberInSurah <= to), from, to, count: ayahs.length };
}

// What adding a range would do, worked out before doing it: which ayahs are
// already in the plan, which continue the sequence, and which are a jump -
// each judged against the sequence as it would stand after the ones before
// it, exactly as adding them one by one would.
function planRangeAddition(surahNumber, list) {
  let reach = Object.values(state.ayahs)
    .filter((i) => i.surah === surahNumber && i.learningStage === "srs" && !i.temporary)
    .reduce((m, i) => Math.max(m, i.ayah), 0);
  const already = [];
  const contiguous = [];
  const jumps = [];
  list.forEach((a) => {
    if (state.ayahs[`${surahNumber}:${a.numberInSurah}`]) {
      already.push(a);
    } else if (a.numberInSurah === reach + 1) {
      contiguous.push(a);
      reach = a.numberInSurah;
    } else {
      jumps.push(a);
    }
  });
  return { already, contiguous, jumps, cost: jumps.length * JUMP_REVIEW_COST };
}

function addAyahDirectlyToSrs(surahNumber, surahName, ayahObj, { quiet = false } = {}) {
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
  // Adding a range says it once, about the range, instead of once per ayah.
  if (temporary && !quiet) {
    showToast("أُضيفت كمراجعة مؤقتة فقط (فيها قفزة عن تسلسل حفظك في هذه السورة) — لن تُحتسب ضمن نسبة التقدم.");
  }
}

document.getElementById("btn-add-range").addEventListener("click", async () => {
  const surahNumber = selectedBrowseSurah;
  if (!surahNumber) return;
  try {
    const surahs = await fetchSurahList();
    const meta = surahs.find((s) => s.number === surahNumber);
    const { ayahs: list } = browseRangeAyahs();
    const plan = planRangeAddition(surahNumber, list);
    const toAdd = plan.contiguous.length + plan.jumps.length;
    if (!toAdd) return;

    // Adding one ayah out of sequence costs points here, so adding twenty of
    // them at once has to cost the same - otherwise this button is simply the
    // cheaper way to do what the ayah's own button charges for.
    if (plan.cost) {
      if (state.points < plan.cost) {
        showToast(
          `🪙 ${ayahCountLabel(plan.jumps.length)} في هذا النطاق تمثّل قفزة عن تسلسل حفظك، وتكلفتها ${plan.cost} نقطة ولا تملك ما يكفي (رصيدك: ${state.points}).`,
          "error"
        );
        return;
      }
      showConfirmModal(
        "قفزة عن تسلسل حفظك",
        `${ayahCountLabel(plan.jumps.length)} من هذا النطاق خارج تسلسل حفظك في ${meta.name}، فتُضاف كمراجعة مؤقتة ولا تُحتسب ضمن نسبة تقدّمك — وتكلفتها ${plan.cost} 🪙 (رصيدك: ${state.points}).`,
        `أنفق ${plan.cost} 🪙 وأضِف`,
        () => commitRangeAddition(surahNumber, meta.name, plan)
      );
      return;
    }
    commitRangeAddition(surahNumber, meta.name, plan);
  } catch (e) {
    showToast("حدث خطأ أثناء الإضافة. تحقق من الاتصال بالإنترنت.", "error");
  }
});

// Says what was actually added rather than what the two boxes said: a range
// asking for 20 ayahs of a surah that has 7 added seven of them.
function commitRangeAddition(surahNumber, surahName, plan) {
  if (plan.cost) {
    state.points -= plan.cost;
    saveState();
    renderPointsDisplay();
  }
  plan.contiguous.concat(plan.jumps).forEach((a) => addAyahDirectlyToSrs(surahNumber, surahName, a, { quiet: true }));
  const added = plan.contiguous.length + plan.jumps.length;
  const numbers = plan.contiguous.concat(plan.jumps).map((a) => a.numberInSurah).sort((x, y) => x - y);
  const span = numbers.length > 1 ? ` (${numbers[0]}–${numbers[numbers.length - 1]})` : ` (${numbers[0]})`;
  renderBrowsePreview();
  renderDashboard();
  showToast(
    `تمت إضافة ${ayahCountLabel(added)} من ${surahName}${span} إلى خطة المراجعة.`,
    "success",
    [
      plan.already.length ? `${ayahCountLabel(plan.already.length)} كانت مضافة` : "",
      plan.jumps.length ? `${ayahCountLabel(plan.jumps.length)} مراجعة مؤقتة · −${plan.cost} 🪙` : "",
    ].filter(Boolean).join(" · ") || undefined
  );
}

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
// People open a recitation with the isti'adha and the basmala without
// thinking about it. Neither is part of the ayah, so both would count as
// words that don't belong - unless the ayah IS the basmala, as it is in
// Al-Fatiha.
const HEARD = { spokenElision: true };
const RECITATION_PREAMBLES = [
  "اعوذ بالله من الشيطان الرجيم",
  "اعوذ بالله السميع العليم من الشيطان الرجيم",
  "بسم الله الرحمن الرحيم",
];
function stripRecitationPreamble(transcript, correctWords) {
  let words = String(transcript || "").trim().split(/\s+/).filter(Boolean);
  for (let pass = 0; pass < 2; pass++) {
    for (const preamble of RECITATION_PREAMBLES) {
      const p = preamble.split(" ");
      if (words.length <= p.length) continue;
      // Never strip what the ayah itself opens with.
      if (p.every((w, k) => correctWords[k] && arabicWordsMatch(correctWords[k], w, HEARD))) continue;
      if (p.every((w, k) => arabicWordsMatch(words[k], w, HEARD))) {
        words = words.slice(p.length);
        break;
      }
    }
  }
  return words.join(" ");
}

function diffRecitation(correctText, transcript) {
  const correctWords = quranWords(correctText);
  const cleaned = stripRecitationPreamble(mergeDetachedConjunctions(transcript), correctWords);
  const saidWords = cleaned.split(/\s+/).filter(Boolean);

  const n = correctWords.length;
  const m = saidWords.length;

  // The alignment is word to word, except where the two orthographies
  // disagree about where a word ends. The rasm writes the vocative يا joined
  // to its noun (يَٰبَنِىٓ, يَٰٓأَيُّهَا) and nobody recites it as one word, so
  // the engine returns "يا" and "بني" - two words for the ayah's one, which
  // scored as one word unread plus two words that don't belong. So one word
  // may align with two, in either direction: an ayah word against a pair of
  // spoken ones, or a pair of ayah words against a single spoken one.
  const joinedSaid = (j) => (j + 1 < m ? saidWords[j] + saidWords[j + 1] : null);
  const joinedCorrect = (i) => (i + 1 < n ? correctWords[i] + correctWords[i + 1] : null);
  const matches1 = (i, j) => j < m && answerMatchesQuranWord(correctWords[i], saidWords[j], HEARD);
  const matches2Said = (i, j) => j + 1 < m && answerMatchesQuranWord(correctWords[i], joinedSaid(j), HEARD);
  const matches2Correct = (i, j) => i + 1 < n && j < m && answerMatchesQuranWord(joinedCorrect(i), saidWords[j], HEARD);
  // One rasm word can be three (\u064a\u064e\u0628\u0652\u0646\u064e\u0624\u064f\u0645\u064e\u0651 is \u064a\u0627 \u0627\u0628\u0646 \u0623\u0645), so the join reaches
  // one further - in that direction only, since the reverse never occurs.
  const matches3Said = (i, j) => j + 2 < m && answerMatchesQuranWord(correctWords[i], saidWords[j] + saidWords[j + 1] + saidWords[j + 2], HEARD);

  // Scored in tokens covered, not pairs matched, so a one-to-two alignment
  // (3 tokens) is preferred over leaving either side stranded.
  const dp = Array.from({ length: n + 2 }, () => new Array(m + 2).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      let best = Math.max(dp[i + 1][j], dp[i][j + 1]);
      if (matches1(i, j)) best = Math.max(best, dp[i + 1][j + 1] + 2);
      if (matches2Said(i, j)) best = Math.max(best, dp[i + 1][j + 2] + 3);
      if (matches2Correct(i, j)) best = Math.max(best, dp[i + 2][j + 1] + 3);
      if (matches3Said(i, j)) best = Math.max(best, dp[i + 1][j + 3] + 4);
      dp[i][j] = best;
    }
  }

  const result = [];
  let i = 0;
  let j = 0;
  let matchedCorrect = 0; // ayah words accounted for - the recall numerator
  let matchedSaid = 0;    // spoken words that belong - the precision numerator
  while (i < n) {
    if (matches1(i, j) && dp[i][j] === dp[i + 1][j + 1] + 2) {
      result.push({ word: correctWords[i], ok: true });
      matchedCorrect++; matchedSaid++;
      i++; j++;
    } else if (matches2Said(i, j) && dp[i][j] === dp[i + 1][j + 2] + 3) {
      result.push({ word: correctWords[i], ok: true });
      matchedCorrect++; matchedSaid += 2;
      i++; j += 2;
    } else if (matches3Said(i, j) && dp[i][j] === dp[i + 1][j + 3] + 4) {
      result.push({ word: correctWords[i], ok: true });
      matchedCorrect++; matchedSaid += 3;
      i++; j += 3;
    } else if (matches2Correct(i, j) && dp[i][j] === dp[i + 2][j + 1] + 3) {
      result.push({ word: correctWords[i], ok: true });
      result.push({ word: correctWords[i + 1], ok: true });
      matchedCorrect += 2; matchedSaid++;
      i += 2; j++;
    } else if (j < m && dp[i][j + 1] >= dp[i + 1][j]) {
      // A word that isn't in this ayah at all - kept, and marked, rather
      // than quietly dropped (see the accuracy note below).
      result.push({ word: saidWords[j], ok: false, extra: true });
      j++;
    } else {
      result.push({ word: correctWords[i], ok: false });
      i++;
    }
  }
  while (j < m) {
    result.push({ word: saidWords[j], ok: false, extra: true });
    j++;
  }

  // Both directions count. Accuracy used to be recall alone - matched over
  // the ayah's own length - so words that were NOT in the ayah cost
  // nothing: reciting this ayah with a neighbouring one spliced into it,
  // or wandering into the next ayah, still scored 100% and passed the
  // round. The F-score refuses that, because every extra word lowers
  // precision: 13 words right out of 13, said in 20, is 73% and not 100%.
  const extras = result.filter((r) => r.extra).length;
  const recall = n ? Math.round((matchedCorrect / n) * 100) : 0;
  const precision = m ? Math.round((matchedSaid / m) * 100) : 0;
  const accuracy = matchedCorrect ? Math.round(((2 * precision * recall) / (precision + recall))) : 0;
  return { result, accuracy, recall, precision, extras };
}

// A tasmee' is passed with no mistakes in it, and that is what this asks
// for: every word of the ayah said, and nothing said that isn't in it.
// A percentage threshold cannot do this - at 85%, or even 90%, reciting
// "أصحاب الجنة" where the ayah says "أصحاب النار" scored 90% and passed,
// which is a mistake that inverts the meaning being waved through. The
// person is shown the transcript and can correct any word the engine
// mangled before verifying, so what is graded is what they meant to say -
// and a failed attempt costs nothing but pressing the mic again.
function recitationPassed(d) {
  return d.extras === 0 && d.recall === 100;
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
let voiceModalAllowLowAccuracyContinue = false;
let voiceModalOnSuccess = null;

// onSuccess (optional): called after a high-accuracy verification, so the
// caller can advance its own flow (next learning round/ayah, or reveal the
// review grading buttons) instead of leaving the person stuck in the modal.
// `continueOnLowAccuracy` is for callers whose callback GRADES the ayah
// (review), where a weak recitation is exactly what the grading step needs
// to hear about. It must stay off for callers whose callback PASSES a round
// (learn): a way through offered there would hand a passed round to a
// recitation that just failed.
function openVoiceModal(correctText, onSuccess, { continueOnLowAccuracy = false } = {}) {
  if (!voiceSupported()) return;
  voiceModalCorrectText = correctText;
  voiceModalAllowLowAccuracyContinue = continueOnLowAccuracy;
  voiceModalOnSuccess = onSuccess || null;
  resetVoiceModal();
  document.getElementById("voice-modal-overlay").classList.remove("modal-closed");
}

function closeVoiceModal() {
  voiceModalShouldContinue = false; // don't let a pending onend auto-restart after closing
  if (voiceModalRecognition) {
    try { voiceModalRecognition.abort(); } catch (e) { /* already stopped */ }
    voiceModalRecognition = null;
  }
  document.getElementById("voice-modal-overlay").classList.add("modal-closed");
}

function resetVoiceModal() {
  voiceModalShouldContinue = false;
  if (voiceModalRecognition) {
    try { voiceModalRecognition.abort(); } catch (e) { /* already stopped */ }
    voiceModalRecognition = null;
  }
  setVoiceMicRecording(false);
  document.getElementById("voice-status-text").textContent = "اضغط على الميكروفون وابدأ بالتسميع";
  const wordsArea = document.getElementById("voice-words-area");
  wordsArea.innerHTML = "";
  wordsArea.classList.add("hidden");
  const scoreArea = document.getElementById("voice-score-area");
  scoreArea.innerHTML = "";
  scoreArea.classList.add("hidden");
  document.getElementById("voice-modal-actions").classList.add("hidden");
}

// Ported from a working continuous-dictation implementation in another of
// the same author's apps (mishkat), after two earlier attempts at this
// (switching continuous off, then rebuilding the transcript from e.results
// each time) still duplicated or dropped words. The actual fix isn't about
// continuous mode at all - it's storing each final result at ITS OWN INDEX
// in e.results instead of concatenating into a flat string. Some Android
// builds' continuous engine re-reports an already-finalized segment again
// later; overwriting the same array slot with it is idempotent, while
// appending it (what both earlier attempts did) duplicates it. Restarting
// the SAME recognition instance in onend (rather than a new one each time)
// also avoids the InvalidStateError races a fresh instance could hit.
let voiceModalShouldContinue = false;
let voiceModalBaseText = ""; // text folded in from completed sessions before the current one
let voiceModalFinalSegments = []; // this session's final results, indexed by result index
let voiceModalLiveTranscript = ""; // the full merged transcript so far, kept live so stopping needs no extra step
const VOICE_FATAL_ERRORS = new Set(["not-allowed", "audio-capture", "service-not-allowed"]);

// Merges this session's result segments into one deduped string. Folds each
// segment in through mergeSessionText rather than appending it outright:
// after a pause, some Android engines re-report an earlier phrase under a
// NEW result index in the same session, which an exact-match-only merge
// (what this used to do) reads as fresh content and appends - the exact
// "duplicates only once I stop and carry on reading" case.
function mergeVoiceSegments(segments) {
  let acc = "";
  for (const seg of segments) {
    const s = String(seg || "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    acc = mergeSessionText(acc, s);
  }
  return acc;
}

// Word-level LCS length (order-respecting overlap) between two small word
// arrays - used to judge how much a freshly re-transcribed session merely
// re-hears audio already folded into the base text, even when the wording
// isn't byte-identical (a few substituted words from re-recognition
// variance). Inputs here are at most a couple dozen words, so plain DP is
// fine.
// Returns lcs[k] = LCS length of a's first k words against all of b, for
// every k - one DP pass gives every prefix at once, which is what locating
// the end of a re-heard run needs (see mergeSessionText).
function prefixLCSLengths(a, b) {
  const m = a.length, n = b.length;
  const lcs = new Array(m + 1).fill(0);
  let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    lcs[i] = cur[n];
    prev = cur;
  }
  return lcs;
}

// Folds a just-finished (or still-live) recognition session's text into the
// accumulated base text. Some Android continuous-recognition engines
// occasionally re-transcribe audio they already finalized - usually right
// after an onend/restart cycle, and often NOT word-for-word identical (a
// few recognition slips) - so this can't just check for an exact repeat:
//   1) if the session's start exactly overlaps the base text's end
//      (normalized word-for-word), that overlap is a clean re-hear -
//      drop it and keep only whatever comes after it.
//   2) otherwise, if the whole session still strongly resembles the tail
//      of the base text (LCS ratio) even without a clean boundary match,
//      it's the same re-hear with a few substituted words breaking the
//      exact match - find how much of its START is that re-hear and drop
//      only that, so a re-hear that then carries on into new words (the
//      usual shape after a pause) still keeps the new words.
//   3) anything left over is genuinely new content and gets appended.
function mergeSessionText(baseText, sessionText) {
  const baseWords = baseText.trim().split(/\s+/).filter(Boolean);
  const sessionWords = sessionText.trim().split(/\s+/).filter(Boolean);
  if (sessionWords.length === 0) return baseWords.join(" ");
  if (baseWords.length === 0) return sessionWords.join(" ");
  const normBase = baseWords.map(normalizeArabic);
  const normSession = sessionWords.map(normalizeArabic);

  let overlap = 0;
  for (let len = Math.min(baseWords.length, sessionWords.length); len > 0; len--) {
    if (normBase.slice(normBase.length - len).join(" ") === normSession.slice(0, len).join(" ")) {
      overlap = len;
      break;
    }
  }
  let newWords = sessionWords.slice(overlap);

  // No clean boundary: locate where a re-heard run ENDS instead. The last
  // word that adds to the match is the end of the re-hear; everything past
  // it stopped matching, so it's the new content. Cutting at the longest
  // run that merely passes the ratio would swallow those new words too
  // (a long re-hear can carry several unmatched words and still score
  // above the threshold). Runs under 3 words aren't considered - a match
  // that small says nothing, and the Quran does repeat short phrases.
  // Known trade-off: an ayah that genuinely repeats a 3+ word phrase back
  // to back ("كلا سوف تعلمون * ثم كلا سوف تعلمون") loses the second copy
  // here. That's deliberate - one dropped repeat inside a single ayah's
  // recitation is mild (the LCS-based scoring tolerates it), while the
  // duplication this prevents made the whole transcript unusable.
  if (overlap === 0) {
    const tailWindow = normBase.slice(-Math.max(normSession.length, 4));
    const lcs = prefixLCSLengths(normSession, tailWindow);
    let lastMatchK = 0;
    for (let k = 1; k < lcs.length; k++) {
      if (lcs[k] > lcs[k - 1]) lastMatchK = k;
    }
    if (lastMatchK >= 3 && lcs[lastMatchK] / lastMatchK >= 0.6) {
      newWords = sessionWords.slice(lastMatchK);
      // A pass cut short by the engine tends to end on a clipped word that
      // the next pass then says in full ("...قالوا ام" -> "...قالوا امنا").
      // Only here, right at a trim boundary, drop that stub in favour of
      // the complete word - a short word that the next one starts with.
      const stub = normBase[normBase.length - 1];
      const full = newWords.length ? normalizeArabic(newWords[0]) : "";
      if (stub && stub.length <= 3 && full.length > stub.length && full.startsWith(stub)) {
        return [...baseWords.slice(0, -1), ...newWords].join(" ");
      }
    }
  }

  return [...baseWords, ...newWords].join(" ");
}

// Collapses whole repeated PASSES inside one already-assembled transcript.
//
// Reciting with tajweed means long madd and long pauses, and on that input
// some Android engines re-endpoint repeatedly and re-transcribe audio they
// already returned - often handing back a single string that ALREADY
// contains the phrase two or three times ("...قالوا ام / ...قالوا /
// ...قالوا امنا واذا خلوا"), each pass restarting from the same opening
// words and each cut off at a different point. Segment-level merging can't
// help there: it's all one segment. (This is an engine behaviour, not an
// app one - the same duplication shows up in other apps using the Web
// Speech API on the same device.)
//
// So: split the text wherever its own opening words start again, and drop
// any pass that a LATER pass repeats more completely. The last pass is
// usually the complete one, and dropping only what reappears later means
// nothing that was actually said gets lost.
function dedupeRepeatedPasses(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const ANCHOR = 3;
  if (words.length < ANCHOR * 2) return words.join(" ");
  const norm = words.map(normalizeArabic);
  const anchor = norm.slice(0, ANCHOR).join(" ");

  const starts = [0];
  for (let i = ANCHOR; i + ANCHOR <= norm.length; i++) {
    if (norm.slice(i, i + ANCHOR).join(" ") === anchor) starts.push(i);
  }
  if (starts.length < 2) return words.join(" ");

  const passes = starts.map((start, i) => words.slice(start, i + 1 < starts.length ? starts[i + 1] : words.length));
  const repeatedLater = (pass, i) =>
    passes.some((later, j) => {
      if (j <= i) return false;
      const a = pass.map(normalizeArabic);
      const b = later.slice(0, pass.length + 2).map(normalizeArabic);
      const lcs = prefixLCSLengths(a, b);
      return lcs[a.length] / a.length >= 0.75;
    });

  return passes
    .filter((pass, i) => !repeatedLater(pass, i))
    .reduce((acc, pass) => mergeSessionText(acc, pass.join(" ")), "");
}

// The mic button swaps to a stop square while recording (the glyph swap
// itself is CSS off this class - see .voice-mic-btn.listening), so its
// label has to say "stop" then too, or a screen reader still announces it
// as "start recording" mid-recording.
function setVoiceMicRecording(recording) {
  const btn = document.getElementById("btn-voice-mic");
  btn.classList.toggle("listening", recording);
  btn.setAttribute("aria-label", recording ? "إيقاف التسجيل" : "ابدأ التسجيل");
}

function createVoiceRecognitionInstance() {
  const recognition = new SpeechRecognitionImpl();
  recognition.lang = "ar-SA";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  return recognition;
}

// A start() call right after a previous session's onend can throw
// (InvalidStateError) if the OS hasn't fully released the microphone yet -
// retrying once after a short delay instead of giving up immediately
// avoids silently ending a recording attempt on an auto-restart.
function attemptRecognitionStart(recognition, isRetry) {
  try {
    recognition.start();
    voiceModalRecognition = recognition;
  } catch (e) {
    if (isRetry) {
      voiceModalShouldContinue = false;
      setVoiceMicRecording(false);
      document.getElementById("voice-status-text").textContent = "تعذّر بدء الاستماع.";
      return;
    }
    setTimeout(() => {
      if (voiceModalShouldContinue) attemptRecognitionStart(recognition, true);
    }, 300);
  }
}

function startVoiceModalRecording() {
  resetVoiceModal();
  const recognition = createVoiceRecognitionInstance();
  voiceModalShouldContinue = true;
  voiceModalBaseText = "";
  voiceModalFinalSegments = [];
  voiceModalLiveTranscript = "";
  const statusText = document.getElementById("voice-status-text");
  setVoiceMicRecording(true);
  statusText.textContent = "🔴 يستمع الآن... اقرأ الآية، ثم اضغط الميكروفون مجددًا لإنهاء التسجيل";

  recognition.onresult = (e) => {
    let interim = "";
    for (let i = 0; i < e.results.length; i++) {
      const result = e.results[i];
      const transcript = (result[0] && result[0].transcript) || "";
      if (result.isFinal) voiceModalFinalSegments[i] = transcript;
      else if (i >= e.resultIndex) interim += transcript;
    }
    const merged = mergeVoiceSegments([...voiceModalFinalSegments.filter(Boolean), interim]);
    // dedupeRepeatedPasses last: the engine can hand back a single segment
    // that already repeats itself, which segment-level merging can't see.
    voiceModalLiveTranscript = dedupeRepeatedPasses(mergeSessionText(voiceModalBaseText, merged));
    statusText.textContent = voiceModalLiveTranscript || "🔴 يستمع الآن...";
  };
  recognition.onerror = (e) => {
    if (e.error === "aborted") return; // our own stop()/close() triggers this - not a real error
    if (VOICE_FATAL_ERRORS.has(e.error)) {
      voiceModalShouldContinue = false;
      setVoiceMicRecording(false);
      statusText.textContent = `تعذّر الاستماع (${e.error}). تأكد من السماح بالوصول للميكروفون وحاول مجددًا.`;
    }
    // other errors (e.g. "no-speech" during a pause) are left to onend below
  };
  recognition.onend = () => {
    // Reached only on a NATURAL end (a pause) - stopVoiceModalRecording
    // nulls this handler out before its own abort(), so a manual stop
    // never lands here. Fold this session's segments into the persistent
    // base text and keep listening on the same instance.
    if (!voiceModalShouldContinue) return;
    // This was previously a raw concatenation of the old base text with
    // this session's segments - which meant a restart that re-transcribed
    // audio already folded into the base text (a real, if inconsistent,
    // Android quirk, and not always word-for-word identical) just kept
    // appending a near-duplicate phrase again on every pause. mergeSessionText
    // trims a clean re-heard overlap or drops the whole session when it's a
    // fuzzy re-hear with no clean boundary, fixing this at the fold point.
    const sessionMerged = mergeVoiceSegments(voiceModalFinalSegments.filter(Boolean));
    voiceModalBaseText = mergeSessionText(voiceModalBaseText, sessionMerged) + " ";
    voiceModalFinalSegments = [];
    attemptRecognitionStart(recognition);
  };
  attemptRecognitionStart(recognition);
}

function stopVoiceModalRecording() {
  voiceModalShouldContinue = false;
  const recognition = voiceModalRecognition;
  voiceModalRecognition = null;
  setVoiceMicRecording(false);
  if (recognition) {
    recognition.onend = null;
    try { recognition.abort(); } catch (e) { /* already stopped */ }
  }
  const transcript = mergeDetachedConjunctions(voiceModalLiveTranscript.trim());
  if (!transcript) {
    document.getElementById("voice-status-text").textContent = "لم يُسمع شيء، حاول مرة أخرى.";
    return;
  }
  showVoiceModalWords(transcript);
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
  const diff = diffRecitation(voiceModalCorrectText, editedTranscript);
  const { result, accuracy } = diff;
  const html = result
    .map((r) => `<span class="vr-word ${r.extra ? "extra" : r.ok ? "ok" : "bad"}">${r.word}</span>`)
    .join(" ");
  const scoreArea = document.getElementById("voice-score-area");
  // Naming what actually went wrong, since one percentage can't: words of
  // the ayah that never came, and words that came but aren't in it.
  const missed = result.filter((r) => !r.ok && !r.extra).length;
  const notes = [];
  if (missed) notes.push(`${missed} كلمة لم تُقرأ`);
  if (diff.extras) notes.push(`${diff.extras} كلمة ليست من الآية`);
  const noteHTML = notes.length ? `<p class="vr-note">${notes.join(" · ")}</p>` : "";
  scoreArea.innerHTML = `<p class="vr-text">${html}</p><p class="vr-score">دقة التسميع: ${accuracy}%</p>${noteHTML}`;
  scoreArea.classList.remove("hidden");
  if (recitationPassed(diff)) {
    playSuccessSound();
    showToast(randomEncouragement());
    if (voiceModalOnSuccess) {
      const cb = voiceModalOnSuccess;
      setTimeout(() => { closeVoiceModal(); cb(accuracy); }, 900); // brief pause so the score is visible before advancing
    }
  } else {
    playErrorSound();
    // A weak recitation is exactly the case the GRADING step most needs to
    // hear about, so there it gets a way through rather than being left to
    // the person to close the modal and remember the number. Where the
    // callback passes a round instead, there is deliberately no way
    // through: failing the recitation is the answer.
    if (voiceModalOnSuccess && voiceModalAllowLowAccuracyContinue) {
      const cb = voiceModalOnSuccess;
      const go = document.createElement("button");
      go.className = "btn";
      go.textContent = "تابع إلى التقييم";
      go.addEventListener("click", () => { closeVoiceModal(); cb(accuracy); });
      scoreArea.appendChild(go);
    }
  }
}

// The mic button toggles: first tap starts listening, second tap stops it
// (recognition.stop() finalizes whatever was captured and fires onend) -
// needed now that continuous recognition won't stop on its own.
document.getElementById("btn-voice-mic").addEventListener("click", () => {
  if (voiceModalRecognition) stopVoiceModalRecording();
  else startVoiceModalRecording();
});
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
let learnMode = "mcq"; // 'mcq' | 'type' | 'partial'
let learnMaskLevel = 1; // only used in 'partial' mode - 0 = none masked ... up to full mask

document.getElementById("mode-btn-partial").innerHTML = iconLabel("eyeOff", "اخفاء");
document.getElementById("mode-btn-mcq").innerHTML = iconLabel("optionsList", "اختيار");
document.getElementById("mode-btn-type").innerHTML = iconLabel("pencil", "كتابة");

// Round 1 recognizes the word among four, round 2 recalls it with the rest
// of the ayah in front of you, round 3 produces it from nothing: the
// support fades across the three rounds instead of the same task being
// drilled three times over. Each mode also tests something the others
// don't - recognition is not recall, and recall is not production - and
// three identical rounds is the shortest road to boredom.
const MODE_ROUND_LABEL = { mcq: "تعرُّف", partial: "تذكُّر", type: "كتابة" };

function modeRotation() {
  return (ageProfile().modes || ["mcq", "partial", "type"]);
}

// A mode picked by hand holds for the ayah being worked on, then rotation
// resumes - it steers the current round without silently switching the
// whole feature off.
let learnModeManualOverride = false;

function setLearnMode(mode, { manual = false } = {}) {
  learnMode = mode;
  if (manual) learnModeManualOverride = true;
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  renderLearnRoundInfo();
}

// The mode name sits next to the round number, so a mode that changed by
// itself reads as the plan rather than as the app losing the setting - and
// disappears once the person picks a mode themselves, since then it is not
// the rotation's doing.
function renderLearnRoundInfo() {
  const el = document.getElementById("learn-round-info");
  if (!el) return;
  const item = state.ayahs[learnCurrentKey];
  if (!item) return;
  const round = item.roundStreak || 0;
  const rotating = state.autoVaryModes && !learnModeManualOverride;
  el.textContent = `الجولة ${round + 1} من ${ROUNDS_TO_MASTER}${rotating ? ` · ${MODE_ROUND_LABEL[learnMode]}` : ""}`;
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setLearnMode(btn.dataset.mode, { manual: true });
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
  closeInfoModal();

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
  learnWords = quranWords(ayahObj.text);
  learnWordIndex = 0;
  learnMistakeThisRound = false;
  // Starts partially masked, not fully shown - showing the whole ayah by
  // default defeats the point of a "hide" mode; "إظهار الكل" is the
  // explicit opt-out for someone who really does want to see it all.
  learnMaskLevel = 1;

  const round = item.roundStreak || 0;
  if (state.autoVaryModes && !learnModeManualOverride) {
    const rotation = modeRotation();
    setLearnMode(rotation[round % rotation.length]);
  }

  document.getElementById("learn-ref").textContent = `${meta.name} - الآية ${pointer.ayah}`;
  renderLearnRoundInfo();
  renderBalanceBanner();
  updateRoundDots(item.roundStreak || 0);
  renderSurahInfoCaption("learn-surah-info", meta);

  const audio = document.getElementById("learn-audio");
  audio.src = audioSrcFor(ayahObj.number);

  renderLearnRound();
}

// Shown only when it is actually true: reviews are owed AND there are due
// ayahs to pay them with. Dismissing it lasts for the session, not
// forever - tomorrow's imbalance is tomorrow's to answer.
let balanceBannerDismissed = false;
function renderBalanceBanner() {
  const banner = document.getElementById("learn-balance-banner");
  if (!banner) return;
  const { learned, reviewed, owed } = todaysBalance();
  const due = getTodaysReviewQueue().length;
  const show = !balanceBannerDismissed && owed > 0 && due > 0;
  banner.classList.toggle("hidden", !show);
  if (!show) return;
  const pending = Math.min(owed, due);
  document.getElementById("learn-balance-text").textContent =
    `⚖️ حفظت ${learned} اليوم وراجعت ${reviewed}. القاعدة: خمس مراجعات مقابل كل آية جديدة — ${pending} مراجعة تنتظرك.`;
}

document.getElementById("btn-balance-review").addEventListener("click", () => switchTab("review"));
document.getElementById("btn-balance-dismiss").addEventListener("click", () => {
  balanceBannerDismissed = true;
  renderBalanceBanner();
});

function updateRoundDots(streak) {
  document.querySelectorAll("#round-dots .dot").forEach((dot, i) => {
    dot.classList.toggle("filled", i < streak);
  });
}

// Brings the ayah panel back into view if it's scrolled off-screen, instead
// of leaving the person looking at a blank spot after answering a word/round
// while scrolled down toward the controls below the ayah.
function scrollIntoViewIfNeeded(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// A word still to come is drawn as a rule the width of the word it stands
// for, so the ayah keeps its own rhythm and reads as a page with blanks -
// the old equal-sized filled tiles turned a long ayah into a wall of grey
// blocks with no shape at all. Capped so a long word can't outline itself.
// A capped ayah panel scrolls inside its own frame, so two things have to
// stay true by hand: the fade at its bottom edge must mean "there is more
// below" and nothing else, and the word being asked for must never be the
// part that's scrolled out of sight.
function updateAyahScrollState(el) {
  if (!el) return;
  el.classList.toggle("has-more", el.scrollHeight - el.scrollTop - el.clientHeight > 4);
}

// The room the ayah can have is whatever the screen has left once the rows
// above it, the answer below it and the bottom nav have taken theirs. That
// total changes with the mode (a two-row grid of options vs one row of
// buttons), the chosen ayah font size, and the phone - so it is measured
// rather than guessed at as a constant: guess too low and half the panel is
// wasted, guess too high and the answer is pushed off the bottom of the
// screen, which is the problem this exists to fix.
function fitAyahPanel(scrollId, tabId) {
  const scroll = document.getElementById(scrollId);
  const tab = document.getElementById(tabId);
  if (!scroll || !tab || !tab.classList.contains("active")) return;
  if (window.innerWidth > 820) {
    scroll.style.maxHeight = "";
    updateAyahScrollState(scroll);
    return;
  }
  const dock = tab.querySelector(".answer-area:not(.hidden)");
  const nav = document.querySelector(".tabs");
  if (!dock || !nav || dock.offsetParent === null) return;

  scroll.style.maxHeight = "none";
  const rect = scroll.getBoundingClientRect();
  // Page coordinates: the answer has to be reachable without scrolling at
  // all, so the measurement is against the top of the page, not the top of
  // whatever is currently in view.
  const topInPage = rect.top + window.scrollY;
  // What sits between the text and the answer, taken from the panel's own
  // box (the progress bar, the panel's padding and border) plus the answer's
  // margin. Reading it off the answer's position instead would measure zero
  // whenever the answer is currently docked - which is exactly the state
  // this is called in - and hand back a height too tall to fix anything.
  const panel = scroll.closest(".ayah-display");
  const gapBelow = (panel ? panel.getBoundingClientRect().bottom - rect.bottom : 0)
    + (parseFloat(getComputedStyle(dock).marginTop) || 0);
  const avail = window.innerHeight - nav.offsetHeight - dock.offsetHeight - gapBelow - topInPage - 24;
  scroll.style.maxHeight = `${Math.max(130, Math.round(avail))}px`;
  updateAyahScrollState(scroll);
}

// Declarations, not const arrows: applyFontSize() runs during start-up,
// well before this point in the file.
function fitLearnAyahHeight() { fitAyahPanel("learn-ayah-scroll", "tab-learn"); }
function fitReviewAyahHeight() { fitAyahPanel("review-ayah-scroll", "tab-review"); }

// Scrolls one word into the visible part of a capped ayah panel, moving
// only the panel (scrollIntoView would drag every ancestor, the page
// included). 34px at the bottom is the fade zone - stopping short of it
// keeps the word fully legible rather than half-faded.
function scrollWordIntoPanel(box, word) {
  if (!box || !word) return;
  const cr = box.getBoundingClientRect();
  const wr = word.getBoundingClientRect();
  if (wr.top < cr.top + 8) box.scrollTop += wr.top - cr.top - 8;
  else if (wr.bottom > cr.bottom - 34) box.scrollTop += wr.bottom - cr.bottom + 34;
  updateAyahScrollState(box);
}

function keepLearnBlankInView() {
  const box = document.getElementById("learn-ayah-scroll");
  scrollWordIntoPanel(box, document.getElementById("learn-blank"));
  updateAyahScrollState(box);
}

// A sticky element gives no signal that it is currently stuck, so the dock
// treatment is worked out from where it lands: sitting on the sticky line
// means it has been pulled up out of its place in the flow, and only then
// does it need the shadow and border that say it's floating over content.
function updateAnswerDockState() {
  document.querySelectorAll(".answer-area").forEach((el) => {
    const cs = getComputedStyle(el);
    if (el.classList.contains("hidden") || cs.position !== "sticky") {
      el.classList.remove("docked");
      return;
    }
    const line = window.innerHeight - parseFloat(cs.bottom || "0");
    el.classList.toggle("docked", Math.round(el.getBoundingClientRect().bottom) >= Math.round(line) - 1);
  });
}
let dockRaf = 0;
function scheduleAnswerDockUpdate() {
  if (dockRaf) return;
  dockRaf = requestAnimationFrame(() => {
    dockRaf = 0;
    updateAnswerDockState();
  });
}
window.addEventListener("scroll", scheduleAnswerDockUpdate, { passive: true });
window.addEventListener("resize", scheduleAnswerDockUpdate);

["learn-ayah-scroll", "review-ayah-scroll"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("scroll", () => updateAyahScrollState(el), { passive: true });
});
window.addEventListener("resize", () => {
  fitLearnAyahHeight();
  fitReviewAyahHeight();
});

function slotWidth(word) {
  const letters = word.replace(/[\u064B-\u0652\u0670\u0640]/g, "").length;
  const n = Math.min(8, Math.max(2, letters));
  return `${(n * 0.42 + 0.5).toFixed(2)}em`;
}

function renderLearnRound() {
  scrollIntoViewIfNeeded(".learn-ayah-display");

  const mcqArea = document.getElementById("mcq-area");
  const typeArea = document.getElementById("type-area");
  const partialArea = document.getElementById("partial-area");
  const wordProgress = document.getElementById("learn-word-progress");
  mcqArea.classList.toggle("hidden", learnMode !== "mcq");
  typeArea.classList.toggle("hidden", learnMode !== "type");
  partialArea.classList.toggle("hidden", learnMode !== "partial");
  // Only the sequential modes walk word by word, so only they have a
  // position within the ayah worth showing.
  wordProgress.classList.toggle("hidden", learnMode === "partial");

  if (learnMode === "partial") {
    renderLearnPartialMask();
    return;
  }

  const container = document.getElementById("learn-text");
  container.innerHTML = learnWords
    .map((w, idx) => {
      if (idx < learnWordIndex) return `<span class="word">${w}</span>`;
      if (idx === learnWordIndex) return `<span class="word blank" id="learn-blank">${w}</span>`;
      return `<span class="word slot" style="width:${slotWidth(w)}"></span>`;
    })
    .join(" ");
  wordProgress.firstElementChild.style.width = `${(learnWordIndex / learnWords.length) * 100}%`;

  const mcqContainer = document.getElementById("mcq-options");

  mcqContainer.innerHTML = "";
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

  // Only now is the answer below the panel at its final size, so this is
  // where the ayah can be given the rest of the screen.
  fitLearnAyahHeight();
  keepLearnBlankInView();
  scheduleAnswerDockUpdate();
}

// 'partial' mode: shows the whole ayah at once with only some words masked
// (tap to reveal one), instead of the sequential mcq/type modes' full hide
// of everything past the current word - a lighter drill for someone who's
// already partway through memorizing this ayah rather than starting fresh.
// Seeded per round, so each round of the same ayah hides a DIFFERENT
// subset of words. Without this every round re-hid exactly the same words,
// which both made the round look like it hadn't advanced at all and let
// someone pass three rounds having only ever recalled the same gaps.
// Grading is offered only once every hidden word has actually been
// uncovered. Rating a recall you never checked is guesswork, and it is
// guesswork the SM-2 schedule then acts on - so the check happens before
// the rating, not instead of it. Uncovering also walks the panel down to
// whatever is still hidden, so a long ayah doesn't leave words waiting
// below the fold with nothing to say they are there.
function makeRevealGate({ scrollId, actionsId, hintId, fit }) {
  return (stillHidden, revealed) => {
    const done = stillHidden === 0;
    const actions = document.getElementById(actionsId);
    const hint = document.getElementById(hintId);
    if (!actions || !hint) return;
    actions.classList.toggle("hidden", !done);
    hint.classList.toggle("hidden", done);
    hint.textContent = stillHidden === 1
      ? "بقيت كلمة واحدة مخفية - اضغط عليها لكشفها."
      : `استرجعها في نفسك، ثم اضغط على كل كلمة مخفية لكشفها (بقي ${stillHidden}).`;
    fit();
    // Only chase the next one after an actual tap - not on the first render,
    // which would jump straight past the opening of the ayah.
    const box = document.getElementById(scrollId);
    if (revealed && box) {
      const next = box.querySelector(".word.masked");
      if (next) scrollWordIntoPanel(box, next);
      else scrollWordIntoPanel(box, revealed);
    }
    scheduleAnswerDockUpdate();
  };
}

function renderLearnPartialMask() {
  const item = state.ayahs[learnCurrentKey];
  const round = item ? (item.roundStreak || 0) : 0;
  renderMaskedWordsInto(
    document.getElementById("learn-text"),
    learnWords,
    learnMaskLevel,
    round + 1,
    makeRevealGate({
      scrollId: "learn-ayah-scroll",
      actionsId: "learn-partial-actions",
      hintId: "learn-partial-hint",
      fit: fitLearnAyahHeight,
    })
  );
  fitLearnAyahHeight();
  scheduleAnswerDockUpdate();
}

function finishPartialRound(recalledCorrectly) {
  learnMistakeThisRound = !recalledCorrectly;
  if (recalledCorrectly) playSuccessSound();
  else playErrorSound();
  completeLearnRound();
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
    shuffleArray(surahWords).forEach((a) => quranWords(a.text).forEach(addCandidate));
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
// The sticky ayah panel (see the CSS) handles most of the keyboard-covers-it
// case, but some mobile browsers resize the visual viewport in a way sticky
// positioning doesn't react to - explicitly re-surfacing it once the
// keyboard has finished animating in covers those too.
document.getElementById("type-input").addEventListener("focus", () => {
  document.getElementById("type-answer").classList.add("keyboard-active");
  document.getElementById("type-area").classList.add("pinned");
  setTimeout(() => scrollIntoViewIfNeeded(".learn-ayah-display"), 350);
});
document.getElementById("type-input").addEventListener("blur", () => {
  document.getElementById("type-answer").classList.remove("keyboard-active");
  document.getElementById("type-area").classList.remove("pinned");
});
document.getElementById("type-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitTypedAnswer();
});

function submitTypedAnswer() {
  const input = document.getElementById("type-input");
  const correctWord = learnWords[learnWordIndex];
  const isCorrect = answerMatchesQuranWord(correctWord, input.value);
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
  // A slip repeats the round it happened in; it doesn't send you back to
  // round one. Losing three rounds' work to one mistyped word punishes the
  // person for the very thing the round exists to surface, and the fix for
  // a shaky word is to do that round again, not to redo the two that
  // already went well.
  if (!learnMistakeThisRound) {
    item.roundStreak = (item.roundStreak || 0) + 1;
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
  const today = todayISO();
  state.masteredCounts[today] = (state.masteredCounts[today] || 0) + 1;
  markActivityToday();
  addPoints(POINTS.masterAyah);
  saveState();
  fireConfetti(true);
  playMasterySound();
  showToast(
    `🌟 أتقنت ${item.surahName} : ${item.ayah} — ${randomEncouragement()}`,
    "success",
    `تعود إليك للمراجعة ${intervalText(item.interval)} · ${surahMasteredProgress(item.surah)} · +${POINTS.masterAyah}`
  );

  // A hand-picked mode was for that ayah; the next one starts the ramp again.
  learnModeManualOverride = false;

  // advance the sequential learning pointer to the next ayah
  const nextAyah = item.ayah + 1;
  state.learningPointer = { surah: item.surah, ayah: nextAyah };
  saveState();
  setTimeout(() => loadLearnAyah(), 1400);
}

// Play/pause resumes from the current position (instead of the old single
// toggle that reset to 0 on every pause), stop always resets to 0, and
// repeat loops the ayah - three separate controls instead of overloading
// one button. Also surfaces a clear message (rather than silently doing
// nothing) when a specific reciter's file 404s/403s on the CDN, and lets
// the user recover the current ayah's src after a reciter change without
// needing to reload the page.
function setupAudioControls(prefix, audioId) {
  const audio = document.getElementById(audioId);
  const playBtn = document.getElementById(`${prefix}-playpause`);
  const stopBtn = document.getElementById(`${prefix}-stop`);
  const repeatBtn = document.getElementById(`${prefix}-repeat`);
  stopBtn.innerHTML = ICONS.stop;
  repeatBtn.innerHTML = ICONS.repeat;
  stopBtn.setAttribute("aria-label", "إيقاف");
  repeatBtn.setAttribute("aria-label", "تكرار الآية");

  // The recitation is fetched from a CDN, so the first play of an ayah on a
  // slow connection sits silent for a moment with the button still showing
  // "play" - looking like the tap was missed. The button carries the wait
  // itself: a spinner from the moment playback is requested until there is
  // enough audio to actually hear (a cached ayah never buffers, so the
  // spinner simply never appears).
  let loading = false;
  const render = () => {
    if (loading) {
      playBtn.innerHTML = ICONS.spinner;
      playBtn.classList.add("loading");
      playBtn.setAttribute("aria-label", "جارٍ تحميل الصوت");
      playBtn.setAttribute("aria-busy", "true");
      return;
    }
    playBtn.classList.remove("loading");
    playBtn.removeAttribute("aria-busy");
    if (audio.paused) {
      playBtn.innerHTML = ICONS.play;
      playBtn.setAttribute("aria-label", "تشغيل");
    } else {
      playBtn.innerHTML = ICONS.pause;
      playBtn.setAttribute("aria-label", "إيقاف مؤقت");
    }
  };
  // Guarded so re-rendering doesn't restart the spinner's spin on every
  // buffering event.
  const setLoading = (on) => {
    if (loading === on) return;
    loading = on;
    render();
  };
  render();

  playBtn.addEventListener("click", () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  stopBtn.addEventListener("click", () => {
    audio.pause();
    audio.currentTime = 0;
    setLoading(false);
  });
  repeatBtn.addEventListener("click", () => {
    audio.loop = !audio.loop;
    repeatBtn.classList.toggle("active", audio.loop);
  });
  // Driven by the element's own events rather than a separate flag, so a
  // play started elsewhere (a reciter change resuming playback) shows the
  // same waiting state. HAVE_FUTURE_DATA means playback can start now.
  audio.addEventListener("play", () => { setLoading(audio.readyState < 3); render(); });
  audio.addEventListener("waiting", () => setLoading(true));
  audio.addEventListener("canplay", () => { if (!audio.paused) setLoading(false); });
  audio.addEventListener("playing", () => { setLoading(false); render(); });
  audio.addEventListener("pause", () => { setLoading(false); render(); });
  audio.addEventListener("ended", () => { if (!audio.loop) render(); });
  // A new src (next ayah, reciter change) drops any pending wait for the old one.
  audio.addEventListener("emptied", () => { setLoading(false); render(); });
  audio.addEventListener("error", () => {
    setLoading(false);
    render();
    showToast("تعذّر تشغيل هذا القارئ لهذه الآية. جرّب قارئًا آخر من الإعدادات ⚙️", "error");
  });
}

setupAudioControls("learn-audio-controls", "learn-audio");

// ---------- Info modal (tafsir / word meanings / generic confirm) ----------
// Shared bottom-sheet used for all three, so opening tafsir/meanings never
// pushes the ayah text or the control buttons further down the page.

function openInfoModal(title, bodyHTML) {
  document.getElementById("info-modal-title").textContent = title;
  document.getElementById("info-modal-body").innerHTML = bodyHTML;
  document.getElementById("info-modal-actions").classList.add("hidden");
  document.getElementById("info-modal-overlay").classList.remove("modal-closed");
}
function closeInfoModal() {
  document.getElementById("info-modal-overlay").classList.add("modal-closed");
  document.getElementById("info-modal-actions").classList.add("hidden");
}
document.getElementById("btn-info-close").addEventListener("click", closeInfoModal);
document.getElementById("info-modal-cancel").addEventListener("click", closeInfoModal);
document.getElementById("info-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "info-modal-overlay") closeInfoModal();
});

// A lightweight confirm dialog reusing the same modal shell instead of the
// browser's native confirm(), so it matches the app's own visual style.
function showConfirmModal(title, message, confirmLabel, onConfirm) {
  document.getElementById("info-modal-title").textContent = title;
  document.getElementById("info-modal-body").innerHTML = `<p>${message}</p>`;
  document.getElementById("info-modal-actions").classList.remove("hidden");
  const confirmBtn = document.getElementById("info-modal-confirm");
  confirmBtn.textContent = confirmLabel;
  confirmBtn.onclick = () => {
    closeInfoModal();
    onConfirm();
  };
  document.getElementById("info-modal-overlay").classList.remove("modal-closed");
}

document.getElementById("btn-learn-meanings").addEventListener("click", async () => {
  openInfoModal("معاني الكلمات", `<p class="muted">جاري تحميل المعاني...</p>`);
  const pointer = state.learningPointer;
  try {
    const meanings = await fetchWordMeanings(pointer.surah, pointer.ayah);
    if (!meanings.length) throw new Error("empty");
    const body = meanings[0].isWholeAyah
      ? `<p>${meanings[0].meaning}</p>`
      : meanings.map((m) => `<div class="meaning-chip"><span class="mw-ar">${m.text}</span><span>${m.meaning || "—"}</span></div>`).join("");
    document.getElementById("info-modal-body").innerHTML = body;
  } catch (e) {
    document.getElementById("info-modal-body").innerHTML = `<p class="muted">تعذّر تحميل معاني الكلمات حاليًا.</p>`;
  }
});

document.getElementById("btn-learn-voice").addEventListener("click", () => {
  const item = state.ayahs[learnCurrentKey];
  if (!item) return;
  // A correct full-ayah recitation counts the same as answering every word
  // right via MCQ/typing: it completes this round (and the ayah itself, once
  // 3 clean rounds are reached) instead of just showing a score and stopping.
  openVoiceModal(item.text, () => {
    learnMistakeThisRound = false;
    completeLearnRound();
  });
});

// ---------- Daily Ta'ahud challenge ----------

let isChallengeMode = false;
let isEphemeralReview = false;
let isSingleItemReview = false;

// A jump-ahead ayah found via search/browsing opens as a single one-off
// practice round instead of being written to state.ayahs - so it never
// persists, never counts toward progress, and can be reviewed as many times
// as the person likes without ever showing up in the dashboard.
function startEphemeralReview(surahNumber, surahName, ayahObj) {
  reviewQueue = [{
    surah: surahNumber,
    surahName,
    ayah: ayahObj.numberInSurah,
    globalNumber: ayahObj.number,
    text: ayahObj.text,
  }];
  reviewIndex = 0;
  isChallengeMode = false;
  isEphemeralReview = true;
  isSingleItemReview = false;
  switchTab("review");
  document.getElementById("challenge-banner").classList.add("hidden");
  document.getElementById("review-empty").classList.add("hidden");
  hideReviewSurahList();
  hideReviewSurahBanner();
  document.getElementById("review-session").classList.remove("hidden");
  loadReviewItem();
  showToast("🔎 هذه مراجعة مؤقتة لآية واحدة فقط ولن تُضاف إلى خطتك أو تُحسب ضمن تقدّمك.");
}

// Opening a single due ayah straight from its dashboard row, instead of
// only being reachable through the full due-queue review session - and
// once graded, returning to the exact dashboard scroll position instead of
// stranding the person on the review tab (see finishReviewOrChallenge).
function startSingleItemReview(item) {
  switchTab("review"); // runs the normal due-queue session first (also resets isSingleItemReview); also remembers the dashboard's scroll position to return to...
  isSingleItemReview = true; // ...then this narrows it to just this ayah
  reviewQueue = [item];
  reviewIndex = 0;
  document.getElementById("challenge-banner").classList.add("hidden");
  document.getElementById("review-empty").classList.add("hidden");
  hideReviewSurahList();
  hideReviewSurahBanner();
  document.getElementById("review-session").classList.remove("hidden");
  loadReviewItem();
}

function startDailyChallenge() {
  const mastered = Object.values(state.ayahs).filter((i) => i.learningStage === "srs");
  if (mastered.length === 0) return;
  reviewQueue = shuffleArray(mastered).slice(0, Math.min(5, mastered.length));
  reviewIndex = 0;
  isChallengeMode = true;
  isSingleItemReview = false;
  challengeCorrectCount = 0;
  switchTab("review");
  document.getElementById("challenge-banner").classList.remove("hidden");
  document.getElementById("review-empty").classList.add("hidden");
  hideReviewSurahList();
  hideReviewSurahBanner();
  document.getElementById("review-session").classList.remove("hidden");
  loadReviewItem();
}

// ---------- Sharing, and reciting to a person ----------
//
// Everything else in this app is one person alone with their phone, but
// memorization has never been a solitary craft: a حلقة, a شيخ to recite to,
// someone who notices when you stop coming. Both of these bring a person
// back into it without a server, an account, or anything leaving the phone
// unless its owner sends it.

// The app's own address, and a QR of it. The matrix is baked in rather than
// generated at runtime: the URL never changes, and a QR library would be a
// dependency this app can't fetch when it is offline - which is most of the
// time, by design. 29x29, version 3, error correction level M; verified to
// decode back to APP_URL.
const APP_URL = "https://tadabbur-quran-phi.vercel.app";
const APP_QR = {
  size: 29,
  bits:
    "1111111011010101111010111111110000010001011100001101000001101110100111000111111010111011011101010011001001100101110110111010110011111000001011101100000101010111010110010000011111111010101010101010111111100000000100000011100000000000100010111101111001011111110011101110101011011111000111111110000010010001111100011000001010011000010110001010101010111001111100000101010101000001011010101110101110110001111111010111110010000111001111011010100110001000011011011000001110011010111101110111010000010100000010110000111100111110110000101011010111001010100010100011100010001010100001100011111100100011110001011111110010000000011100111100010001000111111110101100010011101011101100000100100101011011000100011011101011000110010111111101010111010010100011010110000001101110100101011111111000011111000001000110000111011110101111111110110011001101101110010",
};

// Rounded rectangle - Path2D#roundRect isn't in every Android WebView yet.
function cardRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Wraps on words, right-to-left, and returns the y it finished at so the
// caller can lay out what comes next without guessing the height.
function cardWrappedText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width > maxWidth && line) {
      ctx.fillText(line, cx, y);
      y += lineHeight;
      line = word;
    } else {
      line = attempt;
    }
  }
  if (line) {
    ctx.fillText(line, cx, y);
    y += lineHeight;
  }
  return y;
}

// The progress card as a picture: a page from the app's own world (its
// colours, its frame, its ornament) rather than a paragraph of text, with
// the app's address and a QR at the foot so whoever receives it can follow
// it back. Colours come from the live theme, so the card looks like the app
// the sender is actually using.
function drawShareCard() {
  const W = 1080;
  const H = 1500;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (css.getPropertyValue(name) || "").trim() || fallback;
  const bg = v("--bg", "#f7f5f0");
  const surface = v("--surface", "#ffffff");
  const text = v("--text", "#2b2620");
  const muted = v("--muted", "#7a7364");
  const primary = v("--primary", "#1f6f5c");
  const accent = v("--accent", "#b98b2a");
  const border = v("--border", "#e5e0d5");
  const ayahFont = v("--ayah-font-family", "'Amiri', serif");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // The app's own frame: double rule, and brackets on the two corners it
  // marks (top-right, bottom-left).
  const M = 52;
  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  cardRoundRect(ctx, M, M, W - M * 2, H - M * 2, 34);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  cardRoundRect(ctx, M + 14, M + 14, W - (M + 14) * 2, H - (M + 14) * 2, 24);
  ctx.stroke();
  ctx.lineWidth = 9;
  const B = 74;
  const k = M + 42;
  ctx.beginPath();
  ctx.moveTo(W - k - B, k); ctx.lineTo(W - k, k); ctx.lineTo(W - k, k + B);
  ctx.moveTo(k + B, H - k); ctx.lineTo(k, H - k); ctx.lineTo(k, H - k - B);
  ctx.stroke();

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const cx = W / 2;

  ctx.fillStyle = primary;
  ctx.font = `700 92px ${ayahFont}`;
  ctx.fillText("✨ تدبر", cx, 250);

  ctx.fillStyle = muted;
  ctx.font = "500 40px 'Tajawal', sans-serif";
  ctx.fillText("رحلتي مع حفظ القرآن", cx, 318);

  ctx.fillStyle = accent;
  ctx.font = "44px 'Amiri', serif";
  ctx.fillText("۞", cx, 388);

  // The numbers, big enough to be the first thing seen.
  const items = Object.values(state.ayahs);
  const mastered = items.filter((i) => i.learningStage === "srs" && !i.temporary).length;
  const streak = computeStreak();
  const meta = (surahListCache || []).find((x) => x.number === (state.learningPointer || {}).surah);
  const rows = [];
  if (mastered) rows.push([String(mastered), "آية محفوظة"]);
  if (streak) rows.push([String(streak), streak === 1 ? "يوم متتالٍ" : streak === 2 ? "يومان متتاليان" : "أيام متتالية"]);
  let y = 480;
  rows.forEach(([num, label]) => {
    ctx.fillStyle = primary;
    ctx.font = "700 96px 'Tajawal', sans-serif";
    ctx.fillText(num, cx, y);
    ctx.fillStyle = text;
    ctx.font = "500 38px 'Tajawal', sans-serif";
    ctx.fillText(label, cx, y + 54);
    y += 158;
  });
  if (meta) {
    ctx.fillStyle = muted;
    ctx.font = "500 32px 'Tajawal', sans-serif";
    ctx.fillText("أحفظ الآن", cx, y);
    ctx.fillStyle = text;
    ctx.font = `50px ${ayahFont}`;
    ctx.fillText(meta.name, cx, y + 62);
    y += 116;
  }

  // The commitment, in a quiet card of its own.
  if (state.wirdPlan) {
    const boxW = W - 260;
    const boxX = (W - boxW) / 2;
    ctx.fillStyle = surface;
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    cardRoundRect(ctx, boxX, y, boxW, 146, 20);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.font = "500 30px 'Tajawal', sans-serif";
    ctx.fillText("عهدي اليومي", cx, y + 52);
    ctx.fillStyle = text;
    ctx.font = "500 34px 'Tajawal', sans-serif";
    cardWrappedText(ctx, wirdPlanSentence(state.wirdPlan), cx, y + 104, boxW - 70, 44);
    y += 166;
  }

  ctx.fillStyle = primary;
  ctx.font = `50px ${ayahFont}`;
  // Sits below whatever the card ended up holding, but never higher than
  // this - so a sparse card doesn't leave it floating in the middle.
  ctx.fillText("ادعُ لي بالثبات 🤲", cx, Math.max(y + 58, 1080));

  // The way back: the address, and a QR of it. QR on the left, the words to
  // its right, the way the rest of the card reads.
  const qrPx = 7;
  const qrSide = APP_QR.size * qrPx;
  const padQ = 18;
  const boxSide = qrSide + padQ * 2;
  // Clear of the bottom-left bracket (which reaches x = M + 42 + 74).
  const qx = M + 130;
  const qy = H - M - 56 - boxSide;
  ctx.fillStyle = "#ffffff";
  cardRoundRect(ctx, qx, qy, boxSide, boxSide, 14);
  ctx.fill();
  ctx.fillStyle = "#000000";
  for (let r = 0; r < APP_QR.size; r++) {
    for (let c = 0; c < APP_QR.size; c++) {
      if (APP_QR.bits[r * APP_QR.size + c] === "1") {
        ctx.fillRect(qx + padQ + c * qrPx, qy + padQ + r * qrPx, qrPx, qrPx);
      }
    }
  }

  ctx.textAlign = "right";
  const tx = W - M - 56;
  const twMax = tx - (qx + boxSide + 44);
  ctx.fillStyle = primary;
  ctx.font = "700 46px 'Tajawal', sans-serif";
  ctx.fillText("تدبر", tx, qy + 56);
  ctx.fillStyle = text;
  ctx.font = "500 29px 'Tajawal', sans-serif";
  cardWrappedText(ctx, "حفظ القرآن بالتكرار المتباعد — يعمل دون إنترنت، بلا حساب ولا إعلانات.", tx, qy + 108, twMax, 40);
  ctx.fillStyle = muted;
  ctx.font = "500 27px 'Tajawal', sans-serif";
  ctx.direction = "ltr";
  ctx.fillText(APP_URL.replace("https://", ""), tx, qy + boxSide - 6);
  ctx.direction = "rtl";

  return canvas;
}

function shareProgressText() {
  const items = Object.values(state.ayahs);
  const mastered = items.filter((i) => i.learningStage === "srs" && !i.temporary).length;
  const streak = computeStreak();
  const lines = [`🌿 رحلتي مع حفظ القرآن`];
  if (mastered) lines.push(`• ${mastered} آية محفوظة`);
  if (streak) lines.push(`• ${streak} ${streak === 1 ? "يوم" : streak === 2 ? "يومان" : "أيام"} متتالية`);
  const pointer = state.learningPointer;
  const meta = (surahListCache || []).find((x) => x.number === (pointer && pointer.surah));
  if (meta) lines.push(`• أحفظ الآن: ${meta.name}`);
  if (state.wirdPlan) lines.push(`• عهدي: ${wirdPlanSentence(state.wirdPlan)}`);
  lines.push("");
  lines.push("ادعُ لي بالثبات 🤲");
  return lines.join("\n");
}

// The picture first, since that is what actually gets looked at in a chat,
// with the text alongside it for anything that shows text instead. Then the
// ladder down: a file share, a plain text share, the clipboard. Nothing is
// uploaded at any rung - the card is drawn on this device and handed to
// whatever the person picks from their own share sheet.
async function shareProgress() {
  const text = shareProgressText();
  let file = null;
  try {
    // The card uses the app's own fonts; drawing before they load would
    // silently fall back to the system serif.
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = drawShareCard();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) file = new File([blob], "tadabbur.png", { type: "image/png" });
  } catch (e) {
    file = null; // fall through to the text-only paths
  }

  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // they changed their mind
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: "تدبر", text });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  if (file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tadabbur.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("🖼️ حُفظت بطاقة تقدّمك — أرسلها لمن تشاء.", "success");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast("📋 نُسخ تقدّمك — الصقه لمن تشاء.", "success");
  } catch (e) {
    showToast("تعذّرت المشاركة على هذا الجهاز.", "error");
  }
}

// The listener holds the phone and reads along; the reciter recites from
// memory and never sees the screen. The grade therefore comes from a second
// person instead of from self-rating - which is the weakest input the
// schedule has, and the one thing a حلقة has always fixed.
let tasmeeQueue = [];
let tasmeeIndex = 0;
let tasmeeTally = { good: 0, hesitant: 0, wrong: 0 };

// The entry point only appears when there is actually something to recite.
function renderTasmeeEntry() {
  const entry = document.getElementById("tasmee-entry");
  if (entry) entry.classList.toggle("hidden", getTodaysReviewQueue().length === 0);
}

function openTasmeeSession() {
  tasmeeQueue = getDueBySurah().flatMap((g) => g.items);
  if (!tasmeeQueue.length) {
    showToast("لا توجد آيات مستحقة للتسميع الآن.", "error");
    return;
  }
  tasmeeIndex = 0;
  tasmeeTally = { good: 0, hesitant: 0, wrong: 0 };
  document.getElementById("tasmee-overlay").classList.remove("modal-closed");
  renderTasmeeItem();
}

function closeTasmeeSession() {
  document.getElementById("tasmee-overlay").classList.add("modal-closed");
  const done = tasmeeTally.good + tasmeeTally.hesitant + tasmeeTally.wrong;
  if (done) {
    showToast(
      `📿 سمّعت ${done} آية`,
      "success",
      `تامّ ${tasmeeTally.good} · تردّد ${tasmeeTally.hesitant} · خطأ ${tasmeeTally.wrong}`
    );
  }
  renderDashboard();
  if (document.getElementById("tab-review").classList.contains("active")) startReviewSession();
}

function renderTasmeeItem() {
  const item = tasmeeQueue[tasmeeIndex];
  if (!item) {
    closeTasmeeSession();
    return;
  }
  document.getElementById("tasmee-position").textContent = `${tasmeeIndex + 1} / ${tasmeeQueue.length}`;
  document.getElementById("tasmee-ref").textContent = `${item.surahName || `سورة ${item.surah}`} - الآية ${item.ayah}`;
  // Shown in full and unmasked: it is the listener's copy to follow, not a
  // test for them.
  document.getElementById("tasmee-text").textContent = cleanAyahText(item.text);
  const box = document.getElementById("tasmee-ayah-scroll");
  if (box) box.scrollTop = 0;
}

function gradeTasmeeItem(quality) {
  const item = tasmeeQueue[tasmeeIndex];
  if (!item) return;
  const key = `${item.surah}:${item.ayah}`;
  if (state.ayahs[key]) {
    sm2Schedule(state.ayahs[key], quality);
    const today = todayISO();
    state.reviewCounts[today] = (state.reviewCounts[today] || 0) + 1;
    saveState();
    markActivityToday();
    if (quality === 5) addPoints(POINTS.reviewEasy);
    else if (quality === 3) addPoints(POINTS.reviewHard);
  }
  if (quality === 5) tasmeeTally.good++;
  else if (quality === 3) tasmeeTally.hesitant++;
  else tasmeeTally.wrong++;

  tasmeeIndex++;
  if (tasmeeIndex >= tasmeeQueue.length) closeTasmeeSession();
  else renderTasmeeItem();
}

document.getElementById("btn-share-progress").addEventListener("click", shareProgress);
document.getElementById("btn-open-tasmee").addEventListener("click", openTasmeeSession);
document.getElementById("btn-tasmee-close").addEventListener("click", closeTasmeeSession);
["btn-tasmee-wrong", "btn-tasmee-hesitant", "btn-tasmee-good"].forEach((id) => {
  const btn = document.getElementById(id);
  btn.addEventListener("click", () => gradeTasmeeItem(Number(btn.dataset.quality)));
});

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

// How many more reviews today's cap still allows. Infinity when the cap is
// off, so every caller can treat it as a plain number.
function reviewsLeftToday() {
  const cap = state.reviewDailyCap;
  if (!cap) return Infinity;
  return Math.max(0, cap - (state.reviewCounts[todayISO()] || 0));
}

// The queue actually offered: due ayahs, oldest first, trimmed to what's
// left of today's allowance. Oldest-first matters here - a trimmed queue
// must never leave the same ayahs at the back of the line day after day.
function getTodaysReviewQueue() {
  const due = getDueQueue();
  const left = reviewsLeftToday();
  return left === Infinity ? due : due.slice(0, left);
}

// Due ayahs, grouped by surah and each group in ayah order. What is being
// memorized is a sequence - ayah 5 following ayah 4 is part of what has to
// be known - so a surah is reviewed as a surah, start to finish, and only
// then does the next one begin. The daily cap still decides how many are
// offered; this decides the order they come in.
function getDueBySurah(ignoreDailyCap = false) {
  const pool = ignoreDailyCap ? getDueQueue() : getTodaysReviewQueue();
  const bySurah = new Map();
  pool.forEach((i) => {
    if (!bySurah.has(i.surah)) bySurah.set(i.surah, { surah: i.surah, name: i.surahName || `سورة ${i.surah}`, items: [] });
    bySurah.get(i.surah).items.push(i);
  });
  return [...bySurah.values()]
    .map((g) => ({ ...g, items: g.items.sort((a, b) => a.ayah - b.ayah) }))
    .sort((a, b) => a.surah - b.surah);
}

// The count the bottom nav carries, so a due queue is noticed without
// opening the tab to look.
function renderReviewBadge() {
  const badge = document.getElementById("review-tab-badge");
  if (!badge) return;
  const n = getTodaysReviewQueue().length;
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.classList.toggle("hidden", n === 0);
}

function renderReviewSurahList(ignoreDailyCap = false) {
  const wrap = document.getElementById("review-surah-list");
  const cards = document.getElementById("review-surah-cards");
  if (!wrap || !cards) return 0;
  const groups = getDueBySurah(ignoreDailyCap);
  cards.innerHTML = "";
  groups.forEach((g) => {
    const row = document.createElement("div");
    row.className = "review-surah-card";
    row.innerHTML = `
      <div class="review-surah-card-text">
        <span class="review-surah-card-name">${g.name}</span>
        <span class="review-surah-card-count">${g.items.length} آية مستحقة</span>
      </div>
      <button class="btn primary">مراجعة</button>`;
    row.querySelector("button").addEventListener("click", () => startSurahReview(g.surah, ignoreDailyCap));
    cards.appendChild(row);
  });
  wrap.classList.toggle("hidden", groups.length === 0);
  return groups.length;
}

let reviewSurahNumber = null;
let reviewIgnoreCap = false;

function hideReviewSurahList() {
  const wrap = document.getElementById("review-surah-list");
  if (wrap) wrap.classList.add("hidden");
}

// The banner names the surah being worked through; the one-off flows
// (a single ayah, an ephemeral practice, the challenge) aren't one.
function hideReviewSurahBanner() {
  const banner = document.getElementById("review-surah-banner");
  if (banner) banner.classList.add("hidden");
}

// Opening the tab lands on the list of surahs, not straight into a queue -
// so the person can see what is waiting and in which surah before starting.
function startReviewSession(ignoreDailyCap = false) {
  isChallengeMode = false;
  isEphemeralReview = false;
  isSingleItemReview = false;
  reviewIgnoreCap = ignoreDailyCap;
  document.getElementById("challenge-banner").classList.add("hidden");
  renderTasmeeEntry();
  renderReviewBadge();

  const empty = document.getElementById("review-empty");
  const session = document.getElementById("review-session");
  session.classList.add("hidden");
  const groups = renderReviewSurahList(ignoreDailyCap);
  if (groups > 0) {
    empty.classList.add("hidden");
    return;
  }

  // Nothing left today can mean two very different things, and telling them
  // apart is the whole point of the cap: an empty schedule, or today's
  // share finished with a backlog waiting patiently behind it.
  const due = getDueQueue();
  if (due.length > 0) {
    empty.innerHTML = `
      <p>✅ أنهيت حصّة اليوم من المراجعة.</p>
      <p class="muted">بقيت ${due.length} آية مستحقة، وستأتيك موزّعة على الأيام القادمة بدل أن تتكدّس عليك دفعة واحدة.</p>
      <button id="btn-review-beyond-cap" class="btn">تابع المراجعة رغم ذلك</button>`;
    empty.querySelector("#btn-review-beyond-cap").addEventListener("click", () => startReviewSession(true));
  } else {
    empty.innerHTML = `<p>🎉 لا توجد آيات تحتاج مراجعة الآن.</p><p class="muted">أضف آيات جديدة من تبويب "ابدأ الحفظ" أو عد لاحقًا حين يحين موعد المراجعة.</p>`;
  }
  empty.classList.remove("hidden");
}

function startSurahReview(surahNumber, ignoreDailyCap = reviewIgnoreCap) {
  const group = getDueBySurah(ignoreDailyCap).find((g) => g.surah === surahNumber);
  if (!group) {
    startReviewSession(ignoreDailyCap);
    return;
  }
  isChallengeMode = false;
  isEphemeralReview = false;
  isSingleItemReview = false;
  reviewIgnoreCap = ignoreDailyCap;
  reviewSurahNumber = surahNumber;
  reviewQueue = group.items;
  reviewIndex = 0;
  hideReviewSurahList();
  document.getElementById("review-empty").classList.add("hidden");
  document.getElementById("review-session").classList.remove("hidden");
  const banner = document.getElementById("review-surah-banner");
  if (banner) {
    banner.textContent = `📖 ${group.name} — ${group.items.length} آية`;
    banner.classList.remove("hidden");
  }
  loadReviewItem();
}

// After a surah is finished, the next one starts on its own - the person
// asked for a pass over everything due, not for a decision after each surah.
function continueToNextSurah() {
  const groups = getDueBySurah(reviewIgnoreCap);
  const next = groups.find((g) => g.surah !== reviewSurahNumber) || groups[0];
  if (!next) return false;
  showToast(`📖 ننتقل إلى ${next.name}`, "success", `${next.items.length} آية مستحقة`);
  startSurahReview(next.surah, reviewIgnoreCap);
  return true;
}

function loadReviewItem() {
  const item = reviewQueue[reviewIndex];
  document.getElementById("review-position").textContent = `${reviewIndex + 1} / ${reviewQueue.length}`;
  document.getElementById("review-progress-fill").style.width = `${((reviewIndex) / reviewQueue.length) * 100}%`;
  document.getElementById("review-ref").textContent = `${item.surahName || `سورة ${item.surah}`} - الآية ${item.ayah}`;

  currentWords = quranWords(item.text);
  // Opens masked: showing the whole ayah and then asking "how well did you
  // remember it?" was asking about a recall that never happened.
  maskLevel = 1;
  // A suggestion belongs to the recitation it was measured from, so it must
  // not survive into the next ayah - which is uncovered by hand and has no
  // measurement behind it.
  clearGradeSuggestion();
  renderMaskedText();

  const audio = document.getElementById("review-audio");
  audio.src = audioSrcFor(item.globalNumber);

  fitReviewAyahHeight();
  scheduleAnswerDockUpdate();
  closeInfoModal();
}

// Picks which word indices to hide for a given mask level (0 = none, higher
// = more), using a seeded shuffle so the same level always hides the same
// words for a given ayah length instead of jumping around on every render.
function computeHiddenIndices(n, maskLevel, seedOffset = 0) {
  const hiddenIndices = new Set();
  if (maskLevel > 0) {
    const fractionToHide = Math.min(maskLevel * 0.34, 1);
    const countToHide = Math.round(n * fractionToHide);
    const indices = [...Array(n).keys()];
    let seed = maskLevel * 9973 + seedOffset * 104729;
    for (let i = indices.length - 1; i > 0; i--) {
      seed = (seed * 16807) % 2147483647;
      const j = seed % (i + 1);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    indices.slice(0, countToHide).forEach((idx) => hiddenIndices.add(idx));
  }
  return hiddenIndices;
}

function renderMaskedWordsInto(container, words, maskLevel, seedOffset = 0, onReveal) {
  const hiddenIndices = computeHiddenIndices(words.length, maskLevel, seedOffset);
  container.innerHTML = words
    .map((w, idx) => {
      if (hiddenIndices.has(idx)) return `<span class="word masked" data-idx="${idx}">${w}</span>`;
      return `<span class="word">${w}</span>`;
    })
    .join(" ");
  container.querySelectorAll(".word.masked").forEach((el) => {
    el.addEventListener("click", () => {
      el.classList.remove("masked");
      if (onReveal) onReveal(container.querySelectorAll(".word.masked").length, el);
    });
  });
  if (onReveal) onReveal(hiddenIndices.size, null);
}

function renderMaskedText() {
  renderMaskedWordsInto(
    document.getElementById("review-text"),
    currentWords,
    maskLevel,
    0,
    makeRevealGate({
      scrollId: "review-ayah-scroll",
      actionsId: "grade-controls",
      hintId: "review-reveal-hint",
      fit: fitReviewAyahHeight,
    })
  );
  fitReviewAyahHeight();
  scheduleAnswerDockUpdate();
}

setupAudioControls("review-audio-controls", "review-audio");
document.getElementById("btn-mask-more").innerHTML = iconLabel("eyeOff", "إخفاء المزيد");
document.getElementById("btn-review-tafsir").innerHTML = iconLabel("book", "التفسير");
document.getElementById("btn-review-voice").innerHTML = iconLabel("mic", "اختبر بالنطق");
document.getElementById("btn-learn-tafsir").innerHTML = iconLabel("book", "التفسير");
document.getElementById("btn-learn-meanings").innerHTML = iconLabel("bulb", "معاني الكلمات");
document.getElementById("btn-learn-voice").innerHTML = iconLabel("mic", "اختبر بالنطق");
document.getElementById("btn-learn-mask-more").innerHTML = iconLabel("eyeOff", "إخفاء المزيد");
document.getElementById("btn-learn-partial-wrong").innerHTML = iconLabel("xCircle", "أخطأت في كلمة");
document.getElementById("btn-learn-partial-correct").innerHTML = iconLabel("check", "تذكرتها جيدًا");

// ---------- Tafsir (persistent per-ayah button, reuses the whole-ayah fallback API) ----------
// Shown in the shared info modal instead of an inline panel, so opening it
// never pushes the ayah text or the control buttons further down the page.

const tafsirTextCache = {};
async function fetchTafsirText(surah, ayah) {
  const key = `${surah}:${ayah}`;
  if (tafsirTextCache[key]) return tafsirTextCache[key];
  const text = await fetchAyahTafsirFallback(surah, ayah)
    .then((rows) => (rows[0] && rows[0].meaning) || "لا يتوفر تفسير لهذه الآية حاليًا.")
    .catch(() => "تعذّر جلب التفسير. تحقق من اتصالك بالإنترنت.");
  tafsirTextCache[key] = text;
  return text;
}

function setupTafsirButton(buttonId, getRef) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const ref = getRef();
    if (!ref) return;
    openInfoModal("التفسير", `<p class="muted">جاري تحميل التفسير...</p>`);
    const text = await fetchTafsirText(ref.surah, ref.ayah);
    document.getElementById("info-modal-body").innerHTML = `<p>${text}</p>`;
  });
}

setupTafsirButton("btn-learn-tafsir", () => {
  if (!learnCurrentKey) return null;
  const [surah, ayah] = learnCurrentKey.split(":").map(Number);
  return { surah, ayah };
});

setupTafsirButton("btn-review-tafsir", () => {
  const item = reviewQueue[reviewIndex];
  return item ? { surah: item.surah, ayah: item.ayah } : null;
});

document.getElementById("btn-mask-more").addEventListener("click", () => {
  maskLevel = Math.min(maskLevel + 1, 3);
  renderMaskedText();
});

document.getElementById("btn-learn-mask-more").addEventListener("click", () => {
  learnMaskLevel = Math.min(learnMaskLevel + 1, 3);
  renderLearnPartialMask();
});

document.getElementById("btn-learn-partial-correct").addEventListener("click", () => finishPartialRound(true));
document.getElementById("btn-learn-partial-wrong").addEventListener("click", () => finishPartialRound(false));

document.getElementById("btn-review-voice").addEventListener("click", () => {
  const item = reviewQueue[reviewIndex];
  if (!item) return;
  openVoiceModal(item.text, revealForGrading, { continueOnLowAccuracy: true });
});

// Self-rating is the weakest link in the whole schedule: people overrate
// what they know, and SM-2 then acts on that guess for months. The voice
// test already measured the thing being guessed at, so its accuracy is
// offered as a suggested grade - marked, not applied. The person still
// decides: they know things the word diff doesn't (a slip of the tongue,
// a word the engine mangled), which is also why it is never automatic.
function suggestedQualityFor(accuracy) {
  if (accuracy >= 95) return 5;
  if (accuracy >= 85) return 4;
  if (accuracy >= 60) return 3;
  return 0;
}

// The one path that opens grading without tapping every word: reciting the
// ayah aloud IS the check, and a stricter one than uncovering it.
function clearGradeSuggestion() {
  document.querySelectorAll(".grade-buttons button").forEach((b) => b.classList.remove("suggested"));
  const hint = document.getElementById("grade-suggestion");
  if (hint) hint.classList.add("hidden");
}

function revealForGrading(accuracy) {
  maskLevel = 0;
  renderMaskedText();
  document.getElementById("grade-controls").classList.remove("hidden");
  document.getElementById("review-reveal-hint").classList.add("hidden");

  const hint = document.getElementById("grade-suggestion");
  clearGradeSuggestion();
  if (typeof accuracy === "number") {
    const quality = suggestedQualityFor(accuracy);
    const btn = document.querySelector(`.grade-buttons button[data-quality="${quality}"]`);
    if (btn) btn.classList.add("suggested");
    hint.textContent = `دقة تسميعك ${accuracy}% — المقترح: ${btn ? btn.textContent : ""} (والقرار لك)`;
    hint.classList.remove("hidden");
  }
  // The grading row is taller than the single reveal button it replaces, so
  // the ayah has to give that height back - measured after the swap, not
  // before it.
  fitReviewAyahHeight();
  scheduleAnswerDockUpdate();
}

document.querySelectorAll(".grade-buttons button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const quality = Number(btn.dataset.quality);
    const item = reviewQueue[reviewIndex];
    const key = `${item.surah}:${item.ayah}`;
    if (!isEphemeralReview && state.ayahs[key]) {
      sm2Schedule(state.ayahs[key], quality);
      const today = todayISO();
      state.reviewCounts[today] = (state.reviewCounts[today] || 0) + 1;
      saveState();
      markActivityToday();
      if (quality === 5) addPoints(POINTS.reviewEasy);
      else if (quality === 4) addPoints(POINTS.reviewGood);
      else if (quality === 3) addPoints(POINTS.reviewHard);
    }
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
    addPoints(POINTS.dailyChallenge);
    fireConfetti(true);
    playMasterySound();
    empty.innerHTML = `<p>⚡ تعاهدت ${challengeCorrectCount} من ${reviewQueue.length} آية اليوم</p>
      <p class="muted">${randomEncouragement()}</p>
      <p class="reward-note">+${POINTS.dailyChallenge}</p>`;
    isChallengeMode = false;
    document.getElementById("challenge-banner").classList.add("hidden");
  } else if (isEphemeralReview) {
    isEphemeralReview = false;
    empty.innerHTML = `<p>✅ انتهت المراجعة المؤقتة.</p><p class="muted">لم تُضَف هذه الآية إلى خطتك ولا إلى تقدّمك — يمكنك البحث عنها ومراجعتها في أي وقت من "تصفح وإضافة".</p>`;
  } else if (isSingleItemReview) {
    // Opened straight from one dashboard row, so return to that same spot
    // instead of stranding the person on the (now-empty) review tab. This
    // is the one flow that wants the remembered offset back, so it asks
    // for it explicitly (switchTab otherwise opens a tab at its top).
    isSingleItemReview = false;
    showToast(randomEncouragement(), "success");
    pendingScrollRestoreTab = "dashboard";
    switchTab("dashboard");
    return;
  } else {
    renderReviewBadge();
    // One surah done: carry straight on to the next one that has ayahs due.
    if (continueToNextSurah()) return;
    fireConfetti(false);
    showToast(randomEncouragement(), "success");
    const stillDue = getDueQueue().length;
    empty.innerHTML = stillDue > 0
      ? `<p>👏 أحسنت! أنهيت حصّة اليوم من المراجعة.</p>
         <p class="muted">بقيت ${stillDue} آية مستحقة، ستأتيك موزّعة على الأيام القادمة.</p>
         <button id="btn-review-beyond-cap" class="btn">تابع المراجعة رغم ذلك</button>`
      : `<p>👏 أحسنت! أنهيت جلسة المراجعة لهذا اليوم.</p>`;
    const more = empty.querySelector("#btn-review-beyond-cap");
    if (more) more.addEventListener("click", () => startReviewSession(true));
    hideReviewSurahList();
  }
  empty.classList.remove("hidden");
  session.classList.add("hidden");
}

// ---------- Settings (reciter + theme + font size) ----------

const FONT_SIZES = { small: "1.4rem", medium: "1.8rem", large: "2.2rem", xlarge: "2.6rem" };

function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = state.theme;
  // The default theme tracks the phone's light/dark setting; "light"/"dark"
  // pin it instead. The named themes are explicit choices, so they ignore it.
  if (state.colorScheme && state.colorScheme !== "system") {
    root.dataset.scheme = state.colorScheme;
  } else {
    delete root.dataset.scheme;
  }
  syncThemeColorMeta();
}

// The Android status bar is painted from <meta name="theme-color">, so it has
// to follow the palette that actually ended up applied - otherwise it stays
// green over a dark app.
function syncThemeColorMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
  if (surface) meta.setAttribute("content", surface);
}

if (window.matchMedia) {
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onSchemeChange = () => { if (!state.colorScheme || state.colorScheme === "system") syncThemeColorMeta(); };
  if (darkQuery.addEventListener) darkQuery.addEventListener("change", onSchemeChange);
  else if (darkQuery.addListener) darkQuery.addListener(onSchemeChange);
}

function applyFontSize() {
  document.documentElement.style.setProperty("--ayah-font-size", FONT_SIZES[state.fontSize] || FONT_SIZES.medium);
  // Bigger text needs a differently sized panel, and no resize event fires
  // for a change made in the settings sheet.
  fitLearnAyahHeight();
  fitReviewAyahHeight();
}

function applyFont() {
  const font = FONTS.find((f) => f.id === state.font) || FONTS[0];
  document.documentElement.style.setProperty("--ayah-font-family", font.family);
  fitLearnAyahHeight();
  fitReviewAyahHeight();
}

function applyBackground() {
  document.documentElement.dataset.bg = state.background;
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

// A generic points-purchase collectible grid (reciters, themes, fonts,
// backgrounds all use this): each button is either free, owned (click to
// select instantly), or locked (click to spend points behind a confirm, via
// purchaseOrSelect) - previewHTML lets each grid render its own swatch look
// (a color gradient, a font-styled sample, a reciter/pattern name) while
// sharing the unlock/select mechanics and layout.
function renderCollectibleGrid({ gridId, items, ownedList, activeId, extraClass, previewHTML, onSelect, afterRender, confirmTitle, unlockedNoun, thisNoun }) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = items.map((item) => {
    const owned = ownedList.includes(item.id);
    const active = activeId === item.id;
    const sub = item.points === 0 ? "مجاني" : owned ? "مملوك ✓" : `🔒 ${item.points} نقطة`;
    return `
      <button class="swatch ${extraClass ? extraClass(item) : ""} ${active ? "active" : ""} ${owned ? "" : "locked"}" data-id="${item.id}">
        ${previewHTML ? previewHTML(item) : `<span class="swatch-name">${item.name}</span>`}
        <span class="swatch-sub">${sub}</span>
      </button>
    `;
  }).join("");
  grid.querySelectorAll(".swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = items.find((i) => i.id === btn.dataset.id);
      purchaseOrSelect(item, ownedList, {
        onSelect: (id) => {
          onSelect(id);
          if (afterRender) afterRender();
          renderCollectibleGrid({ gridId, items, ownedList, activeId: id, extraClass, previewHTML, onSelect, afterRender, confirmTitle, unlockedNoun, thisNoun });
        },
        confirmTitle,
        unlockedNoun,
        thisNoun,
      });
    });
  });
}

function renderThemeGrid() {
  renderCollectibleGrid({
    gridId: "theme-grid",
    items: THEMES,
    ownedList: state.unlockedThemes,
    activeId: state.theme,
    extraClass: (t) => `theme-${t.id}`,
    previewHTML: (t) => `<span class="swatch-name">${t.name}</span>`,
    onSelect: (id) => { state.theme = id; applyTheme(); },
    confirmTitle: "فتح مظهر جديد",
    unlockedNoun: "مظهرًا جديدًا",
    thisNoun: "هذا المظهر",
  });
}

function renderReciterGrid() {
  renderCollectibleGrid({
    gridId: "reciter-grid",
    items: RECITERS,
    ownedList: state.unlockedReciters,
    activeId: state.reciter,
    previewHTML: (r) => `<span class="swatch-name">${r.name}</span>`,
    onSelect: (id) => { state.reciter = id; refreshCurrentAudioSrc(); },
    confirmTitle: "فتح قارئ جديد",
    unlockedNoun: "صوت",
    thisNoun: "هذا القارئ",
  });
}

function renderFontGrid() {
  renderCollectibleGrid({
    gridId: "font-grid",
    items: FONTS,
    ownedList: state.unlockedFonts,
    activeId: state.font,
    previewHTML: (f) => `<span class="swatch-name" style="font-family:${f.family}">بِسْمِ اللَّهِ</span>`,
    onSelect: (id) => { state.font = id; applyFont(); },
    confirmTitle: "فتح خط جديد",
    unlockedNoun: "خطًا جديدًا",
    thisNoun: "هذا الخط",
  });
}

function renderBackgroundGrid() {
  renderCollectibleGrid({
    gridId: "background-grid",
    items: BACKGROUNDS,
    ownedList: state.unlockedBackgrounds,
    activeId: state.background,
    extraClass: (b) => `bg-${b.id}`,
    previewHTML: (b) => `<span class="swatch-name">${b.name}</span>`,
    onSelect: (id) => { state.background = id; applyBackground(); },
    confirmTitle: "فتح خلفية جديدة",
    unlockedNoun: "خلفية جديدة",
    thisNoun: "هذه الخلفية",
  });
}

function initSettingsPanel() {
  const overlay = document.getElementById("settings-overlay");
  const fontSizeSelect = document.getElementById("font-size-select");
  const reviewCapSelect = document.getElementById("review-cap-select");
  const autoVaryInput = document.getElementById("auto-vary-modes");
  const colorSchemeSelect = document.getElementById("color-scheme-select");

  colorSchemeSelect.value = state.colorScheme || "system";
  fontSizeSelect.value = state.fontSize;
  reviewCapSelect.value = String(state.reviewDailyCap);
  autoVaryInput.checked = state.autoVaryModes !== false;
  renderAgeModeGrids();
  renderReciterGrid();
  renderThemeGrid();
  renderFontGrid();
  renderBackgroundGrid();
  renderPointsDisplay();

  document.getElementById("btn-settings").addEventListener("click", () => openOverlay("settings"));
  document.getElementById("btn-settings-close").addEventListener("click", () => closeOverlay("settings"));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay("settings");
  });

  autoVaryInput.addEventListener("change", () => {
    state.autoVaryModes = autoVaryInput.checked;
    learnModeManualOverride = false;
    saveState();
    if (document.getElementById("tab-learn").classList.contains("active")) loadLearnAyah();
  });

  reviewCapSelect.addEventListener("change", () => {
    state.reviewDailyCap = Number(reviewCapSelect.value);
    saveState();
    renderDashboard();
  });

  fontSizeSelect.addEventListener("change", () => {
    state.fontSize = fontSizeSelect.value;
    saveState();
    applyFontSize();
  });

  colorSchemeSelect.addEventListener("change", () => {
    state.colorScheme = colorSchemeSelect.value;
    saveState();
    applyTheme();
  });

  document.getElementById("btn-settings-floating").addEventListener("click", () => openOverlay("settings"));
  setupFloatingSettingsButton();

  const prefetchBtn = document.getElementById("btn-offline-prefetch");
  prefetchBtn.innerHTML = iconLabel("book", "تحميل سور خطتي للاستخدام دون إنترنت");
  prefetchBtn.addEventListener("click", prefetchPlanForOffline);

  document.getElementById("btn-privacy").addEventListener("click", showPrivacyPolicy);
  document.getElementById("btn-terms").addEventListener("click", showTerms);
  document.getElementById("btn-privacy-footer").addEventListener("click", showPrivacyPolicy);
  document.getElementById("btn-terms-footer").addEventListener("click", showTerms);
}

// Keeps the settings gear reachable once the header has scrolled out of
// view, and inside the fullscreen reader. Visibility is derived rather
// than toggled from each call site: an IntersectionObserver tracks whether
// the header is on screen (no scroll handler running on every frame), and
// a MutationObserver watches the overlays' own open/closed class, so
// nothing has to remember to notify this when a modal opens.
function setupFloatingSettingsButton() {
  const fab = document.getElementById("btn-settings-floating");
  const header = document.querySelector(".app-header");
  const reader = document.getElementById("mushaf-reader-overlay");
  // Modals that should own the screen while they're open.
  const blockingOverlays = ["settings-overlay", "info-modal-overlay", "voice-modal-overlay"].map((id) => document.getElementById(id));

  function update() {
    const readerOpen = !reader.classList.contains("modal-closed");
    const blocked = blockingOverlays.some((el) => el && !el.classList.contains("modal-closed"));
    // Read the header's position rather than trusting the observer entry:
    // its first callback can arrive before layout exists and report "not
    // intersecting", and at the top of the page nothing changes afterwards
    // to correct it - which left the button showing over its own header.
    const headerVisible = header.getBoundingClientRect().bottom > 0;
    // Same coordinates in every state, so it reads as one button staying
    // put rather than moving around (the reader header reserves room for
    // it - see .mushaf-reader-header).
    fab.classList.toggle("visible", !blocked && (readerOpen || !headerVisible));
  }

  // The observer is only a trigger - it fires exactly when the header
  // crosses in or out of view, which avoids a handler running on every
  // scroll frame.
  new IntersectionObserver(update, { threshold: 0 }).observe(header);

  const classWatcher = new MutationObserver(update);
  [reader, ...blockingOverlays].forEach((el) => {
    if (el) classWatcher.observe(el, { attributes: true, attributeFilter: ["class"] });
  });

  requestAnimationFrame(update);
  window.addEventListener("load", update);
}

// Warms the service worker's data cache for the surahs actually in use -
// the one being memorized plus every surah in the review plan - so those
// work offline without having had to browse each of them online first.
// (Reviews themselves already work offline regardless: each item's text is
// kept in localStorage with its schedule.)
async function prefetchPlanForOffline() {
  const status = document.getElementById("offline-prefetch-status");
  const surahs = new Set([state.learningPointer.surah]);
  Object.values(state.ayahs).forEach((item) => surahs.add(item.surah));
  if (state.mushafPointer) surahs.add(state.mushafPointer.surah);

  const list = [...surahs].filter(Boolean);
  status.textContent = `جاري التحميل... (0 من ${list.length})`;
  let done = 0;
  let failed = 0;
  try {
    await fetchSurahList();
  } catch (e) {
    failed++;
  }
  for (const surah of list) {
    try {
      await fetchSurahAyahs(surah);
    } catch (e) {
      failed++;
    }
    done++;
    status.textContent = `جاري التحميل... (${done} من ${list.length})`;
  }
  status.textContent = failed
    ? `تم تحميل ${done - failed} من ${list.length} سورة - تعذّر تحميل الباقي، تحقق من الاتصال وأعد المحاولة.`
    : `✓ جاهز للعمل دون إنترنت (${done} ${done === 1 ? "سورة" : "سور"}). ما تفتحه لاحقًا يُحفظ تلقائيًا أيضًا.`;
}

// Deliberately specific rather than boilerplate: the two things people
// can't guess from the UI are that nothing leaves the device except the
// third-party fetches listed here, and that the browser's own speech
// recognition sends recorded audio to its vendor - which matters when the
// feature is used to recite Quran aloud.
function showPrivacyPolicy() {
  openInfoModal("سياسة الخصوصية", `
    <p><strong>لا حساب ولا خادم.</strong> لا يطلب التطبيق تسجيل دخول ولا اسمًا ولا بريدًا، ولا يملك خادمًا يرسل إليه بياناتك.</p>
    <p><strong>أين يُحفظ تقدمك؟</strong> كل شيء (الآيات المحفوظة، مواعيد المراجعة، النقاط، الإعدادات) يُخزَّن محليًا في متصفح جهازك فقط. حذف بيانات الموقع من المتصفح يمسحها نهائيًا، ولا توجد لدينا نسخة منها.</p>
    <p><strong>لا تتبّع ولا إعلانات.</strong> لا يستخدم التطبيق أدوات تحليلات أو تتبّع أو إعلانات، ولا يضع كوكيز لهذا الغرض.</p>
    <p><strong>خدمات خارجية يتصل بها التطبيق:</strong></p>
    <ul>
      <li>alquran.cloud — نص القرآن الكريم والتفسير والبحث.</li>
      <li>quran.com — معاني الكلمات.</li>
      <li>cdn.islamic.network — تلاوات القرّاء الصوتية.</li>
      <li>Google Fonts — ملفات الخطوط.</li>
    </ul>
    <p>هذه الخدمات تتلقى - كأي موقع تزوره - عنوان الـ IP ونوع المتصفح ووقت الطلب، وتخضع لسياسات الخصوصية الخاصة بها. لا نرسل إليها أي شيء عن تقدمك في الحفظ.</p>
    <p><strong>اختبار التسميع بالصوت:</strong> يستخدم خاصية التعرّف على الكلام المدمجة في المتصفح. في معظم المتصفحات (ومنها كروم على أندرويد) يُرسَل الصوت المسجَّل إلى خوادم مزوّد المتصفح لتحويله إلى نص، وهذا خارج عن سيطرة التطبيق. التطبيق نفسه لا يسجّل صوتك ولا يحتفظ به ولا يرسله إلى أي جهة؛ يستقبل النص الناتج فقط ويستخدمه في الجهاز. إن لم ترغب بذلك، فلا تستخدم زر "اختبر بالنطق".</p>
    <p><strong>دون إنترنت:</strong> يحتفظ التطبيق بنسخة من الصفحات والنصوص والتلاوات التي فتحتها داخل ذاكرة المتصفح ليعمل بلا اتصال، وتبقى هذه النسخة على جهازك.</p>
  `);
}

function showTerms() {
  openInfoModal("شروط الاستخدام", `
    <p><strong>أداة للحفظ لا للإفتاء.</strong> هذا التطبيق أداة لتنظيم حفظ القرآن الكريم ومراجعته. ليس مرجعًا شرعيًا، ولا يُستفتى في مسألة دينية.</p>
    <p><strong>راجع نصّ المصحف.</strong> نصوص الآيات والتفسير ومعاني الكلمات تأتي من خدمات خارجية (alquran.cloud و quran.com)، وقد يقع فيها خطأ أو نقص أو انقطاع. اعتمد على المصحف المطبوع عند أي شك، خصوصًا في الرسم والضبط. لا نتحمّل مسؤولية خطأ في بيانات هذه الخدمات.</p>
    <p><strong>نتائج اختبار التسميع تقريبية.</strong> التعرّف على الصوت يخطئ، خاصة مع التجويد والمدّ الطويل، فلا تُعدّ نتيجته حكمًا على صحة حفظك.</p>
    <p><strong>النقاط والمكافآت.</strong> النقاط والمظاهر والخطوط والخلفيات عناصر تحفيزية داخل التطبيق فقط: لا قيمة مالية لها، ولا تُشترى أو تُباع أو تُستبدل بمال، ويمكن أن تُفقد بحذف بيانات المتصفح.</p>
    <p><strong>حفظ تقدمك مسؤوليتك.</strong> البيانات محفوظة في متصفحك وحده؛ حذف بيانات الموقع أو المتصفح أو الجهاز يعني فقدانها دون إمكانية استرجاع.</p>
    <p><strong>التطبيق كما هو.</strong> يُقدَّم دون ضمانات من أي نوع، ولا ضمان لاستمرار توفّر الخدمات الخارجية التي يعتمد عليها.</p>
    <p><strong>حقوق الجهات الأخرى.</strong> استخدامك لبيانات الخدمات المذكورة يخضع لشروطها هي، ولا يمنحك هذا التطبيق أي حقوق عليها.</p>
  `);
}

// ---------- PWA service worker ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Root-relative for the same reason the page's assets are: registering
    // "sw.js" from /learn/settings would ask for /learn/sw.js, and scope the
    // worker to /learn/ even if it were there.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// ---------- Init ----------

applyTheme();
applyFontSize();
applyFont();
applyBackground();
initSettingsPanel();
initWirdCard();
initMushafCard();
initBrowseTab();

// Opens whatever the address bar asks for. The tab's panel is already the
// visible one (the head script saw the same URL), so this only runs its own
// setup - and rewrites an old #learn link, or an /index.html landing, as the
// address that tab now has. An overlay with nothing left to reopen (a reader
// whose pages aren't kept any more) drops off the address rather than
// opening empty.
const initialRoute = parseRoute();
const initialOverlays = initialRoute.overlays.filter((name) => OVERLAY_ROUTES[name].restorable());
writeRoute(initialRoute.tab, initialOverlays, true);
switchTab(initialRoute.tab, { fromHistory: true });
applyOverlays(initialOverlays);
