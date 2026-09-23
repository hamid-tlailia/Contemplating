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
  // Darkness with one lamp, a moon and a handful of stars - for the hour it
  // is named after. Listed by price, so it sits with the other 300.
  { id: "lastthird", name: "ثلث الليل", points: 350 },
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
  { id: "arabesque", name: "أرابيسك متشابك", points: 100 },
  { id: "lanterns", name: "فوانيس رمضان", points: 120 },
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
  // The seams between ayahs, drilled on their own. Small: it is a short
  // exercise, and the point of it is the seam, not the coin.
  seamCorrect: 1,
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
  // One coin for the whole app: a struck coin rather than two bare
  // concentric rings - a milled rim, and a crescent on the face, which is
  // the app's own mark.
  coin: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.2" fill="currentColor" opacity="0.16"/><circle cx="12" cy="12" r="9.2" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="6.6" stroke="currentColor" stroke-width="1" opacity="0.55" stroke-dasharray="1.6 1.7"/><path d="M14.6 8.3a4.2 4.2 0 1 0 0 7.4 5 5 0 0 1 0-7.4Z" fill="currentColor"/></svg>',
  headphones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15v-3a9 9 0 0 1 18 0v3"/><path d="M3 16a2 2 0 0 1 2-2h1v6H5a2 2 0 0 1-2-2Z"/><path d="M21 16a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2Z"/></svg>',
};
// ---------- Wiring that cannot bring the app down ----------
//
// Every one of these is a top-level statement, and a top-level throw does
// not just lose that one line - it abandons the rest of the file. That is
// how a half-updated cache turned into the blank-looking app people kept
// reporting: an index.html from one deploy served next to an app.js from
// another, the script reaches for a control the old markup has not got,
// `null.addEventListener` throws, and every label and handler written
// below that point is silently never applied. The buttons are still there,
// still tappable, and completely blank.
//
// So the wiring goes through these two instead. A control that is missing
// is simply not wired, and the next line still runs.
function on(id, event, handler, options) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler, options);
  return el;
}
function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
  return el;
}

function iconLabel(iconKey, text) {
  return `<span class="icon-label">${ICONS[iconKey]}<span>${text}</span></span>`;
}

// An SVG icon instead of the 🪙 emoji: emoji glyphs carry their own baked-in
// internal artwork (some renderers even draw a "1" on the coin face) whose
// vertical position within its own box is outside CSS's control, so no
// amount of align-items/line-height ever lines it up with the point count
// reliably across devices - a plain stroke icon we draw ourselves does.
// Both places that report the point total draw the same coin: the header
// badge and the settings row. One icon, one colour, one alignment - two
// different marks for one thing read as two different things.
document.querySelectorAll(".coin-icon").forEach((el) => { el.innerHTML = ICONS.coin; });

// One mark for points, everywhere they are named. The app had grown three -
// the drawn coin in the header, a 🪙 emoji in toasts and dialogs, and a ✦ on
// the gilding button - and three marks for one currency read as three
// different things to earn. Wherever markup is allowed it is this coin;
// wherever only plain text can go (a toast, a button label) the word نقطة
// stands in, rather than an emoji standing in for the icon.
function coinIconHTML(cls) {
  return `<span class="coin-icon${cls ? ` ${cls}` : ""}">${ICONS.coin}</span>`;
}
function pointsHTML(amount, cls) {
  return `<span class="points-amount">${amount}${coinIconHTML(cls)}</span>`;
}
// ١ نقطة · نقطتان · ٣-١٠ نقاط · ١١+ نقطة - the same shape ayahCountLabel uses.
function pointsText(amount) {
  const n = Number(amount) || 0;
  if (n === 1) return "نقطة واحدة";
  if (n === 2) return "نقطتان";
  if (n >= 3 && n <= 10) return `${n} نقاط`;
  return `${n} نقطة`;
}

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

// How many ayahs each surah has, by surah number. Written out rather than
// read from the fetched surah list, because the dashboard is drawn before
// that list arrives - and on a first run, or offline, it may not arrive at
// all - and a card that says "0 سور قيد الحفظ" to someone in the middle of
// البقرة is worse than no card. These numbers are fixed for all time; the
// table sums to 6236, which is the ayah count the rest of the file uses.
const SURAH_AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98,
  135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88,
  75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29,
  22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31,
  50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8,
  19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6
];

function surahAyahCount(surahNumber) {
  return SURAH_AYAH_COUNTS[surahNumber - 1] || 0;
}

// The place the sequence had really reached: the first unmemorized ayah of
// the earliest surah that was being worked through. Only applied when the
// pointer is standing in a surah where nothing at all has been memorized and
// on an ayah with no rounds behind it - which is what an abandoned jump looks
// like, and never what deliberate progress looks like.
function restoreStrandedPointer(parsed) {
  const pointer = parsed.learningPointer;
  const ayahs = parsed.ayahs || {};
  const items = Object.values(ayahs);
  const here = ayahs[`${pointer.surah}:${pointer.ayah}`];
  const startedHere = items.some((i) => i.surah === pointer.surah && i.learningStage === "srs");
  if (startedHere || (here && (here.roundStreak || 0) > 0)) return;

  const surahsStarted = [...new Set(items.filter((i) => i.learningStage === "srs").map((i) => i.surah))].sort((a, b) => a - b);
  for (const surah of surahsStarted) {
    if (surah >= pointer.surah) break;
    const count = surahAyahCount(surah);
    let front = 1;
    while (front <= count && (ayahs[`${surah}:${front}`] || {}).learningStage === "srs") front++;
    if (front <= count) {
      parsed.learningPointer = { surah, ayah: front };
      // The ayah the stray pointer created just by being pointed at - no
      // rounds, never chosen - goes with it.
      if (here && here.learningStage === "learning" && !(here.roundStreak || 0)) {
        delete ayahs[`${pointer.surah}:${pointer.ayah}`];
      }
      return;
    }
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.ayahs = parsed.ayahs || {};
      parsed.activity = parsed.activity || {};
      parsed.learningPointer = parsed.learningPointer || { surah: 1, ayah: 1 };
      parsed.learnDetour = parsed.learnDetour || null;
      parsed.recitePlace = parsed.recitePlace || {};
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
      // Whatever you are using, you own. Something can only become the
      // active choice by being chosen, and a price set afterwards must not
      // reach back and take it away - which is precisely what would happen
      // to anyone who picked a theme while it was free and then found it
      // priced. The rule is general because the problem is: this will not
      // be the last time something's price changes.
      [["theme", "unlockedThemes"], ["font", "unlockedFonts"],
       ["background", "unlockedBackgrounds"], ["reciter", "unlockedReciters"]]
        .forEach(([active, owned]) => {
          const id = parsed[active];
          if (id && Array.isArray(parsed[owned]) && !parsed[owned].includes(id)) parsed[owned].push(id);
        });
      parsed.mushafPointer = parsed.mushafPointer || null; // {surah, ayah} - where the Mushaf reader should resume next
      parsed.reviewDailyCap = parsed.reviewDailyCap == null ? REVIEW_DAILY_CAP_DEFAULT : parsed.reviewDailyCap;
      parsed.reviewCounts = parsed.reviewCounts || {};
      parsed.wirdPlan = parsed.wirdPlan || null;
      parsed.wirdNotifiedOn = parsed.wirdNotifiedOn || null;
      parsed.lastBackupOn = parsed.lastBackupOn || null;
      parsed.addIntent = parsed.addIntent === "review" ? "review" : "learn";
      parsed.gilding = parsed.gilding || {};
      // The illumination was briefly sold in three degrees, opened at the
      // start of a surah, at its half and at its end. It is one purchase now,
      // and only for a surah memorized whole - so a degree bought part-way
      // along is no longer a thing that exists. The third degree cost 25+75+
      // 150, which is exactly today's single price, so it carries over as a
      // full gilding; the first and second are refunded to the balance rather
      // than left sitting on a surah as a claim of "تمَّ الحفظ" that isn't
      // true yet. (Which is what put a finished frame around البقرة at 161
      // of 286.)
      // Guarded by a flag, and it has to be: a surah gilded under the rules
      // that replaced it also stores a 1, and the two are indistinguishable
      // from the value alone - so without this the sweep would run again on
      // the next load and refund away every gilding anyone has bought since.
      if (!parsed.gildingMigrated) {
        Object.keys(parsed.gilding).forEach((surah) => {
          const degree = parsed.gilding[surah];
          if (degree >= 3) { parsed.gilding[surah] = 1; return; }
          parsed.points = (parsed.points || 0) + (degree >= 2 ? 100 : 25);
          delete parsed.gilding[surah];
        });
        parsed.gildingMigrated = true;
      }
      parsed.listenMode = parsed.listenMode === true;
      parsed.backupNudgedOn = parsed.backupNudgedOn || null;
      parsed.autoVaryModes = parsed.autoVaryModes !== false;
      parsed.ageMode = parsed.ageMode || "adult";
      parsed.wirdRewardedDate = parsed.wirdRewardedDate || null;
      parsed.masteredCounts = parsed.masteredCounts || {};
      parsed.colorScheme = parsed.colorScheme || "system";
      parsed.mushafReader = parsed.mushafReader || null;
      // Ayahs added out of sequence used to be filed as "temporary": they
      // cost points, and never counted toward anything. Both of those are
      // gone, and the person did memorize them - so they join the plan
      // properly, keeping the day they were added as the day they started.
      Object.values(parsed.ayahs || {}).forEach((item) => {
        if (item && item.temporary) {
          item.temporary = false;
          if (!item.memorizedOn) item.memorizedOn = item.added || null;
        }
      });
      // "ابدأ بها" on a waiting group used to move the sequential pointer
      // itself and never give it back, so one tap could leave the tab in a
      // surah far ahead of the one actually being memorized, with no way to
      // find the way back. Detours have their own pointer now; this puts a
      // pointer left stranded by the old behaviour back where it belongs.
      if (!parsed.pointerRestored) {
        parsed.pointerRestored = true;
        restoreStrandedPointer(parsed);
      }
      return parsed;
    }
  } catch (e) {
    console.warn("Failed to load state", e);
  }
  return {
    ayahs: {}, // key "surah:ayah" -> { surah, ayah, surahName, text, globalNumber, interval, repetition, ef, due, lastReviewed, added, learningStage, roundStreak, temporary }
    activity: {}, // "YYYY-MM-DD" -> true (for streak calculation)
    learningPointer: { surah: 1, ayah: 1 },
    // A temporary side trip away from that sequence - an ayah added out of
    // order that the person chose to work on now. The sequence keeps its
    // place underneath and is returned to when the detour is finished.
    learnDetour: null, // null | { surah, ayah }
    // Where the free reciting stopped, per surah: { "2": 164 }. Reopening
    // that surah offers to carry on from there instead of from the first
    // ayah - a long surah is not something anyone recites from the top every
    // evening, and starting over was the whole cost of stopping.
    recitePlace: {},
    dailyChallenge: { date: null, score: 0, total: 0 },
    reciter: RECITERS[0].id,
    theme: THEMES[0].id,
    font: FONTS[0].id,
    background: BACKGROUNDS[0].id,
    fontSize: "medium",
    colorScheme: "system", // "system" | "light" | "dark" - only the default theme follows it
    numerals: "western", // "western" (123) | "arabic" (١٢٣) - every number the app shows
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
    wirdPlan: null, // {anchor, time:"HH:MM", place, notify} - the when/where commitment
    wirdNotifiedOn: null, // "YYYY-MM-DD" - the day the reminder last went out, so it goes out once
    listenMode: false, // review by ear: the ayah veiled, its opening played, you continue
    // "learn" | "review" - what the browse tab does with what it adds.
    // Defaults to learning: needing the rounds is the honest assumption, and
    // "I already know these" is the claim a person makes deliberately.
    addIntent: "learn",
    gilding: {}, // surah number -> 1 once its illumination is bought
    gildingMigrated: true, // a new plan has nothing from the three-degree scheme to sweep
    pointerRestored: true, // a new plan has no pointer stranded by the old "ابدأ بها"
    lastBackupOn: null, // "YYYY-MM-DD" - the day a backup file was last saved
    backupNudgedOn: null, // "YYYY-MM-DD" - the day we last suggested saving one
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

// The local date, never toISOString(). toISOString converts to UTC first,
// so it names the wrong day for part of every day: one hour of it in
// Algiers, three in Riyadh, four in New York - where an evening's work from
// 8pm onwards was being filed under tomorrow. Every day key in the app -
// activity, the streak, the daily counts, the wird strip, SM-2 due dates -
// went through this, which is why a streak could stall and a completed day
// could show empty.
function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayISO() {
  return isoOf(new Date());
}

function formatArabicDate(iso) {
  return new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T00:00:00`));
}

// Days for the first ~2 weeks, weeks up to ~2 months, months beyond that -
// so a brand-new streak reads "3 أيام" rather than an odd "0 أسابيع", and a
// years-long one reads in months rather than a triple-digit day count.
// Arabic counts in four shapes, not two: one, two, a few (3-10, plural after
// the number) and many (11+, singular accusative after it). "2 يومان" and
// "15 أيام" are both wrong, and both were being printed.
function arabicCount(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

function formatDurationSince(iso) {
  const start = new Date(`${iso}T00:00:00`);
  // Floor, not round: at noon on the day after, you have been at this for one
  // day - not two.
  const days = Math.max(0, Math.floor((new Date() - start) / 86400000));
  if (days === 0) return "اليوم";
  if (days < 14) return arabicCount(days, "يوم واحد", "يومان", "أيام", "يومًا");
  if (days < 60) return arabicCount(Math.round(days / 7), "أسبوع", "أسبوعان", "أسابيع", "أسبوعًا");
  return arabicCount(Math.round(days / 30), "شهر", "شهران", "أشهر", "شهرًا");
}

// ---------- The year, as a sheet ----------
//
// Every one of these days was already being recorded - activity,
// dailyCounts, masteredCounts, reviewCounts - and all the app ever showed
// of them was "this week". A year of effort compressed into one sheet is
// the cheapest motivation there is: it is built entirely from numbers
// already on disk, and a long unbroken run is visible in a way a streak
// counter reading "23" never is.
//
// Read right to left, like everything else here: the oldest week on the
// right, today at the left end. The grid inherits the page's direction, so
// laying the weeks out oldest-first puts them in exactly that order without
// any reversing.

const ACTIVITY_WEEKDAYS = ["ح", "ن", "ث", "ر", "خ", "ج", "س"]; // الأحد → السبت
const ACTIVITY_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const ACTIVITY_CELL = 13; // px per column, cell plus its gap

function activityLevel(n) {
  if (!n) return 0;
  if (n <= 2) return 1;
  if (n <= 5) return 2;
  if (n <= 10) return 3;
  return 4;
}

function activityShortDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${ACTIVITY_MONTHS[d.getMonth()]}`;
}

function activityDayLabel(iso) {
  const date = activityShortDate(iso);
  const learned = state.masteredCounts[iso] || 0;
  const reviewed = state.reviewCounts[iso] || 0;
  const pages = state.dailyPageCounts[iso] || 0;
  const total = state.dailyCounts[iso] || 0;
  if (!total && !learned && !reviewed && !pages) return `${date}: لا نشاط`;
  const parts = [];
  if (learned) parts.push(`${arabicCount(learned, "آية جديدة", "آيتان جديدتان", "آيات جديدة", "آية جديدة")}`);
  if (reviewed) parts.push(`${arabicCount(reviewed, "مراجعة", "مراجعتان", "مراجعات", "مراجعة")}`);
  if (pages) parts.push(`${arabicCount(pages, "صفحة", "صفحتان", "صفحات", "صفحة")}`);
  // A day recorded by markActivityToday alone has a total but no breakdown.
  if (!parts.length) parts.push(arabicCount(total, "نشاط واحد", "نشاطان", "أنشطة", "نشاطًا"));
  return `${date}: ${parts.join(" · ")}`;
}

// How many weeks fit without the cells becoming a texture nobody can aim
// at. A phone gets about half a year, a wide screen the whole one.
function activityWeeksThatFit(width) {
  const usable = Math.max(0, width - 22); // the weekday column on the side
  return Math.max(8, Math.min(53, Math.floor(usable / ACTIVITY_CELL)));
}

function renderActivityCalendar() {
  const host = document.getElementById("activity-calendar");
  if (!host) return;
  const caption = document.getElementById("activity-caption");
  const summary = document.getElementById("activity-summary");

  const weeks = activityWeeksThatFit(host.clientWidth || 340);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Start on the Sunday of the first week shown, so every column is a whole
  // week and the weekday rows line up down the sheet.
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks - 1) * 7 - today.getDay());

  host.innerHTML = "";
  host.style.setProperty("--activity-cols", weeks);

  // The weekday initials, in their own column beside the grid.
  const days = document.createElement("div");
  days.className = "activity-days";
  ACTIVITY_WEEKDAYS.forEach((d, i) => {
    const el = document.createElement("span");
    // Three of seven, or the column is a wall of letters at this size.
    el.textContent = i % 2 === 1 ? d : "";
    days.appendChild(el);
  });

  const grid = document.createElement("div");
  grid.className = "activity-grid";
  let active = 0, best = null, bestN = 0;
  const cursor = new Date(start);
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const iso = isoOf(cursor);
      const future = cursor > today;
      const n = state.dailyCounts[iso] || 0;
      const cell = document.createElement("i");
      cell.className = `activity-cell l${future ? 0 : activityLevel(n)}${future ? " future" : ""}`;
      cell.dataset.iso = iso;
      // A grid this dense can't carry visible labels, so every cell names
      // itself to a screen reader and to a long press.
      cell.title = activityDayLabel(iso);
      if (!future) {
        if (state.activity[iso]) active++;
        if (n > bestN) { bestN = n; best = iso; }
      }
      grid.appendChild(cell);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  host.appendChild(days);
  host.appendChild(grid);

  if (summary) {
    const span = arabicCount(weeks, "أسبوع", "أسبوعان", "أسابيع", "أسبوعًا");
    // Just the date and the size of the day here - the full breakdown is
    // one tap away in the caption, and two colons in one line read badly.
    const peak = best ? ` · أفضل يوم: ${activityShortDate(best)} (${bestN})` : "";
    summary.textContent = active
      ? `آخر ${span} · ${arabicCount(active, "يوم نشِط", "يومان نشِطان", "أيام نشِطة", "يومًا نشِطًا")}${peak}`
      : `آخر ${span} · لم يُسجَّل نشاط بعد`;
  }
  if (caption) caption.textContent = "اضغط على أي مربّع لترى ما فعلته فيه.";
}

// The number of weeks is chosen from the available width, so a rotation or
// a resized window has to recompute it. Debounced: resize fires in bursts.
let activityResizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(activityResizeTimer);
  activityResizeTimer = setTimeout(() => {
    if (document.getElementById("activity-map") && document.getElementById("activity-map").open) renderActivityCalendar();
  }, 200);
});

// A <details> that has never been opened has no width to measure, so the
// sheet is drawn (or redrawn) the moment it opens.
document.addEventListener("toggle", (e) => {
  if (e.target && e.target.id === "activity-map" && e.target.open) renderActivityCalendar();
}, true);

// Delegated once, so redrawing the grid never needs rewiring.
document.addEventListener("click", (e) => {
  const cell = e.target.closest(".activity-cell");
  if (!cell) return;
  const caption = document.getElementById("activity-caption");
  if (caption) caption.textContent = activityDayLabel(cell.dataset.iso);
  document.querySelectorAll(".activity-cell.picked").forEach((c) => c.classList.remove("picked"));
  cell.classList.add("picked");
});

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
  // One rule for whether the day was met, in wirdDoneToday - including the
  // open wird, where any reading at all is the whole of it.
  if (!wirdDoneToday()) return;
  state.wirdRewardedDate = today;
  saveState();
  addPoints(POINTS.wirdComplete);
  renderWirdPlanCard();
  showToast(
    state.wirdPlan ? "🤝 وفّيت بعهد اليوم" : "🌙 أتممت ورد اليوم",
    "success",
    `${activeDaysThisWeek()} من 7 أيام هذا الأسبوع${rewardSuffix(POINTS.wirdComplete)}`
  );
}

// Points are a pure motivational layer - they never gate any actual
// memorization feature, only the cosmetic purchases in the settings panel
// (theme/font/background/reciter - see purchaseOrSelect). Awarding them
// here (rather than scattering literal numbers at each call site) keeps
// the "what earns points" list in one place.
function addPoints(amount) {
  if (!amount) return;
  // The count ends where the collection does. A number that climbs forever
  // with nothing left to spend it on is not a reward, it is noise on the
  // screen - so once every collectible is unlocked nothing further is
  // awarded, and the figure shown settles at the final harvest instead of
  // drifting upward for the rest of the person's life. (If more is ever put
  // in the shop, everythingOwned goes false again and counting resumes on
  // its own.)
  if (everythingOwned()) return;
  state.points += amount;
  saveState();
  renderPointsDisplay();
}

// "+15" under a finished round is a promise. Once the counting has stopped
// it is a promise the app no longer keeps, so it stops being made.
function rewardSuffix(amount) {
  return everythingOwned() ? "" : ` · +${pointsText(amount)}`;
}

// ---------- Illuminating the mushaf ----------
//
// The four collectible grids are a finite shop: about two thousand points
// buys the lot, which a daily user passes in a few months, and after that
// the points had nothing to do. This is the sink that does not run out -
// and it does not run out for the right reason. A surah can be illuminated
// only once it has been memorized whole, so what is bought tracks the work
// rather than the grind: 114 surahs is as far as it goes, and by then there
// is nothing left to memorize either.
const GILD_PRICE = 250;

// Memorized whole: every ayah of the surah properly in the review cycle.
function surahFullyMemorized(surahNumber) {
  const total = surahAyahCount(surahNumber);
  if (!total) return false;
  const done = Object.values(state.ayahs).filter(
    (i) => i.surah === surahNumber && i.learningStage === "srs" && !i.temporary
  ).length;
  return done >= total;
}

// Bought - which is what stops it being offered twice, and what the lifetime
// total counts.
function gildPurchased(surahNumber) {
  return !!(state.gilding || {})[surahNumber];
}

// Shown. The seal on the frame says "تمَّ الحفظ", so it is only drawn while
// that is true: an ayah dropped from the plan afterwards takes the frame
// down with it rather than leaving the seal telling a lie, and putting the
// ayah back brings it straight back - the purchase itself is never lost.
function isGilded(surahNumber) {
  return gildPurchased(surahNumber) && surahFullyMemorized(surahNumber);
}

// Bought only at the end, and only once.
function canGild(surahNumber) {
  return !gildPurchased(surahNumber) && surahFullyMemorized(surahNumber);
}

// Every surah standing finished and unilluminated - what the points still
// have to do.
function pendingGildings() {
  const out = [];
  new Set(Object.values(state.ayahs).filter((i) => !i.temporary).map((i) => i.surah))
    .forEach((surah) => { if (canGild(surah)) out.push({ surah, points: GILD_PRICE }); });
  return out;
}

function gildSurah(surahNumber) {
  if (!canGild(surahNumber)) return;
  if (state.points < GILD_PRICE) {
    showToast(`يتطلب تذهيب السورة ${pointsText(GILD_PRICE)} ولا تملك ما يكفي (رصيدك: ${pointsText(state.points)}).`, "error");
    return;
  }
  const name = surahDisplayName(surahNumber);
  showConfirmModal(
    "تذهيب السورة",
    `تُذهّب "${name}" وقد حفظتها كاملة — مقابل ${pointsHTML(GILD_PRICE)} (رصيدك: ${pointsHTML(state.points)})؟`,
    `أنفق ${pointsText(GILD_PRICE)} وذهّبها`,
    () => {
      state.points -= GILD_PRICE;
      state.gilding = state.gilding || {};
      state.gilding[surahNumber] = 1;
      saveState();
      renderPointsDisplay();
      renderDashboard();
      fireConfetti(true);
      showToast(`✨ ذهّبت "${name}"`, "success");
    }
  );
}

// A tick beside the name, and nothing more. The first seal said «تمَّ الحفظ»
// in full between two rosettes, which was a second line's worth of saying
// what the gilded frame around it already says: this surah is finished. One
// mark on the name is the whole of it.
// How far this surah has got, as a ring that fills - the same number
// «التقدم حسب السورة» reports, said in the row that names the surah so it is
// answered where it is asked. A finished surah wears a full ring, and the
// tick beside it says it was also illuminated.
function surahProgressRingNode(surahNumber, name) {
  const total = surahAyahCount(surahNumber);
  const done = Object.values(state.ayahs)
    .filter((i) => i.surah === surahNumber && i.learningStage === "srs" && !i.temporary).length;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  // A full ring and a tick beside it say the same thing twice. Once the
  // surah is whole the ring goes and the tick speaks for it.
  if (pct >= 100) return null;
  // 2πr for r = 8.6, so the dash length is the arc the percentage covers.
  const circumference = 54.04;
  const el = document.createElement("span");
  el.className = "surah-ring";
  // The number is in the ring's own title rather than printed beside it: the
  // arc already says how far along the surah is at a glance, and the digits
  // next to it were a second answer to a question already answered.
  el.title = `${name}: ${done} من ${total} — ${pct}%`;
  el.setAttribute("aria-label", `حفظتَ ${pct} بالمئة من ${name}`);
  el.innerHTML = `<svg viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="8.6" class="surah-ring-track"/>
      <circle cx="11" cy="11" r="8.6" class="surah-ring-fill"
              stroke-dasharray="${(circumference * pct / 100).toFixed(2)} ${circumference}"
              transform="rotate(-90 11 11)"/>
    </svg>`;
  return el;
}

function gildCheckNode() {
  const el = document.createElement("span");
  el.className = "gild-check";
  el.title = "حفظتَها كاملة";
  el.setAttribute("aria-label", "تمَّ حفظها كاملة");
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10.2" fill="currentColor" opacity=".16"/>
    <circle cx="12" cy="12" r="10.2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M7.4 12.5 10.6 15.6 16.7 8.8" fill="none" stroke="currentColor"
          stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  return el;
}

function surahDisplayName(surahNumber) {
  const meta = (surahListCache || []).find((s) => s.number === surahNumber);
  if (meta) return meta.name;
  const any = Object.values(state.ayahs).find((i) => i.surah === surahNumber);
  return (any && any.surahName) || `سورة ${surahNumber}`;
}

// Everything purchasable, in one list, so "is there anything left to buy"
// is a question with an answer rather than four separate ones.
function allCollectibles() {
  return [
    { items: RECITERS, owned: state.unlockedReciters },
    { items: THEMES, owned: state.unlockedThemes },
    { items: FONTS, owned: state.unlockedFonts },
    { items: BACKGROUNDS, owned: state.unlockedBackgrounds },
  ];
}

function everythingOwned() {
  const gridsDone = allCollectibles().every(({ items, owned }) =>
    items.every((i) => (owned || []).includes(i.id)));
  // The counting stops at the real end and nowhere before it. It used to
  // stop whenever nothing was gildable *today* - so illuminating الفاتحة,
  // with a hundred and thirteen surahs still ahead, read as "you have bought
  // everything". There is something to spend on for as long as a single
  // surah of the Mushaf is unilluminated, which is why the end of the points
  // is the end of the whole thing: every collectible owned, and the Mushaf
  // memorized and illuminated entire.
  return gridsDone && gildedSurahCount() >= 114;
}

function gildedSurahCount() {
  return Object.keys(state.gilding || {}).length;
}

// Six figures in a header badge push the brand off the row. Past ten
// thousand the exact digits stop being the point anyway - what is being read
// is the size of the harvest - so it is said in thousands from there on, and
// exactly below it.
function compactNumber(n) {
  const v = Number(n) || 0;
  // Written in plain digits either way: the app's own numerals pass turns
  // them into ١٢٣ afterwards if that is what the person chose.
  const round = (x) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10);
  if (v < 10000) return String(v);
  if (v < 1000000) return `${round(v / 1000)}k`;
  return `${round(v / 1000000)}m`;
}

// What has been earned all told, worked out rather than counted. A counter
// added partway through starts at whatever the balance happened to be that
// day, so for anyone who had already bought things it understated the total
// badly - the note said "منذ البداية" over a number that began last week.
// Buying a collectible is the only thing that ever spends a point (see
// purchaseOrSelect), so the balance plus the price of everything owned IS
// the lifetime figure - exact, and exact for an old plan as much as a new one.
function lifetimePoints() {
  let spent = 0;
  allCollectibles().forEach(({ items, owned }) => {
    items.forEach((i) => {
      if (i.points && (owned || []).includes(i.id)) spent += i.points;
    });
  });
  spent += Object.keys(state.gilding || {}).length * GILD_PRICE;
  return state.points + spent;
}

function cheapestUnowned() {
  let best = Infinity;
  allCollectibles().forEach(({ items, owned }) => {
    items.forEach((i) => { if (!(owned || []).includes(i.id)) best = Math.min(best, i.points); });
  });
  if (pendingGildings().length) best = Math.min(best, GILD_PRICE);
  return best === Infinity ? null : best;
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
      `افتح "${item.name}" مقابل ${pointsHTML(item.points)} (رصيدك: ${pointsHTML(state.points)})؟`,
      `أنفق ${pointsText(item.points)} وافتحه`,
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
    showToast(`يتطلب فتح ${thisNoun} ${pointsText(item.points)} ولا تملك ما يكفي (رصيدك: ${pointsText(state.points)}).`, "error");
  }
}

function renderPointsDisplay() {
  const done = everythingOwned();
  // With nothing left to buy the balance means nothing, and it has stopped
  // moving anyway (see addPoints). What is shown instead is the whole
  // harvest - the balance plus everything it bought - which is the last
  // number this counter will ever produce.
  const shown = done ? lifetimePoints() : state.points;
  const el = document.getElementById("points-display");
  if (el) { el.textContent = compactNumber(shown); el.title = `${shown}`; }
  const headerEl = document.getElementById("header-points-value");
  if (headerEl) { headerEl.textContent = compactNumber(shown); headerEl.title = `${shown}`; }
  const note = document.getElementById("points-note");
  if (note) {
    const cheapest = cheapestUnowned();
    // Three states, not two: something to buy now, nothing to buy *today*
    // but the gilding still ahead, and the true end.
    note.textContent = done
      ? "ذهّبت المصحف كلّه وفتحت كلّ المقتنيات — بلغت النقاط منتهاها. هذا حصادك كلّه."
      : cheapest !== null
        ? `أقرب ما يمكنك فتحه: ${pointsText(cheapest)}`
        : `${pointsText(GILD_PRICE)} لتذهيب كلّ سورة تُتمّها — والنقاط تتراكم لها.`;
    note.classList.remove("hidden");
  }
  const label = document.getElementById("points-display-label");
  if (label) label.textContent = done ? "حصادك" : "نقاطك";
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
  if (!state.activity[isoOf(cursor)]) cursor.setDate(cursor.getDate() - 1);
  let lastWasGap = false;
  while (streak < 3650) {
    const key = isoOf(cursor);
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
// This week, not the last seven days. A rolling window is permanently near
// full for anyone keeping a streak - every day that drops off the back was
// also worked - so "6 من 7" sat under a ten-day streak and meant nothing.
// The calendar week empties itself on its first day, which is what makes
// the line worth reading: it says how this week is going. Same week the wird
// strip draws, so the two never disagree.
function startOfLocalWeek() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() - localFirstWeekday() + 7) % 7));
  return start;
}

function activeDaysThisWeek() {
  const start = startOfLocalWeek();
  const today = todayISO();
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = isoOf(d);
    if (iso > today) break; // days that have not arrived are not misses
    if (state.activity[iso]) n++;
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

// A stretched word comes back twice. On a مدّ - ٱلْبَأْسَآءِ, ٱلضَّرَّآءِ - the
// engine commits to what it has heard so far, then hears the rest and says
// the whole word, and both land in the transcript: «الباس الباساء»،
// «والضر والضراء». Two words where the reciter said one, and the check
// counts the short one as a mistake he never made.
//
// So where one of two neighbours is the start of the other, the longer one
// is the word and the other is the engine thinking aloud. Kept narrow on
// purpose: three letters at least, at most three letters of difference, and
// most of the longer word already present - «مَا» before «مَالِكِ» and «قُلْ»
// before «قُلُوبِهِمْ» are real pairs and stay untouched.
// ---------- The disconnected letters, said as letters ----------
//
// الٓمٓ is one word on the page and three sounds in the mouth: أَلِف لَام مِيم.
// Nobody recites it as "alam", and asking for that to make it pass is asking
// for a mistake. So where the text has a fawatih group, the letters spelled
// out are accepted for it - matched against that word specifically, never
// collapsed on sight, because عَيْن and نُون and يَا are ordinary words
// elsewhere and must stay ordinary.
const ARABIC_LETTER_NAMES = {
  "الف": "\u0627", "أَلِف": "\u0627", "ألف": "\u0627",
  "با": "\u0628", "باء": "\u0628",
  "تا": "\u062A", "تاء": "\u062A",
  "حا": "\u062D", "حاء": "\u062D",
  "را": "\u0631", "راء": "\u0631",
  "سين": "\u0633",
  "صاد": "\u0635",
  "طا": "\u0637", "طاء": "\u0637",
  "عين": "\u0639",
  "قاف": "\u0642",
  "كاف": "\u0643",
  "لام": "\u0644",
  "ميم": "\u0645",
  "نون": "\u0646",
  "ها": "\u0647", "هاء": "\u0647",
  "يا": "\u064A", "ياء": "\u064A",
};
const MUQATTAAT_LETTERS = new Set("\u0627\u0644\u0645\u0635\u0631\u0643\u0647\u064A\u0639\u0637\u0633\u062D\u0642\u0646".split(""));

// A word made only of the letters the fawatih are drawn from, and short -
// الٓمٓ, كٓهيعٓصٓ, حمٓ, طسٓمٓ. Ordinary words of those letters (مَال, سَمِيع)
// are far longer than the longest group, which is five.
function isMuqattaatWord(word) {
  const w = normalizeArabic(word || "");
  return w.length >= 1 && w.length <= 5 && [...w].every((c) => MUQATTAAT_LETTERS.has(c));
}

// "الف لام ميم" -> "الم". Null unless every token is a letter's name.
function joinLetterNames(tokens) {
  let out = "";
  for (const t of tokens) {
    const letter = ARABIC_LETTER_NAMES[normalizeArabic(t)];
    if (!letter) return null;
    out += letter;
  }
  return out;
}

// How many spoken tokens starting at i spell the expected word, or 0.
function spelledLettersMatch(words, i, expected) {
  if (!isMuqattaatWord(expected)) return 0;
  const maxRun = Math.min(5, words.length - i);
  for (let n = maxRun; n >= 1; n--) {
    const joined = joinLetterNames(words.slice(i, i + n));
    if (joined && answerMatchesQuranWord(joined, expected)) return n;
  }
  return 0;
}

// The same acceptance, for the paths that compare two finished texts rather
// than follow a pointer: a run of letter names is folded into the one word
// it spells, but only where the ayah actually has that word.
function collapseSpelledLetters(text, correctWords) {
  const targets = (correctWords || []).filter(isMuqattaatWord);
  if (!targets.length) return text;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; ) {
    let used = 0;
    for (const target of targets) {
      used = spelledLettersMatch(words, i, target);
      if (used > 1) { out.push(target); break; }
      used = 0;
    }
    if (!used) { out.push(words[i]); used = 1; }
    i += used;
  }
  return out.join(" ");
}

function mergeMaddSplits(text) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const out = [];
  const swallows = (shortW, longW) => {
    const a = normalizeArabic(shortW), b = normalizeArabic(longW);
    return a.length >= 3 && b.length > a.length && b.length - a.length <= 3
      && a.length / b.length >= 0.6 && b.startsWith(a);
  };
  for (const w of words) {
    const prev = out[out.length - 1];
    if (prev && swallows(prev, w)) { out[out.length - 1] = w; continue; }
    if (prev && swallows(w, prev)) continue;
    out.push(w);
  }
  return out.join(" ");
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
  if (typeof syncSettingsSummaries === "function") syncSettingsSummaries();
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
  item.due = isoOf(due);
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

// A reply that parses as JSON is not the same as a reply that carries what
// we asked for: the API answers an internal error with a perfectly valid
// {code, status, data:"..."} whose data is a *string*, and a captive portal
// or a proxy can answer with something else entirely. Reading .ayahs off
// that yields undefined rather than throwing, so the failure used to travel
// silently down to the caller and blow up there, past the try/catch that
// was meant to catch it - leaving the screen half-drawn. Checking the shape
// here turns it back into an ordinary network failure, which every caller
// already knows how to report.
function requireAyahArray(json, what) {
  const ayahs = json && json.data && json.data.ayahs;
  if (!Array.isArray(ayahs)) throw new Error(`Unexpected response shape for ${what}`);
  return ayahs;
}

async function fetchSurahList() {
  if (surahListCache) return surahListCache;
  const res = await fetchWithTimeout(`${API_BASE}/surah`);
  const json = await res.json();
  if (!Array.isArray(json && json.data)) throw new Error("Unexpected response shape for surah list");
  surahListCache = json.data;
  return surahListCache;
}

async function fetchSurahAyahs(surahNumber) {
  if (surahAyahsCache[surahNumber]) return surahAyahsCache[surahNumber];
  const res = await fetchWithTimeout(`${API_BASE}/surah/${surahNumber}/quran-uthmani`);
  const json = await res.json();
  surahAyahsCache[surahNumber] = requireAyahArray(json, `surah ${surahNumber}`);
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
let slideDirection = null; // "next" | "prev" while a swipe is switching tabs

// Two of the overlays are pages of their own rather than passing dialogs:
// they have an address, a refresh reopens them where they were, and the
// phone's back button closes them instead of leaving the app. They layer
// over a tab, so their address carries both - /learn/settings, /review/mushaf
// - and closing one returns to the tab it was opened from.
const OVERLAY_ROUTES = {
  settings: {
    // Every drawer starts shut on each opening, not just the first: a group
    // left open from the last visit would hand back the long sheet this is
    // meant to fold away.
    open: () => {
      document.querySelectorAll("#settings-overlay .settings-group").forEach((d) => { d.open = false; });
      document.getElementById("settings-overlay").classList.remove("modal-closed");
    },
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
  // After the info modal, so a dialog opened over the page gets the press
  // before the page underneath it does.
  { id: "recite-overlay", close: () => reciteBackPressed() },
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

function switchTab(tab, { fromHistory = false, from = null } = {}) {
  tabScrollPositions[currentTabName] = window.scrollY;
  // Where it came from, so the panel can arrive from that side. Set by the
  // swipe; a tap on the bar arrives the way it always did.
  slideDirection = from;
  // Replacing rather than pushing when the tab hasn't changed: a session
  // restarted in place (finishing a review, say) is not a second page to
  // press back through.
  if (!fromHistory) writeRoute(tab, overlayStack, tab === currentTabName);
  currentTabName = tab;
  document.documentElement.dataset.route = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  // The one being left, kept on screen for the length of the slide so the two
  // pages pass each other instead of one blinking into the other's place.
  const leaving = slideDirection ? document.querySelector(".tab-panel.active") : null;
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.remove("slide-from-left", "slide-from-right", "leaving", "leave-to-right", "leave-to-left");
    const on = p.id === `tab-${tab}`;
    p.classList.toggle("active", on);
    if (on && slideDirection) {
      // Reading the offset forces the class change to land as a restart of
      // the animation rather than as no change at all. A finger dragged to
      // the right pulls the next tab in from the left, and the other way
      // round - the panels follow the hand.
      void p.offsetWidth;
      p.classList.add(slideDirection === "next" ? "slide-from-left" : "slide-from-right");
    }
  });
  if (leaving && leaving.id !== `tab-${tab}`) {
    const out = slideDirection === "next" ? "leave-to-right" : "leave-to-left";
    leaving.classList.add("leaving", out);
    setTimeout(() => leaving.classList.remove("leaving", out), 300);
  }
  slideDirection = null;
  syncFooterVisibility();
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
  // Both are self-limiting: persistence is asked for once per session and
  // only when there is something to protect, the nudge at most weekly.
  ensurePersistenceOnce();
  maybeNudgeBackup();
  // The stat shows what's actually being asked of today, not the whole
  // backlog: a four-figure "due" count is a reason to close the app.
  const totalDue = items.filter((i) => i.learningStage === "srs" && i.due <= today).length;
  const dueCount = Math.min(totalDue, reviewsLeftToday());
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
  if (weekEl) {
    const week = activeDaysThisWeek();
    weekEl.textContent = week >= 7 ? "أسبوع كامل 🌿" : `${week} من 7 أيام`;
  }
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
  document.getElementById("stat-new").textContent = surahsInProgress();
  document.getElementById("stat-mastered").textContent = masteredCount;
  document.getElementById("stat-streak").textContent = computeStreak();

  const TOTAL_QURAN_AYAHS = 6236;
  const overallPct = Math.min(100, (masteredCount / TOTAL_QURAN_AYAHS) * 100);
  document.getElementById("overall-progress-fill").style.width = `${overallPct}%`;
  document.getElementById("overall-progress-text").textContent =
    `${masteredCount} / ${TOTAL_QURAN_AYAHS} (${overallPct.toFixed(1)}%)`;

  // "تحفظ منذ" dates from the first ayah actually memorized - the same set the
  // counter above reports. It used to date from the first ayah that entered
  // the app at all, so a single temporary review (which is never counted as
  // memorized) started a clock on a memorization that hadn't begun.
  const sinceEl = document.getElementById("memorization-since-text");
  const firstMemorized = items.reduce((min, i) => {
    if (i.learningStage !== "srs" || i.temporary) return min;
    const day = i.memorizedOn || i.added; // older items predate the stamp
    return !min || day < min ? day : min;
  }, null);
  sinceEl.textContent = firstMemorized
    ? `تحفظ منذ ${formatArabicDate(firstMemorized)} (${formatDurationSince(firstMemorized)})`
    : "";

  // Nothing added at all, not merely nothing memorized: an ayah part-way
  // through its rounds is still a reason to see the whole dashboard.
  const firstRun = items.length === 0;
  document.documentElement.dataset.firstRun = firstRun ? "true" : "false";
  document.getElementById("onboarding-panel").classList.toggle("show", firstRun);

  renderChallengeCard();

  const planList = document.getElementById("plan-list");
  planList.innerHTML = "";
  // The surahs being memorized live here too, alongside what they have
  // already put into the review cycle: one surah, one place, whether a given
  // ayah is finished or still under the rounds.
  const planItems = items.filter((i) => i.learningStage === "srs" || i.learningStage === "learning");
  if (planItems.length === 0) {
    planList.innerHTML = `<p class="muted">لا توجد آيات في جدول المراجعة بعد. أكمل حفظ آية من تبويب "ابدأ الحفظ" لتظهر هنا.</p>`;
  } else {
    const bySurah = new Map();
    planItems.forEach((item) => {
      if (!bySurah.has(item.surah)) bySurah.set(item.surah, { name: item.surahName || item.surah, items: [] });
      bySurah.get(item.surah).items.push(item);
    });
    [...bySurah.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([surahNum, group]) => {
        const items2 = [...group.items].sort((a, b) => a.ayah - b.ayah);
        const dueInGroup = items2.filter((i) => i.learningStage === "srs" && i.due <= today).length;
        const learningInGroup = items2.filter((i) => i.learningStage === "learning");
        const memorizedInGroup = items2.length - learningInGroup.length;
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
        // Illuminated, or standing finished and waiting to be. Both belong on
        // the row that already names the surah rather than in a list of their
        // own - the gilding is a thing about this surah, not a separate
        // collection to go and browse.
        const gilded = isGilded(surahNum);
        const offer = !gilded && canGild(surahNum);
        if (gilded) details.classList.add("gilded");
        const summary = document.createElement("summary");
        summary.className = "plan-surah-summary";
        // Name and badges share one wrapper that wraps onto a second line by
        // itself when the row runs out of width; the disclosure arrow sits in
        // a column of its own so it stays put at any screen size, and the
        // name is never broken across lines to make room for a badge.
        summary.innerHTML = `
          <span class="plan-surah-body">
            <span class="plan-surah-head">
              <span class="plan-surah-name">📖 ${group.name}</span>
            </span>
            <span class="plan-surah-tags">${
              memorizedInGroup ? `<span class="plan-surah-count">${memorizedInGroup} آية</span>` : ""
            }${
              dueInGroup ? `<span class="badge due">${dueInGroup} مستحقة</span>` : ""
            }${
              learningInGroup.length ? `<span class="badge learning">${learningInGroup.length} قيد الحفظ</span>` : ""
            }<span class="plan-surah-actions"></span></span>
          </span>
        `;
        const actions = summary.querySelector(".plan-surah-actions");
        // A surah with ayahs still under the rounds can be taken up now
        // without disturbing the place in the sequence - unless the learn
        // tab is already standing on it, in which case there is nowhere to go.
        const activePointer = activeLearnPointer();
        if (learningInGroup.length && activePointer.surah !== surahNum) {
          const go = document.createElement("button");
          go.type = "button";
          go.className = "plan-resume-btn";
          go.title = `تابع حفظ ${group.name} من الآية ${learningInGroup[0].ayah}`;
          go.setAttribute("aria-label", `تابع حفظ ${group.name} من الآية ${learningInGroup[0].ayah}`);
          go.textContent = "تابِع";
          go.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            startLearnDetour(surahNum, learningInGroup[0].ayah);
          });
          actions.appendChild(go);
        }
        // Straight from the surah whose row this is: recite it onto the blank
        // page. Offered only where there is something memorized to recite.
        // The microphone and the tick sit with the name, not down in the row
        // of marks: they are what this surah IS and what you do with it,
        // while the ring, the badges and the buttons are its state and its
        // housekeeping.
        const head = summary.querySelector(".plan-surah-head");
        if (memorizedInGroup > 0 && voiceSupported()) {
          const say = document.createElement("button");
          say.type = "button";
          say.className = "plan-recite-btn";
          say.innerHTML = ICONS.mic;
          say.title = `سمِّع ${group.name} على صفحة فارغة`;
          say.setAttribute("aria-label", `سمِّع ${group.name} على صفحة فارغة`);
          say.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const nums = items2.filter((i) => i.learningStage === "srs").map((i) => i.ayah);
            openReciteSession({ kind: "surah", surah: surahNum, from: nums[0], to: nums[nums.length - 1] });
          });
          head.appendChild(say);
        }
        // Added and thought better of: clears this surah's unmemorized ayahs
        // in one go. Only those - what is already memorized is removed one
        // ayah at a time, from its own row, where the choice is deliberate.
        if (learningInGroup.length) {
          const nums = learningInGroup.map((i) => i.ayah);
          const span = nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]}` : `${nums[0]}`;
          const drop = document.createElement("button");
          drop.type = "button";
          drop.className = "plan-drop-btn";
          drop.textContent = "✕";
          drop.title = `أزِل ما لم يُحفظ من ${group.name}`;
          drop.setAttribute("aria-label", `أزِل ${group.name} ${span} مما لم يُحفظ بعد`);
          drop.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropPendingGroup({ surah: surahNum, name: group.name, items: learningInGroup }, span);
          });
          actions.appendChild(drop);
        }
        if (offer) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "gild-btn";
          btn.title = `حفظتها كاملة — ذهّبها مقابل ${pointsText(GILD_PRICE)}`;
          btn.setAttribute("aria-label", `تذهيب ${group.name} مقابل ${pointsText(GILD_PRICE)}`);
          btn.innerHTML = `<span class="gild-btn-price">${GILD_PRICE}</span>${coinIconHTML("coin-sm")}`;
          // Inside a <summary>, a click is the toggle - so the button has to
          // take the event out of the summary's hands or buying would open
          // and close the group underneath the confirm dialog.
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            gildSurah(surahNum);
          });
          actions.appendChild(btn);
        }
        // The lower line is a fixed place, not a spillover: badges and
        // buttons always sit there and never mix into the name's line, so
        // every row in the list reads the same way. It disappears only when
        // there is genuinely nothing to put on it.
        // The tick only goes on a surah that is illuminated - which already
        // means memorized whole - so what it says is true whenever it is
        // there, and it comes off with the frame if an ayah leaves the plan.
        const tags = summary.querySelector(".plan-surah-tags");
        // Under the name, in one row with the badges and the buttons: how
        // much of the surah is memorized, drawn as a ring, and the tick when
        // it is all of it and illuminated. A mark left up beside the name was
        // a second row's worth of marks in two different places.
        const ring = surahProgressRingNode(surahNum, group.name);
        if (ring) tags.insertBefore(ring, tags.firstChild);
        // The tick is for the surah being memorized whole, which is what it
        // says; the gold frame around it already says it was illuminated.
        if (surahFullyMemorized(surahNum)) {
          const nameEl = summary.querySelector(".plan-surah-name");
          nameEl.parentNode.insertBefore(gildCheckNode(), nameEl.nextSibling);
        }
        // The row hides only when it is genuinely empty. It used to ask about
        // badges alone, and now that the count and the ring live here too, a
        // surah with neither a badge nor a button - آل عمران, four ayahs in,
        // nothing due - had its count and its ring hidden along with the row.
        const hasMarks = tags.querySelector(".plan-surah-count, .badge, .surah-ring");
        tags.classList.toggle("hidden", !hasMarks && !actions.childElementCount);
        details.appendChild(summary);
        const itemsContainer = document.createElement("div");
        itemsContainer.className = "plan-surah-items";
        items2.forEach((item) => itemsContainer.appendChild(buildPlanItemRow(item, today)));
        details.appendChild(itemsContainer);
        planList.appendChild(details);
      });
  }


  renderPendingCard();
  renderSurahProgress();
  renderMushafMap();
  renderActivityCalendar();
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
  // The form lives inside a <details> now: the wrapper is what is shown or
  // hidden, and whether it is open decides whether the fields are unfolded.
  const form = document.getElementById("wird-plan-details");
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
    // Folded by default: a form with six fields, unasked-for and fully
    // unrolled, is most of the reason the dashboard read as long. The
    // invitation is one line; the fields come when they are wanted.
    form.open = false;
    document.getElementById("btn-wird-plan-cancel").classList.add("hidden");
    renderWirdPlanAnchors();
    return;
  }

  form.classList.add("hidden");
  view.classList.remove("hidden");
  document.getElementById("wird-plan-sentence").textContent = wirdPlanSentence(plan);

  // Held to today only, and phrased as a nudge rather than a scolding: a
  // missed commitment that greets you as a failure is one you stop making.
  const done = wirdDoneToday();
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
  nextEl.textContent = `🗓️ غدًا ${when}${plan.place ? ` ${plan.place}` : ""}`;
  nextEl.classList.toggle("hidden", !done);
  // Two shapes for one fact, stacked: "سأحفظ وردي بعد الفجر (05:30) في
  // البيت" and then "موعدك القادم: غدًا بعد الفجر (05:30) في البيت". Once
  // the day is kept the pill carries everything the sentence did and adds
  // غدًا, so the sentence steps aside rather than repeating itself.
  document.getElementById("wird-plan-sentence").classList.toggle("hidden", done);
  document.getElementById("btn-wird-plan-start").classList.toggle("hidden", done);
  document.getElementById("btn-wird-plan-edit").textContent = done ? "عدّل موعد الغد" : "تعديل العهد";
  renderWirdNotifyRow();
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
  const details = document.getElementById("wird-plan-details");
  details.classList.remove("hidden");
  details.open = true; // asked for explicitly, so it opens on the fields
  document.getElementById("btn-wird-plan-cancel").classList.toggle("hidden", !state.wirdPlan);
  renderWirdPlanAnchors();
}

function saveWirdPlan() {
  const time = document.getElementById("wird-plan-time").value || "05:30";
  const place = document.getElementById("wird-plan-place").value.trim();
  // Editing the hour must move the reminder with it - a commitment changed
  // to 6am that still buzzes at 5:30 is worse than no reminder at all.
  const notify = !!(state.wirdPlan && state.wirdPlan.notify);
  state.wirdPlan = { anchor: wirdPlanDraftAnchor, time, place, created: todayISO(), notify };
  saveState();
  renderWirdPlanCard();
  scheduleWirdReminder();
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

// ---------- The reminder itself ----------
//
// The commitment card has always known *when*, and could hand that when to
// the phone's calendar - but the app itself never said a word at the hour
// it named, which is the one moment the whole feature exists for.
//
// What the web can honestly do here is narrower than a native app, and the
// card says so rather than implying otherwise:
//   - while the app is running (foreground, or backgrounded and not yet
//     evicted) a timer fires at the appointed minute;
//   - in the foreground that's a toast, since a system notification for an
//     app you are already looking at is just noise;
//   - once the browser has thrown the page away, nothing of ours runs, so
//     the calendar entry stays the guaranteed path and is named as such.
// Notification Triggers (a real scheduled notification) is still behind a
// flag in Chromium and absent from Safari, so there is nothing better to
// reach for yet.

let wirdReminderTimer = null;

function notifyState() {
  if (typeof Notification === "undefined" || !navigator.serviceWorker) return "unsupported";
  return Notification.permission; // "granted" | "denied" | "default"
}

// iOS only exposes notifications to a PWA that has been added to the Home
// Screen; in a Safari tab the API is simply missing, and saying "your
// browser doesn't support this" to an iPhone owner who could have it in two
// taps is the wrong answer.
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

// The unit the day's reading is measured in. "open" is not a unit - it is
// the absence of a target - so it is still counted in ayahs, which is the
// finer of the two and what the card shows.
function wirdCounts() {
  return (state.wirdTargetType === "pages") ? state.dailyPageCounts : state.dailyCounts;
}

function wirdIsOpen() {
  return state.wirdTargetType === "open";
}

function wirdDoneToday() {
  const today = wirdCounts()[todayISO()] || 0;
  // Nothing was asked for, so turning up is the whole of it.
  if (wirdIsOpen()) return today > 0;
  return today >= (state.wirdTarget || 5);
}

// The next time this clock-time comes round: today if it hasn't passed,
// tomorrow otherwise. Built from a Date rather than string arithmetic so
// midnight, month ends and DST are the platform's problem, not ours.
function nextWirdOccurrence(plan, from = new Date()) {
  const [h, m] = (plan.time || "05:30").split(":").map(Number);
  const at = new Date(from);
  at.setHours(h || 0, m || 0, 0, 0);
  if (at <= from) at.setDate(at.getDate() + 1);
  return at;
}

function cancelWirdReminder() {
  if (wirdReminderTimer) clearTimeout(wirdReminderTimer);
  wirdReminderTimer = null;
}

async function fireWirdReminder() {
  wirdReminderTimer = null;
  const plan = state.wirdPlan;
  if (!plan || !plan.notify) return;
  // Done already, or today's reminder has been given: say nothing. A
  // reminder for something you have finished is the fastest way to teach
  // someone to switch reminders off.
  if (!wirdDoneToday() && state.wirdNotifiedOn !== todayISO()) {
    state.wirdNotifiedOn = todayISO();
    saveState();
    const body = plan.place ? `ورد اليوم ينتظرك ${plan.place} 🌿` : "ورد اليوم ينتظرك 🌿";
    if (document.visibilityState === "visible") {
      showToast(`🤝 حان موعد عهدك — ${body}`, "success");
      renderWirdPlanCard();
    } else {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification("🤝 حان موعد وردك", {
          body,
          icon: "icons/icon-192.png",
          badge: "icons/icon-192.png",
          tag: "tadabbur-wird",       // one reminder, replaced - never a stack
          lang: "ar",
          dir: "rtl",
          renotify: true,
        });
      } catch (e) {
        /* permission revoked mid-session, or no worker: nothing to do */
      }
    }
  }
  scheduleWirdReminder();
}

function scheduleWirdReminder() {
  cancelWirdReminder();
  const plan = state.wirdPlan;
  if (!plan || !plan.notify) return;
  if (notifyState() !== "granted") return;
  const ms = nextWirdOccurrence(plan) - new Date();
  // setTimeout is 32-bit: anything past ~24.8 days silently fires at once.
  // A daily appointment is never more than a day out, so this is a guard
  // against a corrupt time rather than a real case.
  if (ms < 0 || ms > 86400000) return;
  wirdReminderTimer = setTimeout(fireWirdReminder, ms);
}

async function requestWirdNotifications() {
  if (notifyState() === "unsupported") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch (e) {
    return false;
  }
}

// Said plainly, including what it cannot do: a reminder someone believes in
// and doesn't get is worse than one they were never offered.
function wirdNotifyNote() {
  const plan = state.wirdPlan;
  const st = notifyState();
  if (st === "unsupported") {
    return isIOS() && !isStandalone()
      ? "لتفعيل التنبيه على الآيفون، ثبّت التطبيق أولًا: زر المشاركة ← «إضافة إلى الشاشة الرئيسية»، ثم افتحه من هناك."
      : "هذا المتصفح لا يدعم التنبيهات. أضِف العهد إلى تقويم جوالك — وهو يعمل في كل الحالات.";
  }
  if (st === "denied") return "التنبيهات محجوبة لهذا الموقع في إعدادات متصفحك. اسمح بها من هناك ثم أعد المحاولة.";
  if (!plan || !plan.notify) return "تنبيه على هذا الجهاز عند موعدك.";
  // One line, because it lives on the card permanently. The full caveat is
  // still said - once, out loud, at the moment the switch is turned on -
  // and the calendar link sits directly beneath this.
  return "يعمل والتطبيق مفتوح أو في الخلفية.";
}

function renderWirdNotifyRow() {
  const row = document.getElementById("wird-notify-row");
  const toggle = document.getElementById("wird-notify-toggle");
  const note = document.getElementById("wird-notify-note");
  if (!row || !toggle || !note) return;
  const st = notifyState();
  toggle.checked = !!(state.wirdPlan && state.wirdPlan.notify) && st === "granted";
  toggle.disabled = st === "unsupported" || st === "denied";
  row.classList.toggle("disabled", toggle.disabled);
  note.textContent = wirdNotifyNote();
}

async function toggleWirdNotifications(on) {
  if (!state.wirdPlan) return;
  if (on) {
    const ok = await requestWirdNotifications();
    if (!ok) {
      state.wirdPlan.notify = false;
      saveState();
      renderWirdNotifyRow();
      showToast("لم يُسمح بالتنبيهات. يمكنك دائمًا استخدام تذكير التقويم 📅", "error");
      return;
    }
    state.wirdPlan.notify = true;
    saveState();
    renderWirdNotifyRow();
    scheduleWirdReminder();
    const at = nextWirdOccurrence(state.wirdPlan);
    const when = at.toDateString() === new Date().toDateString() ? "اليوم" : "غدًا";
    showToast(`🔔 سأذكّرك ${when} الساعة ${state.wirdPlan.time}`, "success",
      "ما دام التطبيق يعمل أو في الخلفية. وإن أُغلق تمامًا فلن يصل — تذكير التقويم وحده مضمون.");
  } else {
    state.wirdPlan.notify = false;
    saveState();
    renderWirdNotifyRow();
    cancelWirdReminder();
  }
}

// A backgrounded page has its timers throttled, and a frozen one has them
// stopped outright - so the appointment is recomputed every time the app
// comes back to the front rather than trusted to a timer set an hour ago.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleWirdReminder();
});

on("btn-wird-plan-save", "click", saveWirdPlan);
on("btn-wird-plan-edit", "click", () => openWirdPlanForm());
on("btn-wird-plan-cancel", "click", renderWirdPlanCard);
on("btn-wird-plan-ics", "click", downloadWirdPlanICS);
const wirdNotifyToggle = document.getElementById("wird-notify-toggle");
if (wirdNotifyToggle) wirdNotifyToggle.addEventListener("change", (e) => toggleWirdNotifications(e.target.checked));
on("btn-wird-plan-start", "click", () => openTodaysWirdReading());

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

// Which weekday the week starts on where this person is - Saturday across
// most of the Arab world, Sunday in the US, Monday in much of Europe. The
// browser knows (Intl.Locale#getWeekInfo, and firstDay before that); Saturday
// is the fallback because the app's audience is overwhelmingly there, but it
// is a fallback rather than an assumption.
function localFirstWeekday() {
  try {
    const loc = new Intl.Locale(navigator.language || "ar");
    const info = typeof loc.getWeekInfo === "function" ? loc.getWeekInfo() : loc.weekInfo;
    // Intl counts Monday as 1 and Sunday as 7; Date#getDay counts Sunday as 0.
    if (info && info.firstDay) return info.firstDay % 7;
  } catch (e) { /* older engine: fall through */ }
  return 6; // Saturday
}

function renderWirdCard() {
  const counts = wirdCounts();
  const open = wirdIsOpen();
  const target = state.wirdTarget || 5;
  const today = todayISO();
  const todayCount = counts[today] || 0;
  // With no target there is no fraction to fill: the ring is either empty or
  // whole, which is exactly what an open wird asks of the day.
  const pct = open ? (todayCount > 0 ? 100 : 0)
                   : Math.min(100, Math.round((todayCount / target) * 100));

  const ring = document.getElementById("wird-ring");
  if (ring) ring.style.background = `conic-gradient(var(--primary) ${pct}%, var(--border) ${pct}%)`;

  const countText = document.getElementById("wird-count-text");
  if (countText) countText.textContent = open ? String(todayCount) : `${todayCount}/${target}`;

  const todayDateEl = document.getElementById("wird-today-date");
  if (todayDateEl) todayDateEl.textContent = formatArabicDate(today);

  const weekEl = document.getElementById("wird-week");
  if (weekEl) {
    weekEl.innerHTML = "";
    let todayEl = null;
    // This calendar week, Saturday to Friday - not the last seven days.
    // A rolling window is permanently full for anyone keeping their wird:
    // every day that drops off the back was also met, so the strip reads
    // "all done" forever and never marks the start of anything. A week that
    // begins on Saturday empties itself every Saturday, which is what makes
    // the row worth looking at - it shows this week, not the last seven
    // days of history.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const firstDay = localFirstWeekday();
    start.setDate(start.getDate() - ((start.getDay() - firstDay + 7) % 7));
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = isoOf(d);
      const count = counts[iso] || 0;
      const metOnDay = open ? count > 0 : count >= target;
      const isToday = iso === today;
      // A day that has not arrived is neither met nor missed, and colouring
      // it as either would be a claim about a day that has not happened.
      const upcoming = iso > today;
      const met = !upcoming && metOnDay;
      const dayEl = document.createElement("div");
      dayEl.className = `wird-day${met ? " met" : ""}${isToday ? " today" : ""}${upcoming ? " upcoming" : ""}`;
      dayEl.title = upcoming ? `${iso}: لم يحن بعد` : (open ? `${iso}: ${count}` : `${iso}: ${count}/${target}`);
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

// ---------- One shape for every number the app shows ----------
// Numbers arrive on screen from a hundred places - counters, percentages,
// dates, "الجولة 1 من 3", an ayah's number in its ring - and threading a
// formatter through every one of them would mean missing some. So the choice
// is applied to the rendered text instead: a pass over the text nodes, and an
// observer that catches whatever is drawn next. Idempotent, so re-running it
// over text it already converted changes nothing.
const WESTERN_DIGIT_RE = /[0-9]/g;
const ARABIC_DIGIT_RE = /[٠-٩]/g;
// Left alone: what the person is typing, what the engine heard (the voice
// chips, whose text is compared against the ayah), and anything asking to
// keep its digits as they are.
const NUMERALS_SKIP = "input, textarea, select, option, [contenteditable], .voice-word-chip, script, style, [data-keep-numerals]";

function numeralsStyle() {
  return state.numerals === "arabic" ? "arabic" : "western";
}

function convertDigits(text, style) {
  return style === "arabic"
    ? text.replace(WESTERN_DIGIT_RE, (d) => ARABIC_INDIC_DIGITS[Number(d)])
    : text.replace(ARABIC_DIGIT_RE, (d) => String(d.charCodeAt(0) - 0x0660));
}

let numeralsPassRunning = false;
function applyNumeralsTo(root) {
  if (!root || numeralsPassRunning) return;
  const style = numeralsStyle();
  const wanted = style === "arabic" ? WESTERN_DIGIT_RE : ARABIC_DIGIT_RE;
  numeralsPassRunning = true;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.data || !wanted.test(node.data)) return NodeFilter.FILTER_REJECT;
        wanted.lastIndex = 0; // the regex is global; a stale index would skip matches
        const el = node.parentElement;
        if (!el || el.closest(NUMERALS_SKIP)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const pending = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) pending.push(n);
    pending.forEach((node) => {
      const next = convertDigits(node.data, style);
      if (next !== node.data) node.data = next;
    });
  } finally {
    numeralsPassRunning = false;
  }
}

function applyNumerals() {
  applyNumeralsTo(document.body);
}

// Everything drawn after the first pass goes through the same shaping - but
// only while there IS a shaping to apply. On the default setting the app
// already writes the digits it means, so nothing watches the document at
// all: no observer, no per-render walk, nothing to go wrong for the people
// who never opened the setting.
let numeralsObserver = null;
function watchNumerals() {
  const needed = numeralsStyle() === "arabic";
  if (!needed) {
    if (numeralsObserver) { numeralsObserver.disconnect(); numeralsObserver = null; }
    return;
  }
  if (numeralsObserver) return;
  numeralsObserver = new MutationObserver((records) => {
    if (numeralsPassRunning) return;
    try {
      const roots = new Set();
      records.forEach((r) => {
        if (r.type === "characterData") { if (r.target.parentElement) roots.add(r.target.parentElement); }
        else r.addedNodes.forEach((n) => roots.add(n.nodeType === 1 ? n : n.parentElement));
      });
      roots.forEach((el) => el && applyNumeralsTo(el));
    } catch (e) {
      // Never let a shaping failure escape into the page's own work.
      console.error("تعذّر تنسيق الأرقام", e);
    }
  });
  numeralsObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

// A way to log the daily wird from reading the Mushaf directly, instead of
// only being able to bump dailyCounts by memorizing/reviewing - some days
// the wird is just reading, not new memorization. Reading happens in a
// fullscreen, distraction-free reader (see openMushafReader below) rather
// than inline on the dashboard.
// How many pages an open reading loads when it starts from a page number.
// Generous enough to keep turning, bounded so "no target" never means
// fetching six hundred pages.
const OPEN_READ_PAGES = 10;

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

// ---------- Recovering from a load that failed ----------
//
// The surah list is fetched once, at startup, by both the Mushaf card and
// the browse tab. If that one fetch failed, nothing ever tried again - and
// every control downstream of it then failed *silently*:
//
//   · the browse tab had no surahs and no ayahs;
//   · "ورد اليوم" found no selected surah and scrolled to the Mushaf card
//     instead, which reads as the button throwing you to the bottom of the
//     page for no reason;
//   · "عرض للقراءة" hit `if (!surahNumber) return;` and did nothing at all.
//
// Three symptoms, one cause. It shows up after the app has sat in the
// background because that is exactly when the page gets discarded and
// reloaded while the phone is still bringing its connection back: the
// startup fetch lands in that window, fails, and the app stays broken until
// it is killed and reopened on a working network - which is the workaround
// people were having to find for themselves.
//
// So: remember what failed, say so where it can be seen, and try again on
// every signal that the network might be back.

const pendingInits = new Map(); // name -> the async loader to run again

function markInitFailed(name, fn) {
  pendingInits.set(name, fn);
  renderConnectionBanner();
}

function markInitOk(name) {
  if (pendingInits.delete(name)) renderConnectionBanner();
}

let retryingInits = false;
async function retryFailedInits() {
  if (retryingInits || !pendingInits.size) return;
  if (navigator.onLine === false) return;
  retryingInits = true;
  const banner = document.getElementById("connection-banner");
  if (banner) banner.classList.add("busy");
  try {
    // A copy: a loader that succeeds removes itself from the map as it runs.
    for (const [, fn] of [...pendingInits.entries()]) {
      try { await fn(); } catch (e) { /* still down; it stays registered */ }
    }
  } finally {
    retryingInits = false;
    if (banner) banner.classList.remove("busy");
    renderConnectionBanner();
  }
}

function renderConnectionBanner() {
  const banner = document.getElementById("connection-banner");
  if (!banner) return;
  const broken = pendingInits.size > 0;
  banner.classList.toggle("hidden", !broken);
  if (broken) {
    const text = document.getElementById("connection-banner-text");
    if (text) {
      text.textContent = navigator.onLine === false
        ? "لا يوجد اتصال — بعض أجزاء التطبيق لم تُحمَّل."
        : "تعذّر تحميل قائمة السور. الآيات والقراءة لن تعمل حتى تُحمَّل.";
    }
  }
}

// Every signal that the network may have come back. The visibility one is
// the important one on a phone: the app is brought to the front long before
// anyone thinks to press a retry button.
window.addEventListener("online", retryFailedInits);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") retryFailedInits();
});

async function initMushafCard() {
  const loadBtn = document.getElementById("btn-mushaf-load");
  loadBtn.innerHTML = iconLabel("book", "عرض للقراءة");

  const loadSurahs = async () => {
    const surahs = await fetchSurahList();
    const startSurah = defaultMushafSurah(surahs);
    setupSurahCombo("mushaf-surah-combo", "mushaf-surah-combo-input", "mushaf-surah-combo-list", surahs, (surahNumber) => {
      updateMushafDefaultRange(surahNumber);
    }).setValue(startSurah);
    await updateMushafDefaultRange(startSurah);
    document.getElementById("mushaf-surah-combo-input").placeholder = "ابحث عن سورة...";
    markInitOk("mushaf-surahs");
  };
  try {
    await loadSurahs();
  } catch (e) {
    document.getElementById("mushaf-surah-combo-input").placeholder = "تعذّر تحميل قائمة السور";
    markInitFailed("mushaf-surahs", loadSurahs);
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
    // A page jump loads the day's worth of pages so it matches what range
    // mode does. With no target there is no "day's worth", so it loads a run
    // long enough to read freely and short enough that it is still one
    // request per page and not the whole mushaf.
    const pageCount = wirdIsOpen() ? OPEN_READ_PAGES
      : (state.wirdTargetType === "pages" ? Math.max(1, state.wirdTarget || 1) : 1);
    try {
      const ayahs = [];
      for (let p = pageNumber; p < pageNumber + pageCount && p <= 604; p++) {
        const res = await fetchWithTimeout(`${API_BASE}/page/${p}/quran-uthmani`, 8000);
        const json = await res.json();
        requireAyahArray(json, `page ${p}`).forEach((a) => ayahs.push({ ...a, surahNumberForReader: a.surah.number }));
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
  if (!surahNumber) {
    showToast("اختر سورة أولًا.", "error");
    if (pendingInits.has("mushaf-surahs")) retryFailedInits();
    return;
  }
  if (from > to) {
    showToast("رقم آية البداية أكبر من النهاية.", "error");
    return;
  }
  try {
    const ayahs = await fetchSurahAyahs(surahNumber);
    const matches = ayahs
      .filter((a) => a.numberInSurah >= from && a.numberInSurah <= to)
      .map((a) => ({ ...a, surahNumberForReader: surahNumber }));
    if (matches.length === 0) return;
    // A wird measured in pages carries on into the next surah rather than
    // stopping at a cover: whether today's two pages happen to straddle a
    // surah boundary is not something the reader should feel.
    const reachesEnd = to >= ayahs.length;
    const spill = state.wirdTargetType === "pages" && reachesEnd && pagesShortBy > 0
      ? await pagesFromNextSurah(surahNumber, pagesShortBy)
      : [];
    openMushafReader(await completeEdgePages(matches.concat(spill)));
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
// Also records, in pagesShortBy, how many pages of the target did not fit
// in this surah. The from/to inputs address ayah numbers inside one surah
// and cannot say "and then the next one", so the clamp has to stay - but a
// two-page wird that starts on the last page of a surah was silently
// becoming a one-page wird, and the second page only turned up the next
// day. The reader makes up the difference from the surah that follows.
let pagesShortBy = 0;

function computeMushafTo(ayahs, from) {
  // No target, no end: the reading runs to the close of the surah and the
  // person stops where they stop. It is not unbounded for all that - the
  // reader pages what it is given, so a long surah arrives as pages to turn
  // rather than as one enormous screen.
  if (wirdIsOpen()) {
    pagesShortBy = 0;
    return ayahs.length;
  }
  if (state.wirdTargetType === "pages") {
    const pages = groupAyahsIntoMushafPages(ayahs);
    let fromPageIdx = pages.findIndex((p) => p.ayahs[p.ayahs.length - 1].numberInSurah >= from);
    if (fromPageIdx === -1) fromPageIdx = 0;
    const wanted = Math.max(1, state.wirdTarget || 1);
    const available = pages.length - fromPageIdx;
    const pageCount = Math.max(1, Math.min(wanted, available));
    pagesShortBy = Math.max(0, wanted - available);
    const lastPage = pages[fromPageIdx + pageCount - 1];
    return lastPage.ayahs[lastPage.ayahs.length - 1].numberInSurah;
  }
  pagesShortBy = 0;
  return Math.min(from + (state.wirdTarget || 5) - 1, ayahs.length);
}

// A page of the Mushaf is a page, not a page of one surah. Where a surah
// ends partway down the paper, the surah after it begins on that same page -
// and a reading assembled from one surah stops at the cover, leaving the
// bottom of the page blank and calling it a page. The same at the other end:
// opening at a surah's first ayah lands mid-page, with the tail of the surah
// before it missing from the top.
//
// So both edges of the reading are completed from the neighbouring surah, by
// the page number the ayahs themselves carry. Nothing in between needs it -
// a range inside one surah has no edge that is not its own.
//
// The page-number path does not come through here: /page/N already returns
// every surah that has a foot on that page.
async function completeEdgePages(list) {
  if (!list || !list.length) return list || [];
  let out = list;

  const last = out[out.length - 1];
  const lastSurah = last.surahNumberForReader;
  if (lastSurah < 114 && last.numberInSurah >= surahAyahCount(lastSurah)) {
    const tail = await ayahsOnMushafPage(lastSurah + 1, last.page);
    if (tail.length) out = out.concat(tail);
  }

  const first = out[0];
  const firstSurah = first.surahNumberForReader;
  if (firstSurah > 1 && first.numberInSurah === 1) {
    const head = await ayahsOnMushafPage(firstSurah - 1, first.page);
    if (head.length) out = head.concat(out);
  }
  return out;
}

// Whatever of this surah sits on that page of the Mushaf. Silent on failure:
// an incomplete page is a smaller loss than no reading at all.
async function ayahsOnMushafPage(surahNumber, pageNumber) {
  if (!pageNumber || surahNumber < 1 || surahNumber > 114) return [];
  try {
    const ayahs = await fetchSurahAyahs(surahNumber);
    return ayahs
      .filter((a) => (a.page || 0) === pageNumber)
      .map((a) => ({ ...a, surahNumberForReader: surahNumber }));
  } catch (e) {
    return [];
  }
}

// The opening pages of the surah after this one, enough to finish a wird
// that ran out of surah. Nothing is added if this is the last surah, or if
// the next one cannot be fetched - a short wird is better than no wird.
async function pagesFromNextSurah(surahNumber, pageCount) {
  if (pageCount <= 0 || surahNumber >= 114) return [];
  try {
    const next = await fetchSurahAyahs(surahNumber + 1);
    const pages = groupAyahsIntoMushafPages(next);
    return pages.slice(0, pageCount).flatMap((page) =>
      page.ayahs.map((a) => ({ ...a, surahNumberForReader: surahNumber + 1 })));
  } catch (e) {
    return [];
  }
}

// Defaults the from/to range to wherever this surah's reading should pick
// up (see defaultMushafSurah) and how far the wird plan says to go from
// there, instead of an arbitrary fixed 1-5.
// Called with a surah when one is picked, and with nothing when the daily
// target changes - the range's end is worked out from that target, so it has
// to be redrawn. Defaulting to the surah already in hand is what makes the
// second case safe: taking the bare parameter set the selection to undefined,
// so changing the target silently unpicked the surah and "عرض للقراءة" then
// answered "اختر سورة أولًا" over an input still showing its name.
async function updateMushafDefaultRange(surahNumber = selectedMushafSurah) {
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
  // A page can now hold the end of one surah and the start of the next, so
  // the name and the basmala go where the surah actually begins rather than
  // at the top of the page - which is where a single hoisted line put them,
  // over ayahs belonging to the surah before it.
  const bodyHTML = page.ayahs
    .map((a) => {
      let text = a.text;
      let before = "";
      if (a.numberInSurah === 1) {
        before = `<span class="mushaf-surah-mark">${surahDisplayName(a.surahNumberForReader)}</span>`;
        if (a.surahNumberForReader !== 1) {
          const { bismillah, rest } = splitBismillah(text);
          if (bismillah) {
            // A span (not a <p>, which browsers won't let nest inside the
            // outer #mushaf-reader-text <p> without auto-correcting the DOM)
            before += `<span class="mushaf-bismillah">${bismillah}</span>`;
            text = rest;
          }
        }
      }
      return `${before}${text} <span class="ayah-number-badge">${a.numberInSurah}</span>`;
    })
    .join(" ");
  document.getElementById("mushaf-reader-text").innerHTML = bodyHTML;
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
  // An open reading never shows "أنهيت القراءة" on the forward button - there
  // is always a next page - so finishing gets a button of its own, on every
  // page, and the person stops at whichever one they please.
  const open = wirdIsOpen();
  const isLast = !open && mushafPageIndex === mushafPages.length - 1;
  document.getElementById("btn-mushaf-reader-next").innerHTML = isLast
    ? iconLabel("checkDone", "أنهيت القراءة")
    : iconLabel("chevronLeft", "الصفحة التالية");
  const doneBtn = document.getElementById("btn-mushaf-reader-done");
  if (doneBtn) doneBtn.classList.toggle("hidden", !open);
}

// An open reading has no end to reach, so running out of loaded pages is not
// the end of it: the next surah is fetched and added on, and the person keeps
// turning until they decide to stop. Bounded all the same - one surah at a
// time, and never past the last of them.
let loadingMorePages = false;
async function extendOpenReading() {
  if (loadingMorePages) return false;
  const last = mushafPages[mushafPages.length - 1];
  const lastAyah = last && last.ayahs[last.ayahs.length - 1];
  const surah = lastAyah && lastAyah.surahNumberForReader;
  if (!surah || surah >= 114) return false;
  loadingMorePages = true;
  try {
    const next = await fetchSurahAyahs(surah + 1);
    const more = next.map((a) => ({ ...a, surahNumberForReader: surah + 1 }));
    const all = mushafPages.flatMap((p) => p.ayahs).concat(more);
    mushafPages = groupAyahsIntoMushafPages(all);
    rememberMushafReader(all, mushafPageIndex);
    return true;
  } catch (e) {
    showToast("تعذّر تحميل ما بعدها. تحقق من الاتصال بالإنترنت.", "error");
    return false;
  } finally {
    loadingMorePages = false;
  }
}

async function goToNextMushafPage() {
  if (mushafPageIndex >= mushafPages.length - 1 && wirdIsOpen()) {
    const grew = await extendOpenReading();
    if (grew) {
      mushafPageIndex++;
      renderMushafReaderPage();
      return;
    }
  }
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
    showToast(`🎉 تجاوزت هدف اليوم بـ ${surplus} ${type === "pages" ? "صفحة" : "آية"}`, "success", `+${pointsText(bonus)}`);
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

on("btn-mushaf-reader-next", "click", goToNextMushafPage);
on("btn-mushaf-reader-done", "click", () => showConfirmModal(
  "إنهاء القراءة",
  "هل أنهيت قراءة اليوم؟ سيُضاف ما قرأته إلى ورد اليوم.",
  "نعم، أنهيت",
  finishMushafReading
));
on("btn-mushaf-reader-prev", "click", goToPrevMushafPage);
on("btn-mushaf-reader-close", "click", closeMushafReader);

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

// ---------- Swiping between tabs ----------
// The four tabs are a row, and a phone should let a thumb walk along it.
// Dragging the page to the right brings in the tab that sits to its left in
// the bar - the next one, reading right to left - and dragging left goes
// back. It stays out of the way of everything else a finger does here: it
// asks for a mostly-horizontal travel of some length, it ignores gestures
// that begin on something that scrolls sideways or that takes a drag of its
// own, and it does nothing at all while a full-screen layer is open (the
// reader has its own page-turning swipe).
(() => {
  const SWIPE_MIN = 70;        // px of travel before it counts as a swipe
  const SWIPE_MAX_OFF_AXIS = 0.5; // |dy| may be at most half of |dx|
  const NO_SWIPE = "input, textarea, select, [contenteditable], .swatch-grid, .mode-switch, .ayah-scroll, .mushaf-map-grid, .combo-list, .wird-week, .activity-grid, [data-no-swipe]";
  let startX = null, startY = null, startedOn = null;

  const overlayOpen = () => document.documentElement.classList.contains("modal-open");

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || overlayOpen()) { startX = null; return; }
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    startedOn = e.target instanceof Element ? e.target.closest(NO_SWIPE) : null;
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (startX === null || startedOn || overlayOpen()) { startX = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    startX = null;
    if (Math.abs(dx) < SWIPE_MIN) return;
    if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_OFF_AXIS) return;
    const here = TAB_ROUTES.indexOf(currentTabName);
    if (here < 0) return;
    const next = here + (dx > 0 ? 1 : -1);
    if (next < 0 || next >= TAB_ROUTES.length) return;
    switchTab(TAB_ROUTES[next], { from: dx > 0 ? "next" : "prev" });
  }, { passive: true });
})();

function initWirdCard() {
  const input = document.getElementById("wird-target-input");
  if (!input) return;
  input.value = state.wirdTarget || 5;

  const typeBtns = [...document.querySelectorAll(".wird-type-btn")];
  const unitLabel = document.getElementById("wird-target-unit");
  const field = document.getElementById("wird-target-field");
  const openNote = document.getElementById("wird-open-note");
  function updateTypeUI() {
    const type = state.wirdTargetType || "ayahs";
    typeBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.type === type));
    if (unitLabel) unitLabel.textContent = type === "pages" ? "صفحة/يوم" : "آية/يوم";
    // A number to hit is the one thing an open wird does not have, so the
    // box that asks for it goes away rather than sitting there disabled.
    if (field) field.classList.toggle("hidden", type === "open");
    if (openNote) openNote.classList.toggle("hidden", type !== "open");
    // The end of the range is decided by the target, so with no target there
    // is nothing for the person to set: the box goes, and the reading runs to
    // the end of the surah instead.
    const range = document.querySelector("#mushaf-range-controls .range-inputs");
    if (range) range.classList.toggle("open-ended", type === "open");
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
  // An ayah still under its rounds has no schedule to be due against: it
  // shows how far along it is instead, and does not open a review.
  const inProgress = item.learningStage === "learning";
  const isDue = !inProgress && item.due <= today;
  div.className = `plan-item${isDue ? " due-now" : ""}${inProgress ? " in-progress" : ""}`;
  let badge = "scheduled";
  let badgeText = `\u064a\u064f\u0633\u062a\u062d\u0642: ${item.due}`;
  if (isDue) { badge = "due"; badgeText = "\u0645\u0633\u062a\u062d\u0642\u0629 \u0627\u0644\u0622\u0646"; }
  if (inProgress) {
    badge = "learning";
    const needed = roundsNeededFor(item);
    badgeText = `\u0642\u064a\u062f \u0627\u0644\u062d\u0641\u0638 \u00b7 \u062c\u0648\u0644\u0629 ${(item.roundStreak || 0) + 1} \u0645\u0646 ${needed}`;
  }
  const tempBadge = item.temporary
    ? `<span class="badge temp" title="\u0644\u0627 \u062a\u064f\u062d\u062a\u0633\u0628 \u0636\u0645\u0646 \u0646\u0633\u0628\u0629 \u0627\u0644\u062a\u0642\u062f\u0645">\u0645\u0631\u0627\u062c\u0639\u0629 \u0645\u0624\u0642\u062a\u0629</span>`
    : "";
  const reviewBtn = isDue ? `<button class="btn btn-review-now">${iconLabel("check", "\u0631\u0627\u062c\u0639\u0647\u0627 \u0627\u0644\u0622\u0646")}</button>` : "";
  // The ayah gets the row to itself, with everything that describes it on a
  // line underneath: sharing one line with the number, the date and two
  // buttons left it about forty pixels wide on a phone - "\u0630\u064e\u0644\u0650..." and nothing
  // more, which is not enough of an ayah to recognize it by.
  div.innerHTML = `
    <div class="plan-item-text">
      <span class="snippet">${cleanAyahText(item.text)}</span>
      <button class="icon-btn" title="\u0625\u0632\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u062e\u0637\u0629" data-key="${item.surah}:${item.ayah}">\u2715</button>
    </div>
    <div class="plan-item-meta">
      <span class="ref">\u0622\u064a\u0629 ${item.ayah}</span>
      <span class="badge ${badge}">${badgeText}</span>
      ${tempBadge}
      ${reviewBtn}
    </div>
  `;
  div.querySelector(".icon-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const key = e.currentTarget.dataset.key;
    delete state.ayahs[key];
    normalizeLearnDetour();
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

on("btn-start-challenge", "click", startDailyChallenge);

// Straight into today's reading from the top of the dashboard, instead of
// scrolling down to the reading card to press its button. If that card
// hasn't managed to load a surah yet (offline on a first run, say), fall
// back to bringing it into view rather than doing nothing.
on("btn-quick-wird", "click", () => {
  if (mushafInputMode === "range" && !selectedMushafSurah) {
    // Two different reasons to have no surah, and they need different
    // answers. If the list never loaded, scrolling the person to a card
    // they cannot use reads as the button hurling them down the page for
    // no reason - which is exactly how it was being reported.
    if (pendingInits.has("mushaf-surahs")) {
      showToast("لم تُحمَّل قائمة السور بعد. جارٍ إعادة المحاولة…", "error");
      retryFailedInits();
      return;
    }
    document.querySelector(".mushaf-card").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  openTodaysWirdReading();
});

// ---------- Browse / Add (manual, advanced) ----------

let selectedBrowseSurah = 1;
let selectedBrowseSurahName = "";

setHTML("ayah-search-icon", ICONS.search);

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
  const loadSurahs = async () => {
    const surahs = await fetchSurahList();
    setupSurahCombo("surah-combo", "surah-combo-input", "surah-combo-list", surahs, (surahNumber, meta) => {
      selectedBrowseSurah = surahNumber;
      selectedBrowseSurahName = meta.name;
      loadBrowseSurah(surahNumber);
    }).setValue(surahs[0].number);

    selectedBrowseSurah = surahs[0].number;
    selectedBrowseSurahName = surahs[0].name;
    loadBrowseSurah(selectedBrowseSurah);
    markInitOk("browse-surahs");
  };
  try {
    await loadSurahs();
  } catch (e) {
    document.getElementById("surah-meta-info").textContent = "تعذّر تحميل قائمة السور. تحقق من الاتصال بالإنترنت.";
    markInitFailed("browse-surahs", loadSurahs);
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
// click it: an ayah is either in your plan already or one tap from being in
// it. Nothing here costs anything - points buy a reciter's voice or a colour,
// and the settings sheet says so plainly; standing between a person and an
// ayah they want to memorize is the one thing they must never buy.
function buildAyahRow(surahNumber, surahName, ayahObj, showSurahBadge) {
  const key = `${surahNumber}:${ayahObj.numberInSurah}`;
  const already = !!state.ayahs[key];
  const btnClass = "btn ayah-add-btn";
  let btnHTML, btnTitle;
  if (already) {
    btnHTML = iconLabel("checkDone", "أُضيفت");
    btnTitle = "أُضيفت بالفعل إلى خطتك";
  } else {
    btnHTML = iconLabel("plus", "أضف للخطة");
    btnTitle = "تُضاف إلى خطة حفظك";
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

// One way in, whatever the ayah and wherever it was found: into the plan.
function handleAddAyahClick(surahNumber, surahName, ayahObj, buttonEl) {
  addAyahToPlan(surahNumber, surahName, ayahObj);
  buttonEl.innerHTML = iconLabel("checkDone", "أُضيفت");
  buttonEl.disabled = true;
  renderDashboard();
  updateAddRangeButton(); // the range may be fully in the plan now
}

function renderAddIntent() {
  const intent = addIntent();
  document.querySelectorAll(".add-intent-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.intent === intent);
  });
  const note = document.getElementById("add-intent-note");
  if (note) {
    note.textContent = intent === "review"
      ? "جولةٌ واحدة تُثبتها، ثم تدخل المراجعة المتباعدة وتُحتسب في «آيات محفوظة»."
      : "تنتظر في لوحتك حتى تحفظها — بلا مراجعة متباعدة ولا احتساب حتى تُتمّ ثلاث جولات.";
  }
  // The button names the destination too; it owns its own text (the count
  // depends on what is already in the plan), so it is asked to redraw.
  updateAddRangeButton();
}

document.querySelectorAll(".add-intent-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.intent === addIntent()) return;
    state.addIntent = btn.dataset.intent;
    saveState();
    renderAddIntent();
  });
});

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

// The button says what pressing it would actually do - how many ayahs of the
// range are not in the plan yet - and steps aside when they all already are,
// which is most of the time once a surah has been added.
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
  if (!plan.toAdd.length) {
    btn.disabled = true;
    btn.textContent = list.length === 1 ? "هذه الآية في خطتك بالفعل" : "كل آيات هذا النطاق في خطتك";
    return;
  }
  btn.disabled = false;
  // Names the destination as well as the count, so what the toggle decided is
  // legible from the button you are about to press.
  btn.textContent = `إضافة ${ayahCountLabel(plan.toAdd.length)} إلى ${addIntent() === "review" ? "المراجعة" : "الحفظ"}`;
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
on("ayah-from", "input", renderBrowsePreview);
on("ayah-to", "input", renderBrowsePreview);
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
on("ayah-search", "input", () => {
  clearTimeout(browseSearchDebounceTimer);
  const val = document.getElementById("ayah-search").value.trim();
  if (!val || /^\d+$/.test(val)) {
    renderBrowsePreview();
    return;
  }
  browseSearchDebounceTimer = setTimeout(() => performGlobalAyahSearch(val), 450);
});

function wordCountLabel(n) {
  if (n === 1) return "كلمة واحدة";
  if (n === 2) return "كلمتان";
  if (n <= 10) return `${n} كلمات`;
  return `${n} كلمة`;
}

// Arabic counts a pair, and a few, differently from a lot.
function ayahCountLabel(n) {
  if (!n) return "لا آيات";
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

// What a range would actually do: some of it is already in the plan, the rest
// is what gets added. It used to sort the rest into "contiguous" and "jumps"
// and price the jumps - and got even that wrong, because the reach it
// measured ignored ayahs still being learned, so someone who had just started
// الفاتحة was told that آياتها 2-5 were a jump and cost 20 points on their
// first day. Nothing is priced now, so nothing has to be classified.
function planRangeAddition(surahNumber, list) {
  const already = [];
  const toAdd = [];
  list.forEach((a) => {
    if (state.ayahs[`${surahNumber}:${a.numberInSurah}`]) already.push(a);
    else toAdd.push(a);
  });
  return { already, toAdd };
}

// Adding ayahs straight to the plan used to file every one of them as
// memorized: the browse tab wrote learningStage "srs" and they counted
// towards "آيات محفوظة", towards the surah's completion, and so towards its
// gilding - without a single round being done. That is a hole, and the fix
// is not to forbid it but to ask, because both answers are real: someone
// carrying half the Qur'an already needs those ayahs in review without
// re-earning them, and someone adding a new page needs the rounds.
//
//   "أحفظها بالفعل" -> "verify": nothing is granted yet. One clean round
//                      proves the claim, and then it joins the review cycle
//                      properly - counted, scheduled, like any other.
//   "سأحفظها"       -> "learning": it waits on the dashboard until the
//                      memorizing reaches it, out of the review cycle and
//                      out of the count until it is actually learnt.
//
// So neither answer hands anything over for free: one asks for a single
// round because the person says the work is already done, the other asks
// for the usual three because it isn't.
function addIntent() {
  return state.addIntent === "review" ? "review" : "learn";
}

function addAyahToPlan(surahNumber, surahName, ayahObj, { asReview } = {}) {
  const review = asReview === undefined ? addIntent() === "review" : asReview;
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
    learningStage: review ? "verify" : "learning",
    roundStreak: 0,
    temporary: false,
    // Written the day the rounds are finished, by masterCurrentLearningAyah -
    // the day the work was actually done, whichever door the ayah came in by.
    memorizedOn: null,
  };
  saveState();
}

on("btn-add-range", "click", async () => {
  const surahNumber = selectedBrowseSurah;
  if (!surahNumber) return;
  try {
    const surahs = await fetchSurahList();
    const meta = surahs.find((s) => s.number === surahNumber);
    const { ayahs: list } = browseRangeAyahs();
    const plan = planRangeAddition(surahNumber, list);
    if (!plan.toAdd.length) return;
    commitRangeAddition(surahNumber, meta.name, plan);
  } catch (e) {
    showToast("حدث خطأ أثناء الإضافة. تحقق من الاتصال بالإنترنت.", "error");
  }
});

// Says what was actually added rather than what the two boxes said: a range
// asking for 20 ayahs of a surah that has 7 added seven of them.
function commitRangeAddition(surahNumber, surahName, plan) {
  plan.toAdd.forEach((a) => addAyahToPlan(surahNumber, surahName, a));
  const added = plan.toAdd.length;
  const numbers = plan.toAdd.map((a) => a.numberInSurah).sort((x, y) => x - y);
  const span = numbers.length > 1 ? ` (${numbers[0]}–${numbers[numbers.length - 1]})` : ` (${numbers[0]})`;
  const where = addIntent() === "review" ? "خطة المراجعة" : "خطة الحفظ";
  renderBrowsePreview();
  renderDashboard();
  showToast(
    `تمت إضافة ${ayahCountLabel(added)} من ${surahName}${span} إلى ${where}.`,
    "success",
    plan.already.length ? `${ayahCountLabel(plan.already.length)} كانت مضافة` : undefined
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
  // Both cleanups belong here too, not only in the modal: this is also the
  // path the in-review «اختبر بالتسميع» takes, and a مدّ split into two there
  // scored as a missed word just the same.
  const cleaned = stripRecitationPreamble(
    collapseSpelledLetters(mergeMaddSplits(mergeDetachedConjunctions(transcript)), correctWords),
    correctWords);
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
let voiceModalOnFail = null;
let voiceModalFailedAttempt = false; // an answer was submitted and it was wrong
let voiceModalFailedDetail = null;
// A single word off is as likely to be the engine mishearing as the reciter
// forgetting, so the first such slip is correctable instead of fatal: the
// chips stay editable and تحقق stays on offer. Two words off is a real gap,
// and so is a second failed attempt - both end the round.
let voiceModalGraceUsed = false;

// onSuccess (optional): called after a high-accuracy verification, so the
// caller can advance its own flow (next learning round/ayah, or reveal the
// review grading buttons) instead of leaving the person stuck in the modal.
// `continueOnLowAccuracy` is for callers whose callback GRADES the ayah
// (review), where a weak recitation is exactly what the grading step needs
// to hear about. It must stay off for callers whose callback PASSES a round
// (learn): a way through offered there would hand a passed round to a
// recitation that just failed.
// onFail (optional): for a caller where the recitation IS the round's answer.
// Pressing تحقق is a submitted answer there, so a failed one ends the attempt
// the way a wrong option or a mistyped word does, instead of leaving the
// person free to re-record until it passes.
function openVoiceModal(correctText, onSuccess, { continueOnLowAccuracy = false, onFail = null } = {}) {
  if (!voiceSupported()) return;
  voiceModalCorrectText = correctText;
  voiceModalAllowLowAccuracyContinue = continueOnLowAccuracy;
  voiceModalOnSuccess = onSuccess || null;
  voiceModalOnFail = onFail;
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
  // A wrong answer already given costs the round however this modal is left -
  // by the button under the result or by the ✕ - or closing it would be a way
  // to un-answer and try again. Leaving without answering costs nothing.
  const failed = voiceModalFailedAttempt ? voiceModalOnFail : null;
  const detail = voiceModalFailedDetail || {};
  voiceModalOnFail = null;
  voiceModalFailedAttempt = false;
  voiceModalFailedDetail = null;
  if (failed) failed(detail.accuracy, detail.notes);
}

// keepVerdict: re-recording clears the panel but must NOT clear what has
// already been answered. Without it, a re-record after a wrong submission
// would hand back both a fresh grace and a clean slate to walk out on.
function resetVoiceModal({ keepVerdict = false } = {}) {
  if (!keepVerdict) {
    voiceModalFailedAttempt = false;
    voiceModalFailedDetail = null;
    voiceModalGraceUsed = false;
  }
  voiceModalShouldContinue = false;
  if (voiceModalRecognition) {
    try { voiceModalRecognition.abort(); } catch (e) { /* already stopped */ }
    voiceModalRecognition = null;
  }
  setVoiceMicState("idle");
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
// How many times a phrase occurs in a word list. The one thing that can tell
// a re-heard repeat from a repeat the ayah actually contains: the ayah itself.
function countPhraseOccurrences(normHaystack, normNeedle) {
  if (!normNeedle.length || normNeedle.length > normHaystack.length) return 0;
  const needle = normNeedle.join(" ");
  let count = 0;
  for (let i = 0; i + normNeedle.length <= normHaystack.length; i++) {
    if (normHaystack.slice(i, i + normNeedle.length).join(" ") === needle) count++;
  }
  return count;
}

function mergeSessionText(baseText, sessionText, referenceText) {
  const baseWords = baseText.trim().split(/\s+/).filter(Boolean);
  const sessionWords = sessionText.trim().split(/\s+/).filter(Boolean);
  if (sessionWords.length === 0) return baseWords.join(" ");
  if (baseWords.length === 0) return sessionWords.join(" ");
  const normBase = baseWords.map(normalizeArabic);
  const normSession = sessionWords.map(normalizeArabic);

  // البقرة 74 says "وَإِنَّ مِنْهَا لَمَا" twice, and the second time is not the engine
  // repeating itself - it is the ayah. So before treating a repeat as a
  // re-hear, ask the ayah how many times it says that phrase: while the
  // transcript has fewer copies than the ayah does, another one is not a
  // duplicate at all.
  const normRef = referenceText ? quranWords(referenceText).map(normalizeArabic) : [];
  const ayahAllowsAnother = (normPhrase) => {
    if (!normRef.length) return false;
    const inAyah = countPhraseOccurrences(normRef, normPhrase);
    // Keeping it must not put MORE copies in the transcript than the ayah
    // has: two is the recitation, three is the engine.
    return inAyah > 0 && countPhraseOccurrences(normBase.concat(normSession), normPhrase) <= inAyah;
  };

  let overlap = 0;
  for (let len = Math.min(baseWords.length, sessionWords.length); len > 0; len--) {
    if (normBase.slice(normBase.length - len).join(" ") === normSession.slice(0, len).join(" ")) {
      overlap = len;
      break;
    }
  }
  if (overlap && ayahAllowsAnother(normSession.slice(0, overlap))) overlap = 0;
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
    // Same question of the ayah before trimming a fuzzy re-hear: if what is
    // about to be dropped is a phrase the ayah has more copies of than the
    // transcript does, it is the recitation, not an echo of it.
    const dropping = normSession.slice(0, lastMatchK);
    if (lastMatchK >= 3 && lcs[lastMatchK] / lastMatchK >= 0.6 && !ayahAllowsAnother(dropping)) {
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
function dedupeRepeatedPasses(text, referenceText) {
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
  // An ayah that opens a phrase it says again later (there are plenty) is not
  // a transcript that repeated a pass - the ayah is asked before anything is
  // split on it.
  const normRef = referenceText ? quranWords(referenceText).map(normalizeArabic) : [];
  if (normRef.length && countPhraseOccurrences(normRef, norm.slice(0, ANCHOR)) >= starts.length) {
    return words.join(" ");
  }

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
    .reduce((acc, pass) => mergeSessionText(acc, pass.join(" "), referenceText), "");
}

// The mic button swaps to a stop square while recording (the glyph swap
// itself is CSS off this class - see .voice-mic-btn.listening), so its
// label has to say "stop" then too, or a screen reader still announces it
// as "start recording" mid-recording.
// Three states, and they are read off the engine's own events rather than
// guessed at. The one that matters is "resuming": Android's recogniser ends
// the session on a pause - a breath is enough - and the app starts it again,
// but start() returning is not the microphone being live. Anything recited in
// that gap is simply not heard, and until now nothing on screen said so.
function setVoiceMicState(mode) {
  const btn = document.getElementById("btn-voice-mic");
  const state = document.getElementById("voice-listen-state");
  const note = document.getElementById("voice-breath-note");
  btn.classList.toggle("listening", mode !== "idle");
  btn.classList.toggle("resuming", mode === "resuming");
  btn.setAttribute("aria-label", mode === "idle" ? "ابدأ التسجيل" : "إيقاف التسجيل");
  if (state) {
    state.classList.toggle("hidden", mode === "idle");
    state.classList.toggle("waiting", mode === "resuming");
    state.textContent = mode === "resuming" ? "توقّف… انتظر الضوء الأخضر" : "أخضر — يستمع الآن";
  }
  if (note) note.classList.toggle("hidden", mode === "idle");
}

// The cue itself: a short tone the moment the microphone is actually live
// again, with a tap of haptics for a phone held away from the eyes. The
// reciter's rule is one thing - carry on when you hear it - so it plays at
// the first start too, not only after a pause.
function playListeningCue() {
  playTone(1320, 0.09);
  try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* not supported */ }
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
      setVoiceMicState("idle");
      document.getElementById("voice-status-text").textContent = "تعذّر بدء الاستماع.";
      return;
    }
    setTimeout(() => {
      if (voiceModalShouldContinue) attemptRecognitionStart(recognition, true);
    }, 300);
  }
}

function startVoiceModalRecording() {
  resetVoiceModal({ keepVerdict: true });
  const recognition = createVoiceRecognitionInstance();
  voiceModalShouldContinue = true;
  voiceModalBaseText = "";
  voiceModalFinalSegments = [];
  voiceModalLiveTranscript = "";
  const statusText = document.getElementById("voice-status-text");
  setVoiceMicState("resuming");
  statusText.textContent = "اقرأ الآية، ثم اضغط الميكروفون مجددًا لإنهاء التسجيل";

  // onstart says the service accepted the request; onaudiostart says the
  // microphone is actually capturing. It is the second one the reciter needs.
  recognition.onaudiostart = () => {
    setVoiceMicState("listening");
    playListeningCue();
  };
  recognition.onaudioend = () => {
    if (voiceModalShouldContinue) setVoiceMicState("resuming");
  };

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
    voiceModalLiveTranscript = dedupeRepeatedPasses(mergeSessionText(voiceModalBaseText, merged, voiceModalCorrectText), voiceModalCorrectText);
    statusText.textContent = voiceModalLiveTranscript || "اقرأ الآية…";
  };
  recognition.onerror = (e) => {
    if (e.error === "aborted") return; // our own stop()/close() triggers this - not a real error
    if (VOICE_FATAL_ERRORS.has(e.error)) {
      voiceModalShouldContinue = false;
      setVoiceMicState("idle");
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
    setVoiceMicState("resuming");
    const sessionMerged = mergeVoiceSegments(voiceModalFinalSegments.filter(Boolean));
    voiceModalBaseText = mergeSessionText(voiceModalBaseText, sessionMerged, voiceModalCorrectText) + " ";
    voiceModalFinalSegments = [];
    attemptRecognitionStart(recognition);
  };
  attemptRecognitionStart(recognition);
}

function stopVoiceModalRecording() {
  voiceModalShouldContinue = false;
  const recognition = voiceModalRecognition;
  voiceModalRecognition = null;
  setVoiceMicState("idle");
  if (recognition) {
    recognition.onend = null;
    try { recognition.abort(); } catch (e) { /* already stopped */ }
  }
  const transcript = mergeMaddSplits(mergeDetachedConjunctions(voiceModalLiveTranscript.trim()));
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
    // A pass wipes any pending failure from the corrected attempt before it,
    // or closing the modal on the way out would fail the round it just won.
    voiceModalFailedAttempt = false;
    voiceModalFailedDetail = null;
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
    } else if (voiceModalOnFail) {
      // Leaving now costs the round either way: an answer was submitted and
      // it was wrong. What differs is whether it can still be taken back.
      voiceModalFailedAttempt = true;
      voiceModalFailedDetail = { accuracy, notes: notes.join(" · ") };
      // A word said wrong shows up twice in the diff - once as a word of the
      // ayah that never came, once as a word that came and isn't in it - so
      // one substitution is max(), not the sum: one mistake, not two.
      const slips = Math.max(missed, diff.extras);
      if (slips === 1 && !voiceModalGraceUsed) {
        // One word. Often the engine's, not the reciter's - and either way
        // it is a word away from right, so the chips stay editable and تحقق
        // stays on offer for exactly one more try.
        voiceModalGraceUsed = true;
        document.getElementById("voice-modal-actions").classList.remove("hidden");
        const fix = document.createElement("p");
        fix.className = "vr-fix";
        fix.textContent = "كلمة واحدة فقط — صحّحها بالضغط عليها في الأعلى، أو أعد التسجيل، ثم اضغط «تحقق». هذه محاولتك الأخيرة في هذه الجولة.";
        scoreArea.appendChild(fix);
      } else {
        // Two words off, or the corrected attempt failed too: the answer is
        // final now, so re-recording is no longer on offer - that would make
        // the round unfailable. The result stays on screen for as long as it
        // takes to read which word went wrong, and the way out repeats this
        // round (only this one).
        document.getElementById("voice-modal-actions").classList.add("hidden");
        const again = document.createElement("button");
        again.className = "btn primary vr-again";
        again.innerHTML = iconLabel("repeat", "أعد هذه الجولة");
        again.addEventListener("click", closeVoiceModal);
        scoreArea.appendChild(again);
      }
    }
  }
}

// The mic button toggles: first tap starts listening, second tap stops it
// (recognition.stop() finalizes whatever was captured and fires onend) -
// needed now that continuous recognition won't stop on its own.
on("btn-voice-mic", "click", () => {
  if (voiceModalRecognition) stopVoiceModalRecording();
  else startVoiceModalRecording();
});
on("btn-voice-retry", "click", startVoiceModalRecording);
on("btn-voice-verify", "click", verifyVoiceModal);
on("btn-voice-close", "click", closeVoiceModal);
on("voice-modal-overlay", "click", (e) => {
  if (e.target.id === "voice-modal-overlay") closeVoiceModal();
});

if (voiceSupported()) {
  document.getElementById("btn-review-voice").classList.remove("hidden");
  document.getElementById("mode-btn-voice").classList.remove("hidden");
}

// ---------- Learn tab (guided sequential memorization: Al-Fatiha first) ----------

let learnCurrentKey = null;
let learnWords = [];
let learnWordIndex = 0;
let learnMistakeThisRound = false;
// The last recitation of the ayah being worked on: what the repeated round
// shows in place of the words it cannot show.
let lastVoiceAttempt = null;
let learnMode = "mcq"; // 'mcq' | 'type' | 'partial'
let learnMaskLevel = 1; // only used in 'partial' mode - 0 = none masked ... up to full mask

setHTML("mode-btn-partial", iconLabel("eyeOff", "اخفاء"));
setHTML("mode-btn-mcq", iconLabel("optionsList", "اختيار"));
setHTML("mode-btn-type", iconLabel("pencil", "كتابة"));
setHTML("mode-btn-voice", iconLabel("mic", "تسميع"));

// Round 1 recognizes the word among four, round 2 recalls it with the rest
// of the ayah in front of you, round 3 produces it from nothing: the
// support fades across the three rounds instead of the same task being
// drilled three times over. Each mode also tests something the others
// don't - recognition is not recall, and recall is not production - and
// three identical rounds is the shortest road to boredom.
const MODE_ROUND_LABEL = { mcq: "تعرُّف", partial: "تذكُّر", type: "كتابة", voice: "تسميع" };

// The three rounds are a ladder, and the order is the point: pick the word
// out of four (تعرُّف), then recall it with the rest of the ayah in front of
// you (تذكُّر), then produce it from nothing. Reciting aloud is the strongest
// rung of all - nothing on the screen, nothing to type - so it takes the top
// one, alternating with كتابة from one ayah to the next. Both get drilled,
// and an ayah still takes three rounds rather than four.
//
// A profile with no typing round (a child's, an elder's) has no production
// round at all today - its third round repeats the first - so there تسميع is
// added rather than alternated. Where the browser can't hear, nothing
// changes.
function modeRotation(key) {
  const base = (ageProfile().modes || ["mcq", "partial", "type"]).slice();
  if (!voiceSupported()) return base;
  if (base.length < 3) {
    base.push("voice");
    return base;
  }
  // Stable per ayah, so leaving an ayah and coming back to it doesn't change
  // what its last round asks for.
  const [surah, ayah] = String(key || "").split(":").map(Number);
  if (((surah || 0) * 1000 + (ayah || 0)) % 2 === 1) base[base.length - 1] = "voice";
  return base;
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
  // A verification is one round, and saying "الجولة 1 من 3" over it would
  // promise two more that are never coming.
  const needed = roundsNeededFor(item);
  const head = item.learningStage === "verify"
    ? "إثبات حفظك — جولة واحدة"
    : `الجولة ${round + 1} من ${needed}`;
  el.textContent = `${head}${rotating ? ` · ${MODE_ROUND_LABEL[learnMode]}` : ""}`;
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

// ---------- The end of the whole thing ----------
//
// Walking off the end of the last surah used to change the heading to
// "أتممت حفظ القرآن كاملاً" and leave everything else exactly where it was:
// the mode switch, the audio controls, the answer area, all of them live
// over an ayah that no longer existed. Someone who had just finished the
// Qur'an was left on a screen that looked broken. It gets a screen of its
// own now, and the drill it has nothing left to drill gets put away.

function quranIsMemorized() {
  return memorizedAyahCount() >= QURAN_AYAH_COUNT;
}

function showKhatm() {
  const panel = document.getElementById("khatm-panel");
  if (!panel) return;
  panel.classList.remove("hidden");
  // The drill has nothing left to drill, so it is put away rather than
  // left running over an ayah that no longer exists.
  document.querySelectorAll("#tab-learn > .panel:not(.khatm-panel)").forEach((el) => el.classList.add("hidden"));
  const since = document.getElementById("khatm-since");
  if (since) {
    const first = Object.values(state.ayahs || {})
      .map((a) => a && a.memorizedOn)
      .filter(Boolean)
      .sort()[0];
    since.textContent = first ? `بدأت في ${formatArabicDate(first)} — ${formatDurationSince(first)}` : "";
  }
}

function hideKhatm() {
  const panel = document.getElementById("khatm-panel");
  if (!panel || panel.classList.contains("hidden")) return;
  panel.classList.add("hidden");
  document.querySelectorAll("#tab-learn > .panel").forEach((el) => el.classList.remove("hidden"));
  panel.classList.add("hidden");   // ...except this one
}

// ---------- The sequence, and detours off it ----------
//
// "ابدأ الحفظ" walks one pointer through the Mushaf in order; that pointer is
// the person's place and nothing may quietly move it. Ayahs added out of
// order - a surah picked from the browse tab, something claimed as already
// memorized and waiting to be proved - are worked on as a *detour*: a second
// pointer that takes over the tab while it lasts, and is dropped the moment
// that little group is finished, leaving the real place exactly where it was.

function learnDetourItems(surah) {
  return Object.values(state.ayahs)
    .filter((i) => i.surah === surah && (i.learningStage === "learning" || i.learningStage === "verify"))
    .sort((a, b) => a.ayah - b.ayah);
}

// The detour is over when nothing in the group is left unmemorized - or when
// what it pointed at was removed from the plan underneath it.
function normalizeLearnDetour() {
  const d = state.learnDetour;
  if (!d) return null;
  const item = state.ayahs[`${d.surah}:${d.ayah}`];
  if (item && (item.learningStage === "learning" || item.learningStage === "verify")) return d;
  const next = learnDetourItems(d.surah).find((i) => i.ayah > d.ayah);
  state.learnDetour = next ? { surah: next.surah, ayah: next.ayah } : null;
  return state.learnDetour;
}

function activeLearnPointer() {
  return normalizeLearnDetour() || state.learningPointer;
}

function startLearnDetour(surah, ayah) {
  state.learnDetour = { surah, ayah };
  saveState();
  switchTab("learn");
  loadLearnAyah();
}

function endLearnDetour() {
  state.learnDetour = null;
  saveState();
  loadLearnAyah();
  renderDashboard();
}

function renderLearnDetourBanner() {
  const banner = document.getElementById("learn-detour");
  if (!banner) return;
  const d = state.learnDetour;
  if (!d) { banner.classList.add("hidden"); return; }
  const left = learnDetourItems(d.surah).filter((i) => i.ayah >= d.ayah).length;
  const name = (state.ayahs[`${d.surah}:${d.ayah}`] || {}).surahName || `سورة ${d.surah}`;
  banner.classList.remove("hidden");
  document.getElementById("learn-detour-text").textContent =
    `${name} — ${ayahCountLabel(left)} خارج تسلسلك. مكانك محفوظ: ${pointerLabel(state.learningPointer)}.`;
}

function pointerLabel(pointer) {
  const meta = (surahListCache || []).find((x) => x.number === pointer.surah);
  return `${meta ? meta.name : `سورة ${pointer.surah}`} : ${pointer.ayah}`;
}

async function loadLearnAyah() {
  const pointer = activeLearnPointer();
  closeInfoModal();
  // The pointer walking past surah 114 is one way to arrive here; adding
  // the last ayahs from the browse tab is another, and it never moves the
  // pointer at all.
  if (quranIsMemorized()) { showKhatm(); return; }
  hideKhatm();

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
    // A detour that ran off the end of its surah is simply finished - the
    // sequence underneath it is untouched and takes over again.
    if (state.learnDetour) {
      state.learnDetour = null;
      saveState();
      return loadLearnAyah();
    }
    // surah finished -> advance to next surah
    if (pointer.surah < 114) {
      state.learningPointer = { surah: pointer.surah + 1, ayah: 1 };
      saveState();
      return loadLearnAyah();
    }
    showKhatm();
    return;
  }

  const item = getOrCreateLearningItem(pointer.surah, meta.name, ayahObj);
  if (learnCurrentKey !== `${pointer.surah}:${pointer.ayah}`) lastVoiceAttempt = null;
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
    const rotation = modeRotation(learnCurrentKey);
    setLearnMode(rotation[round % rotation.length]);
  }

  document.getElementById("learn-ref").textContent = `${meta.name} - الآية ${pointer.ayah}`;
  renderSimilarButton("btn-learn-similar", pointer.surah, pointer.ayah);
  renderLearnRoundInfo();
  renderLearnDetourBanner();
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

on("btn-balance-review", "click", () => switchTab("review"));
on("btn-balance-dismiss", "click", () => {
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
  const avail = window.innerHeight - nav.offsetHeight - dock.offsetHeight - gapBelow - topInPage - 14;
  // 130 was a floor set for the smallest ayah; on anything longer it made
  // the panel feel like a slot rather than a page, and the text spent most
  // of its time scrolled. A bit more room, and 10px less slack below.
  scroll.style.maxHeight = `${Math.max(180, Math.round(avail))}px`;
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

// The تسميع round hides the ayah, which left nothing to say WHERE to start
// from - and "24 كلمة" is not a place. A few opening words are: enough to
// begin from, and short enough that the rest is still recited from memory.
// It scales with the ayah, so a four-word ayah isn't handed over whole, and
// the shortest ayahs get nothing but their reference above.
function voiceRoundLead(words) {
  if (!words || words.length <= 3) return "";
  const count = Math.min(3, Math.max(1, Math.floor(words.length / 4)));
  return `${words.slice(0, count).join(" ")} …`;
}

function renderLearnRound() {
  scrollIntoViewIfNeeded(".learn-ayah-display");

  const mcqArea = document.getElementById("mcq-area");
  const typeArea = document.getElementById("type-area");
  const partialArea = document.getElementById("partial-area");
  const voiceArea = document.getElementById("voice-area");
  const wordProgress = document.getElementById("learn-word-progress");
  mcqArea.classList.toggle("hidden", learnMode !== "mcq");
  typeArea.classList.toggle("hidden", learnMode !== "type");
  partialArea.classList.toggle("hidden", learnMode !== "partial");
  voiceArea.classList.toggle("hidden", learnMode !== "voice");
  // No recitation shortcut under the other modes: تسميع is a mode of its own
  // in the row above, and the rotation brings it round on its own turn. A
  // second door into it from إخفاء/اختيار/كتابة only asked, on every round,
  // which of the two the round was supposed to be answered by.
  // Only the sequential modes walk word by word, so only they have a
  // position within the ayah worth showing.
  wordProgress.classList.toggle("hidden", learnMode === "partial" || learnMode === "voice");

  if (learnMode === "partial") {
    renderLearnPartialMask();
    return;
  }

  // Recited from memory, so there are no words to show - and a wall of empty
  // tiles standing in for them said nothing and took half the screen. What
  // the panel carries instead is what is worth knowing before reciting and
  // cannot give an answer away: how many words are coming, and - when this
  // round is being repeated - how the last attempt went.
  if (learnMode === "voice") {
    const last = lastVoiceAttempt && lastVoiceAttempt.key === learnCurrentKey ? lastVoiceAttempt : null;
    const lead = voiceRoundLead(learnWords);
    document.getElementById("learn-text").innerHTML = `
      <div class="voice-round-shape">
        ${lead ? `<span class="voice-round-lead">${lead}</span>` : ""}
        <span class="voice-round-count">${wordCountLabel(learnWords.length)}</span>
        ${last ? `<span class="voice-round-last">آخر محاولة: ${last.accuracy}%${last.notes ? ` · ${last.notes}` : ""}</span>` : ""}
      </div>`;
    document.getElementById("btn-voice-round-start").innerHTML = iconLabel("mic", last ? "أعد التسميع" : "ابدأ التسميع");
    fitLearnAyahHeight();
    scheduleAnswerDockUpdate();
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
function makeRevealGate({ scrollId, actionsId, hintId, fit, ask = false }) {
  return (stillHidden, revealed) => {
    const done = stillHidden === 0;
    const actions = document.getElementById(actionsId);
    const hint = document.getElementById(hintId);
    if (!actions || !hint) return;
    actions.classList.toggle("hidden", !done);
    hint.classList.toggle("hidden", done);
    if (ask) {
      hint.textContent = stillHidden === 1
        ? "بقيت كلمة واحدة - اضغط عليها واختر الصحيحة."
        : `اضغط على كل كلمة مخفية واختر الصحيحة من الخيارات (بقي ${stillHidden}).`;
    } else {
      hint.textContent = stillHidden === 1
        ? "بقيت كلمة واحدة مخفية - اضغط عليها لكشفها."
        : `استرجعها في نفسك، ثم اضغط على كل كلمة مخفية لكشفها (بقي ${stillHidden}).`;
    }
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

// Ayah endings are where memorization actually slips: غفور رحيم against
// عزيز حكيم against سميع عليم - the same shape, the same rhyme, a different
// word. Offering "الذين" as the wrong answer next to "رحيم" tests nothing,
// so the wrong answers for a word like that are its own siblings.
//
// Built from the Quran itself, not written by hand: every word among an
// ayah's last two that occurs at least three times, kept only where four or
// more of them end alike (the last two letters and the same length) - 482
// words. Each entry is one word's spellings, commonest first, so the option
// shown can carry the same case ending as the answer instead of giving
// itself away by a different one.
const QURAN_CADENCE_WORDS = [
  "عَذَابٌ|عَذَابٌۭ|عَذَابَ|عَذَابٍ|عَذَابِ|عَذَابٍۢ|عَذَابُ",
  "عَلِيمٌۭ|عَلِيمٌ|عَلِيمٌۢ|عَلِيمٍۢ|عَلِيمٍ",
  "مُّبِينٌۭ|مُّبِينٍۢ|مُّبِينٍ|مُّبِينٌ|مُبِينٌۭ|مُبِينٍۢ", "تَعْمَلُونَ",
  "إِلَّا|أَلَا|أَلَّا", "وَلَا|وَلَآ", "يَعْلَمُونَ", "ٱلْعَٰلَمِينَ",
  "رَّحِيمٌۭ|رَّحِيمٌ|رَّحِيمٌۢ|رَّحِيمٍۢ|رَحِيمٌۭ", "ٱلرَّحِيمِ|ٱلرَّحِيمُ",
  "لَعَلَّكُمْ|لَّعَلَّكُمْ", "غَفُورٌۭ|غَفُورٌ|غَفُورٍۢ", "عَظِيمٌۭ|عَظِيمٍۢ|عَظِيمٌ|عَظِيمٍ",
  "ٱلظَّٰلِمِينَ", "تَعْلَمُونَ", "وَهُمْ|وَهُم|وَّهُم|وَّهُمْ", "يَعْمَلُونَ",
  "أَلِيمٌۭ|أَلِيمٍۢ|أَلِيمٌ|أَلِيمٍ|ٱلْيَمِّ", "ٱلْقَوْمَ|ٱلْقَوْمِ|ٱلْقَوْمُ", "يُؤْمِنُونَ",
  "ٱلْحَكِيمُ|ٱلْحَكِيمِ", "حَكِيمٌۭ|حَكِيمٌ|حَكِيمٍ", "أَفَلَا", "لَعَلَّهُمْ|لَّعَلَّهُمْ",
  "ٱلْعَظِيمِ|ٱلْعَظِيمُ|ٱلْعَظِيمَ", "وَمَا|وَمَآءٍۢ", "قَدِيرٌۭ|قَدِيرٌ|قَدِيرٌۢ",
  "فِيهَا|فِيهَآ", "ٱلْمُؤْمِنِينَ", "ٱلْكَٰفِرِينَ", "ٱلْعَلِيمُ|ٱلْعَلِيمِ",
  "مُّؤْمِنِينَ|مُؤْمِنِينَ", "بِمَا|بِمَآءٍۢ", "رَبِّكُمَا|رَّبُّكُمَا", "صَٰدِقِينَ",
  "ٱلْمُحْسِنِينَ", "عَمَّا", "ٱلْأَوَّلِينَ", "يُظْلَمُونَ|يَظْلِمُونَ", "مِّمَّا|مِمَّا",
  "مُّسْتَقِيمٍۢ|مُّسْتَقِيمٌۭ|مُّسْتَقِيمٍ|مُسْتَقِيمٌ", "خَٰلِدُونَ", "تَعْقِلُونَ",
  "سَبِيلًۭا|سَبِيلًا|سَبِيلًۢا", "بَصِيرٌۭ|بَصِيرٌ|بَصِيرٌۢ", "ٱلْمَصِيرُ", "أَجْمَعِينَ",
  "عَلِيمًا|عَلِيمًۭا", "عَظِيمًۭا|عَظِيمًا|عَظِيمًۢا", "ٱلْمُبِينُ|ٱلْمُبِينِ", "كُنَّا",
  "يَرْجِعُونَ|يُرْجَعُونَ", "ٱلْجَحِيمِ|ٱلْجَحِيمُ|ٱلْجَحِيمَ",
  "شَدِيدُ|شَدِيدٍۢ|شَدِيدٌ|شَدِيدٌۭ|شَدِيدٍ", "ٱلْعَذَابِ|ٱلْعَذَابَ|ٱلْعَذَابُ",
  "ٱلْمُرْسَلِينَ", "عَذَابًا|عَذَابًۭا", "قَوْمًۭا|قَوْمًا|قَوْمًۢا",
  "رَّحِيمًۭا|رَّحِيمًا|رَحِيمًۭا|رَّحِيمًۢا", "غَفُورًۭا|غَفُورًا",
  "لَهُمْ|لَهُمُ|لَّهُمْ|لَّهُمُ", "كَرِيمٌۭ|كَرِيمٍ|كَرِيمٍۢ|كَرِيمٌ", "يَشْعُرُونَ",
  "تَشْكُرُونَ", "ٱلصَّٰلِحِينَ", "يَعْقِلُونَ", "تَتَّقُونَ", "تُرْجَعُونَ",
  "قَلِيلًۭا|قَلِيلًا", "إِنَّا|أَءِنَّا|أَنَا۠|أَئِنَّا", "يُشْرِكُونَ", "تَذَكَّرُونَ",
  "نَذِيرٌۭ|نَّذِيرٍۢ|نَذِيرٌ|نَذِيرِ", "ٱلدِّينِ|ٱلدِّينَ",
  "خَبِيرٌۭ|خَبِيرٌۢ|خَبِيرٍ|خَبِيرٍۢ", "حَكِيمًۭا|حَكِيمًا", "لِلْمُتَّقِينَ|لِّلْمُتَّقِينَ",
  "ٱلْمُشْرِكِينَ", "ٱلْمُتَّقِينَ", "ٱلْحِسَابِ|ٱلْحِسَابُ", "ٱلظَّٰلِمُونَ",
  "ٱلصُّدُورِ|ٱلصُّدُورُ", "عَلَيْهِم|عَلَيْهِمْ", "كَٰفِرُونَ", "مُّعْرِضُونَ|مُعْرِضُونَ",
  "مُّسْلِمُونَ|مُسْلِمُونَ", "كَبِيرًۭا|كَبِيرًا", "أَجْرًا|أَجْرًۭا", "يَسْتَهْزِءُونَ",
  "ٱلصَّٰدِقِينَ", "مِنْهُ|مِّنْهُ", "يَحْزَنُونَ", "يُنصَرُونَ|يَنصُرُونَ",
  "أَنفُسَهُمْ|أَنفُسِهِمْ|أَنفُسُهُمْ", "يَكْسِبُونَ", "يَفْتَرُونَ|يَفْتُرُونَ",
  "لِّلْعَٰلَمِينَ|لِلْعَٰلَمِينَ|لِّلْعَٰلِمِينَ", "مُّبِينًۭا|مُّبِينًا",
  "بَصِيرًۭا|بَصِيرًا|بَصِيرًۢا", "وَكِيلًۭا|وَكِيلًا", "أَحَدًۭا|أَحَدًا|أَحَدًۢا",
  "ٱلْءَاخِرِينَ|ٱلْءَاخَرِينَ", "ٱلْمُفْلِحُونَ", "يَفْعَلُونَ", "يُنظَرُونَ|يَنظُرُونَ",
  "يَتَّقُونَ", "ٱلْعِقَابِ", "ٱلْأُمُورُ|ٱلْأُمُورِ", "قَوْلًۭا|قَوْلًۢا|قَوْلًا",
  "خَبِيرًۭا|خَبِيرًۢا|خَبِيرًا", "نَصِيرًۭا|نَصِيرًا|نَّصِيرًۭا", "عَنْهَا", "ٱلْمُجْرِمِينَ",
  "أَكْثَرُهُم|أَكْثَرَهُمْ", "فَهُمْ|فَهُم|فَهُمُ", "لِّلْمُكَذِّبِينَ", "يُوقِنُونَ",
  "ٱلْفَٰسِقِينَ", "ٱلْخَٰسِرُونَ", "ٱلْخَٰسِرِينَ", "مُّهِينٌۭ|مَّهِينٍۢ|مَّهِينٍ",
  "تَعْبُدُونَ", "بَعِيدٍۢ|بَعِيدٍ|بَعِيدٌۭ", "تُفْلِحُونَ", "وَأَطِيعُونِ",
  "أَلِيمًۭا|أَلِيمًا|أَلِيمًۢا", "يَفْقَهُونَ", "ٱلْكَٰفِرُونَ",
  "إِنَّكُمْ|إِنَّكُم|أَنَّكُمْ|أَنَّكُم", "أَمِينٌۭ|أَمِينٍۢ|أَمِينٌ",
  "لِلْكَٰفِرِينَ|لِّلْكَٰفِرِينَ", "رَبِّكُمْ|رَّبِّكُمْ|رَبُّكُمْ|رَبُّكُمُ",
  "لِلْمُؤْمِنِينَ|لِّلْمُؤْمِنِينَ", "يَهْتَدُونَ", "حَلِيمٌۭ|حَلِيمٍۢ|حَلِيمٌ",
  "ٱلسَّمَآءُ|ٱلسَّمَآءِ", "ٱلْكَٰذِبِينَ", "كَثِيرًۭا|كَثِيرًا", "ٱلْمُفْسِدِينَ",
  "ٱلنَّعِيمِ", "مُّجْرِمِينَ|مُجْرِمِينَ", "يَتَفَكَّرُونَ", "ٱلْغَفُورُ",
  "تُكَذِّبُونَ|تَكْذِبُونَ", "يُبْصِرُونَ", "ٱلْفَٰسِقُونَ",
  "نَصِيرٍۢ|نَصِيرٍ|نَّصِيرٍۢ|نَّصِيرٍ", "ٱلصَّٰبِرِينَ", "يَشْكُرُونَ", "ٱلْمُؤْمِنُونَ",
  "مُؤْمِنُونَ|مَمْنُونٍۢ|مُّؤْمِنُونَ|مَمْنُونٍۭ", "لَكَٰذِبُونَ", "ٱلْمُسْلِمِينَ",
  "ظَٰلِمِينَ", "فَلَا", "ٱلْمُجْرِمُونَ", "مَّعْلُومٍۢ|مَّعْلُومٌۭ",
  "إِنَّهُۥ|إِنَّهُۥٓ|أَنَّهُ", "تُبْصِرُونَ", "يَخْتَلِفُونَ", "تُحْشَرُونَ",
  "ٱلْعَلِىُّ|ٱلْعُلَى|ٱلْعُلَىٰ|ٱلْعَلِىِّ", "لِّأُو۟لِى|لِأُو۟لِى", "كَٰفِرِينَ",
  "تُرْحَمُونَ", "عَلَيْكُم|عَلَيْكُمْ", "إِبْرَٰهِيمَ|إِبْرَٰهِيمُ",
  "شَهِيدٌ|شَهِيدٌۭ|شَهِيدٍۢ", "سَبِيلَ|سَبِيلٍۢ|سَبِيلٍ|سَبِيلُ", "يُبْعَثُونَ", "يَسْمَعُونَ",
  "مُسْلِمِينَ|مُّسْلِمِينَ", "كَبِيرٌۭ|كَبِيرٍ|كَبِيرٌ|كَبِيرٍۢ", "ٱلْمُخْلَصِينَ",
  "تَأْكُلُونَ", "يَسِيرٌۭ|يَسِيرٍۢ", "ٱلْكَبِيرُ|ٱلْكَبِيرِ",
  "شَكُورٍۢ|شَكُورٌ|شَكُورٌۭ|شَكُورٍ", "وَعُيُونٍۢ|وَعُيُونٍ", "مِّنْهَا|مِنْهَا",
  "رَسُولًۭا|رَّسُولًۭا|رَسُولًا", "ذِكْرًۭا|ذِكْرًا", "تُوعَدُونَ", "ٱلسَّعِيرِ",
  "حَمِيمٍۢ|حَمِيمٌۭ|حَمِيمٍ|حَمِيمٌ", "يُنفِقُونَ", "يَعْمَهُونَ", "تَنظُرُونَ|تُنظِرُونِ",
  "ظَٰلِمُونَ", "فَيَكُونُ", "تَكْفُرُونَ|تَكْفُرُونِ", "بِغَيْرِ", "حِسَابٍۢ|حِسَابٍ",
  "يَتَذَكَّرُونَ", "نَّٰصِرِينَ", "ٱلشَّٰكِرِينَ", "سَعِيرًا|سَعِيرًۭا", "يَسِيرًۭا|يَسِيرًا",
  "مُّقِيمٌ|مُّقِيمٌۭ|مُّقِيمٍ|مُّقِيمٍۢ", "فَٰسِقُونَ", "أَعْلَمُ", "يَصِفُونَ",
  "يَذَّكَّرُونَ|يَذْكُرُونَ", "ٱلْغَٰبِرِينَ", "ٱلْمُنذَرِينَ|ٱلْمُنذِرِينَ", "عَلَيْنَا",
  "لِّمَا|لِمَا|لَمَا|لَّمًّۭا", "عَنْهُ", "ٱلْمُرْسَلُونَ", "كُفُورًۭا|كَفُورًۭا|كَفُورًا",
  "نَبِيًّۭا|نَّبِيًّۭا|نَّبِيًّا", "يُوعَدُونَ", "يَتَسَآءَلُونَ", "أَعْمَٰلَهُمْ",
  "ٱلضَّآلِّينَ", "رَزَقْنَٰهُمْ", "بِمُؤْمِنِينَ", "ٱلتَّوَّابُ", "تَهْتَدُونَ",
  "ٱلْجَٰهِلِينَ", "يُرِيدُ", "حَمِيدٌۭ|حَمِيدٌ|حَمِيدٍۢ", "ٱلشَّٰهِدِينَ", "ٱلْمُكَذِّبِينَ",
  "ضَلَٰلًۢا|ضَلَٰلًۭا", "قَدِيرًۭا|قَدِيرًا", "يُؤْفَكُونَ", "ءَاخَرِينَ", "ٱلْخَبِيرُ",
  "تُشْرِكُونَ", "يَجْحَدُونَ", "يَكْفُرُونَ", "غَٰفِلُونَ", "ٱلْمُسْرِفِينَ", "وَإِنَّا",
  "ٱلرَّٰحِمِينَ", "فَٰسِقِينَ", "ٱلْأَلِيمَ|ٱلْأَلِيمُ|ٱلْأَلِيمِ", "فَٰعِلِينَ", "ءَامِنِينَ",
  "ٱلْيَقِينِ|ٱلْيَقِينُ", "يَسْتَطِيعُونَ", "تَفْعَلُونَ", "رَشَدًۭا|رُشْدًۭا",
  "صَبْرًۭا|صَبْرًا", "أَمْرًۭا|إِمْرًۭا|أَمْرًا", "يُسْرًۭا|يُسْرًا",
  "وَتَوَلَّىٰ|وَتَوَلَّىٰٓ", "جَنَّةٍ|جَنَّةِ|جَنَّةُ|جَنَّةَ|جَنَّةًۭ", "ٱلْيَمِينِ",
  "مَجْنُونٌۭ|مَّجْنُونٍۭ|مَّجْنُونٌ|مَجْنُونٌ|مَجْنُونٍ",
  "يَكْذِبُونَ|يُكَذِّبُونِ|يُكَذِّبُونَ", "طُغْيَٰنِهِمْ", "تَكْتُمُونَ", "يَفْسُقُونَ",
  "مُفْسِدِينَ", "بِٱلظَّٰلِمِينَ", "أَثِيمٍ|أَثِيمٍۢ", "تَخْتَلِفُونَ", "خَٰسِرِينَ",
  "ٱلْغَرُورُ|ٱلْغُرُورِ", "يَصْنَعُونَ", "ٱلْغَٰلِبُونَ", "ٱلرَّٰزِقِينَ", "يَعْدِلُونَ",
  "مُعْرِضِينَ", "وَإِنَّهُمْ|وَأَنَّهُم|وَإِنَّهُم", "مُّهْتَدُونَ", "يَلْعَبُونَ",
  "صَلَاتِهِمْ", "وَكِيلٌۭ|وَكِيلٌ", "بِمُعْجِزِينَ", "ٱلسَّٰجِدِينَ", "مِنكُمْ|مِّنكُم|مِنكُم",
  "جَٰثِمِينَ", "ٱلْحَٰكِمِينَ", "سَٰجِدِينَ", "رَبِّنَا", "يَتَوَكَّلُونَ",
  "نَعِيمٍۢ|نَعِيمٌۭ|نَعِيمٍ", "مُدْبِرِينَ|مُّدْبِرِينَ", "كَٰرِهُونَ",
  "كَفُورٌۭ|كَفُورٍۢ|كَفُورٍ", "سِنِينَ", "مُنكِرُونَ|مُّنكَرُونَ", "مُصْبِحِينَ|مُّصْبِحِينَ",
  "قَرِيبًۭا|قَرِيبًا", "أَبَدًۭا|أَبَدًا", "وَلَدًۭا|وَلَدًا", "مَالًۭا", "عِلْمًۭا|عِلْمًۢا",
  "ٱلْقُبُورِ|ٱلْقُبُورُ", "نَكِيرِ|نَّكِيرٍۢ", "إِلَيْكُمْ|إِلَيْكُم",
  "مُحْضَرُونَ|مُّحْضَرُونَ", "أَوَّابٌ|أَوَّابٌۭ|أَوَّابٍ", "فَٱتَّقُونِ", "رَٰجِعُونَ",
  "يُعْلِنُونَ", "ٱلْمُمْتَرِينَ", "تَشْعُرُونَ", "بِهِمْ|بِهِمُ|بِهِم", "ٱلْمُعْتَدِينَ",
  "تُظْلَمُونَ", "كَفَّارٍ|كَفَّارٌۭ", "يَخْتَصِمُونَ", "ٱلْمُقَرَّبِينَ", "ظُلْمًۭا",
  "حَسِيبًۭا|حَسِيبًا", "كَرِيمًۭا", "مُّهِينًۭا", "هَٰٓؤُلَآءِ",
  "مَفْعُولًا|مَّفْعُولًۭا|مَفْعُولًۭا", "سُلْطَٰنًۭا", "غُرُورًا|غُرُورًۭا", "بِٱلْمُؤْمِنِينَ",
  "نَٰدِمِينَ", "يَسْتَكْبِرُونَ", "بِرَبِّهِمْ", "تَكْسِبُونَ", "تَزْعُمُونَ", "تُؤْفَكُونَ",
  "يَمْكُرُونَ", "يَحْكُمُونَ", "لَصَٰدِقُونَ", "تُخْرَجُونَ|تَخْرُجُونَ", "ٱلْغَٰلِبِينَ",
  "وَهَٰرُونَ", "غَٰفِلِينَ", "تَجْهَلُونَ", "ٱلْمُبْطِلُونَ", "بِظَلَّٰمٍۢ", "ٱلْفَآئِزُونَ",
  "يَسْتَبْشِرُونَ", "ءَايَٰتِنَا", "تَحْكُمُونَ", "تَسْتَعْجِلُونَ|تَسْتَعْجِلُونِ",
  "فِرْعَوْنَ", "تَصِفُونَ", "مَكِينٌ|مَّكِينٍۢ|مَّكِينٍ|مَكِينٍۢ", "عِقَابِ|عِقَابٍ",
  "صَبَّارٍۢ", "جَدِيدٍۢ|جَدِيدٍ", "قَرَارٍۢ", "رَجِيمٌۭ|رَّجِيمٍ|رَّجِيمٍۢ",
  "مُّتَقَٰبِلِينَ|مُتَقَٰبِلِينَ", "أَيُّهَا", "يَشْتَهُونَ", "ٱلْبَصِيرُ",
  "مَسْـُٔولًۭا|مَّسْـُٔولًۭا", "نُفُورًۭا|نُفُورًا", "ظَهِيرًۭا", "مَكَانًۭا|مَكَانًا",
  "ٱلْيَوْمَ", "إِلَيْنَا|إِلَيْنَآ", "ٱلْأَوَّلُونَ", "مُشْفِقُونَ|مُّشْفِقُونَ", "يَنطِقُونَ",
  "لَنَا", "ٱلْحَمِيمِ|ٱلْحَمِيمُ", "كَذَّبُونِ|كَٰذِبُونَ", "وَبَنِينَ",
  "ٱلشَّيَٰطِينِ|ٱلشَّيَٰطِينُ", "نَذِيرًا|نَّذِيرًۭا|نَذِيرًۭا", "وَأَصِيلًۭا|وَأَصِيلًا",
  "يَعْبُدُونَ|يُعْبَدُونَ", "تَبْدِيلًۭا|تَبْدِيلًا", "جَمِيلًۭا|جَمِيلًا",
  "كَذَّابٌ|كَذَّابٌۭ", "ٱلْمِسْكِينِ|ٱلْمِسْكِينَ", "مُهْتَدِينَ", "بِٱلْكَٰفِرِينَ",
  "يَعْتَدُونَ", "تَشْهَدُونَ|تَشْهَدُونِ", "تَتَفَكَّرُونَ", "ٱلْوَهَّابُ|ٱلْوَهَّابِ",
  "ٱلضَّآلُّونَ", "يَسْجُدُونَ", "ٱلْعَٰمِلِينَ", "يَجْمَعُونَ", "تَوَّابًۭا|تَوَّابًۢا",
  "خَيْرًۭا", "وَإِثْمًۭا", "عَلِيًّۭا|عَلِيًّا", "فَتِيلًا|فَتِيلًۭا", "مَصِيرًا|مَصِيرًۭا",
  "خَلِيلًۭا", "فَإِنَّا", "هَٰهُنَا|هَٰهُنَآ", "ٱلْمُقْسِطِينَ", "يَقْتُلُونِ|يَقْتُلُونَ",
  "مُشْرِكِينَ|مُّشْرِكِينَ", "مُبْلِسُونَ|مُّبْلِسُونَ", "تَتَذَكَّرُونَ", "يُحَافِظُونَ",
  "يَخْرُصُونَ", "مُنتَظِرُونَ|مُّنتَظِرُونَ", "ٱلْمُنظَرِينَ", "ٱلنَّٰصِحِينَ",
  "يَسْتَقْدِمُونَ", "دَارِهِمْ", "لَّخَٰسِرُونَ", "لِلنَّٰظِرِينَ", "حَٰشِرِينَ",
  "وَلَعَلَّهُمْ", "قَلِيلٌ|قَلِيلٌۭ|قَلِيلٍۢ", "فَرِحُونَ", "مَعَكُم|مَعَكُمْ", "لِّلْقَوْمِ",
  "فَخُورٌ|فَخُورٍۢ|فَخُورٍ", "كَٰذِبِينَ", "مُّغْرَقُونَ", "جَبَّارٍ|جَبَّارٍۢ", "عَنِيدٍۢ",
  "سِجِّيلٍۢ|سِجِّيلٍ", "تُنصَرُونَ", "عَٰمِلُونَ", "لَحَٰفِظُونَ", "حَٰفِظِينَ",
  "كَظِيمٌۭ|كَظِيمٌ", "وَعِيدِ", "لَمَجْنُونٌۭ", "حَمَإٍۢ", "مَّسْنُونٍۢ", "أَجْمَعُونَ",
  "بِغُلَٰمٍ", "وَحِينَ", "يُسْتَعْتَبُونَ", "ٱلْكَٰذِبُونَ", "عَبْدًۭا|عَبْدًا",
  "شَكُورًۭا|شُكُورًۭا|شُكُورًا", "حَلِيمًا|حَلِيمًۭا", "رَجُلًۭا", "تَحْوِيلًا", "خَسَارًۭا",
  "بَشَرًۭا", "تَنزِيلًۭا|تَنزِيلًا", "سُجَّدًۭا", "عَدَدًۭا|عَدَدًۢا", "وَلِيًّۭا",
  "وَخَيْرٌ|وَخَيْرٌۭ", "نُّكْرًۭا", "شَقِيًّۭا", "سَوِيًّۭا", "تَقِيًّۭا", "بِنَا|بَنَّآءٍۢ",
  "إِنَّهَا|أَنَّهَا", "فَٱعْبُدُونِ", "مُّكْرَمُونَ", "عَٰبِدِينَ", "ٱلْوَٰرِثِينَ",
  "لَقَٰدِرُونَ", "لَدَيْهِمْ", "لَمَبْعُوثُونَ", "ٱلْكَرِيمِ|ٱلْكَرِيمُ", "نُشُورًۭا",
  "ثُبُورًۭا", "سَلَٰمًۭا", "ءَابَآئِكُمُ", "سَيَهْدِينِ", "تَدَّعُونَ|تَدْعُونَ",
  "ٱلْمَشْحُونِ", "بِمُعَذَّبِينَ", "ٱلْأَمِينُ|ٱلْأَمِينِ", "يَسْتَعْجِلُونَ|يَسْتَعْجِلُونِ",
  "يُوزَعُونَ", "مُنتَقِمُونَ|مُّنتَقِمُونَ", "مَّعِينٍۭ|مَّعِينٍۢ", "مَّكْنُونٌۭ|مَّكْنُونٍۢ",
  "ٱلْبُطُونَ|ٱلْبُطُونِ", "ءَاثَٰرِهِم|ءَاثَٰرِهِمْ", "مُّنذِرِينَ|مُنذِرِينَ", "لَيَقُولُونَ",
  "يَضْحَكُونَ", "يَكْتُبُونَ", "فَأَوْلَىٰ|فَأَوْلَىٰٓ", "يَعْلَمُ|يَعْلَمْ", "ٱلْمُقَرَّبُونَ",
  "فَلَوْلَا", "كَلَّا", "حِسَابًۭا", "بِٱلدِّينِ"
];

let cadenceIndex = null;
function cadenceLookup() {
  if (cadenceIndex) return cadenceIndex;
  const byWord = new Map();
  const byRhyme = new Map();
  QURAN_CADENCE_WORDS.forEach((entry) => {
    const forms = entry.split("|");
    const n = normalizeArabic(forms[0]);
    if (!n) return;
    byWord.set(n, forms);
    const rhyme = n.slice(-2) + n.length;
    if (!byRhyme.has(rhyme)) byRhyme.set(rhyme, []);
    byRhyme.get(rhyme).push(n);
  });
  cadenceIndex = { byWord, byRhyme };
  return cadenceIndex;
}

// The case ending a word wears, so a رَحِيمًا is answered among أَلِيمًا and
// عَظِيمًا rather than among nominatives it could be told apart from at a
// glance.
function cadenceEnding(word) {
  const w = String(word || "");
  const vowels = w.match(/[\u064B-\u0650]/g);
  const endsWithAlef = /\u0627[\u064B-\u0652\u0670\u06D6-\u06ED]*$/.test(w);
  return (endsWithAlef ? "\u0627" : "") + (vowels ? vowels[vowels.length - 1] : "");
}

function cadenceDistractors(correctWord, usedNorms) {
  const { byWord, byRhyme } = cadenceLookup();
  const n = normalizeArabic(correctWord);
  const peers = byRhyme.get(n.slice(-2) + n.length);
  if (!peers) return [];
  const ending = cadenceEnding(correctWord);
  // The nearer the ending, the harder the choice: كَرِيمًا before رَبِّكُمَا,
  // نَذِيرٌ before وَخَيْرٌ. Shuffled first, so words that tie are not always
  // offered in the same order.
  const shared = (a, b) => {
    let i = 0;
    while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
    return i;
  };
  return shuffleArray(peers.filter((w) => w !== n && !usedNorms.has(w)))
    .sort((a, b) => shared(n, b) - shared(n, a))
    .map((w) => {
      const forms = byWord.get(w);
      return forms.find((f) => cadenceEnding(f) === ending) || forms[0];
    });
}

function buildMcqOptions(correctWord, ayahWords, surahNumber = null) {
  const usedNorms = new Set([normalizeArabic(correctWord)]);
  const pool = [];
  function addCandidate(w) {
    const n = normalizeArabic(w);
    if (n && !usedNorms.has(n)) {
      usedNorms.add(n);
      pool.push(w);
    }
  }
  // A word with siblings is asked against them; anything else falls back to
  // the ayah's own words and its surah's.
  const distractors = cadenceDistractors(correctWord, usedNorms).slice(0, 3);
  distractors.forEach((w) => usedNorms.add(normalizeArabic(w)));

  ayahWords.forEach(addCandidate);
  const surahWords = surahAyahsCache[surahNumber || state.learningPointer.surah];
  if (surahWords) {
    shuffleArray(surahWords).forEach((a) => quranWords(a.text).forEach(addCandidate));
  }
  shuffleArray(pool).slice(0, 3 - distractors.length).forEach((w) => distractors.push(w));
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

on("btn-type-submit", "click", submitTypedAnswer);
// The sticky ayah panel (see the CSS) handles most of the keyboard-covers-it
// case, but some mobile browsers resize the visual viewport in a way sticky
// positioning doesn't react to - explicitly re-surfacing it once the
// keyboard has finished animating in covers those too.
on("type-input", "focus", () => {
  document.getElementById("type-answer").classList.add("keyboard-active");
  document.getElementById("type-area").classList.add("pinned");
  setTimeout(() => scrollIntoViewIfNeeded(".learn-ayah-display"), 350);
});
on("type-input", "blur", () => {
  document.getElementById("type-answer").classList.remove("keyboard-active");
  document.getElementById("type-area").classList.remove("pinned");
});
on("type-input", "keydown", (e) => {
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

// Three rounds to learn an ayah; one to prove an ayah you say you already
// know. The claim still has to be shown - it is just not made to repeat work
// that, if the claim is true, was done long ago.
function roundsNeededFor(item) {
  return item && item.learningStage === "verify" ? 1 : ROUNDS_TO_MASTER;
}

function completeLearnRound() {
  const item = state.ayahs[learnCurrentKey];
  // A slip repeats the round it happened in; it doesn't send you back to
  // round one. Losing three rounds' work to one mistyped word punishes the
  // person for the very thing the round exists to surface, and the fix for
  // a shaky word is to do that round again, not to redo the two that
  // already went well.
  const needed = roundsNeededFor(item);
  if (!learnMistakeThisRound) {
    item.roundStreak = (item.roundStreak || 0) + 1;
  } else if (item.learningStage === "verify") {
    // The claim did not hold. It is not held against the person - the ayah
    // simply becomes one to memorize, with the three rounds that go with it,
    // and the round just spent counts as the first attempt at the first.
    item.learningStage = "learning";
    item.roundStreak = 0;
    showToast("لا بأس — سنضعها في الحفظ من أوّلها.", undefined);
  }
  saveState();

  if (item.roundStreak >= needed) {
    masterCurrentLearningAyah(item);
  } else {
    showToast(learnMistakeThisRound ? "قريب جدًا! أعد المحاولة من جديد 💪" : `أحسنت! جولة ${item.roundStreak} من ${needed} ✅`, learnMistakeThisRound ? undefined : "success");
    if (!learnMistakeThisRound) fireConfetti(false);
    setTimeout(() => loadLearnAyah(), 900);
  }
}

function masterCurrentLearningAyah(item) {
  item.learningStage = "srs";
  // The day this ayah was actually memorized - which is what "تحفظ منذ"
  // counts from. Its `added` date is when it entered the plan, which can be
  // weeks earlier, and belongs to a different question.
  if (!item.memorizedOn) item.memorizedOn = todayISO();
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
    `تعود إليك للمراجعة ${intervalText(item.interval)} · ${surahMasteredProgress(item.surah)}${rewardSuffix(POINTS.masterAyah)}`
  );

  // A hand-picked mode was for that ayah; the next one starts the ramp again.
  learnModeManualOverride = false;

  // Advance - but only the pointer that is actually driving the tab. On a
  // detour that is the detour's own pointer, which hops to the next ayah of
  // the group still waiting and then gets out of the way; the sequential
  // pointer keeps the place it had before the detour started.
  if (state.learnDetour && state.learnDetour.surah === item.surah && state.learnDetour.ayah === item.ayah) {
    const next = learnDetourItems(item.surah).find((i) => i.ayah > item.ayah);
    state.learnDetour = next ? { surah: next.surah, ayah: next.ayah } : null;
    if (!next) showToast("انتهت الآيات التي بدأت بها — عدنا بك إلى موضعك في التسلسل.", "success");
  } else {
    state.learningPointer = { surah: item.surah, ayah: item.ayah + 1 };
  }
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

  // Whether the person has actually asked to hear this ayah. An <audio>
  // element reports an error for a src it merely failed to preload, and
  // announcing that unprompted put "تعذّر تشغيل هذا القارئ" on screen the
  // moment a tab opened, over an ayah nobody had asked to hear.
  let playRequested = false;
  playBtn.addEventListener("click", () => {
    if (audio.paused) { playRequested = true; audio.play().catch(() => {}); }
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
  audio.addEventListener("emptied", () => { setLoading(false); playRequested = false; render(); });
  audio.addEventListener("error", () => {
    setLoading(false);
    render();
    if (!playRequested) return; // nobody was listening; nothing to apologise for
    playRequested = false;
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
  // One shell serves every info modal, so it keeps the scroll position of
  // whatever was read in it last - and a tafsir opened after a long privacy
  // policy would start halfway down. New content starts at its beginning.
  document.querySelector(".info-modal").scrollTop = 0;
  document.getElementById("info-modal-overlay").classList.remove("modal-closed");
}
function closeInfoModal() {
  document.getElementById("info-modal-overlay").classList.add("modal-closed");
  document.getElementById("info-modal-actions").classList.add("hidden");
}
on("btn-info-close", "click", closeInfoModal);
on("info-modal-cancel", "click", closeInfoModal);
on("info-modal-overlay", "click", (e) => {
  if (e.target.id === "info-modal-overlay") closeInfoModal();
});

// A lightweight confirm dialog reusing the same modal shell instead of the
// browser's native confirm(), so it matches the app's own visual style.
function showConfirmModal(title, message, confirmLabel, onConfirm) {
  showChoiceModal(title, message, { label: confirmLabel, onPick: onConfirm });
}

// Two answers and a way back, where a yes/no will not do: "save and leave"
// and "leave without saving" are both leaving, and neither of them is the
// cancel. The third button only appears when there is a second answer.
function showChoiceModal(title, message, primary, alt) {
  document.getElementById("info-modal-title").textContent = title;
  document.getElementById("info-modal-body").innerHTML = `<p>${message}</p>`;
  document.getElementById("info-modal-actions").classList.remove("hidden");
  const confirmBtn = document.getElementById("info-modal-confirm");
  confirmBtn.textContent = primary.label;
  confirmBtn.onclick = () => { closeInfoModal(); primary.onPick(); };
  const altBtn = document.getElementById("info-modal-alt");
  altBtn.classList.toggle("hidden", !alt);
  altBtn.onclick = null;
  if (alt) {
    altBtn.textContent = alt.label;
    altBtn.onclick = () => { closeInfoModal(); alt.onPick(); };
  }
  document.getElementById("info-modal-overlay").classList.remove("modal-closed");
}

// ---------- Word meanings, from a source that actually has them ----------
//
// The old معاني الكلمات button could not work: quran.com carries word-by-word
// translations in 71 languages and Arabic is not one of them (asking for
// word_translation_language=ar hands back the English gloss), and
// alquran.cloud's "معاني مفردات القرآن" edition is English too despite the
// name. Neither carries an Arabic لemma or root either.
//
// تفسير الجلالين does. It is written as interleaved glossing - each Quranic
// word in guillemets followed by what it means:
//
//   «ذلك» أي هذا «الكتاب» الذي يقرؤه محمد «لا ريب» لا شك «فيه» ...
//
// which is غريب القرآن in its classical form, and parses cleanly into word
// and meaning. So the meanings are real scholarship rather than invented,
// and they come from an edition the app already has access to.

const wordGlossCache = {};

// Splits the Jalalayn text into {word, meaning} pairs. Anything before the
// first guillemet is preamble and anything the parse cannot place is handed
// back whole, so a verse the pattern does not fit still shows something
// true rather than nothing.
function parseJalalaynGloss(text) {
  if (!text) return { pairs: [], rest: "" };
  const pairs = [];
  const re = /«([^»]+)»\s*([^«]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const word = m[1].trim();
    const meaning = (m[2] || "").trim().replace(/^أي\s+/, "");
    if (word) pairs.push({ word, meaning });
  }
  const firstQuote = text.indexOf("«");
  const rest = firstQuote > 0 ? text.slice(0, firstQuote).trim() : "";
  return { pairs, rest };
}

async function fetchWordGloss(surah, ayah) {
  const key = `${surah}:${ayah}`;
  if (wordGlossCache[key]) return wordGlossCache[key];
  const res = await fetchWithTimeout(`${API_BASE}/ayah/${key}/ar.jalalayn`, 7000);
  const json = await res.json();
  const text = json && json.data && json.data.text;
  if (!text) throw new Error("no gloss");
  const parsed = parseJalalaynGloss(text);
  wordGlossCache[key] = parsed;
  return parsed;
}

function glossHTML({ pairs, rest }) {
  if (!pairs.length) return `<p>${rest || ""}</p>`;
  const chips = pairs.map((p) => `
    <div class="meaning-chip">
      <span class="mw-ar">${p.word}</span>
      <span>${p.meaning || "—"}</span>
    </div>`).join("");
  return (rest ? `<p class="muted gloss-preamble">${rest}</p>` : "") + chips +
    `<p class="muted gloss-source">من تفسير الجلالين</p>`;
}

// One modal, two ways of reading the same ayah: the plain meaning of the
// whole verse, and the same verse word by word.
async function openAyahMeaning(surah, ayah, mode) {
  const title = mode === "words" ? "معاني الكلمات" : "التفسير";
  openInfoModal(title, `<p class="muted">جاري التحميل...</p>`);
  const body = document.getElementById("info-modal-body");
  const tabs = `
    <div class="gloss-tabs">
      <button class="btn gloss-tab${mode === "tafsir" ? " active" : ""}" data-gloss="tafsir">التفسير</button>
      <button class="btn gloss-tab${mode === "words" ? " active" : ""}" data-gloss="words">معاني الكلمات</button>
    </div>`;
  try {
    let inner;
    if (mode === "words") {
      inner = glossHTML(await fetchWordGloss(surah, ayah));
    } else {
      const res = await fetchWithTimeout(`${API_BASE}/ayah/${surah}:${ayah}/ar.muyassar`, 7000);
      const json = await res.json();
      const text = json && json.data && json.data.text;
      if (!text) throw new Error("no tafsir");
      inner = `<p>${text}</p><p class="muted gloss-source">من التفسير الميسّر</p>`;
    }
    if (body) body.innerHTML = tabs + inner;
  } catch (e) {
    if (body) body.innerHTML = tabs + `<p class="muted">تعذّر التحميل حاليًا. تحقق من الاتصال بالإنترنت.</p>`;
  }
  if (body) {
    body.querySelectorAll(".gloss-tab").forEach((btn) => {
      btn.addEventListener("click", () => openAyahMeaning(surah, ayah, btn.dataset.gloss));
    });
  }
}

// The تسميع round's own button. Same path as the standalone تسميع button
// below it: a clean recitation completes the round.
on("btn-voice-round-start", "click", () => {
  const item = state.ayahs[learnCurrentKey];
  if (!item) return;
  openVoiceModal(
    item.text,
    () => {
      lastVoiceAttempt = null;
      learnMistakeThisRound = false;
      completeLearnRound();
    },
    {
      // A slip here repeats this round, exactly as a wrong option or a
      // mistyped word does - and only this round, not the three.
      onFail: (accuracy, notes) => {
        lastVoiceAttempt = { key: learnCurrentKey, accuracy, notes };
        learnMistakeThisRound = true;
        completeLearnRound();
      },
    }
  );
});

// ---------- Daily Ta'ahud challenge ----------

let isChallengeMode = false;
// A review that isn't written to the plan. Nothing starts one today - adding
// an ayah is free, so "show me this one without adding it" stopped being a
// thing anyone needed - but grading and finishing still honour the flag, so
// a future one-off review has somewhere to plug in.
let isEphemeralReview = false;
let isSingleItemReview = false;

// A jump-ahead ayah found via search/browsing opens as a single one-off
// practice round instead of being written to state.ayahs - so it never
// persists, never counts toward progress, and can be reviewed as many times
// as the person likes without ever showing up in the dashboard.
// Opening a single due ayah straight from its dashboard row, instead of
// only being reachable through the full due-queue review session - and
// once graded, returning to the exact dashboard scroll position instead of
// stranding the person on the review tab (see finishReviewOrChallenge).
function startSingleItemReview(item) {
  switchTab("review"); // runs the normal due-queue session first (also resets isSingleItemReview); also remembers the dashboard's scroll position to return to...
  isSingleItemReview = true; // ...then this narrows it to just this ayah
  reviewQueue = [item];
  reviewIndex = 0;
  hideReviewEntries();
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
  challengeNeighbourRight = 0;
  challengeNeighbourTotal = 0;
  switchTab("review");
  hideReviewEntries();
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
// ---------- خريطة الحفظ ----------
//
// "77 آية" says how much, and nothing at all about where. The Mushaf's own
// 604 pages do: a page is the unit a hafiz actually thinks in, and seeing
// which of them are filled in - and where the gaps are - is worth more than
// a percentage.
//
// Two arrays read off the Quran: the first ayah of each page (by its number
// in the whole Quran, so a page's ayahs are simply the numbers between one
// start and the next) and the juz that page belongs to. 4KB, no network.
const MUSHAF_PAGE_STARTS = [
  1,8,13,24,32,37,45,56,65,69,77,84,91,96,101,109,113,120,127,134,142,149,153,161,171,177,184,
  189,194,198,204,210,218,223,227,232,238,241,245,253,256,260,264,267,272,277,282,289,290,294,
  303,309,316,323,331,339,346,355,364,371,377,385,394,402,409,415,426,434,442,447,451,459,467,
  474,480,488,494,500,505,508,513,517,520,527,531,538,545,553,559,568,573,580,585,588,595,599,
  607,615,621,628,634,641,648,656,664,669,672,675,679,683,687,693,701,706,711,715,720,727,734,
  740,746,752,759,765,773,778,783,790,798,808,817,825,834,842,849,858,863,871,880,884,891,900,
  908,914,921,927,932,936,941,947,955,966,977,985,992,998,1006,1012,1022,1028,1036,1042,1050,
  1059,1075,1085,1092,1098,1104,1110,1114,1118,1125,1133,1142,1150,1161,1169,1177,1186,1194,
  1201,1206,1213,1222,1230,1236,1242,1249,1256,1262,1267,1272,1276,1283,1290,1297,1304,1308,
  1315,1322,1329,1335,1342,1347,1353,1358,1365,1371,1379,1385,1390,1398,1407,1418,1426,1435,
  1443,1453,1462,1471,1479,1486,1493,1502,1511,1519,1527,1536,1545,1555,1562,1571,1582,1591,
  1601,1611,1619,1627,1634,1640,1649,1660,1666,1675,1683,1692,1700,1708,1713,1721,1726,1736,
  1742,1750,1756,1761,1769,1775,1784,1793,1803,1818,1834,1854,1873,1893,1908,1916,1928,1936,
  1944,1956,1966,1974,1981,1989,1995,2004,2012,2020,2030,2037,2047,2057,2068,2079,2088,2096,
  2105,2116,2126,2134,2145,2156,2161,2168,2175,2186,2194,2202,2215,2224,2238,2251,2262,2276,
  2289,2302,2315,2327,2346,2361,2386,2400,2413,2425,2436,2447,2462,2474,2484,2494,2508,2519,
  2528,2541,2556,2565,2574,2585,2596,2601,2611,2619,2626,2634,2642,2651,2660,2668,2674,2691,
  2701,2716,2733,2748,2763,2778,2792,2802,2812,2819,2823,2828,2835,2845,2850,2853,2858,2867,
  2876,2888,2899,2911,2923,2933,2952,2972,2993,3016,3044,3069,3092,3116,3139,3160,3173,3182,
  3195,3204,3215,3223,3236,3248,3258,3266,3274,3281,3288,3296,3303,3312,3323,3330,3337,3347,
  3355,3364,3371,3379,3386,3393,3404,3415,3425,3434,3442,3451,3460,3470,3481,3489,3498,3504,
  3515,3524,3534,3540,3549,3556,3564,3569,3577,3584,3588,3596,3607,3614,3621,3629,3638,3646,
  3655,3664,3672,3679,3691,3699,3705,3718,3733,3746,3760,3776,3789,3813,3840,3865,3891,3915,
  3942,3971,3987,3997,4013,4032,4054,4064,4069,4080,4090,4099,4106,4115,4126,4133,4141,4150,
  4159,4167,4174,4183,4192,4200,4211,4219,4230,4239,4248,4257,4265,4273,4283,4288,4295,4304,
  4317,4324,4336,4348,4359,4373,4386,4399,4415,4433,4454,4474,4487,4496,4506,4516,4525,4531,
  4539,4546,4557,4565,4575,4584,4593,4599,4607,4612,4617,4624,4631,4646,4666,4682,4706,4727,
  4750,4767,4785,4811,4829,4853,4874,4896,4918,4942,4969,4996,5030,5056,5079,5087,5094,5100,
  5105,5111,5116,5126,5130,5136,5143,5151,5156,5162,5169,5178,5186,5193,5200,5209,5218,5223,
  5230,5237,5242,5254,5268,5287,5314,5332,5358,5386,5415,5430,5448,5461,5476,5495,5513,5543,
  5571,5597,5617,5642,5673,5703,5728,5759,5801,5830,5855,5883,5910,5932,5964,5994,6017,6044,
  6073,6099,6126,6138,6156,6177,6194,6208,6222
];
const MUSHAF_PAGE_JUZ = [
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,3,3,3,3,3,
  3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5,
  5,5,5,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,10,10,
  10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,11,11,11,11,11,11,11,11,11,11,11,11,
  11,11,11,11,11,11,11,11,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,13,13,
  13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,14,14,14,14,14,14,14,14,14,14,14,14,
  14,14,14,14,14,14,14,14,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,16,16,
  16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,17,17,17,17,17,17,17,17,17,17,17,17,
  17,17,17,17,17,17,17,17,18,18,18,18,18,18,18,18,18,18,18,18,18,18,18,18,18,18,18,18,19,19,
  19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,20,20,20,20,20,20,20,20,20,20,20,20,
  20,20,20,20,20,20,20,20,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,22,
  22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,23,23,23,23,23,23,23,23,23,23,23,23,
  23,23,23,23,23,23,23,23,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,25,25,
  25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,26,26,26,26,26,26,26,26,26,26,26,
  26,26,26,26,26,26,26,26,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,28,28,
  28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,29,29,29,29,29,29,29,29,29,29,29,29,
  29,29,29,29,29,29,29,29,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,
  30
];
const QURAN_AYAH_COUNT = 6236;

function pageOfAyahNumber(n) {
  let lo = 0;
  let hi = MUSHAF_PAGE_STARTS.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (MUSHAF_PAGE_STARTS[mid] <= n) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1; // pages are 1-based
}
function pageAyahCount(page) {
  const next = page < MUSHAF_PAGE_STARTS.length ? MUSHAF_PAGE_STARTS[page] : QURAN_AYAH_COUNT + 1;
  return next - MUSHAF_PAGE_STARTS[page - 1];
}

function memorizedByPage() {
  const counts = new Map();
  Object.values(state.ayahs).forEach((item) => {
    if (item.learningStage !== "srs" || item.temporary || !item.globalNumber) return;
    const page = pageOfAyahNumber(item.globalNumber);
    counts.set(page, (counts.get(page) || 0) + 1);
  });
  return counts;
}

function renderMushafMap() {
  const grid = document.getElementById("mushaf-map-grid");
  const summary = document.getElementById("mushaf-map-summary");
  const box = document.getElementById("mushaf-map");
  if (!grid || !box) return;
  const counts = memorizedByPage();
  let full = 0;
  let partial = 0;
  const cells = [];
  for (let page = 1; page <= MUSHAF_PAGE_STARTS.length; page++) {
    const total = pageAyahCount(page);
    const done = counts.get(page) || 0;
    let level = 0;
    if (done >= total) { level = 3; full++; }
    else if (done > 0) { level = done / total >= 0.5 ? 2 : 1; partial++; }
    cells.push(`<span class="map-cell l${level}" title="صفحة ${page} · الجزء ${MUSHAF_PAGE_JUZ[page - 1]} · ${done} من ${total}" data-page="${page}" data-done="${done}" data-total="${total}"></span>`);
  }
  // 604 cells is cheap to build but not free, and the dashboard re-renders on
  // every graded review - so the grid is only built while it is open.
  if (box.open) grid.innerHTML = cells.join("");
  summary.textContent = full || partial
    ? `${full} صفحة كاملة · ${partial} صفحة بدأتها · من ${MUSHAF_PAGE_STARTS.length}`
    : `لم تكتمل صفحة بعد — من ${MUSHAF_PAGE_STARTS.length} صفحة.`;
  box.ontoggle = () => { if (box.open && !grid.innerHTML) renderMushafMap(); };
  grid.onclick = (e) => {
    const cell = e.target.closest(".map-cell");
    if (!cell) return;
    const page = cell.dataset.page;
    showToast(`📄 صفحة ${page} · الجزء ${MUSHAF_PAGE_JUZ[page - 1]}`, undefined, `${cell.dataset.done} من ${cell.dataset.total} آية`);
  };
}

// ---------- نسخة احتياطية ----------
//
// Everything this app knows lives in one object in one browser's storage.
// Clearing site data, or changing phone, takes months of memorization with
// it, and nothing here could carry it out. The file below is the whole of
// that object - the ayahs and their schedule, the points, the reciter, the
// theme, the font, the background and what has been unlocked of each, the
// wird commitment, the daily counts - not a summary of it.

const BACKUP_FORMAT = "tadabbur-backup";

function backupSummary(data) {
  const st = (data && data.state) || {};
  const ayahs = Object.values(st.ayahs || {});
  return {
    ayahs: ayahs.length,
    mastered: ayahs.filter((a) => a.learningStage === "srs" && !a.temporary).length,
    points: st.points || 0,
    savedAt: (data && data.savedAt) || "",
  };
}

// ---------- Keeping the data from evaporating ----------
//
// Everything a person has memorized lives in this browser's localStorage
// and nowhere else, and browsers treat that as disposable:
//
//   - any engine may evict a site's storage when the disk gets tight;
//   - Safari on iOS goes further and wipes a site's data after 7 days
//     without a visit - unless the app has been added to the Home Screen,
//     which exempts it. Someone who memorizes for a month, travels for
//     two weeks and comes back to nothing did not lose a setting, they
//     lost their مصحف.
//
// Three things are done about it: ask the browser to mark the data as
// persistent, tell the person plainly where they actually stand, and nudge
// them to keep a file once they have enough to lose.

const BACKUP_NUDGE_MIN_AYAHS = 10;   // below this there is little to mourn
const BACKUP_NUDGE_AFTER_DAYS = 30;  // since the last file they saved
const BACKUP_NUDGE_GAP_DAYS = 7;     // and never more often than this

function storageApi() {
  return navigator.storage && navigator.storage.persist ? navigator.storage : null;
}

// Chrome grants this silently to a site the person uses (or has installed),
// Firefox asks, and Safari does not implement it at all - so a false here
// means "no promise", never "something went wrong".
async function requestPersistentStorage() {
  const api = storageApi();
  if (!api) return false;
  try {
    if (await api.persisted()) return true;
    return await api.persist();
  } catch (e) {
    return false;
  }
}

async function isStoragePersisted() {
  const api = navigator.storage && navigator.storage.persisted ? navigator.storage : null;
  if (!api) return false;
  try { return await api.persisted(); } catch (e) { return false; }
}

function daysSinceISO(iso) {
  if (!iso) return null;
  const then = new Date(`${iso}T00:00:00`);
  if (isNaN(then)) return null;
  return Math.floor((new Date(`${todayISO()}T00:00:00`) - then) / 86400000);
}

// "srs" is the stage an ayah reaches once it is memorized and only being
// kept alive by review - the same count the dashboard calls محفوظة.
function memorizedAyahCount() {
  return Object.values(state.ayahs || {}).filter((a) => a && a.learningStage === "srs").length;
}

// The iPhone sentence is the one that matters most here, so it is not
// buried behind the generic one.
function storageRiskNote(persisted) {
  if (isIOS() && !isStandalone()) {
    return "⚠️ سفاري يمسح بيانات المواقع بعد 7 أيام دون فتحها. ثبّت التطبيق على الشاشة الرئيسية (زر المشاركة ← «إضافة إلى الشاشة الرئيسية») ليتوقف هذا تمامًا.";
  }
  if (persisted) return "✅ طلبنا من المتصفّح ألّا يحذف بياناتك تلقائيًا، ووافق. تبقى النسخة الاحتياطية ضروريةً لتغيير الهاتف.";
  if (!storageApi()) return "هذا المتصفّح لا يتيح تثبيت التخزين. احفظ نسخةً بين الحين والآخر.";
  return "⚠️ لم يمنح المتصفّح بياناتك حمايةً من الحذف التلقائي بعد — غالبًا يمنحها بعد استخدام التطبيق أيامًا، أو فور تثبيته على الشاشة الرئيسية.";
}

function lastBackupNote() {
  const days = daysSinceISO(state.lastBackupOn);
  if (days === null) return "لم تحفظ نسخةً بعد.";
  if (days === 0) return "آخر نسخة: اليوم.";
  if (days === 1) return "آخر نسخة: أمس.";
  return `آخر نسخة: منذ ${arabicCount(days, "يوم واحد", "يومين", "أيام", "يومًا")}.`;
}

async function renderStorageStatus() {
  const el = document.getElementById("storage-status");
  if (!el) return;
  const persisted = await isStoragePersisted();
  el.textContent = `${lastBackupNote()} ${storageRiskNote(persisted)}`;
  const btn = document.getElementById("btn-protect-storage");
  if (btn) btn.classList.toggle("hidden", persisted || !storageApi());
  // The accordion is shut by default, so the warning has to be legible on
  // its closed summary or it will never be read.
  const value = document.getElementById("backup-group-value");
  if (value) {
    const days = daysSinceISO(state.lastBackupOn);
    value.textContent = days === null ? "⚠️ بلا نسخة احتياطية"
      : days > BACKUP_NUDGE_AFTER_DAYS ? `⚠️ آخر نسخة منذ ${days} يومًا`
      : "نسخة احتياطية · دون إنترنت";
  }
}

async function protectStorageFromTap() {
  const ok = await requestPersistentStorage();
  showToast(ok ? "🛡️ بياناتك محميّة الآن من الحذف التلقائي" : "لم يمنح المتصفّح الحماية الآن. احفظ نسخةً احتياطية للأمان.", ok ? "success" : "error");
  renderStorageStatus();
}

// Asked for once there is something worth keeping rather than on a first
// launch: an empty app prompting Firefox's permission bar teaches the
// person to say no before the app has earned a yes.
let persistenceAsked = false;
function ensurePersistenceOnce() {
  if (persistenceAsked) return;
  if (memorizedAyahCount() < 1) return;
  persistenceAsked = true;
  requestPersistentStorage().then(() => renderStorageStatus());
}

// A nudge, not a nag: only once there is a real amount to lose, only after
// a month without a file, and never twice in a week.
function maybeNudgeBackup() {
  if (memorizedAyahCount() < BACKUP_NUDGE_MIN_AYAHS) return;
  const sinceBackup = daysSinceISO(state.lastBackupOn);
  if (sinceBackup !== null && sinceBackup < BACKUP_NUDGE_AFTER_DAYS) return;
  const sinceNudge = daysSinceISO(state.backupNudgedOn);
  if (sinceNudge !== null && sinceNudge < BACKUP_NUDGE_GAP_DAYS) return;
  state.backupNudgedOn = todayISO();
  saveState();
  showBackupNudgeToast();
}

function showBackupNudgeToast() {
  const container = document.getElementById("toast-container");
  if (!container || container.querySelector(".toast-update")) return;
  const el = document.createElement("div");
  el.className = "toast toast-update show";
  const main = document.createElement("div");
  main.textContent = `💾 ${ayahCountLabel(memorizedAyahCount())} محفوظة في هذا المتصفّح وحده`;
  const sub = document.createElement("div");
  sub.className = "toast-note";
  sub.textContent = "احفظ نسخةً حتى لا يضيع تعبك بتغيير هاتف أو مسح بيانات.";
  const row = document.createElement("div");
  row.className = "toast-update-actions";
  const go = document.createElement("button");
  go.className = "btn primary";
  go.textContent = "احفظ نسخة";
  go.addEventListener("click", () => { el.remove(); exportBackup(); });
  const later = document.createElement("button");
  later.className = "btn";
  later.textContent = "لاحقًا";
  later.addEventListener("click", () => el.remove());
  row.appendChild(go);
  row.appendChild(later);
  el.appendChild(main);
  el.appendChild(sub);
  el.appendChild(row);
  container.appendChild(el);
}

function exportBackup() {
  const payload = {
    format: BACKUP_FORMAT,
    version: 1,
    savedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    app: "تدبر",
    state,
  };
  try {
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tadabbur-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    state.lastBackupOn = todayISO();
    saveState();
    renderStorageStatus();
    const s = backupSummary(payload);
    showToast("💾 حُفظت نسختك", "success", `${ayahCountLabel(s.ayahs)} · ${pointsText(s.points)}`);
  } catch (e) {
    showToast("تعذّر حفظ النسخة على هذا الجهاز.", "error");
  }
}

// Restoring replaces everything, so it says what it is about to replace it
// WITH - a file from the wrong phone, or an older one, is otherwise
// indistinguishable until the damage is done.
function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(String(reader.result));
    } catch (e) {
      showToast("هذا الملف ليس نسخة صالحة.", "error");
      return;
    }
    if (!data || data.format !== BACKUP_FORMAT || !data.state || typeof data.state.ayahs !== "object") {
      showToast("هذا الملف ليس نسخة من تدبر.", "error");
      return;
    }
    const incoming = backupSummary(data);
    const current = backupSummary({ state });
    showConfirmModal(
      "استعادة نسخة",
      `النسخة المحفوظة${incoming.savedAt ? ` بتاريخ ${incoming.savedAt}` : ""} فيها <strong>${ayahCountLabel(incoming.ayahs)}</strong> منها ${incoming.mastered} محفوظة، و<strong>${pointsText(incoming.points)}</strong>.<br><br>ستحلّ محلّ ما على هذا الجهاز الآن (${ayahCountLabel(current.ayahs)} · ${pointsText(current.points)})، ولا يمكن التراجع.`,
      "استعد هذه النسخة",
      () => {
        try {
          localStorage.setItem(STATE_KEY, JSON.stringify(data.state));
        } catch (e) {
          showToast("تعذّرت الكتابة في ذاكرة المتصفّح.", "error");
          return;
        }
        showToast("✅ استُعيدت نسختك", "success");
        setTimeout(() => location.reload(), 700);
      }
    );
  };
  reader.onerror = () => showToast("تعذّرت قراءة الملف.", "error");
  reader.readAsText(file);
}

// ---------- المتشابهات ----------
//
// Ayahs that are nearly the same as ayahs elsewhere are the other half of
// where memorization slips - not a word inside one ayah, but two ayahs that
// differ by a word and are held in the same place in the mind. Knowing which
// ones they are, and exactly where they part, is most of the work.
//
// Read off the Quran itself rather than written by hand: every pair of ayahs
// of four words or more that align at 75 per cent or better, word for word,
// after the same normalization the answer checker uses. 860 pairs across 423
// ayahs; each entry lists up to four of an ayah's own likenesses.
const QURAN_SIMILAR_AYAHS = [
  "101:10=69:3,74:27,83:8,83:19", "101:3=69:3,74:27,83:8,83:19", "101:7=69:21",
  "104:5=69:3,74:27,83:8,83:19", "107:3=69:34,89:18", "109:3=109:5", "109:5=109:3",
  "10:38=11:13", "10:48=21:38,27:71,32:28,34:29", "10:63=27:53,41:18", "11:110=41:45",
  "11:13=10:38", "11:19=7:45", "11:22=16:109", "11:39=39:40", "11:50=7:65", "11:96=40:23",
  "12:22=28:14", "12:2=43:3", "14:20=35:17", "15:11=43:7", "15:12=26:200", "15:19=50:7",
  "15:29=38:72", "15:30=38:73", "15:34=38:77", "15:35=38:78", "15:36=38:79", "15:37=38:80",
  "15:38=38:81", "15:40=38:83", "15:45=51:15,52:17,54:54,77:41", "15:57=51:31", "15:58=51:32",
  "15:5=23:43", "16:109=11:22", "16:115=2:173", "16:34=45:33", "16:42=29:59", "16:43=21:7",
  "16:55=30:34", "17:48=25:9", "17:83=41:51", "18:67=18:72", "18:72=18:75,18:67", "18:75=18:72",
  "19:36=3:51,43:64", "19:41=19:56", "19:56=19:41", "1:2=37:182", "20:24=79:17,20:43",
  "20:43=20:24,79:17", "20:9=79:15", "21:14=68:31", "21:16=44:38",
  "21:38=10:48,27:71,32:28,34:29", "21:41=6:10", "21:7=16:43", "22:10=3:182,8:51", "22:62=31:30",
  "23:26=23:39", "23:31=23:42", "23:37=6:29", "23:39=23:26", "23:42=23:31", "23:43=15:5",
  "23:5=70:29", "23:6=70:30", "23:79=67:24", "23:7=70:31", "23:82=37:16,56:47", "23:83=27:68",
  "23:85=23:87", "23:87=23:85", "23:8=70:32", "23:9=70:34", "24:10=24:20", "24:20=24:10",
  "24:5=3:89", "25:9=17:48", "26:103=26:8,26:67,26:121,26:174",
  "26:104=26:9,26:68,26:122,26:140", "26:106=26:124,26:142,26:161",
  "26:107=26:125,26:143,26:162,26:178", "26:109=26:127,26:145,26:164,26:180", "26:116=26:167",
  "26:121=26:8,26:67,26:103,26:174", "26:122=26:9,26:68,26:104,26:140",
  "26:124=26:106,26:142,26:161", "26:125=26:107,26:143,26:162,26:178",
  "26:127=26:109,26:145,26:164,26:180", "26:139=26:8,26:67,26:103,26:121",
  "26:140=26:9,26:68,26:104,26:122", "26:142=26:106,26:124,26:161",
  "26:143=26:107,26:125,26:162,26:178", "26:145=26:109,26:127,26:164,26:180", "26:153=26:185",
  "26:158=26:8,26:67,26:103,26:121", "26:159=26:9,26:68,26:104,26:122", "26:160=54:33",
  "26:161=26:106,26:124,26:142", "26:162=26:107,26:125,26:143,26:178",
  "26:164=26:109,26:127,26:145,26:180", "26:167=26:116", "26:171=37:135", "26:173=27:58",
  "26:174=26:8,26:67,26:103,26:121", "26:175=26:9,26:68,26:104,26:122",
  "26:178=26:107,26:125,26:143,26:162", "26:180=26:109,26:127,26:145,26:164", "26:185=26:153",
  "26:190=26:8,26:67,26:103,26:121", "26:191=26:9,26:68,26:104,26:122", "26:1=28:1",
  "26:200=15:12", "26:24=44:7", "26:26=37:126", "26:2=28:2,31:2", "26:32=7:107", "26:33=7:108",
  "26:35=7:110", "26:36=7:111", "26:41=7:113", "26:42=7:114", "26:47=7:121",
  "26:67=26:8,26:103,26:121,26:174", "26:68=26:9,26:104,26:122,26:140", "26:70=37:85",
  "26:8=26:67,26:103,26:121,26:174", "26:9=26:68,26:104,26:122,26:140", "27:3=31:4",
  "27:53=10:63,41:18", "27:55=7:81", "27:57=7:83", "27:58=26:173", "27:68=23:83",
  "27:71=10:48,21:38,32:28,34:29", "27:80=30:52", "27:81=30:53", "28:14=12:22", "28:1=26:1",
  "28:2=26:2,31:2", "28:62=28:74", "28:71=28:72", "28:72=28:71", "28:74=28:62",
  "29:1=2:1,3:1,30:1,31:1", "29:22=42:31", "29:28=7:80", "29:37=7:78,7:91", "29:59=16:42",
  "2:107=9:116", "2:122=2:47", "2:123=2:48", "2:134=2:141", "2:136=3:84", "2:141=2:134",
  "2:147=3:60", "2:162=3:88", "2:173=16:115", "2:1=3:1,29:1,30:1,31:1", "2:47=2:122",
  "2:48=2:123", "2:49=7:141", "2:5=31:5", "2:62=5:69", "2:95=62:7", "30:1=2:1,3:1,29:1,31:1",
  "30:34=16:55", "30:37=39:52", "30:52=27:80", "30:53=27:81", "31:1=2:1,3:1,29:1,30:1",
  "31:2=26:2,28:2", "31:30=22:62", "31:4=27:3", "31:5=2:5", "32:1=2:1,3:1,29:1,30:1",
  "32:28=10:48,21:38,27:71,34:29", "33:62=48:23", "34:29=10:48,21:38,27:71,32:28", "35:17=14:20",
  "36:46=6:4", "36:48=10:48,21:38,27:71,32:28", "37:108=37:78,37:129",
  "37:111=37:81,37:132,37:122", "37:121=37:80,37:131,77:44", "37:122=37:81,37:111,37:132",
  "37:126=26:26", "37:128=37:40,37:74,37:160,37:169", "37:129=37:78,37:108",
  "37:131=37:80,37:121,77:44", "37:132=37:81,37:111,37:122", "37:135=26:171", "37:154=68:36",
  "37:157=44:36", "37:160=37:40,37:74,37:128,37:169", "37:169=37:40,37:74,37:128,37:160",
  "37:16=37:53,23:82,56:47", "37:174=37:178", "37:178=37:174", "37:182=1:2", "37:25=37:92",
  "37:27=52:25,37:50", "37:40=37:74,37:128,37:160,37:169", "37:48=38:52",
  "37:50=68:30,37:27,52:25", "37:53=37:16", "37:74=37:40,37:128,37:160,37:169",
  "37:78=37:108,37:129", "37:80=37:121,37:131,77:44", "37:81=37:111,37:132,37:122",
  "37:85=26:70", "37:92=37:25", "38:52=37:48", "38:72=15:29", "38:73=15:30", "38:77=15:34",
  "38:78=15:35", "38:79=15:36", "38:80=15:37", "38:81=15:38", "38:83=15:40", "38:87=81:27,68:52",
  "39:13=6:15", "39:40=11:39", "39:48=45:33", "39:52=30:37", "39:72=40:76", "3:10=3:116",
  "3:116=3:10,58:17", "3:182=8:51,22:10", "3:1=2:1,29:1,30:1,31:1", "3:51=19:36,43:64",
  "3:60=2:147", "3:84=2:136", "3:88=2:162", "3:89=24:5", "40:1=41:1,42:1,43:1,44:1",
  "40:23=11:96", "40:2=45:2,46:2", "40:76=39:72", "41:18=10:63,27:53",
  "41:1=40:1,42:1,43:1,44:1", "41:45=11:110", "41:51=17:83", "41:8=84:25,95:6",
  "42:1=40:1,41:1,43:1,44:1", "42:31=29:22", "43:1=40:1,41:1,42:1,44:1", "43:3=12:2",
  "43:64=3:51,19:36", "43:7=15:11", "43:83=70:42", "44:1=40:1,41:1,42:1,43:1", "44:36=37:157",
  "44:38=21:16", "44:7=26:24", "45:1=40:1,41:1,42:1,43:1", "45:2=40:2,46:2", "45:33=39:48,16:34",
  "46:1=40:1,41:1,42:1,43:1", "46:2=40:2,45:2", "48:23=33:62", "48:28=9:33,61:9", "4:116=4:48",
  "4:48=4:116", "50:25=68:12", "50:40=52:49", "50:7=15:19", "51:15=15:45,52:17,54:54,77:41",
  "51:31=15:57", "51:32=15:58", "52:17=15:45,51:15,54:54", "52:19=77:43", "52:25=37:27,37:50",
  "52:40=68:46", "52:41=68:47", "52:49=50:40", "54:16=54:21,54:30", "54:17=54:22,54:32,54:40",
  "54:21=54:16,54:30", "54:22=54:17,54:32,54:40", "54:30=54:16,54:21", "54:32=54:17,54:22,54:40",
  "54:33=26:160", "54:40=54:17,54:22,54:32", "54:54=15:45,51:15,52:17",
  "55:13=55:16,55:18,55:21,55:23", "55:16=55:13,55:18,55:21,55:23",
  "55:18=55:13,55:16,55:21,55:23", "55:21=55:13,55:16,55:18,55:23",
  "55:23=55:13,55:16,55:18,55:21", "55:25=55:13,55:16,55:18,55:21",
  "55:28=55:13,55:16,55:18,55:21", "55:30=55:13,55:16,55:18,55:21",
  "55:32=55:13,55:16,55:18,55:21", "55:34=55:13,55:16,55:18,55:21",
  "55:36=55:13,55:16,55:18,55:21", "55:38=55:13,55:16,55:18,55:21",
  "55:40=55:13,55:16,55:18,55:21", "55:42=55:13,55:16,55:18,55:21",
  "55:45=55:13,55:16,55:18,55:21", "55:47=55:13,55:16,55:18,55:21",
  "55:49=55:13,55:16,55:18,55:21", "55:51=55:13,55:16,55:18,55:21",
  "55:53=55:13,55:16,55:18,55:21", "55:55=55:13,55:16,55:18,55:21",
  "55:57=55:13,55:16,55:18,55:21", "55:59=55:13,55:16,55:18,55:21",
  "55:61=55:13,55:16,55:18,55:21", "55:63=55:13,55:16,55:18,55:21",
  "55:65=55:13,55:16,55:18,55:21", "55:67=55:13,55:16,55:18,55:21",
  "55:69=55:13,55:16,55:18,55:21", "55:71=55:13,55:16,55:18,55:21",
  "55:73=55:13,55:16,55:18,55:21", "55:75=55:13,55:16,55:18,55:21",
  "55:77=55:13,55:16,55:18,55:21", "56:25=78:35", "56:47=23:82,37:16", "56:74=56:96,69:52",
  "56:80=69:43", "56:96=56:74,69:52", "57:1=59:1,61:1", "58:17=3:116", "59:1=57:1,61:1",
  "59:4=8:13", "5:10=5:86", "5:69=2:62", "5:86=5:10", "5:92=64:12", "61:1=57:1,59:1",
  "61:9=9:33,48:28", "62:7=2:95", "64:12=5:92", "66:9=9:73", "67:24=23:79",
  "67:25=10:48,21:38,27:71,32:28", "68:12=50:25", "68:15=83:13", "68:30=37:50", "68:31=21:14",
  "68:36=37:154", "68:45=7:183", "68:46=52:40", "68:47=52:41", "68:52=38:87,81:27", "68:7=6:117",
  "69:21=101:7", "69:34=107:3,89:18", "69:3=74:27,83:8,83:19,86:2", "69:40=81:19", "69:43=56:80",
  "69:52=56:74,56:96", "6:10=21:41", "6:117=68:7", "6:15=39:13", "6:29=23:37", "6:4=36:46",
  "70:29=23:5", "70:30=23:6", "70:31=23:7", "70:32=23:8", "70:34=23:9", "70:42=43:83",
  "73:19=76:29", "74:27=69:3,83:8,83:19,86:2", "75:12=75:30", "75:19=88:26", "75:30=75:12",
  "76:29=73:19", "77:14=82:17", "77:25=78:6", "77:41=15:45,51:15", "77:43=52:19",
  "77:44=37:80,37:121,37:131", "78:35=56:25", "78:6=77:25", "79:15=85:17,20:9",
  "79:17=20:24,20:43", "7:107=26:32", "7:108=26:33", "7:110=26:35", "7:111=26:36", "7:113=26:41",
  "7:114=26:42", "7:121=26:47", "7:141=2:49", "7:183=68:45", "7:45=11:19", "7:61=7:67",
  "7:65=11:50", "7:67=7:61", "7:78=7:91,29:37", "7:80=29:28", "7:81=27:55", "7:83=27:57",
  "7:91=7:78,29:37", "81:19=69:40", "81:27=38:87,68:52", "82:13=83:22", "82:17=77:14",
  "83:13=68:15", "83:19=69:3,74:27,83:8,86:2", "83:22=82:13", "83:8=69:3,74:27,83:19,86:2",
  "84:25=95:6,41:8", "85:17=79:15", "86:2=69:3,74:27,83:8,83:19", "87:14=91:9", "88:26=75:19",
  "89:18=69:34,107:3", "8:13=59:4", "8:51=3:182,22:10", "90:12=69:3,74:27,83:8,83:19",
  "91:9=87:14", "94:5=94:6", "94:6=94:5", "95:6=84:25,41:8", "9:116=2:107", "9:33=48:28,61:9",
  "9:73=66:9"
];

let similarIndex = null;
function similarAyahsFor(surah, ayah) {
  if (!similarIndex) {
    similarIndex = new Map();
    QURAN_SIMILAR_AYAHS.forEach((entry) => {
      const [ref, list] = entry.split("=");
      similarIndex.set(ref, list.split(","));
    });
  }
  return similarIndex.get(`${surah}:${ayah}`) || [];
}

// Word-level alignment of two ayahs, so the answer to "where do they differ?"
// is the words themselves rather than a percentage.
function alignAyahWords(a, b) {
  const na = a.map(normalizeArabic);
  const nb = b.map(normalizeArabic);
  const m = na.length;
  const n = nb.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const left = [];
  const right = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (na[i] === nb[j]) { left.push({ w: a[i], same: true }); right.push({ w: b[j], same: true }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { left.push({ w: a[i], same: false }); i++; }
    else { right.push({ w: b[j], same: false }); j++; }
  }
  while (i < m) left.push({ w: a[i++], same: false });
  while (j < n) right.push({ w: b[j++], same: false });
  return { left, right };
}

async function ayahTextByRef(ref) {
  const [surah, ayah] = ref.split(":").map(Number);
  const stored = state.ayahs[ref];
  if (stored && stored.text) return { surah, ayah, text: stored.text, name: stored.surahName };
  const ayahs = await fetchSurahAyahs(surah);
  const found = ayahs.find((x) => x.numberInSurah === ayah);
  const surahs = await fetchSurahList().catch(() => []);
  const meta = surahs.find((x) => x.number === surah);
  return found ? { surah, ayah, text: found.text, name: (meta && meta.name) || `سورة ${surah}` } : null;
}

function renderSimilarButton(buttonId, surah, ayah) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  const refs = similarAyahsFor(surah, ayah);
  btn.classList.toggle("hidden", refs.length === 0);
  if (!refs.length) return;
  btn.innerHTML = iconLabel("bulb", refs.length === 1 ? "لها متشابهة" : `لها ${refs.length} متشابهات`);
  btn.onclick = () => openSimilarCompare(`${surah}:${ayah}`, refs);
}

async function openSimilarCompare(baseRef, refs) {
  openInfoModal("المتشابهات", `<p class="muted">جاري تحميل الآيات المتشابهة...</p>`);
  try {
    const base = await ayahTextByRef(baseRef);
    if (!base) throw new Error("no base");
    const others = [];
    for (const ref of refs) {
      const other = await ayahTextByRef(ref).catch(() => null);
      if (other) others.push(other);
    }
    if (!others.length) throw new Error("none");
    const paint = (list) => list
      .map((x) => `<span class="cmp-word${x.same ? "" : " differs"}">${x.w}</span>`)
      .join(" ");
    const blocks = others.map((other) => {
      const { left, right } = alignAyahWords(quranWords(base.text), quranWords(other.text));
      const changed = right.filter((x) => !x.same).map((x) => x.w);
      return `
        <div class="cmp-pair">
          <p class="cmp-ref">${base.name} : ${base.ayah}</p>
          <p class="cmp-text">${paint(left)}</p>
          <p class="cmp-ref other">${other.name} : ${other.ayah}</p>
          <p class="cmp-text">${paint(right)}</p>
          <p class="cmp-note">${changed.length ? `الفرق: ${changed.join(" · ")}` : "الآيتان متطابقتان لفظًا — الفرق موضعهما لا لفظهما."}</p>
        </div>`;
    }).join("");
    openInfoModal("المتشابهات", `
      <p class="muted">ما يشتبه على الحافظ ليس داخل الآية بل بين آيتين تفترقان بكلمة. الملوّن هو موضع الافتراق.</p>
      ${blocks}`);
  } catch (e) {
    openInfoModal("المتشابهات", `<p class="muted">تعذّر تحميل الآيات المتشابهة. تحقق من الاتصال بالإنترنت.</p>`);
  }
}

// ---------- وصل الآيات: the seams between them ----------
//
// The commonest way a memorized surah breaks down is not inside an ayah but
// between two: each one is known on its own and the join is not. Nothing in
// the app drilled that, so this does - and deliberately as its own exercise
// rather than as a word slipped into a round of the ayah being learned,
// which would only blur which ayah is being asked about.
//
// A question shows the END of one ayah and asks what OPENS the next. The
// options are openings of ayahs, three words each rather than one: a single
// word is no answer at all when half the Quran's ayahs open with "وَ" or
// "إِنَّ", and guessing between them teaches nothing.

const SEAM_QUESTION_COUNT = 10;
const SEAM_CUE_WORDS = 4;      // how much of the END of the ayah before is shown
const SEAM_LEAD_WORDS = 3;     // and how much of its beginning, to name it
const SEAM_OPENING_WORDS = 3;  // how much of an ayah's opening an option shows

let seamQueue = [];
let seamIndex = 0;
let seamTally = { right: 0, wrong: 0 };
let seamAnswered = false;

// A seam can be asked from either side, and asking it from one side only
// teaches the join in one direction: plenty of people can carry on from an
// ayah and cannot say what came before it. So the question varies -
// sometimes what OPENS the next, sometimes what ENDED the one before, and
// sometimes both about a single ayah, which is the join known properly.
const SEAM_DIRECTIONS = ["forward", "backward", "both"];

function ayahEnding(item) {
  return quranWords(item.text).slice(-SEAM_OPENING_WORDS).join(" ");
}

function ayahOpening(item) {
  return quranWords(item.text).slice(0, SEAM_OPENING_WORDS).join(" ");
}
function ayahEnding(item) {
  return quranWords(item.text).slice(-SEAM_CUE_WORDS).join(" ");
}

// The seam is asked from the END of an ayah, but four closing words are often
// four words that close a dozen ayahs ("لعلكم تتقون", "وهو العزيز الحكيم") -
// and being unsure WHICH ayah you are being asked to leave makes the question
// about recognising a phrase rather than about the join. So it opens with the
// ayah's own first words too: enough to place it, never enough to recite it.
function ayahCue(item) {
  const words = quranWords(item.text);
  if (words.length <= SEAM_LEAD_WORDS + SEAM_CUE_WORDS + 1) return { text: words.join(" "), whole: true };
  return {
    text: `${words.slice(0, SEAM_LEAD_WORDS).join(" ")} … ${words.slice(-SEAM_CUE_WORDS).join(" ")}`,
    whole: false,
  };
}

// "Which surahs am I on?" - which is what a person means by قيد الحفظ, and
// not what the card used to answer. It counted ayahs still inside their
// three rounds, so someone working steadily through البقرة and آل عمران saw
// a 1: the one ayah in hand at that moment. A surah is under memorization
// from the first ayah of it entered into the plan until its last one is
// memorized, however many of its ayahs are mid-round today.
function surahsInProgress() {
  const mastered = new Map();
  Object.values(state.ayahs).forEach((item) => {
    // Vestigial, like the other `temporary` filters here: the flag is cleared
    // on load now (see loadState), and kept only so the sums agree if an old
    // state ever slips through unmigrated.
    if (item.temporary) return;
    if (!mastered.has(item.surah)) mastered.set(item.surah, 0);
    if (item.learningStage === "srs") mastered.set(item.surah, mastered.get(item.surah) + 1);
  });
  let count = 0;
  mastered.forEach((done, surah) => {
    const total = surahAyahCount(surah);
    if (!total || done < total) count++;
  });
  return count;
}

// A seam exists where two consecutive ayahs of one surah are BOTH memorized
// for real - a temporary review isn't part of the sequence, and neither is an
// ayah still being learned.
function memorizedSeams() {
  const solid = Object.values(state.ayahs).filter((i) => i.learningStage === "srs" && !i.temporary);
  const byKey = new Map(solid.map((i) => [`${i.surah}:${i.ayah}`, i]));
  const seams = [];
  solid.forEach((i) => {
    const next = byKey.get(`${i.surah}:${i.ayah + 1}`);
    if (next) seams.push({ from: i, to: next });
  });
  return seams;
}

function renderSeamEntry() {
  const entry = document.getElementById("seam-entry");
  const btn = document.getElementById("btn-open-seam");
  if (!entry || !btn) return;
  const seams = memorizedSeams();
  // Four options need four different openings to choose between, so the
  // exercise stays out of sight until there is enough memorized to build one.
  entry.classList.toggle("hidden", seams.length < 4 || reviewSessionOpen());
  btn.innerHTML = iconLabel("repeat", `وصل الآيات (${seams.length})`);
}

// ---------- Reciting onto a blank page ----------
//
// Every other drill here hands you the ayah and hides part of it. This one
// hands you nothing: a page with the ayah numbers on it and, between them,
// the space each ayah takes up - and the words appear, in the Uthmani rasm,
// as you say them. It is the closest thing the app has to sitting in front
// of a شيخ with the Mushaf closed.
//
// Two things it deliberately is not:
//   * it is not graded. No word is marked wrong, nothing is scored out of
//     ten. What it produces is a list of the places you stumbled, and the
//     offer to review those.
//   * it is not scheduled. It moves no due date forward or back, and adds
//     nothing to the plan. You may recite the same surah five times in an
//     evening; the spaced repetition underneath does not notice.
//
// The matching is alignment, not transcription: the text is already known,
// so the only question is where in it the reciter has got to. That is what
// makes this workable on the browser's own recognition engine - it never has
// to be right about what was said, only about where it fits.

let recitePlan = [];          // [{ key, surah, ayah, surahName, words: [...] }]
let reciteFlat = [];          // every word of the plan in order, with its ayah
let recitePointer = 0;        // how far into reciteFlat the reciting has got
let reciteRecognition = null;
let reciteListening = false;
let reciteFinalSegments = [];
let reciteFinalWords = [];    // every finalized segment, cleaned, as words
let reciteFinalDone = 0;      // how many segment slots have been folded in
let reciteSeenWords = [];     // the transcript as last read, word by word
let reciteScope = { kind: "all", surah: null, from: null, to: null };
// The gap after a pause: start() has returned but the microphone is not yet
// live. Anything recited into it is simply not heard, so it is said out loud.
let reciteWaking = false;
let reciteStartAyah = 0;   // the ayah the page was opened at, to count from
let reciteStumbles = new Set();
// Words the reciter asked to see. Kept apart from the stumbles: a word he was
// shown and then said is not a word he passed over.
let recitePeeked = new Set();
// What the last alert said, so the same thing is not re-announced on every
// result while someone is still off the page.
let reciteAlertKey = "";

// How far ahead a missed word may be found before the reciter is taken to be
// somewhere else entirely. Three covers a dropped word or two - which the
// engine does constantly - without letting a wrong ayah quietly match.
const RECITE_LOOKAHEAD = 4;
// How far back a repeat may be recognized as a repeat: a breath's worth of
// words, because a whole breath is what the engine re-sends.
const RECITE_LOOKBEHIND = 40;
// A run is only followed far enough to tell a repeat from a jump.
const RECITE_RUN_CAP = 8;

function memorizedAyahsInOrder(filter) {
  return Object.values(state.ayahs)
    .filter((i) => i.learningStage === "srs" && !i.temporary && (!filter || filter(i)))
    .sort((a, b) => (a.surah - b.surah) || (a.ayah - b.ayah));
}

function recitableSurahs() {
  const out = new Map();
  memorizedAyahsInOrder().forEach((i) => {
    if (!out.has(i.surah)) out.set(i.surah, { surah: i.surah, name: i.surahName || `سورة ${i.surah}`, count: 0 });
    out.get(i.surah).count++;
  });
  return [...out.values()].sort((a, b) => a.surah - b.surah);
}

// A surah is recited whole. Only the memorized ayahs were on the page
// before, so a plan with gaps in it produced a page with gaps in it - and a
// page that skips from ayah 5 to ayah 12 is not a page of the Mushaf, it is
// a list of what happens to be in a database. The ayahs not in the plan are
// there and recited like the rest; nothing about them is scheduled either
// way, which is the whole nature of this mode.
let reciteSurahTextCache = {};

// What may be recited of a surah: from the first ayah of it that is in the
// plan to the last. The whole surah is drawn inside that span - the ayahs
// between that have not been reached yet are kept, so the page reads as a
// page and not as a list with holes in it - but the span itself ends where
// the reciter has got to. Beyond it there is nothing to recite from: the page
// would be blanks he has never learned, and every one of them would be marked
// against him.
function clampNum(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

function reciteMemorizedSpan(surah) {
  const mine = memorizedAyahsInOrder((i) => i.surah === surah);
  if (!mine.length) return null;
  return { first: mine[0].ayah, last: mine[mine.length - 1].ayah };
}

function reciteItemsForScope(scope) {
  if (scope.kind === "all") return memorizedAyahsInOrder();
  const whole = reciteSurahTextCache[scope.surah];
  const memorized = memorizedAyahsInOrder((i) => i.surah === scope.surah);
  const name = (memorized[0] && memorized[0].surahName) || surahDisplayName(scope.surah);
  // The span is the ceiling and the floor, whatever the range asks for.
  const span = reciteMemorizedSpan(scope.surah);
  const lo = Math.max(scope.from == null ? -Infinity : scope.from, span ? span.first : -Infinity);
  const hi = Math.min(scope.to == null ? Infinity : scope.to, span ? span.last : Infinity);
  const inRange = (n) => n >= lo && n <= hi;
  if (whole) {
    return whole
      .filter((a) => inRange(a.numberInSurah))
      .map((a) => state.ayahs[`${scope.surah}:${a.numberInSurah}`]
        || { surah: scope.surah, ayah: a.numberInSurah, surahName: name, text: a.text, notInPlan: true });
  }
  return memorized.filter((i) => inRange(i.ayah));
}

// Fetched once per surah and kept for the session. Falls back silently to
// what the plan holds - offline, the memorized ayahs are all there is, and
// a page of those is better than no page.
async function loadReciteSurahText(surah) {
  if (reciteSurahTextCache[surah]) return;
  try {
    const ayahs = await fetchSurahAyahs(surah);
    if (Array.isArray(ayahs) && ayahs.length) reciteSurahTextCache[surah] = ayahs;
  } catch (e) { /* the plan's own ayahs stand in */ }
}

function renderReciteEntry() {
  const entry = document.getElementById("recite-entry");
  const btn = document.getElementById("btn-open-recite");
  if (!entry || !btn) return;
  const n = memorizedAyahsInOrder().length;
  // Nothing to recite from is not an empty page, it is a confusing one.
  entry.classList.toggle("hidden", n < 3 || !voiceSupported() || reviewSessionOpen());
  btn.innerHTML = iconLabel("mic", `سمِّع على الصفحة (${n})`);
}

// A drill is running on this page. The ways in belong to the page you land
// on, not over the top of the ayah you are in the middle of answering - and
// the challenge in particular is a fixed run of five that nothing should
// offer to leave halfway.
function hideReviewEntries() {
  ["tasmee-entry", "seam-entry", "recite-entry"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
}

function reviewSessionOpen() {
  const session = document.getElementById("review-session");
  return isChallengeMode || (!!session && !session.classList.contains("hidden"));
}

function openReciteSession(preset) {
  if (!voiceSupported()) {
    showToast("متصفّحك لا يدعم الاستماع — جرّب كروم على أندرويد أو سفاري على آيفون.", "error");
    return;
  }
  if (memorizedAyahsInOrder().length < 1) {
    showToast("احفظ آيةً واحدة على الأقل ليكون على الصفحة ما يُسمَّع.", "error");
    return;
  }
  reciteScope = preset || { kind: "all", surah: null, from: null, to: null };
  document.getElementById("recite-overlay").classList.remove("modal-closed");
  showReciteSetup();
  if (reciteScope.kind === "surah") loadReciteSurahText(reciteScope.surah).then(renderReciteScope);
}

// Which ayah of the plan the pointer is standing in.
function currentReciteAyahIndex() {
  const at = reciteFlat[recitePointer];
  return at ? at.ai : recitePlan.length;
}

// How many whole ayahs have been recited since this page was opened.
function reciteAyahsRead() {
  if (!recitePlan.length) return 0;
  return Math.max(0, currentReciteAyahIndex() - reciteStartAyah);
}

// The phone's back button, in three steps - because "back" from here means
// three different places depending on where you are:
//
//   on the page, an ayah or more recited  -> ask: keep the place, or leave
//   on the page, nothing recited yet      -> back to choosing what to recite
//   on the choosing screen                -> out, to the review page
//
// Reading half a surah and losing it to a stray back press is the one thing
// this page could do that would make it not worth opening.
function reciteBackPressed() {
  const body = document.getElementById("recite-body");
  const onPage = body && !body.classList.contains("hidden");
  if (!onPage) { closeReciteSession(); return; }
  if (reciteAyahsRead() < 1) {
    stopReciteListening();
    showReciteSetup();
    return;
  }
  askToKeepRecitePlace();
}

// The ✕ is an explicit leaving, so it does not step back through the
// screens - but it still does not throw the place away without asking.
function reciteClosePressed() {
  const body = document.getElementById("recite-body");
  const onPage = body && !body.classList.contains("hidden");
  if (onPage && reciteAyahsRead() >= 1) { askToKeepRecitePlace(); return; }
  closeReciteSession();
}

function askToKeepRecitePlace() {
  stopReciteListening();
  const read = reciteAyahsRead();
  const at = recitePlan[currentReciteAyahIndex()] || recitePlan[recitePlan.length - 1];
  showChoiceModal(
    "قبل أن تخرج",
    `قرأتَ ${ayahCountLabel(read)}. أتحفظ موضعك عند ${at.surahName} : ${at.ayah} لتُكمل منه، أم تخرج؟`,
    { label: "احفظ موضعي واخرج", onPick: () => { saveRecitePlace(); closeReciteSession(); } },
    { label: "اخرج بلا حفظ", onPick: () => closeReciteSession() }
  );
}

function closeReciteSession() {
  stopReciteListening();
  document.getElementById("recite-overlay").classList.add("modal-closed");
  recitePlan = [];
  reciteFlat = [];
  recitePointer = 0;
  reciteStumbles = new Set();
  recitePeeked = new Set();
  clearReciteAlert();
}

function showReciteSetup() {
  document.getElementById("recite-setup").classList.remove("hidden");
  document.getElementById("recite-body").classList.add("hidden");
  document.getElementById("recite-actions").classList.add("hidden");
  document.getElementById("recite-summary").classList.add("hidden");
  document.getElementById("recite-position").textContent = "";
  renderReciteScope();
}

function renderReciteScope() {
  const box = document.getElementById("recite-scope");
  if (!box) return;
  const surahs = recitableSurahs();
  const all = memorizedAyahsInOrder().length;
  box.innerHTML = "";

  const addBtn = (label, sub, active, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `recite-scope-btn${active ? " active" : ""}`;
    b.innerHTML = `<span class="recite-scope-name">${label}</span><span class="recite-scope-sub">${sub}</span>`;
    b.addEventListener("click", onClick);
    box.appendChild(b);
  };

  addBtn("كلّ ما حفظت", ayahCountLabel(all), reciteScope.kind === "all", () => {
    reciteScope = { kind: "all", surah: null, from: null, to: null };
    renderReciteScope();
  });
  surahs.forEach((s) => {
    addBtn(s.name, ayahCountLabel(s.count), reciteScope.kind === "surah" && reciteScope.surah === s.surah, () => {
      const span = reciteMemorizedSpan(s.surah);
      reciteScope = { kind: "surah", surah: s.surah, from: span ? span.first : 1, to: span ? span.last : null };
      renderReciteScope();
      loadReciteSurahText(s.surah).then(renderReciteScope);
    });
  });

  // The range only means anything inside one surah.
  const range = document.getElementById("recite-range");
  range.classList.toggle("hidden", reciteScope.kind !== "surah");
  if (reciteScope.kind === "surah") {
    const span = reciteMemorizedSpan(reciteScope.surah) || { first: 1, last: surahAyahCount(reciteScope.surah) || 1 };
    const from = document.getElementById("recite-from");
    const to = document.getElementById("recite-to");
    from.min = to.min = span.first;
    from.max = to.max = span.last;
    reciteScope.from = clampNum(reciteScope.from || span.first, span.first, span.last);
    reciteScope.to = clampNum(reciteScope.to || span.last, reciteScope.from, span.last);
    from.value = reciteScope.from;
    to.value = reciteScope.to;
    // Said plainly rather than left to be discovered by a number that refuses
    // to go higher.
    const note = document.getElementById("recite-range-note");
    if (note) {
      const total = surahAyahCount(reciteScope.surah);
      const partial = total && span.last < total;
      note.textContent = partial ? `تنتهي السورة عندك عند الآية ${span.last} من ${total}.` : "";
      note.classList.toggle("hidden", !partial);
    }
  }
  updateReciteCount();
}

function updateReciteCount() {
  const el = document.getElementById("recite-count");
  const items = reciteItemsForScope(reciteScope);
  const words = items.reduce((n, i) => n + quranWords(i.text).length, 0);
  el.textContent = items.length
    ? `${ayahCountLabel(items.length)} · ${words} كلمة`
    : "لا آيات في هذا النطاق.";
  document.getElementById("btn-recite-start").disabled = items.length === 0;

  // Where it was left off, offered rather than imposed.
  const resume = document.getElementById("recite-resume");
  const place = reciteScope.kind === "surah" ? recitePlaceFor(reciteScope.surah) : null;
  const inRange = place && items.some((i) => i.ayah === place);
  resume.classList.toggle("hidden", !inRange);
  if (inRange) {
    resume.innerHTML = "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn recite-resume-btn";
    btn.textContent = `تابِع من الآية ${place}`;
    btn.addEventListener("click", () => startRecitePage({ fromAyah: place }));
    resume.appendChild(btn);
  }
}

// The ayah the reciting had got to when it was last saved for this surah.
function recitePlaceFor(surah) {
  return (state.recitePlace || {})[String(surah)] || null;
}

function saveRecitePlace() {
  const cur = reciteFlat[recitePointer] || reciteFlat[reciteFlat.length - 1];
  if (!cur) return;
  const a = recitePlan[cur.ai];
  state.recitePlace = state.recitePlace || {};
  state.recitePlace[String(a.surah)] = a.ayah;
  saveState();
  showToast(`💾 حُفظ موضعك: ${a.surahName} : ${a.ayah}`, "success",
    "تفتح السورة من هنا في المرّة القادمة.");
}

function startRecitePage(opts) {
  const items = reciteItemsForScope(reciteScope);
  if (!items.length) return;
  recitePlan = items.map((i) => ({
    key: `${i.surah}:${i.ayah}`,
    surah: i.surah,
    ayah: i.ayah,
    surahName: i.surahName || `سورة ${i.surah}`,
    words: quranWords(i.text),
    notInPlan: !!i.notInPlan,
  }));
  reciteFlat = [];
  reciteAyahStart = [];
  recitePlan.forEach((a, ai) => {
    reciteAyahStart[ai] = reciteFlat.length;
    a.words.forEach((w, wi) => reciteFlat.push({ w, ai, wi }));
  });
  recitePointer = 0;
  reciteStumbles = new Set();
  recitePeeked = new Set();
  clearReciteAlert();
  reciteSeenWords = [];
  reciteFinalSegments = [];
  reciteFinalWords = [];
  reciteFinalDone = 0;

  // Carrying on from a saved place puts the pointer there; everything before
  // it stands written, because it was recited - on an earlier evening.
  const fromAyah = opts && opts.fromAyah;
  if (fromAyah) {
    const at = recitePlan.findIndex((a) => a.ayah === fromAyah);
    if (at > 0) recitePointer = reciteAyahStart[at];
  }
  reciteStartAyah = currentReciteAyahIndex();

  document.getElementById("recite-setup").classList.add("hidden");
  document.getElementById("recite-summary").classList.add("hidden");
  document.getElementById("recite-body").classList.remove("hidden");
  document.getElementById("recite-actions").classList.remove("hidden");
  renderRecitePage();
  setReciteStatus("اضغط الميكروفون واقرأ من حفظك.");
  updateReciteMic();
}

// The page. Every word is a slot as wide as the word it is waiting for, so
// the shape of the ayah - and how much of it is left - is visible before a
// single word has been said.
//
// And the ayahs run on, as they do in the Mushaf: not one to a line, but one
// after another in justified lines with the ۝ between them. A page with an
// ayah per row is a list, and nobody memorizes from a list - the shape of
// the line, and which word sits where on it, is half of what the eye keeps.
// Where an ayah's word sits in the flattened list - worked out from the
// plan rather than searched for, since the rendering walks the same order.
let reciteAyahStart = [];
function reciteIndexOfFlat(ai, wi) { return reciteAyahStart[ai] + wi; }

function renderRecitePage() {
  const page = document.getElementById("recite-page");
  page.innerHTML = "";
  reciteSlotEls = new Array(reciteFlat.length);
  recitePainted = -1;
  let lastSurah = null;
  recitePlan.forEach((a, ai) => {
    if (a.surah !== lastSurah) {
      const head = document.createElement("div");
      head.className = "recite-surah-head";
      head.textContent = a.surahName;
      page.appendChild(head);
      lastSurah = a.surah;
    }
    // display:contents - the wrapper groups the ayah for the code without
    // taking a box of its own, so its words join the line that is running.
    const run = document.createElement("span");
    run.className = `recite-ayah${a.notInPlan ? " recite-outside" : ""}`;
    run.dataset.ai = String(ai);
    a.words.forEach((w, wi) => {
      const slot = document.createElement("span");
      slot.className = "recite-slot";
      slot.dataset.ai = String(ai);
      slot.dataset.wi = String(wi);
      // The blank keeps the word's own width without showing it: the letters
      // are there, invisible, and a rule is drawn under them.
      slot.innerHTML = `<span class="recite-word">${w}</span>`;
      const flatIdx = reciteIndexOfFlat(ai, wi);
      reciteSlotEls[flatIdx] = slot;
      // Behind the pointer, the engine is not the judge: a word it failed to
      // hear can be put right by the one person who knows whether it was
      // said - tapping takes the mark off, and tapping again puts it back.
      //
      // Ahead of it, the same tap uncovers. Forgetting where an ayah starts
      // is the ordinary way a recitation stops, and the cure is one word, not
      // the page: tapping the blank shows the word that belongs in it.
      slot.addEventListener("click", () => {
        if (flatIdx < recitePointer) {
          if (reciteStumbles.has(flatIdx)) reciteStumbles.delete(flatIdx);
          else reciteStumbles.add(flatIdx);
          slot.dataset.state = "";
          paintSlot(flatIdx);
          return;
        }
        const refused = peekReciteWord(flatIdx);
        if (refused) setReciteAlert(`peek-refused:${flatIdx}`, refused);
        else clearReciteAlert();
      });
      run.appendChild(slot);
      // A real space, not a margin: it is what the line breaks at and what
      // justification stretches.
      run.appendChild(document.createTextNode(" "));
    });
    const badge = document.createElement("span");
    badge.className = "ayah-number-badge recite-badge";
    badge.textContent = String(a.ayah);
    run.appendChild(badge);
    run.appendChild(document.createTextNode(" "));
    page.appendChild(run);
  });
  paintReciteAll();
}

function updateRecitePosition() {
  const cur = reciteFlat[recitePointer];
  const done = cur ? cur.ai : recitePlan.length;
  document.getElementById("recite-position").textContent = `${Math.min(done + 1, recitePlan.length)} / ${recitePlan.length}`;
}

function setReciteStatus(text) {
  const el = document.getElementById("recite-status");
  if (el) el.textContent = text;
}

// Writes everything up to the pointer, marking whatever was passed over
// without being said. Called after every recognition result, so it has to be
// cheap: it only touches the slots whose state actually changed.
// Painting has to be cheap, because it runs on every interim result the
// engine emits - several a second while someone is reciting. It used to walk
// every slot on the page and re-run a smooth scrollIntoView each time, which
// on a long page (a whole surah, or everything memorized) is thousands of
// nodes a second and a scroll animation restarted before it ever arrives.
// That was the lag: not the recognition, the drawing.
//
// So the slots are held in an array laid out like reciteFlat, only the ones
// whose state actually changed are touched, and the page is scrolled only
// when the place being written has left the screen - in one jump, not an
// animation that is cancelled a moment later.
let reciteSlotEls = [];
let recitePainted = -1;

function slotState(idx) {
  if (idx < recitePointer) return reciteStumbles.has(idx) ? "missed" : "said";
  return idx === recitePointer ? "next" : "waiting";
}

function paintSlot(idx) {
  const el = reciteSlotEls[idx];
  if (!el) return;
  const st = slotState(idx);
  // A word shown on request keeps the marker it had - it is still the place
  // the reciter is at - and only stops being blank.
  const peek = idx >= recitePointer && recitePeeked.has(idx);
  const key = peek ? `${st}~peek` : st;
  if (el.dataset.state === key) return;
  el.dataset.state = key;
  el.className = `recite-slot recite-${st}${peek ? " recite-peek" : ""}`;
}

// Uncovers one word. What may be uncovered is bounded by the ayah the reciter
// is inside: a word he cannot call to mind is one word away from him, and
// uncovering the page beyond that is not remembering, it is reading.
// Returns why not, when it will not.
function peekReciteWord(flatIdx) {
  const slot = reciteFlat[flatIdx];
  if (!slot) return "";
  if (slot.ai !== currentReciteAyahIndex()) return "لا تُكشف إلّا كلمات الآية التي أنت فيها.";
  recitePeeked.add(flatIdx);
  paintSlot(flatIdx);
  return "";
}

// Several results can land inside one frame; the page only needs drawing
// once for all of them.
let recitePaintQueued = false;
function paintRecitePage() {
  if (recitePaintQueued) return;
  recitePaintQueued = true;
  requestAnimationFrame(() => { recitePaintQueued = false; paintReciteNow(); });
}

// A freshly drawn page has no state on any slot, and the incremental paint
// only ever touches the range around the pointer - so everything past it was
// left with no class at all, which is the one state that shows the word.
// The page opened fully written. A full render paints every slot once; after
// that the cheap path takes over.
function paintReciteAll() {
  recitePaintQueued = false;
  for (let i = 0; i < reciteSlotEls.length; i++) paintSlot(i);
  recitePainted = recitePointer;
  updateRecitePosition();
}

function paintReciteNow() {
  if (!reciteSlotEls.length) return;
  // Everything between the last painted position and this one, plus the slot
  // that was carrying the marker before.
  const from = Math.max(0, Math.min(recitePainted, recitePointer) - 1);
  const to = Math.min(reciteSlotEls.length - 1, Math.max(recitePainted, recitePointer));
  for (let i = from; i <= to; i++) paintSlot(i);
  recitePainted = recitePointer;

  const next = reciteSlotEls[recitePointer];
  const body = document.getElementById("recite-body");
  if (next && body) {
    const nb = next.getBoundingClientRect();
    const bb = body.getBoundingClientRect();
    // Only when it has actually gone out of sight - a scroll on every word
    // is what made the page feel like it was chasing the reciter.
    if (nb.bottom > bb.bottom - 40 || nb.top < bb.top + 40) {
      body.scrollTop += (nb.top - bb.top) - bb.height * 0.4;
    }
  }
  updateRecitePosition();
}

// Advances the pointer over a spoken word. Returns true if it was placed.
//
// A word that is not the next one is looked for a few words ahead before it
// is given up on: the engine drops words constantly, and a reciter who says
// four words while it hears three must not be stopped by it. Anything it
// cannot place at all is ignored rather than counted against him - it is far
// more often the engine mishearing than the reciter inventing.
// Advances the pointer over what was spoken at words[i]. Returns how many
// spoken tokens it used, or 0 if it could not place any.
//
// Three shapes are recognized, in order of how ordinary they are:
//   one token for one word       - the usual case
//   one token for TWO words      - the engine ran them together, which it
//                                  does at an إدغام: «قُلُوبِهِم مَّرَضٌ» comes
//                                  back as one sound, and مَرَض was being
//                                  marked as skipped over a word the reciter
//                                  had plainly said
//   several tokens for one word  - the fawatih, spelled out as letters
//
// A word that is not the next one is looked for a few words ahead before any
// of this: the engine drops words constantly, and a reciter who says four
// words while it hears three must not be stopped by it. Anything that cannot
// be placed at all is ignored rather than counted against him - it is far
// more often the engine mishearing than the reciter inventing.
// How many words, said one after another from words[i], match the page one
// after another from idx. This is what tells a repetition from a jump: the
// same words in two places are told apart by how much of what follows agrees
// with each of them.
function reciteRunLength(words, i, idx) {
  let n = 0;
  while (n < RECITE_RUN_CAP && i + n < words.length && reciteFlat[idx + n] &&
         answerMatchesQuranWord(words[i + n], reciteFlat[idx + n].w)) n++;
  return n;
}

// What was said a moment ago, said again.
//
// The engine re-sends: an interim guess arrives whole on every result, the
// same words arrive once more renumbered when the guess is finalized, and the
// tail of a breath is re-emitted as a segment of its own. All of it is words
// already placed, arriving a second time - and in ٱلْفَاتِحَة «ٱلرَّحْمَٰنِ ٱلرَّحِيمِ»
// closes the basmala and is also the whole of the third ayah, so a repeat was
// being read as a jump forward: the third ayah written and «ٱلْحَمْدُ لِلَّهِ رَبِّ
// ٱلْعَٰلَمِينَ» marked as passed over, an ayah the reciter had not reached.
//
// A repeat is recognized by where it ENDS: it re-says the words that lead up
// to where the reciter now stands, and stops there. That is what tells it
// from a leap forward, and from an earlier place the same words happen to
// sit - «فَبِأَىِّ ءَالَآءِ رَبِّكُمَا تُكَذِّبَانِ» comes round every few ayahs in
// ٱلرَّحْمَٰن, and the one before this ayah is a place the reciter has left, not
// an echo of the breath he is in.
//
// Returns how many spoken words the repeat covers, or 0.
function reciteEchoRun(st, words, i) {
  const left = words.length - i;
  const floor = Math.max(0, st.pointer - RECITE_LOOKBEHIND);
  for (let idx = st.pointer - 1; idx >= floor; idx--) {
    const need = st.pointer - idx;   // it has to run all the way to the pointer
    if (need > left) break;          // and there is no longer enough of it left
    let n = 0;
    while (n < need && reciteFlat[idx + n] &&
           answerMatchesQuranWord(words[i + n], reciteFlat[idx + n].w)) n++;
    if (n === need) return need;
  }
  return 0;
}

function placeRecitedWords(st, words, i) {
  const said = words[i];

  for (let ahead = 0; ahead <= RECITE_LOOKAHEAD; ahead++) {
    const idx = st.pointer + ahead;
    const slot = reciteFlat[idx];
    if (!slot) break;
    let span = 0;    // words of the page this takes
    let used = 0;    // tokens of the speech it took
    if (answerMatchesQuranWord(said, slot.w)) { span = 1; used = 1; }
    else {
      const next = reciteFlat[idx + 1];
      if (next && answerMatchesQuranWord(said, `${slot.w} ${next.w}`.replace(/\s+/g, ""))) { span = 2; used = 1; }
      else {
        const spelled = spelledLettersMatch(words, i, slot.w);
        if (spelled) { span = 1; used = spelled; }
      }
    }
    if (!span) continue;
    st.placed = (st.placed || 0) + 1;
    // Found ahead of the pointer - which means the words in between would be
    // written off as skipped. Before doing that, look behind: if as much of
    // what was said fits where the reciter already is, he is repeating
    // himself rather than leaping ahead, and nothing should be marked.
    if (ahead > 0) {
      const echo = reciteEchoRun(st, words, i);
      if (echo && echo >= reciteRunLength(words, i, idx)) return echo;
    }
    advanceRecitePointer(st, idx, span);
    return used;
  }
  // Nothing ahead. A repeat of what is behind is swallowed whole rather than
  // dropped a word at a time.
  return reciteEchoRun(st, words, i);
}

// Everything stepped over on the way was not said - that is the stumble.
function advanceRecitePointer(st, idx, span) {
  for (let k = st.pointer; k < idx; k++) {
    st.stumbles.add(k);
    if (st.skippedFrom == null) st.skippedFrom = k;
    st.skipped = (st.skipped || 0) + 1;
  }
  st.pointer = idx + span;
}

// The run also reports on itself: how much of it went nowhere, and the longest
// stretch of it in a row - which is what tells a word the engine mangled from
// speech that is not on this page at all.
//
// It adds to what is already on the state rather than starting the tally
// over: one result can carry a finished segment AND the interim after it, and
// both are the same breath as far as judging it goes.
function placeReciteRun(st, words) {
  let stray = 0;
  let strayFrom = 0;
  for (let i = 0; i < words.length; ) {
    const used = placeRecitedWords(st, words, i);
    if (used) {
      stray = 0;
      i += used;
    } else {
      if (!stray) strayFrom = i;
      stray++;
      if (stray > (st.strayRun || 0)) {
        st.strayRun = stray;
        st.strayAt = strayFrom;
        st.strayWords = words;
      }
      i += 1;
    }
  }
  return st;
}

// The transcript arrives whole and re-arrives whole, a little longer each
// time. What is new is whatever comes after the part that has not changed -
// and it is compared that way rather than by length, because a live engine
// revises the tail it has not committed to yet, and a revision that made the
// text shorter would otherwise leave the page stuck where it stood.
//
// Only the CURRENT session's text is handed in. Everything the engine
// finalized before the last pause is already placed and cannot change, so
// re-cleaning and re-splitting it on every interim result - several times a
// second, over a transcript that only grows - was work done again and again
// for an answer that was settled. A long recitation was paying for its own
// length on every word. Now the cost is the length of the breath, and a
// pause resets it.
function cleanReciteWords(text) {
  return mergeMaddSplits(mergeDetachedConjunctions(text || "")).split(/\s+/).filter(Boolean);
}

// A segment the engine has marked final will not change again, so it is
// cleaned once and kept as words, and placed once. Only the interim tail is
// re-cleaned on every result. This is what stops a long recitation from
// paying for its own length: the regexes no longer run over the whole of it
// several times a second.
function foldFinishedReciteSegments(st) {
  for (let i = reciteFinalDone; i < reciteFinalSegments.length; i++) {
    const seg = reciteFinalSegments[i];
    if (!seg) continue;
    const add = cleanReciteWords(seg);
    // A مدّ split can fall across the boundary between two segments, where
    // neither of them can see it alone.
    const last = reciteFinalWords[reciteFinalWords.length - 1];
    if (last && add.length) {
      const joined = cleanReciteWords(`${last} ${add[0]}`);
      if (joined.length === 1) { reciteFinalWords[reciteFinalWords.length - 1] = joined[0]; add.shift(); }
    }
    if (add.length) {
      placeReciteRun(st, add);
      for (const w of add) reciteFinalWords.push(w);
    }
  }
  reciteFinalDone = reciteFinalSegments.length;
}

// One place, and it only ever goes forward.
//
// It was briefly kept two ways - what the engine had committed to, and the
// interim replayed on a copy of it - so that a revised guess could not leave
// a wrong mark behind. But the engine's final word on a breath is often
// NARROWER than the interim it had been showing, and rebuilding from it threw
// away ground the reciter had actually covered: «بسم الله الرحمن الرحيم» read
// aloud settled back to «بسم الله» and stood there, waiting for words that
// had already been said.
//
// A reciter does not un-recite. So the page keeps one state, every word that
// arrives is placed on it, and the re-sending the engine does - which is what
// the two-state arrangement existed to absorb - is handled where it belongs,
// by recognizing a repeat as a repeat.
function feedReciteSession(interimText) {
  const st = {
    pointer: recitePointer, stumbles: reciteStumbles, startedAt: recitePointer,
    skipped: 0, skippedFrom: null, placed: 0,
    strayRun: 0, strayAt: -1, strayWords: null,
  };
  foldFinishedReciteSegments(st);
  placeReciteRun(st, cleanReciteWords(interimText));
  recitePointer = st.pointer;
  judgeRecitation(st);
  paintRecitePage();
  if (recitePointer >= reciteFlat.length) finishRecitePage();
}

// ── تنبيه ────────────────────────────────────────────────────────────────
//
// The page follows what is recited; it also has to be able to say when what
// is recited is not what is on it. Three things can go wrong, and they are
// not the same thing:
//
//   جاوز        words on the page were stepped over - the reciter went from
//               the first ayah into the second without saying the first
//   موضع آخر    what was said IS on the page, but somewhere else: another
//               ayah entirely, which is the one a reciter lands in when the
//               متشابه takes him
//   ليس من هنا  what was said is nowhere on the page - other speech, or an
//               ayah from a surah this page does not hold
//
// The third cannot be told apart from the engine mishearing a word or two,
// so it is only said when a whole stretch of speech goes nowhere.

const RECITE_STRAY_ALERT = 3;   // words in a row before speech counts as off
// The engine drops a word, sometimes two, on any long recitation - so a jump
// is only called a jump past where its ordinary clumsiness reaches.
const RECITE_SKIP_ALERT = 3;    // words stepped over before it counts as a jump

function setReciteAlert(key, text) {
  const el = document.getElementById("recite-alert");
  if (!el) return;
  if (reciteAlertKey === key) return;
  reciteAlertKey = key;
  el.textContent = text || "";
  el.classList.toggle("hidden", !text);
}

function clearReciteAlert() { setReciteAlert("", ""); }

// Where else on the page these words sit. A single word is worthless - half
// the page shares its words - so it takes a run of at least two, and the
// answer is the ayah, not the word.
function findReciteElsewhere(words, from) {
  const run = Math.min(3, words.length - from);
  if (run < 2) return -1;
  for (let idx = 0; idx < reciteFlat.length; idx++) {
    if (idx >= recitePointer - 1 && idx <= recitePointer + RECITE_LOOKAHEAD) continue;
    let n = 0;
    while (n < run && reciteFlat[idx + n] &&
           answerMatchesQuranWord(words[from + n], reciteFlat[idx + n].w)) n++;
    if (n === run) return idx;
  }
  return -1;
}

function judgeRecitation(st) {
  // Stepped over words on the way - said in full, because the reciter can see
  // exactly which ones are marked and this only names where to go back to.
  if (st.skipped >= RECITE_SKIP_ALERT && st.skippedFrom != null) {
    const f = reciteFlat[st.skippedFrom];
    const a = f && recitePlan[f.ai];
    if (a) {
      setReciteAlert(`skip:${st.skippedFrom}:${st.skipped}`,
        `⚠︎ تجاوزتَ ${wordCountLabel(st.skipped)} من الآية ${a.ayah} — المُعلَّم بالأحمر.`);
      return;
    }
  }
  // Speech that goes nowhere is only called that when NOTHING in the result
  // went anywhere. The engine garbles a word or three in the middle of a
  // sound recitation, and as long as the rest of the breath is landing on the
  // page the reciter is on the page - he is not to be told otherwise.
  if (st.strayRun >= RECITE_STRAY_ALERT && st.strayWords && !st.placed) {
    const at = findReciteElsewhere(st.strayWords, st.strayAt);
    if (at >= 0) {
      const there = recitePlan[reciteFlat[at].ai];
      const here = reciteFlat[recitePointer] ? recitePlan[reciteFlat[recitePointer].ai] : null;
      setReciteAlert(`elsewhere:${there.key}`,
        `⚠︎ هذا من الآية ${there.ayah}${here ? `، وموضعك الآية ${here.ayah}` : ""}.`);
    } else {
      setReciteAlert("stray", "⚠︎ ما سمعتُه ليس من هذا الموضع.");
    }
    return;
  }
  // Back on the page - and the notice goes with the trouble that raised it.
  if (st.pointer > st.startedAt) clearReciteAlert();
}

function toggleReciteListening() {
  if (reciteListening) stopReciteListening();
  else startReciteListening();
}

// The same three states the tasmee' modal has, said the same way and drawn
// the same way: green while it is hearing you, amber in the gap after a
// pause while the microphone comes back, red when it is not listening at
// all. One vocabulary - a reciter should not have to learn the button twice.
function updateReciteMic(mode) {
  const btn = document.getElementById("btn-recite-mic");
  if (!btn) return;
  const state = mode || (reciteListening ? (reciteWaking ? "resuming" : "listening") : "idle");
  // Both glyphs live in the button and swap on the same class the state
  // already toggles - the microphone to start, a stop square while it is
  // running, exactly as the tasmee' modal does it. One button, one meaning,
  // wherever it appears.
  if (!btn.querySelector("svg")) {
    btn.innerHTML = `${ICONS.mic.replace("<svg", '<svg class="mic-glyph"')}
      <svg class="stop-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2.5"/></svg>`;
  }
  btn.classList.toggle("listening", state === "listening");
  btn.classList.toggle("resuming", state === "resuming");
  btn.setAttribute("aria-label", state === "idle" ? "ابدأ التسميع" : "أوقف التسميع");
}

function startReciteListening() {
  const recognition = createVoiceRecognitionInstance();
  reciteRecognition = recognition;
  reciteListening = true;
  reciteWaking = true;
  reciteFinalSegments = [];
  reciteFinalWords = [];
  reciteFinalDone = 0;
  reciteSeenWords = [];
  updateReciteMic();
  setReciteStatus("جارٍ فتح الميكروفون…");

  recognition.onresult = (e) => {
    let interim = "";
    for (let i = 0; i < e.results.length; i++) {
      const result = e.results[i];
      const transcript = (result[0] && result[0].transcript) || "";
      if (result.isFinal) reciteFinalSegments[i] = transcript;
      else if (i >= e.resultIndex) interim += transcript;
    }
    // A plain join, not mergeVoiceSegments: that one folds every segment
    // through an LCS against everything heard so far to catch a re-heard
    // repeat, which costs more the longer the recitation gets - and it runs
    // several times a second. On a page it is not needed: the matcher only
    // ever moves forward, so a repeat finds nothing ahead of it to match and
    // is simply ignored. This is the other half of the lag.
    feedReciteSession(interim);
  };
  recognition.onaudiostart = () => {
    reciteWaking = false;
    updateReciteMic();
    setReciteStatus("أخضر — يستمع الآن. اقرأ على مهلك.");
    playListeningCue();
  };
  recognition.onaudioend = () => {
    if (!reciteListening) return;
    reciteWaking = true;
    updateReciteMic();
    setReciteStatus("توقّف… انتظر الضوء الأخضر.");
  };
  recognition.onerror = (e) => {
    if (e.error === "aborted") return;
    if (VOICE_FATAL_ERRORS.has(e.error)) {
      reciteListening = false;
      reciteWaking = false;
      updateReciteMic();
      setReciteStatus(`تعذّر الاستماع (${e.error}).`);
    }
  };
  // A pause ends the session; the page keeps its place and listening resumes
  // on the same instance, so stopping to breathe is not stopping.
  recognition.onend = () => {
    if (!reciteListening) return;
    // The session that just ended is placed and done with. Nothing of it is
    // carried forward - the pointer holds the place, which is the only part
    // of it that mattered.
    reciteFinalSegments = [];
    reciteFinalWords = [];
    reciteFinalDone = 0;
    reciteSeenWords = [];
    reciteWaking = true;
    updateReciteMic();
    attemptRecognitionStart(recognition);
  };
  attemptRecognitionStart(recognition);
}

function stopReciteListening() {
  reciteListening = false;
  reciteWaking = false;
  const recognition = reciteRecognition;
  reciteRecognition = null;
  updateReciteMic();
  if (recognition) {
    recognition.onend = null;
    try { recognition.abort(); } catch (e) { /* already stopped */ }
  }
}

// What the page produced: not a mark, a list of places to go back to.
function finishRecitePage() {
  stopReciteListening();
  // A page seen through to the end has no place left to keep. Next time this
  // surah is opened it is blank from its first ayah, which is the whole
  // point of the page - the saved place exists for the evening you stopped
  // halfway, not as a high-water mark that never comes down.
  const reachedEnd = recitePointer >= reciteFlat.length;
  if (reachedEnd && recitePlan.length) {
    const surah = recitePlan[0].surah;
    if (state.recitePlace && state.recitePlace[String(surah)] != null) {
      delete state.recitePlace[String(surah)];
      saveState();
    }
  }
  const missedAyahs = new Map();
  reciteStumbles.forEach((idx) => {
    const f = reciteFlat[idx];
    if (!f) return;
    const a = recitePlan[f.ai];
    if (!missedAyahs.has(a.key)) missedAyahs.set(a.key, { ...a, words: [] });
    missedAyahs.get(a.key).words.push(a.words[f.wi]);
  });
  // A word that had to be uncovered was not remembered, even though it was
  // then said. It is not a stumble - nothing was passed over - but it is
  // exactly what a next review should ask about, so it is counted, shown, and
  // its ayah joins the ones the review button opens.
  const peekedAyahs = new Map();
  recitePeeked.forEach((idx) => {
    const f = reciteFlat[idx];
    if (!f || idx >= recitePointer) return;
    const a = recitePlan[f.ai];
    if (!peekedAyahs.has(a.key)) peekedAyahs.set(a.key, { ...a, words: [] });
    peekedAyahs.get(a.key).words.push(a.words[f.wi]);
  });
  const reached = reciteFlat[recitePointer] ? reciteFlat[recitePointer].ai : recitePlan.length;
  const box = document.getElementById("recite-summary");
  box.classList.remove("hidden");
  document.getElementById("recite-actions").classList.add("hidden");

  const list = [...missedAyahs.values()];
  const peeks = [...peekedAyahs.values()];
  const peekWords = peeks.reduce((n, a) => n + a.words.length, 0);
  box.innerHTML = `
    <p class="recite-summary-lead">${reached >= recitePlan.length ? "🌿 أتممتَ الصفحة" : "توقّفت هنا"}</p>
    <p class="muted">قرأتَ ${ayahCountLabel(Math.min(reached, recitePlan.length))} من ${ayahCountLabel(recitePlan.length)}${
      list.length ? ` · تعثّرتَ في ${ayahCountLabel(list.length)}` : " · بلا تعثّر"
    }${peekWords ? ` · كشفتَ ${wordCountLabel(peekWords)}` : ""}.</p>
    <div class="recite-missed-list"></div>
    <div class="recite-summary-actions">
      <button class="btn" id="btn-recite-again">أعِد</button>
      <button class="btn primary${list.length || peeks.length ? "" : " hidden"}" id="btn-recite-review">راجع ما تعثّرتَ فيه</button>
    </div>`;
  const missedBox = box.querySelector(".recite-missed-list");
  const row = (a, peeked) => {
    const el = document.createElement("div");
    el.className = `recite-missed-row${peeked ? " recite-peeked-row" : ""}`;
    el.innerHTML = `<span class="recite-missed-ref">${a.surahName} : ${a.ayah}</span>
      <span class="recite-missed-words">${peeked ? "👁 " : ""}${a.words.slice(0, 4).join(" · ")}</span>`;
    missedBox.appendChild(el);
  };
  list.forEach((a) => row(a, false));
  peeks.filter((a) => !missedAyahs.has(a.key)).forEach((a) => row(a, true));
  box.querySelector("#btn-recite-again").addEventListener("click", () => startRecitePage());
  const reviewBtn = box.querySelector("#btn-recite-review");
  if (reviewBtn) {
    reviewBtn.addEventListener("click", () => {
      const keys = [...new Set([...list, ...peeks].map((a) => a.key))];
      const items = keys.map((k) => state.ayahs[k]).filter(Boolean);
      if (!items.length) return;
      closeReciteSession();
      startAyahListReview(items);
    });
  }
}

// A one-off pass over a handful of ayahs, graded as a review is graded -
// these ARE reviews, just ones the reciting asked for rather than the
// schedule.
function startAyahListReview(items) {
  switchTab("review");
  isChallengeMode = false;
  isEphemeralReview = false;
  isSingleItemReview = true;
  reviewQueue = items;
  reviewIndex = 0;
  hideReviewEntries();
  document.getElementById("challenge-banner").classList.add("hidden");
  document.getElementById("review-empty").classList.add("hidden");
  hideReviewSurahList();
  hideReviewSurahBanner();
  document.getElementById("review-session").classList.remove("hidden");
  loadReviewItem();
}

on("btn-open-recite", "click", () => openReciteSession());
on("btn-recite-close", "click", reciteClosePressed);
on("btn-recite-start", "click", () => startRecitePage());
on("btn-recite-save", "click", saveRecitePlace);
on("btn-recite-mic", "click", toggleReciteListening);
on("btn-recite-finish", "click", finishRecitePage);
// Typed in rather than nudged, a number can be anything; the span is what
// decides, both here and again where the ayahs themselves are gathered.
function reciteRangeInput(id, key) {
  on(id, "input", () => {
    const span = reciteMemorizedSpan(reciteScope.surah);
    const raw = Number(document.getElementById(id).value);
    if (!raw) return;                       // mid-typing, an empty box
    reciteScope[key] = span ? clampNum(raw, span.first, span.last) : raw;
    updateReciteCount();
  });
  on(id, "change", () => {
    const el = document.getElementById(id);
    const span = reciteMemorizedSpan(reciteScope.surah);
    const raw = Number(el.value) || (span ? span.first : 1);
    reciteScope[key] = span ? clampNum(raw, span.first, span.last) : raw;
    if (reciteScope.to != null && reciteScope.from != null && reciteScope.to < reciteScope.from) {
      if (key === "from") reciteScope.to = reciteScope.from;
      else reciteScope.from = reciteScope.to;
    }
    renderReciteScope();
  });
}
reciteRangeInput("recite-from", "from");
reciteRangeInput("recite-to", "to");

function openSeamSession() {
  const seams = memorizedSeams();
  if (seams.length < 4) {
    showToast("احفظ آيات متتالية أكثر أولًا — التمرين يحتاج مفاصل يختار من بينها.", "error");
    return;
  }
  // "both" needs an ayah with a memorized neighbour on each side, so it is
  // only offered where one exists; the other two need only the seam itself.
  seamQueue = shuffleArray(seams).slice(0, SEAM_QUESTION_COUNT).map((seam) => {
    const before = state.ayahs[`${seam.from.surah}:${seam.from.ayah - 1}`];
    const canBoth = before && before.learningStage === "srs" && !before.temporary;
    const choices = canBoth ? SEAM_DIRECTIONS : ["forward", "backward"];
    return { ...seam, before, direction: choices[Math.floor(Math.random() * choices.length)] };
  });
  seamIndex = 0;
  seamPartIndex = 0;
  seamTally = { right: 0, wrong: 0 };
  document.getElementById("seam-overlay").classList.remove("modal-closed");
  renderSeamQuestion();
}

function closeSeamSession() {
  document.getElementById("seam-overlay").classList.add("modal-closed");
  const done = seamTally.right + seamTally.wrong;
  if (!done) return;
  const earned = seamTally.right * POINTS.seamCorrect;
  if (earned) addPoints(earned);
  showToast(
    `🔗 وصلت ${seamTally.right} من ${done} مفصلًا`,
    seamTally.wrong ? undefined : "success",
    earned ? `+${pointsText(earned)}` : undefined
  );
  renderSeamEntry();
  renderDashboard();
}

// Four options for one question: the right answer and three openings (or
// endings) of other memorized ayahs - a plausible neighbour, not a random
// phrase - preferring the same surah, where the confusion actually lives.
function seamDistractors(correct, excludeKeys, sameSurah, take) {
  const pool = Object.values(state.ayahs).filter(
    (i) => i.learningStage === "srs" && !i.temporary && !excludeKeys.has(`${i.surah}:${i.ayah}`)
  );
  const seen = new Set([normalizeArabic(correct)]);
  const out = [];
  shuffleArray(pool.filter((i) => i.surah === sameSurah))
    .concat(shuffleArray(pool.filter((i) => i.surah !== sameSurah)))
    .forEach((i) => {
      if (out.length >= 3) return;
      const phrase = take(i);
      const n = normalizeArabic(phrase);
      if (seen.has(n)) return;
      seen.add(n);
      out.push(phrase);
    });
  return out;
}

// The one or two questions this seam asks, in the order they are asked.
// Each carries the ayah it shows, what it wants, and how to find it.
function seamParts(seam) {
  const forward = {
    key: "forward",
    shown: seam.from,
    question: "وبِمَ تبدأ الآية التي بعدها؟",
    correct: ayahOpening(seam.to),
    answerKey: `${seam.to.surah}:${seam.to.ayah}`,
    take: ayahOpening,
    suffix: " …",
    trail: `${seam.from.ayah} ← ${seam.to.ayah}`,
  };
  const backward = {
    key: "backward",
    shown: seam.to,
    question: "وبِمَ خُتمت الآية التي قبلها؟",
    correct: ayahEnding(seam.from),
    answerKey: `${seam.from.surah}:${seam.from.ayah}`,
    take: ayahEnding,
    suffix: "",
    prefix: "… ",
    trail: `${seam.from.ayah} ← ${seam.to.ayah}`,
  };
  if (seam.direction === "forward") return [forward];
  if (seam.direction === "backward") return [backward];
  // Both, about one ayah: what ended the one before it, then what opens the
  // one after. That is the join known from both sides rather than one.
  return [
    {
      ...backward,
      shown: seam.from,
      correct: ayahEnding(seam.before),
      answerKey: `${seam.before.surah}:${seam.before.ayah}`,
      trail: `${seam.before.ayah} ← ${seam.from.ayah}`,
    },
    { ...forward, shown: seam.from },
  ];
}

let seamPartIndex = 0;

function renderSeamQuestion() {
  const seam = seamQueue[seamIndex];
  if (!seam) return closeSeamSession();
  seamAnswered = false;
  const parts = seamParts(seam);
  const part = parts[seamPartIndex] || parts[0];
  const shown = part.shown;

  document.getElementById("seam-position").textContent =
    `المفصل ${seamIndex + 1} من ${seamQueue.length}${parts.length > 1 ? ` · ${seamPartIndex + 1} من ${parts.length}` : ""}`;
  document.getElementById("seam-ref").textContent = `${shown.surahName} - الآية ${shown.ayah}`;
  const cue = ayahCue(shown);
  document.getElementById("seam-cue").textContent = cue.text;
  document.getElementById("seam-cue-label").textContent = cue.whole ? "هذه الآية…" : "أوّل هذه الآية وآخرها…";
  document.querySelector(".seam-question").textContent = part.question;
  document.getElementById("seam-feedback").classList.add("hidden");
  document.getElementById("btn-seam-next").classList.add("hidden");

  const exclude = new Set([part.answerKey, `${shown.surah}:${shown.ayah}`]);
  const distractors = seamDistractors(part.correct, exclude, shown.surah, part.take);

  const box = document.getElementById("seam-options");
  box.innerHTML = "";
  shuffleArray([part.correct, ...distractors]).forEach((phrase) => {
    const btn = document.createElement("button");
    btn.className = "btn seam-option";
    btn.textContent = `${part.prefix || ""}${phrase}${part.suffix || ""}`;
    btn.addEventListener("click", () => answerSeam(btn, phrase === part.correct, part.correct, part));
    box.appendChild(btn);
  });
}

function answerSeam(btn, isCorrect, correct, part) {
  if (seamAnswered) return;
  seamAnswered = true;
  const seam = seamQueue[seamIndex];
  const label = `${part.prefix || ""}${correct}${part.suffix || ""}`;
  document.querySelectorAll("#seam-options .seam-option").forEach((b) => {
    b.disabled = true;
    if (b.textContent === label) b.classList.add("correct");
  });
  if (isCorrect) {
    btn.classList.add("correct");
    seamTally.right++;
    playSuccessSound();
  } else {
    btn.classList.add("wrong");
    seamTally.wrong++;
    playErrorSound();
  }
  const feedback = document.getElementById("seam-feedback");
  feedback.textContent = `${seam.from.surahName}: ${part.trail}`;
  feedback.classList.remove("hidden");
  // A two-sided seam is not finished until its other side is asked.
  const more = seamPartIndex + 1 < seamParts(seam).length;
  const last = !more && seamIndex + 1 >= seamQueue.length;
  const next = document.getElementById("btn-seam-next");
  next.innerHTML = iconLabel(last ? "checkDone" : "chevronLeft",
    last ? "أنهِ التمرين" : more ? "والجهة الأخرى" : "المفصل التالي");
  next.classList.remove("hidden");
}

on("btn-seam-next", "click", () => {
  const seam = seamQueue[seamIndex];
  if (seam && seamPartIndex + 1 < seamParts(seam).length) {
    seamPartIndex++;
    renderSeamQuestion();
    return;
  }
  seamPartIndex = 0;
  seamIndex++;
  if (seamIndex >= seamQueue.length) closeSeamSession();
  else renderSeamQuestion();
});
on("btn-seam-close", "click", closeSeamSession);
on("btn-open-seam", "click", openSeamSession);

function renderTasmeeEntry() {
  const entry = document.getElementById("tasmee-entry");
  if (entry) entry.classList.toggle("hidden", getTodaysReviewQueue().length === 0 || reviewSessionOpen());
  renderSeamEntry();
  renderReciteEntry();
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

on("btn-share-progress", "click", shareProgress);
on("btn-open-tasmee", "click", openTasmeeSession);
on("btn-tasmee-close", "click", closeTasmeeSession);
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
  renderReciteEntry();
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
  hideReviewEntries();
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
  renderSimilarButton("btn-review-similar", item.surah, item.ayah);

  currentWords = quranWords(item.text);
  // Opens masked: showing the whole ayah and then asking "how well did you
  // remember it?" was asking about a recall that never happened.
  maskLevel = 1;
  // A suggestion belongs to the recitation it was measured from, so it must
  // not survive into the next ayah - which is uncovered by hand and has no
  // measurement behind it.
  clearGradeSuggestion();
  renderMaskedText();
  // After the text, not before it: drawing the masked ayah resets the
  // question row along with the word choices, so a neighbour question raised
  // ahead of it was created and then wiped in the same breath - which is why
  // it never actually appeared in a session.
  askReviewNeighbour(item);

  const audio = document.getElementById("review-audio");
  audio.src = audioSrcFor(item.globalNumber);

  // Sticky across the queue: turning the mode on once should carry through
  // the whole session rather than being re-chosen at every ayah.
  listenPrimed = false;
  listenCutAt = null;
  renderListenButton();
  const startListening = () => {
    if (listenModeOn() && listenSuitsAyah(item.text)) primeListening();
    else applyListenVeil();
  };
  // A join question asked first means first: the reciter waits for it rather
  // than playing the opening underneath it.
  if (reviewNeighbourParts.length) reviewNeighbourThen = startListening;
  else startListening();

  fitReviewAyahHeight();
  scheduleAnswerDockUpdate();
  closeInfoModal();
}

// ---------- The neighbours, asked inside the review ----------
//
// Completing the ayah is one thing to know about it and not the only one:
// where it sits is another, and an ayah known perfectly on its own is still
// lost if nothing says what came before it. So a review sometimes opens with
// its join instead - what ended the one before, what opens the one after, or
// both - and then goes on to the ayah as usual. Sometimes, not always: the
// review's own work is recalling the ayah, and a question in front of every
// single one would be a toll rather than a variation.
const REVIEW_NEIGHBOUR_CHANCE = 0.3;

let reviewNeighbourParts = [];
let reviewNeighbourIndex = 0;
// The challenge's own tally of the join questions, kept apart from the ayah
// gradings so the result can say what each half went like.
let challengeNeighbourRight = 0;
let challengeNeighbourTotal = 0;
// What to do once the join has been answered - in listen mode, starting the
// reciter, which must not begin under a question about where the ayah sits.
let reviewNeighbourThen = null;

// "قبل أن تسترجعها" has to mean it. While a join question is standing, the
// ayah underneath is out of reach: its hidden words cannot be tapped, the
// grading is not offered, and the mask and audio controls are put away -
// otherwise the whole question can be walked past by answering the words
// below it and grading, which is exactly what happened.
function setNeighbourBlock(on) {
  const session = document.getElementById("review-session");
  if (session) session.classList.toggle("neighbour-pending", on);
  if (on) closeReviewChoice();
}

// While the join is being asked, the ayah is shown whole.
//
// Asking "what comes after this one" over an ayah with half its words hidden
// is asking about an ayah the person cannot identify - and among the
// mutashabihat, or on a short ayah, the few words left visible name nothing
// at all. So the text is uncovered for the question and covered again the
// moment it is answered: what is being tested here is the join, not the
// recall, and the recall is still waiting untouched underneath.
let keepNeighbourWhileRendering = false;
function renderAyahForNeighbour(reveal) {
  const saved = maskLevel;
  keepNeighbourWhileRendering = true;
  if (reveal) maskLevel = 0;
  renderMaskedText();
  maskLevel = saved;
  keepNeighbourWhileRendering = false;
}

// Puts the hint and the grading back to whatever the ayah's own state says,
// without redrawing it - redrawing would clear the words already uncovered.
function refreshReviewGate() {
  const text = document.getElementById("review-text");
  if (!text) return;
  const stillHidden = text.querySelectorAll(".word.masked").length;
  makeRevealGate({
    scrollId: "review-ayah-scroll",
    actionsId: "grade-controls",
    hintId: "review-reveal-hint",
    fit: fitReviewAyahHeight,
    ask: maskLevel > 0,
  })(stillHidden, null);
  // The veil has its own claim on the grading: it comes after the recall,
  // not before it.
  if (listenModeOn() && listenPrimed) document.getElementById("grade-controls").classList.add("hidden");
}

function memorizedNeighbour(item, offset) {
  const other = state.ayahs[`${item.surah}:${item.ayah + offset}`];
  return other && other.learningStage === "srs" && !other.temporary ? other : null;
}

function hideReviewNeighbour() {
  reviewNeighbourParts = [];
  reviewNeighbourIndex = 0;
  reviewNeighbourThen = null;
  setNeighbourBlock(false);
  const box = document.getElementById("review-neighbour");
  if (box) box.classList.add("hidden");
}

// Answered through to the end: the ayah is handed back, and whatever was
// waiting on the question - the reciter, in listen mode - goes ahead.
function finishReviewNeighbour() {
  const after = reviewNeighbourThen;
  const wasRevealed = !(listenModeOn() && listenPrimed);
  hideReviewNeighbour();
  // Covered again at its own mask level, so the recall that was always the
  // point of the review is still to come.
  if (wasRevealed) renderMaskedText();
  refreshReviewGate();
  if (after) after();
}

function askReviewNeighbour(item) {
  hideReviewNeighbour();
  // In the daily challenge it is not a variation but part of the test: the
  // challenge asks what is missing from the ayah, and where the ayah sits is
  // the other half of knowing it. So every ayah with a memorized neighbour
  // gets the question, and the answers are counted into the result.
  if (!isChallengeMode && Math.random() > REVIEW_NEIGHBOUR_CHANCE) return;
  const before = memorizedNeighbour(item, -1);
  const after = memorizedNeighbour(item, 1);
  if (!before && !after) return;

  // Both only when both sides are actually there; otherwise whichever is.
  const options = [];
  if (before) options.push("backward");
  if (after) options.push("forward");
  if (before && after) options.push("both");
  const pick = options[Math.floor(Math.random() * options.length)];

  const backPart = before && {
    lead: "قبل أن تسترجعها: بِمَ خُتمت الآية التي قبلها؟",
    correct: ayahEnding(before),
    answerKey: `${before.surah}:${before.ayah}`,
    take: ayahEnding,
    prefix: "… ",
    suffix: "",
  };
  const fwdPart = after && {
    lead: "وبِمَ تبدأ الآية التي بعدها؟",
    correct: ayahOpening(after),
    answerKey: `${after.surah}:${after.ayah}`,
    take: ayahOpening,
    prefix: "",
    suffix: " …",
  };
  reviewNeighbourParts = pick === "both" ? [backPart, fwdPart] : pick === "backward" ? [backPart] : [fwdPart];
  reviewNeighbourIndex = 0;
  setNeighbourBlock(true);
  // Not in listen mode: there the ayah is behind its veil on purpose, and
  // uncovering it for the question would hand over the very thing the veil
  // is there to withhold.
  if (!(listenModeOn() && listenSuitsAyah(item.text))) renderAyahForNeighbour(true);
  renderReviewNeighbour(item);
}

function renderReviewNeighbour(item) {
  const part = reviewNeighbourParts[reviewNeighbourIndex];
  const box = document.getElementById("review-neighbour");
  const optionsBox = document.getElementById("review-neighbour-options");
  if (!part || !box || !optionsBox) { hideReviewNeighbour(); return; }

  document.getElementById("review-neighbour-lead").textContent = part.lead;
  const exclude = new Set([part.answerKey, `${item.surah}:${item.ayah}`]);
  const choices = shuffleArray([
    part.correct,
    ...seamDistractors(part.correct, exclude, item.surah, part.take),
  ]);

  optionsBox.innerHTML = "";
  choices.forEach((phrase) => {
    const btn = document.createElement("button");
    btn.className = "mcq-btn";
    btn.textContent = `${part.prefix}${phrase}${part.suffix}`;
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const right = phrase === part.correct;
      if (isChallengeMode) {
        challengeNeighbourTotal++;
        if (right) challengeNeighbourRight++;
      }
      optionsBox.querySelectorAll(".mcq-btn").forEach((b) => {
        b.disabled = true;
        if (b.textContent === `${part.prefix}${part.correct}${part.suffix}`) b.classList.add("correct");
      });
      if (right) playSuccessSound();
      else { btn.classList.add("wrong"); playErrorSound(); }
      // The answer stays on screen a moment so the right one can be read,
      // then the other side - or the ayah itself - takes its place.
      setTimeout(() => {
        reviewNeighbourIndex++;
        if (reviewNeighbourIndex < reviewNeighbourParts.length) renderReviewNeighbour(item);
        else finishReviewNeighbour();
        fitReviewAyahHeight();
        scheduleAnswerDockUpdate();
      }, right ? 700 : 1400);
    });
    optionsBox.appendChild(btn);
  });

  box.classList.remove("hidden");
  fitReviewAyahHeight();
  scheduleAnswerDockUpdate();
}

// Only what was claimed as *already memorized* and still owes its proof. A
// surah being memorized belongs in "خطة الحفظ الحالية" with the rest of that
// surah - it is the same work, at an earlier point, and splitting it across
// two cards made one memorization look like two separate things.
function pendingGroups() {
  const groups = new Map();
  Object.values(state.ayahs).forEach((item) => {
    if (item.learningStage !== "verify") return;
    if (!groups.has(item.surah)) {
      groups.set(item.surah, { surah: item.surah, stage: "verify", name: item.surahName || `سورة ${item.surah}`, items: [] });
    }
    groups.get(item.surah).items.push(item);
  });
  return [...groups.values()].sort((a, b) => a.surah - b.surah);
}

function renderPendingCard() {
  const card = document.getElementById("pending-card");
  const list = document.getElementById("pending-list");
  if (!card || !list) return;
  const groups = pendingGroups();
  card.classList.toggle("hidden", groups.length === 0);
  if (!groups.length) return;

  document.getElementById("pending-heading").textContent = "📥 بانتظار إثباتك";
  document.getElementById("pending-lead").textContent =
    "آياتٌ قلتَ إنك تحفظها. جولةٌ واحدة تُثبتها فتدخل المراجعة وتُحتسب — ولن يتغيّر موضعك في «ابدأ الحفظ».";

  list.innerHTML = "";
  groups.forEach((g) => {
    const nums = g.items.map((i) => i.ayah).sort((a, b) => a - b);
    const span = nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]}` : `${nums[0]}`;
    const row = document.createElement("div");
    row.className = "pending-row to-verify";
    row.innerHTML = `
      <div class="pending-row-text">
        <span class="pending-row-name">${g.name} <span class="pending-row-span">${span}</span></span>
        <span class="pending-row-count">${ayahCountLabel(g.items.length)} · تنتظر إثباتك</span>
      </div>
      <div class="pending-row-actions">
        <button class="btn primary">أثبت حفظك</button>
        <button class="icon-btn pending-drop" title="أزِلها من الخطة" aria-label="أزِل ${g.name} ${span} من الخطة">✕</button>
      </div>`;
    row.querySelector(".btn").addEventListener("click", () => startPendingGroup(g));
    row.querySelector(".pending-drop").addEventListener("click", () => dropPendingGroup(g, span));
    list.appendChild(row);
  });
}

// Added by mistake, or added and thought better of. Removing them takes the
// surah out of "التقدم حسب السورة" too, since that list is built from whatever
// is in the plan - a surah added and never started sat there at 0% with
// nothing to show for itself.
//
// Only ever these two stages: an ayah that was actually memorized is not
// swept away by a button meant for tidying a queue. Those are removed one at
// a time from the plan list, where the choice is deliberate.
function dropPendingGroup(group, span) {
  const keys = group.items.map((i) => `${i.surah}:${i.ayah}`);
  showConfirmModal(
    "إزالة من الخطة",
    `تُزيل ${ayahCountLabel(keys.length)} من ${group.name} (${span})؟ لم تُحفظ بعد، ولن يضيع بإزالتها شيء - ويمكنك إضافتها متى شئت.`,
    "أزِلها",
    () => {
      keys.forEach((key) => {
        const item = state.ayahs[key];
        // Re-checked at the moment of removal, not only when the row was
        // drawn: a round finished in another tab may have promoted one of
        // these to memorized while the dialog was open.
        if (item && (item.learningStage === "learning" || item.learningStage === "verify")) {
          delete state.ayahs[key];
        }
      });
      // The detour may have been standing on one of these.
      normalizeLearnDetour();
      saveState();
      renderDashboard();
      showToast(`أُزيلت ${ayahCountLabel(keys.length)} من ${group.name}.`, "success");
    }
  );
}

// Works this group now without losing the place in the sequence: the learn
// tab is handed a detour pointer, and the sequential one is left exactly
// where it stands to be resumed the moment the group is done.
function startPendingGroup(group) {
  const first = group.items.map((i) => i.ayah).sort((a, b) => a - b)[0];
  startLearnDetour(group.surah, first);
}

// Picks which word indices to hide for a given mask level (0 = none, higher
// = more), using a seeded shuffle so the same level always hides the same
// words for a given ayah length instead of jumping around on every render.
// The words an ayah is actually lost by. A فاصلة - the ending an ayah closes
// on - is where memorization fails first and hardest: «ٱلْعَزِيزُ ٱلْحَكِيمُ» and
// «ٱلْعَلِيمُ ٱلْحَكِيمُ» and «ٱلْغَفُورُ ٱلرَّحِيمُ» sit at the end of hundreds of
// ayahs, and which pair closes THIS one is the thing that goes. A uniform
// shuffle spent most of its hiding on the middle, where the sentence itself
// carries you through.
const FASILA_NAMES = new Set([
  "عليم", "حكيم", "غفور", "رحيم", "عزيز", "سميع", "بصير", "خبير", "قدير",
  "لطيف", "تواب", "شكور", "حليم", "عظيم", "كريم", "مجيد", "حميد", "ودود",
  "قوي", "متين", "وكيل", "شهيد", "مقتدر", "علي", "كبير", "محيط", "بديع",
  "ولي", "نصير", "مولي", "هاد", "رءوف", "رحمن", "عفو", "غفار", "قهار",
  "جبار", "متكبر", "خالق", "بارئ", "مصور", "فتاح", "رزاق", "واسع", "مبين",
].map((w) => normalizeArabic(w)));

// The name is worn with ٱل before it and a tanween after it - ٱلْحَكِيمُ,
// حَكِيمًا, عَلِيمًا - and the bare root is what the table holds.
function isFasilaWord(word) {
  const w = normalizeArabic(word || "");
  if (!w) return false;
  const bare = w.replace(/^ال/, "");
  return FASILA_NAMES.has(w) || FASILA_NAMES.has(bare)
    || FASILA_NAMES.has(w.replace(/ا$/, "")) || FASILA_NAMES.has(bare.replace(/ا$/, ""));
}

// How much a word deserves to be the one hidden. The end of the ayah weighs
// heaviest, a divine-name ending heavier still, and a seeded jitter keeps it
// from being the same three words every single round.
function maskWeight(idx, n, word, seed) {
  const fromEnd = n - 1 - idx;
  let w = 0;
  if (fromEnd === 0) w += 3.2;
  else if (fromEnd === 1) w += 2.4;
  else if (fromEnd <= 3) w += 1.1;
  // The opening is the cue that says which ayah this is; hiding it first
  // turns recall into a guess at the ayah rather than at its words.
  if (idx === 0) w -= 1.2;
  if (isFasilaWord(word)) w += 1.6;
  return w + seed * 2;
}

function computeHiddenIndices(n, maskLevel, seedOffset = 0, words = null) {
  const hiddenIndices = new Set();
  if (maskLevel > 0) {
    const fractionToHide = Math.min(maskLevel * 0.34, 1);
    const countToHide = Math.round(n * fractionToHide);
    let seed = maskLevel * 9973 + seedOffset * 104729 + n * 7919;
    const nextSeed = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const scored = [...Array(n).keys()]
      .map((idx) => ({ idx, w: maskWeight(idx, n, words && words[idx], nextSeed()) }))
      .sort((a, b) => b.w - a.w || a.idx - b.idx);
    scored.slice(0, countToHide).forEach(({ idx }) => hiddenIndices.add(idx));
  }
  return hiddenIndices;
}

// askFirst (optional): a word is not simply uncovered by tapping it - the tap
// asks a question first, and the word appears only once it is answered. That
// is the difference between "I would have known that" and knowing it.
function renderMaskedWordsInto(container, words, maskLevel, seedOffset = 0, onReveal, askFirst = null) {
  const hiddenIndices = computeHiddenIndices(words.length, maskLevel, seedOffset, words);
  container.innerHTML = words
    .map((w, idx) => {
      if (hiddenIndices.has(idx)) return `<span class="word masked" data-idx="${idx}">${w}</span>`;
      return `<span class="word">${w}</span>`;
    })
    .join(" ");
  container.querySelectorAll(".word.masked").forEach((el) => {
    const idx = Number(el.dataset.idx);
    const reveal = () => {
      el.classList.remove("masked", "asking");
      if (onReveal) onReveal(container.querySelectorAll(".word.masked").length, el);
    };
    el.addEventListener("click", () => {
      if (askFirst) askFirst(idx, words[idx], el, reveal);
      else reveal();
    });
  });
  if (onReveal) onReveal(hiddenIndices.size, null);
}

// ---------- Review by recognition, not by reveal ----------
// Uncovering a word by tapping it graded nothing: the answer arrived before
// any recall had to happen, and the self-rating that followed was a guess
// about a guess. In review the hidden word is asked instead - four options,
// the right one among words that could plausibly stand there - so by the
// time the grading row appears there is a real count behind it. تسميع stays
// one button away for whoever would rather recite the whole ayah.
let reviewChoiceAsked = 0;
let reviewChoiceMissed = new Set();

function resetReviewChoices() {
  reviewChoiceAsked = 0;
  reviewChoiceMissed = new Set();
  closeReviewChoice();
  // A neighbour question belongs to the ayah that raised it: revealing the
  // text, grading, or moving on all end it, or it would sit over the next.
  // Except when the question is the very thing redrawing the ayah.
  if (!keepNeighbourWhileRendering) hideReviewNeighbour();
}

function closeReviewChoice() {
  const box = document.getElementById("review-choice");
  if (!box) return;
  box.classList.add("hidden");
  document.getElementById("review-choice-options").innerHTML = "";
  document.querySelectorAll("#review-text .word.asking").forEach((el) => el.classList.remove("asking"));
}

function askReviewChoice(idx, word, el, reveal) {
  const box = document.getElementById("review-choice");
  const optionsBox = document.getElementById("review-choice-options");
  // The join question comes first, and the block is not only visual: a tap
  // that arrives anyway (a stray synthetic event, a stale handler) still
  // finds the ayah closed.
  if (reviewNeighbourParts.length) return;
  if (!box || !optionsBox) { reveal(); return; }
  closeReviewChoice();
  el.classList.add("asking");
  // Each word is counted once, however many times it is asked - re-opening a
  // question already answered wrong must not deepen the same mistake.
  if (!el.dataset.asked) {
    el.dataset.asked = "1";
    reviewChoiceAsked++;
  }
  const item = reviewQueue[reviewIndex];
  const options = buildMcqOptions(word, currentWords, item ? item.surah : null);
  optionsBox.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "mcq-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => {
      if (opt === word) {
        playSuccessSound();
        btn.classList.add("correct");
        optionsBox.querySelectorAll(".mcq-btn").forEach((b) => (b.disabled = true));
        setTimeout(() => { closeReviewChoice(); reveal(); }, 420);
      } else {
        playErrorSound();
        btn.classList.add("wrong");
        btn.disabled = true;
        reviewChoiceMissed.add(idx);
        el.classList.add("missed");
      }
    });
    optionsBox.appendChild(btn);
  });
  box.classList.remove("hidden");
  // The options push the ayah panel shorter, which can carry the word being
  // asked about out of view - so it is put back afterwards, not before.
  fitReviewAyahHeight();
  scrollWordIntoPanel(document.getElementById("review-ayah-scroll"), el);
  scheduleAnswerDockUpdate();
  scrollIntoViewIfNeeded("#review-choice");
}

// The choices already measured this ayah, so the grading row opens with that
// measurement marked - the same courtesy the تسميع score gets, and for the
// same reason: SM-2 acts on this number for months.
function suggestFromChoices() {
  if (!reviewChoiceAsked) return;
  const right = reviewChoiceAsked - reviewChoiceMissed.size;
  const accuracy = Math.round((right / reviewChoiceAsked) * 100);
  const quality = suggestedQualityFor(accuracy);
  const btn = document.querySelector(`.grade-buttons button[data-quality="${quality}"]`);
  const hint = document.getElementById("grade-suggestion");
  if (!hint) return;
  document.querySelectorAll(".grade-buttons button").forEach((b) => b.classList.remove("suggested"));
  if (btn) btn.classList.add("suggested");
  hint.textContent = `أصبت ${right} من ${reviewChoiceAsked} — المقترح: ${btn ? btn.textContent : ""} (والقرار لك)`;
  hint.classList.remove("hidden");
}

// ---------- Reviewing by ear ----------
//
// Every mode here so far is a reading mode: the ayah is on the screen with
// some of it covered, and the test is whether you can fill the gaps. But a
// great deal of real revision happens with nothing to look at - walking,
// driving, lying down, eyes shut - and it is a different test. Hearing the
// opening of an ayah and carrying on from memory is closer to how the
// Qur'an is actually held than uncovering words with a thumb.
//
// So: the text goes behind a veil, the reciter plays the opening and stops,
// and you continue aloud from memory. Then you hear the rest, or lift the
// veil, and grade yourself as usual. The grading is unchanged - this is a
// different way of being asked, not a different schedule.

let listenPrimed = false;   // the opening is queued for this ayah
let listenCutAt = null;     // seconds at which to stop, once we know the length
let listenSplitIndex = 0;   // how many words the reciter got through before stopping

function listenModeOn() {
  return state.listenMode === true;
}

// The mode only means anything on an ayah long enough that hearing its
// opening still leaves something to recall. «الٓمٓ» and «ٱلرَّحْمَٰنِ ٱلرَّحِيمِ»
// are over before any cut can land: the reciter says the whole ayah, and the
// veil then lifts on something that was just read aloud. Six words is where
// a third of the way in is still a beginning - below it the prompt and the
// ayah are the same thing, so the option is not offered at all.
const LISTEN_MIN_WORDS = 6;
function listenSuitsAyah(text) {
  return quranWords(text || "").length >= LISTEN_MIN_WORDS;
}
function listenSuitsCurrentReview() {
  const item = reviewQueue && reviewQueue[reviewIndex];
  return !item || listenSuitsAyah(item.text);
}

// About a third of the way in, bounded either side: less than a second and
// a half is not a prompt, more than six gives the ayah away.
function listenCutPoint(duration) {
  if (!duration || !isFinite(duration)) return 3;
  return Math.min(6, Math.max(1.5, duration * 0.35));
}

// ---------- Stopping the reciter on a word, not in the middle of one ----------
//
// A cut at a bare fraction of the clip lands wherever it lands, and most of
// the time that is inside a word: وَءَاتُوا۟ came out as "وَءَا" and the person
// was left guessing whether he had heard a whole word or half of one.
//
// The recitations are timed word by word, and quran.com publishes those
// timings. Reading the waveform was the obvious alternative and is not
// possible: the audio CDN sends no CORS header, so an AnalyserNode on that
// element reads silence and a fetch of it comes back opaque. The timings do
// not have that problem - and, verified per ayah, the mp3 they were measured
// against is byte for byte the file this app already plays.
//
// Every use of them is guarded: an unmapped reciter, a failed request, a
// reader offline, or timings that do not fit the audio that actually loaded
// all fall back to the fraction. Nothing here can stop the ayah playing.
const QURAN_COM_RECITERS = {
  "ar.alafasy": 7,
  "ar.husary": 6,
  "ar.minshawi": 9,
  "ar.abdulbasitmurattal": 2,
  "ar.abdurrahmaansudais": 3,
  // ماهر المعيقلي has no counterpart there; he keeps the fraction.
};
const wordTimingCache = new Map();
let listenSegments = null; // [{ start, end }] in seconds, for the ayah in hand

// The API gives [wordNumber, startMs, endMs] in one place and
// [index, wordNumber, startMs, endMs] in another; the last two are the
// times either way.
function parseAudioSegments(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = [];
  for (const seg of raw) {
    if (!Array.isArray(seg) || seg.length < 2) return null;
    const start = Number(seg[seg.length - 2]) / 1000;
    const end = Number(seg[seg.length - 1]) / 1000;
    if (!isFinite(start) || !isFinite(end) || end < start) return null;
    out.push({ start, end });
  }
  return out;
}

async function fetchWordTimings(surah, ayah) {
  const reciterId = QURAN_COM_RECITERS[state.reciter];
  if (!reciterId) return null;
  const key = `${reciterId}:${surah}:${ayah}`;
  if (wordTimingCache.has(key)) return wordTimingCache.get(key);
  let segments = null;
  try {
    const res = await fetch(`https://api.quran.com/api/v4/verses/by_key/${surah}:${ayah}?audio=${reciterId}`);
    if (res.ok) {
      const json = await res.json();
      segments = parseAudioSegments(json && json.verse && json.verse.audio && json.verse.audio.segments);
    }
  } catch (e) {
    segments = null; // offline, or the API is down: the fraction still works
  }
  if (wordTimingCache.size > 300) wordTimingCache.clear();
  wordTimingCache.set(key, segments);
  return segments;
}

// Timings measured against a different cut of the recitation would be worse
// than none, so they are only trusted if the last word ends inside the clip
// that actually loaded, and near its end rather than a third of the way in.
function segmentsFitAudio(segments, duration) {
  if (!segments || !segments.length || !duration || !isFinite(duration)) return false;
  const last = segments[segments.length - 1].end;
  return last > duration * 0.6 && last <= duration + 0.4;
}

// Where to stop so the reciter finishes what he started. A target inside a
// word runs on to the end of it; a target already in the gap between two
// words is a boundary and stays where it is.
function cutAtWordBoundary(target) {
  if (!listenSegments) return { at: target, index: null };
  for (let i = 0; i < listenSegments.length; i++) {
    const seg = listenSegments[i];
    if (target <= seg.start) return { at: target, index: i };
    if (target < seg.end) return { at: seg.end, index: i + 1 };
  }
  return { at: target, index: listenSegments.length };
}

function setListenLead(text) {
  const el = document.getElementById("listen-lead");
  if (el) el.textContent = text;
}

function renderListenButton() {
  const btn = document.getElementById("btn-review-listen");
  if (!btn) return;
  const suits = listenSuitsCurrentReview();
  btn.innerHTML = iconLabel("headphones", listenModeOn() ? "أغلق وضع السمع" : "راجع بالسمع");
  btn.classList.toggle("active", listenModeOn());
  btn.classList.toggle("hidden", !suits);
  // Says why the veil is not there on an ayah too short for it, so the mode
  // staying on across the queue does not read as the mode having broken.
  const note = document.getElementById("listen-skip-note");
  if (note) note.classList.toggle("hidden", suits || !listenModeOn());
}

// The veil hides the ayah without unmounting it: the masked words, the
// height fitting and the grade gate all keep working underneath, so
// lifting it mid-ayah lands on exactly the state that was already there.
function applyListenVeil() {
  const veil = document.getElementById("listen-veil");
  const scroll = document.getElementById("review-ayah-scroll");
  if (!veil || !scroll) return;
  const on = listenModeOn() && listenPrimed;
  veil.classList.toggle("hidden", !on);
  scroll.classList.toggle("veiled", on);
}

function primeListening() {
  const audio = document.getElementById("review-audio");
  if (!audio || !listenSuitsCurrentReview()) return;
  clearListenCutTimer();
  listenPrimed = true;
  listenCutAt = null;
  listenSplitIndex = 0;
  listenSegments = null;
  hideListenFinishChoices();
  setListenLead("استمع لأول الآية، ثم أكملها من حفظك.");
  applyListenVeil();
  // The grade buttons belong after the recall, not before it.
  document.getElementById("grade-controls").classList.add("hidden");
  playListenPrompt();
}

function playListenPrompt() {
  const audio = document.getElementById("review-audio");
  if (!audio) return;
  const start = () => {
    listenCutAt = listenCutPoint(audio.duration);
    audio.currentTime = 0;
    audio.play().then(armListenCut).catch(() => {
      // Autoplay refused (no gesture yet on this page): the ▶ button is
      // right there, so say so instead of failing silently.
      setListenLead("اضغط ▶ لسماع أول الآية.");
    });
    loadListenWordBoundaries(audio);
  };
  if (audio.readyState >= 1) start();
  else audio.addEventListener("loadedmetadata", start, { once: true });
}

// Fetched alongside playback rather than before it: the cut is seconds away,
// the fraction is already set as a floor, and the ayah must never wait on a
// network round trip to start. If the timings arrive in time they move the
// cut onto the end of a word; if they don't, nothing changes.
function loadListenWordBoundaries(audio) {
  const item = reviewQueue[reviewIndex];
  if (!item) return;
  const token = `${item.surah}:${item.ayah}`;
  fetchWordTimings(item.surah, item.ayah).then((segments) => {
    const now = reviewQueue[reviewIndex];
    // The queue may have moved on, or the mode been switched off, while the
    // request was in flight - timings for a previous ayah would be poison.
    if (!now || `${now.surah}:${now.ayah}` !== token) return;
    if (!listenPrimed || listenCutAt === null) return;
    if (!segmentsFitAudio(segments, audio.duration)) return;
    listenSegments = segments;
    listenCutAt = cutAtWordBoundary(listenCutPoint(audio.duration)).at;
    armListenCut();
  });
}

// timeupdate fires about four times a second, so leaning on it alone
// overshot the cut by up to a quarter of a second - long enough to sound
// the first syllable of the next word, which is the very thing the word
// boundary was there to prevent. So the stop is timed: a clock armed for
// the moment itself, with timeupdate left in place behind it as a net for
// when the tab is throttled and timers run late.
let listenCutTimer = 0;

function clearListenCutTimer() {
  if (listenCutTimer) { clearTimeout(listenCutTimer); listenCutTimer = 0; }
}

function armListenCut() {
  clearListenCutTimer();
  const audio = document.getElementById("review-audio");
  if (!audio || listenCutAt === null || audio.paused) return;
  const rate = audio.playbackRate || 1;
  const left = (listenCutAt - audio.currentTime) / rate;
  if (left <= 0) { stopAtCutPoint(); return; }
  listenCutTimer = setTimeout(() => {
    listenCutTimer = 0;
    // A timer can fire early as well as late; if the audio has not reached
    // the cut yet, wait out the remainder rather than stopping short.
    if (listenCutAt !== null && audio.currentTime < listenCutAt - 0.01) armListenCut();
    else stopAtCutPoint();
  }, Math.max(0, left * 1000));
}

function stopAtCutPoint() {
  const audio = document.getElementById("review-audio");
  if (!audio || !listenModeOn() || !listenPrimed || listenCutAt === null) return;
  // A hair's tolerance: the clock lands a millisecond or two short of the
  // mark as often as past it, and without this the stop fell through to the
  // next timeupdate - a quarter of a second into the following word. Stopping
  // twenty milliseconds early sits inside the silence after the word.
  if (audio.currentTime >= listenCutAt - 0.02) {
    // Only once it really stops: timeupdate calls this several times a
    // second, and disarming the clock on every one of those calls left the
    // quarter-second overshoot it was added to remove.
    clearListenCutTimer();
    audio.pause();
    // Where he stopped, in words. With the recitation's own timings this is
    // exact - provided they count the ayah's words the same way this does;
    // where they don't, or where there are none, it falls back to the
    // fraction of the clip played. Recitation is not evenly paced, so that
    // is only an estimate - but it is a hint to the alignment, not a verdict,
    // and being a word out costs nothing there.
    const boundary = listenSegments ? cutAtWordBoundary(listenCutAt) : null;
    const exact = boundary && boundary.index !== null
      && listenSegments.length === currentWords.length;
    const played = audio.duration ? audio.currentTime / audio.duration : 0.35;
    listenSplitIndex = Math.min(currentWords.length - 1, Math.max(1,
      exact ? boundary.index : Math.round(currentWords.length * played)));
    listenCutAt = null; // spent: "اسمع البقية" must play through to the end
    setListenLead("توقّف القارئ هنا. أكملها من حفظك:");
    showListenFinishChoices();
  }
}

// The part he has not recited - what the person is being asked for.
function listenRemainingText() {
  return currentWords.slice(listenSplitIndex).join(" ");
}

function showListenFinishChoices() {
  const finish = document.getElementById("listen-finish");
  if (finish) finish.classList.remove("hidden");
  const row = document.getElementById("listen-write-row");
  if (row) row.classList.add("hidden");
}

function hideListenFinishChoices() {
  ["listen-finish", "listen-write-row"].forEach((id) => {
    const el = document.getElementById(id);
    // Pinned above the keyboard it is out of the flow, where "hidden" on an
    // ancestor would not have reached it - so it is unpinned as it is hidden.
    if (el) el.classList.add("hidden"), el.classList.remove("keyboard-active");
  });
}

// Completing by voice: the same recitation check the app already uses,
// pointed at the remainder instead of the whole ayah.
function finishListenBySaying() {
  if (!voiceSupported()) {
    showToast("التسميع غير مدعوم في هذا المتصفح. أكملها كتابةً.", "error");
    finishListenByWriting();
    return;
  }
  const audio = document.getElementById("review-audio");
  if (audio) audio.pause();
  openVoiceModal(listenRemainingText(), () => {
    closeVoiceModal();
    revealListenSeam(null);
  }, { continueOnLowAccuracy: true, onFail: () => revealListenSeam(null) });
}

function finishListenByWriting() {
  const row = document.getElementById("listen-write-row");
  const finish = document.getElementById("listen-finish");
  if (finish) finish.classList.add("hidden");
  if (!row) return;
  row.classList.remove("hidden");
  const input = document.getElementById("listen-write-input");
  if (input) { input.value = ""; growListenWriteBox(); input.focus(); }
}

// The box follows the writing. A single line was fine for one word and
// useless for the twelve this asks for: what you wrote scrolled off to the
// side and there was no way to read it back before checking it. Capped so
// it can never grow past the keyboard it sits on.
function growListenWriteBox() {
  const input = document.getElementById("listen-write-input");
  if (!input) return;
  input.style.height = "auto";
  const cap = Math.max(96, Math.round(window.innerHeight * 0.28));
  input.style.height = `${Math.min(input.scrollHeight, cap)}px`;
  input.style.overflowY = input.scrollHeight > cap ? "auto" : "hidden";
}

function submitListenWriting() {
  const input = document.getElementById("listen-write-input");
  if (!input) return;
  const typed = quranWords(input.value.trim());
  // Nothing written is not the same as everything written wrong: with no
  // words to line up there is nothing to judge, so the seam is simply shown.
  revealListenSeam(typed.length ? typed : null);
}

// The whole ayah, with the seam shown: what the reciter gave, and what the
// person supplied. When they wrote it, each of their words is marked right
// or wrong against the text - seeing the miss in place is the point of
// having typed it at all.
// Lining up what was written against the ayah.
//
// A fixed starting offset was not enough. It handled the reciter stopping a
// word early or late, but not a word missing from the middle, an extra one,
// or a و dropped from the front of a word - and any one of those shifts
// everything after it, so a single slip still turned the whole remainder
// red. The comparison has to tolerate insertions and deletions, not just a
// shift.
//
// So: a word-level fitting alignment. The written words are matched against
// the ayah with gaps allowed on both sides - free before and after, since
// the reciter covered the start and the person may stop early - and each
// ayah word comes back marked as matched, mistaken, or missing. One slip
// costs one mark, which is what a person expects and what makes the verdict
// worth reading.
// A word of the ayah nobody wrote is cheap to skip - stopping early is the
// normal way this exercise ends. A written word that answers to nothing in
// the ayah is not: every word the person typed was meant as part of it, so
// discarding one has to cost more than calling it a mistake, or a wrong word
// at either end of the writing is quietly swallowed instead of marked. That
// is exactly what a fixed cost for both did: "...هدى خطأ" came back clean,
// with the last word reported as merely unreached.
const SEAM_MATCH = 2, SEAM_MISS = -2;
const SEAM_GAP_AYAH = -1, SEAM_GAP_WRITTEN = -3;

function alignSeam(typedWords, hint) {
  const A = currentWords;
  // A one-letter particle with nothing after it is a half-typed word or a
  // stray keystroke - the mushaf never leaves one standing alone - so it is
  // not an answer, and letting it convict the next word of being wrong is
  // an accusation the writing does not support.
  const B = typedWords.length && /^[\u0648\u0641\u0628\u0644\u0643]$/.test(typedWords[typedWords.length - 1])
    ? typedWords.slice(0, -1)
    : typedWords;
  const n = A.length, m = B.length;
  if (!m) return { start: hint, marks: [] };

  // Two words typed where the mushaf writes one. A phone keyboard invites
  // the conjunction to be typed apart - "و اتوا" for وَءَاتُوا۟, "و اركعوا"
  // for وَٱرْكَعُوا۟ - and the vocative يا likewise (يا أيها / يَٰٓأَيُّهَا).
  // Counted as two, the word they belong to matched nothing and every word
  // after it shifted, which is how a correctly written ayah came back with
  // three words owed. Only consulted when the single word did not match, so
  // it costs nothing on the ordinary path.
  const joins = (i, j) => j >= 2 && answerMatchesQuranWord(A[i - 1], B[j - 2] + B[j - 1]);

  // score[i][j]: best alignment of A[0..i) with B[0..j). A's prefix is free
  // (the reciter's part), so the first column is all zeros.
  const score = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let j = 1; j <= m; j++) score[0][j] = j * SEAM_GAP_WRITTEN;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same = answerMatchesQuranWord(A[i - 1], B[j - 1]);
      let best = Math.max(
        score[i - 1][j - 1] + (same ? SEAM_MATCH : SEAM_MISS),
        score[i - 1][j] + SEAM_GAP_AYAH,     // an ayah word nobody wrote
        score[i][j - 1] + SEAM_GAP_WRITTEN   // a written word not in the ayah
      );
      if (!same && joins(i, j)) best = Math.max(best, score[i - 1][j - 2] + SEAM_MATCH);
      score[i][j] = best;
    }
  }

  // The written text must be fully consumed; the ayah's tail is free.
  let endI = n;
  for (let i = 0; i <= n; i++) if (score[i][m] > score[endI][m]) endI = i;

  const marks = [];
  let i = endI, j = m;
  while (i > 0 && j > 0) {
    const same = answerMatchesQuranWord(A[i - 1], B[j - 1]);
    if (score[i][j] === score[i - 1][j - 1] + (same ? SEAM_MATCH : SEAM_MISS)) {
      marks.push({ index: i - 1, state: same ? "ok" : "wrong" });
      i--; j--;
    } else if (!same && joins(i, j) && score[i][j] === score[i - 1][j - 2] + SEAM_MATCH) {
      marks.push({ index: i - 1, state: "ok" });
      i--; j -= 2;
    } else if (score[i][j] === score[i - 1][j] + SEAM_GAP_AYAH) {
      marks.push({ index: i - 1, state: "missing" });
      i--;
    } else {
      j--; // something written that is not in the ayah - nothing to mark
    }
  }
  marks.reverse();
  return { start: marks.length ? marks[0].index : hint, marks };
}

function revealListenSeam(typedWords) {
  const audio = document.getElementById("review-audio");
  if (audio) audio.pause();
  listenPrimed = false;
  hideListenFinishChoices();
  applyListenVeil();
  resetReviewChoices();

  const aligned = typedWords ? alignSeam(typedWords, listenSplitIndex) : null;
  const start = aligned ? aligned.start : listenSplitIndex;
  const stateOf = {};
  if (aligned) aligned.marks.forEach((mk) => { stateOf[mk.index] = mk.state; });
  const lastMarked = aligned && aligned.marks.length
    ? aligned.marks[aligned.marks.length - 1].index
    : currentWords.length - 1;

  const target = document.getElementById("review-text");
  const grades = document.getElementById("grade-controls");
  const hint = document.getElementById("review-reveal-hint");
  if (!target) return;

  // What the writing settled and what it left open. A word written right is
  // done with; a word written wrong, or never written at all, is not handed
  // over - it is asked. Stopping eight words in used to open the grading row
  // with the other seven simply printed, which grades a recall that never
  // happened.
  let wrong = 0, judged = 0;
  const owed = [];
  target.innerHTML = currentWords.map((w, i) => {
    if (i < start) return `<span class="word seam-reciter">${w}</span>`;
    // The join itself gets a mark. Without it the two halves are only a
    // shade apart, and "where did he stop?" - the whole question the
    // exercise asks - is left to be inferred from the underlines.
    const seam = i === start && start > 0 ? " seam-start" : "";
    // No writing to judge: تسميع, or the text simply asked for. Those paths
    // have done their own checking, so the ayah is shown whole.
    if (!typedWords) return `<span class="word seam-you${seam}">${w}</span>`;
    if (i > lastMarked) {
      owed.push(i);
      return `<span class="word masked seam-owed${seam}" data-idx="${i}">${w}</span>`;
    }
    judged++;
    const state = stateOf[i] || "missing";
    if (state === "ok") return `<span class="word seam-you${seam}">${w}</span>`;
    wrong++;
    owed.push(i);
    // Tinted rather than red-lettered while it is still covered: the tile
    // says "you had this one wrong" without saying what it was.
    return `<span class="word masked seam-owed seam-owed-wrong${seam}" data-idx="${i}">${w}</span>`;
  }).join(" ");

  const left = typedWords ? currentWords.length - 1 - lastMarked : 0;
  const verdict = !typedWords
    ? "ما قبل الفاصل من القارئ، وما بعده منك."
    : wrong === 0 && left === 0
      ? `✅ أكملتها كاملة — ${arabicCount(judged, "كلمة", "كلمتان", "كلمات", "كلمة")}`
      : wrong === 0
        ? `✅ ما كتبته صحيح (${judged}) — وأكملتَ الباقي بالاختيار`
        : `الملوّن بالأحمر ما اختلف عن النص (${wrong} من ${judged})`;

  // The suggestion comes from the writing, not from the choices that
  // followed it: picking the right word out of four after getting it wrong
  // is a recovery, not a recall, and SM-2 lives on this number for months.
  const owing = currentWords.length - start;
  const recalled = owing - owed.length;

  const settle = () => {
    if (hint) { hint.classList.remove("hidden"); hint.textContent = verdict; }
    if (grades) grades.classList.remove("hidden");
    if (typedWords && owing > 0) suggestListenQuality(recalled, owing);
    fitReviewAyahHeight();
    scheduleAnswerDockUpdate();
  };

  const askOwed = (stillOwed, revealed) => {
    if (stillOwed === 0) { settle(); }
    else {
      if (grades) grades.classList.add("hidden");
      if (hint) {
        // A word written wrong and a word never written are both owed, but
        // they are not the same failure and saying "لم تكتبها" about one he
        // did write reads as the app not having looked.
        const stillWrong = target.querySelectorAll(".word.masked.seam-owed-wrong").length;
        hint.classList.remove("hidden");
        hint.textContent = stillOwed === 1
          ? (stillWrong === 1
              ? "كلمة واحدة اختلفت عمّا كتبت - اضغط عليها واختر الصحيحة."
              : "بقيت كلمة لم تكتبها - اضغط عليها واختر الصحيحة.")
          : (stillWrong === stillOwed
              ? `اضغط على كل كلمة ملوّنة واختر الصحيحة (بقي ${stillOwed}).`
              : `أكمل ما لم تكتبه: اضغط على كل كلمة واختر الصحيحة (بقي ${stillOwed}).`);
      }
      fitReviewAyahHeight();
      const box = document.getElementById("review-ayah-scroll");
      if (revealed && box) scrollWordIntoPanel(box, box.querySelector(".word.masked") || revealed);
      scheduleAnswerDockUpdate();
    }
  };

  target.querySelectorAll(".word.masked").forEach((el) => {
    const idx = Number(el.dataset.idx);
    const wasWrong = el.classList.contains("seam-owed-wrong");
    const reveal = () => {
      el.classList.remove("masked", "asking", "seam-owed", "seam-owed-wrong");
      el.classList.add("seam-you");
      if (wasWrong) el.classList.add("seam-wrong");
      askOwed(target.querySelectorAll(".word.masked").length, el);
    };
    el.addEventListener("click", () => askReviewChoice(idx, currentWords[idx], el, reveal));
  });

  maskLevel = 0;
  if (owed.length) askOwed(owed.length, null);
  else settle();
}

// The grading row opens with a mark on it, the way the تسميع and choice
// rounds already do: how much of the ayah after the seam came back on its
// own, before any option was offered.
function suggestListenQuality(recalled, total) {
  const accuracy = Math.round((recalled / total) * 100);
  const quality = suggestedQualityFor(accuracy);
  const btn = document.querySelector(`.grade-buttons button[data-quality="${quality}"]`);
  const hint = document.getElementById("grade-suggestion");
  if (!hint) return;
  document.querySelectorAll(".grade-buttons button").forEach((b) => b.classList.remove("suggested"));
  if (btn) btn.classList.add("suggested");
  hint.textContent = `أكملتَ ${recalled} من ${total} من حفظك — المقترح: ${btn ? btn.textContent : ""} (والقرار لك)`;
  hint.classList.remove("hidden");
}

function listenContinue() {
  const audio = document.getElementById("review-audio");
  if (!audio) return;
  clearListenCutTimer();
  listenCutAt = null;
  setListenLead("استمع إلى بقيتها وقارنها بما قلت.");
  audio.play().catch(() => {});
}

function listenFromStart() {
  setListenLead("استمع لأول الآية، ثم أكملها من حفظك.");
  playListenPrompt();
}

// Lifting the veil ends the hidden part of the exercise, so the grade
// buttons come out with it - the recall has already happened, out loud.
function listenReveal() {
  const audio = document.getElementById("review-audio");
  if (audio) audio.pause();
  listenPrimed = false;
  hideListenFinishChoices();
  applyListenVeil();
  maskLevel = 0;
  renderMaskedText();
  document.getElementById("grade-controls").classList.remove("hidden");
  const hint = document.getElementById("review-reveal-hint");
  if (hint) hint.classList.add("hidden");
}

function toggleListenMode() {
  state.listenMode = !listenModeOn();
  saveState();
  renderListenButton();
  if (listenModeOn()) {
    primeListening();
    showToast("🎧 وضع السمع: اسمع أول الآية وأكملها من حفظك", "success");
  } else {
    const audio = document.getElementById("review-audio");
    if (audio) audio.pause();
    listenPrimed = false;
    applyListenVeil();
    maskLevel = 1;
    renderMaskedText();
  }
}

function renderMaskedText() {
  resetReviewChoices();
  const gate = makeRevealGate({
    scrollId: "review-ayah-scroll",
    actionsId: "grade-controls",
    hintId: "review-reveal-hint",
    fit: fitReviewAyahHeight,
    ask: maskLevel > 0,
  });
  renderMaskedWordsInto(
    document.getElementById("review-text"),
    currentWords,
    maskLevel,
    0,
    (stillHidden, revealed) => {
      gate(stillHidden, revealed);
      if (stillHidden === 0) suggestFromChoices();
    },
    maskLevel > 0 ? askReviewChoice : null
  );
  fitReviewAyahHeight();
  scheduleAnswerDockUpdate();
}

setupAudioControls("review-audio-controls", "review-audio");
setHTML("btn-mask-more", iconLabel("eyeOff", "إخفاء المزيد"));
setHTML("btn-review-tafsir", ICONS.book);
setHTML("btn-review-voice", iconLabel("mic", "اختبر بالتسميع"));
renderListenButton();
on("btn-khatm-read", "click", () => { switchTab("dashboard"); setTimeout(() => {
  const card = document.querySelector(".mushaf-card");
  if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
}, 120); });
on("btn-khatm-share", "click", () => shareProgress());
on("btn-learn-detour-end", "click", endLearnDetour);
on("btn-review-listen", "click", toggleListenMode);
on("btn-listen-continue", "click", listenContinue);
on("btn-listen-again", "click", listenFromStart);
on("btn-listen-reveal", "click", listenReveal);
on("btn-listen-say", "click", finishListenBySaying);
on("btn-listen-write", "click", finishListenByWriting);
on("btn-listen-write-submit", "click", submitListenWriting);
// Enter checks rather than breaking the line: the box wraps on its own, and
// an ayah has no line breaks to type.
on("listen-write-input", "keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitListenWriting(); }
});
on("listen-write-input", "input", growListenWriteBox);
// Same treatment the typing round gets in الحفظ: while the keyboard is up the
// row leaves the flow and sits on top of it, so what is being written stays
// visible instead of being covered by the thing writing it.
on("listen-write-input", "focus", () => {
  const row = document.getElementById("listen-write-row");
  if (row) row.classList.add("keyboard-active");
  growListenWriteBox();
  setTimeout(growListenWriteBox, 350);
});
on("listen-write-input", "blur", () => {
  const row = document.getElementById("listen-write-row");
  if (row) row.classList.remove("keyboard-active");
  growListenWriteBox();
});
// The cut is enforced on the clock rather than with a timer: a timer set
// when play() is called drifts with buffering, and on a slow connection it
// would cut before the reciter had said anything.
on("review-audio", "timeupdate", stopAtCutPoint);
// Whenever the audio starts or moves - the ▶ button after a refused
// autoplay, a scrub - the clock is re-aimed at what is left before the cut.
on("review-audio", "play", armListenCut);
on("review-audio", "seeked", armListenCut);
on("review-audio", "pause", clearListenCutTimer);
setHTML("btn-learn-tafsir", ICONS.book);
setHTML("btn-learn-mask-more", iconLabel("eyeOff", "إخفاء المزيد"));
setHTML("btn-learn-partial-wrong", iconLabel("xCircle", "أخطأت في كلمة"));
setHTML("btn-learn-partial-correct", iconLabel("check", "تذكرتها جيدًا"));

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
  btn.addEventListener("click", () => {
    const ref = getRef();
    if (!ref) return;
    // Opens on the tafsir, with the word-by-word reading one tap away in
    // the same sheet rather than behind a second button in the row.
    openAyahMeaning(ref.surah, ref.ayah, "tafsir");
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

on("btn-mask-more", "click", () => {
  maskLevel = Math.min(maskLevel + 1, 3);
  renderMaskedText();
});

on("btn-learn-mask-more", "click", () => {
  learnMaskLevel = Math.min(learnMaskLevel + 1, 3);
  renderLearnPartialMask();
});

on("btn-learn-partial-correct", "click", () => finishPartialRound(true));
on("btn-learn-partial-wrong", "click", () => finishPartialRound(false));

on("btn-review-voice", "click", () => {
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
    // Same guard as the word choice: nothing about this ayah is settled
    // while its join question is still standing.
    if (reviewNeighbourParts.length) return;
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
      ${challengeNeighbourTotal ? `<p class="muted">ومواضعها: أصبت ${challengeNeighbourRight} من ${challengeNeighbourTotal} في ما قبلها وما بعدها.</p>` : ""}
      <p class="muted">${randomEncouragement()}</p>
      ${everythingOwned() ? "" : `<p class="reward-note">+${pointsHTML(POINTS.dailyChallenge, "coin-sm")}</p>`}`;
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
    const sub = item.points === 0 ? "مجاني" : owned ? "مملوك ✓" : `🔒 ${pointsHTML(item.points, "coin-sm")}`;
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
    onSelect: (id) => { state.theme = id; applyTheme(); syncSettingsSummaries(); },
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
    onSelect: (id) => { state.reciter = id; refreshCurrentAudioSrc(); syncSettingsSummaries(); },
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
    onSelect: (id) => { state.font = id; applyFont(); syncSettingsSummaries(); },
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
    onSelect: (id) => { state.background = id; applyBackground(); syncSettingsSummaries(); },
    confirmTitle: "فتح خلفية جديدة",
    unlockedNoun: "خلفية جديدة",
    thisNoun: "هذه الخلفية",
  });
}

// Each settings group is folded shut, so its heading has to carry what is
// inside it - otherwise finding a setting means opening every drawer in
// turn. The value shown is the one currently in force, refreshed wherever
// it can change.
function syncSettingsSummaries() {
  const put = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text || ""; };
  const nameOf = (list, id) => { const hit = list.find((x) => x.id === id); return hit ? hit.name : ""; };
  const optionOf = (id) => {
    const sel = document.getElementById(id);
    return sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.trim() : "";
  };
  put("group-reciter-value", nameOf(RECITERS, state.reciter));
  const scheme = state.colorScheme && state.colorScheme !== "system" ? ` · ${optionOf("color-scheme-select")}` : "";
  put("group-theme-value", nameOf(THEMES, state.theme) + scheme);
  put("group-font-value", `${nameOf(FONTS, state.font)} · ${optionOf("font-size-select")} · ${numeralsStyle() === "arabic" ? "١٢٣" : "123"}`);
  put("group-background-value", nameOf(BACKGROUNDS, state.background));
  const age = AGE_MODES.find((m) => m.id === state.ageMode);
  put("group-age-value", age ? `${age.emoji} ${age.label}` : "");
  const vary = state.autoVaryModes !== false ? "تنويع تلقائي" : "طريقة ثابتة";
  // The select's own label ("30 آية في اليوم") is too long to sit beside the
  // heading, so the summary says the same thing in the space it has.
  const cap = state.reviewDailyCap ? `${state.reviewDailyCap} يوميًا` : "بلا سقف";
  put("group-drill-value", `${vary} · ${cap}`);
}

function initSettingsPanel() {
  const overlay = document.getElementById("settings-overlay");
  const fontSizeSelect = document.getElementById("font-size-select");
  const reviewCapSelect = document.getElementById("review-cap-select");
  const autoVaryInput = document.getElementById("auto-vary-modes");
  const colorSchemeSelect = document.getElementById("color-scheme-select");
  const numeralsSelect = document.getElementById("numerals-select");

  // Each one checked before it is touched. A browser can hold a page from
  // one build and a script from the next for a moment after a deploy, and a
  // control the script knows about may simply not be in that page - which
  // used to throw here and take the whole init sequence down with it: no
  // wird card, no Mushaf card, no browse tab, no routing. A missing control
  // should cost its own setting and nothing else.
  if (numeralsSelect) numeralsSelect.value = numeralsStyle();
  if (colorSchemeSelect) colorSchemeSelect.value = state.colorScheme || "system";
  if (fontSizeSelect) fontSizeSelect.value = state.fontSize;
  if (reviewCapSelect) reviewCapSelect.value = String(state.reviewDailyCap);
  if (autoVaryInput) autoVaryInput.checked = state.autoVaryModes !== false;
  renderAgeModeGrids();
  renderReciterGrid();
  renderThemeGrid();
  renderFontGrid();
  renderBackgroundGrid();
  renderPointsDisplay();
  syncSettingsSummaries();

  document.getElementById("btn-settings").addEventListener("click", () => openOverlay("settings"));
  document.getElementById("btn-settings-close").addEventListener("click", () => closeOverlay("settings"));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay("settings");
  });

  if (autoVaryInput) autoVaryInput.addEventListener("change", () => {
    state.autoVaryModes = autoVaryInput.checked;
    learnModeManualOverride = false;
    saveState();
    syncSettingsSummaries();
    if (document.getElementById("tab-learn").classList.contains("active")) loadLearnAyah();
  });

  if (reviewCapSelect) reviewCapSelect.addEventListener("change", () => {
    state.reviewDailyCap = Number(reviewCapSelect.value);
    saveState();
    syncSettingsSummaries();
    renderDashboard();
  });

  if (fontSizeSelect) fontSizeSelect.addEventListener("change", () => {
    state.fontSize = fontSizeSelect.value;
    saveState();
    applyFontSize();
    syncSettingsSummaries();
  });

  if (colorSchemeSelect) colorSchemeSelect.addEventListener("change", () => {
    state.colorScheme = colorSchemeSelect.value;
    saveState();
    applyTheme();
    syncSettingsSummaries();
  });

  if (numeralsSelect) numeralsSelect.addEventListener("change", () => {
    state.numerals = numeralsSelect.value;
    saveState();
    applyNumerals(); // converts what is already on screen, in both directions
    watchNumerals(); // and starts or stops watching for what comes next
    syncSettingsSummaries();
  });

  document.getElementById("btn-settings-floating").addEventListener("click", () => openOverlay("settings"));
  setupFloatingSettingsButton();
  setupModalScrollLock();

  const exportBtn = document.getElementById("btn-backup-export");
  const importBtn = document.getElementById("btn-backup-import");
  const fileInput = document.getElementById("backup-file");
  exportBtn.innerHTML = iconLabel("book", "احفظ نسخة");
  importBtn.innerHTML = iconLabel("repeat", "استعد من ملف");
  exportBtn.addEventListener("click", exportBackup);
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = ""; // so choosing the same file twice still fires
    if (file) importBackupFile(file);
  });

  const protectBtn = document.getElementById("btn-protect-storage");
  if (protectBtn) protectBtn.addEventListener("click", protectStorageFromTap);
  renderStorageStatus();

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

// The other half of the scroll lock (the CSS carries the rest): while any
// full-screen layer is open, the document behind it stops scrolling, so a
// swipe that runs past the end of a modal's own content doesn't carry on
// into the tab underneath and leave it somewhere else when the modal
// closes. Watched rather than toggled at each call site: overlays open and
// close from a dozen places (buttons, routes, the back button, a failed
// recitation), and one of them would always end up forgetting to say so.
const SCROLL_LOCKING_OVERLAYS = [
  "settings-overlay",
  "info-modal-overlay",
  "voice-modal-overlay",
  "mushaf-reader-overlay",
  "tasmee-overlay",
  "seam-overlay",
];

function setupModalScrollLock() {
  const layers = SCROLL_LOCKING_OVERLAYS.map((id) => document.getElementById(id)).filter(Boolean);
  const update = () => {
    const open = layers.some((el) => !el.classList.contains("modal-closed"));
    document.documentElement.classList.toggle("modal-open", open);
  };
  const watcher = new MutationObserver(update);
  layers.forEach((el) => watcher.observe(el, { attributes: true, attributeFilter: ["class"] }));
  update();
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
    <p><strong>اختبار التسميع بالصوت:</strong> يستخدم خاصية التعرّف على الكلام المدمجة في المتصفح. في معظم المتصفحات (ومنها كروم على أندرويد) يُرسَل الصوت المسجَّل إلى خوادم مزوّد المتصفح لتحويله إلى نص، وهذا خارج عن سيطرة التطبيق. التطبيق نفسه لا يسجّل صوتك ولا يحتفظ به ولا يرسله إلى أي جهة؛ يستقبل النص الناتج فقط ويستخدمه في الجهاز. إن لم ترغب بذلك، فلا تستخدم زر "اختبر بالتسميع" ولا وضع التسميع.</p>
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

// ---------- No zooming ----------
// The meta viewport and touch-action cover Chrome; Safari ignores
// user-scalable=no and delivers a pinch as a gesture event of its own, which
// no CSS can refuse - so it is turned away here. Nothing is lost: the text
// size setting scales the whole interface together, which zoom never did.
["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
});

// ---------- PWA service worker ----------

// An installed app is resumed far more often than it is opened: the page on
// screen is the one from last time, and nothing in it goes looking for a
// newer build - which is why a deployed change could sit unseen until the
// person happened to pull-to-refresh. So the app asks whenever it comes back
// to the foreground, and OFFERS the new version when one arrives.
//
// It offers rather than takes. Reloading on its own meant the app could go
// away under a finger mid-tap - and on a slow connection the reload leaves a
// page that is neither the old one nor the new one for as long as the
// network takes. A line the person taps when they are ready costs one tap
// and can't do that.
// Tested for truthiness, not with `in`: a browser (or a test) can have the
// property present and empty, and this block reads from it immediately - a
// throw here would take the app's whole init section below with it.
if (navigator.serviceWorker) {
  // Whether a worker was already serving this page when it loaded. The very
  // first registration also fires controllerchange, and announcing an update
  // for that would be announcing an update on someone's first ever visit.
  const hadController = !!navigator.serviceWorker.controller;
  let offered = false;

  function offerUpdate() {
    if (offered) return;
    offered = true;
    showUpdateToast();
  }

  // The new worker took this page over: what is on screen is from the
  // previous build. Say so - and let the person choose the moment.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) offerUpdate();
  });

  window.addEventListener("load", () => {
    // Root-relative for the same reason the page's assets are: registering
    // "sw.js" from /learn/settings would ask for /learn/sw.js, and scope the
    // worker to /learn/ even if it were there.
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      if (!reg) return;

      // A worker that has installed sits in "waiting" until every page using
      // the old one is gone - which, for an app that is resumed rather than
      // reopened, can be days. So when one is waiting, say a new version is
      // ready; taking it is a reload, and the reload is the person's to make.
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate();
      reg.addEventListener("updatefound", () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener("statechange", () => {
          if (incoming.state === "installed" && navigator.serviceWorker.controller) offerUpdate();
        });
      });

      let lastCheck = Date.now();
      const check = () => {
        if (document.visibilityState !== "visible") return;
        if (Date.now() - lastCheck < 60000) return; // once a minute at most
        lastCheck = Date.now();
        reg.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", check);
      window.addEventListener("pageshow", check);
      window.addEventListener("focus", check);
    }).catch(() => {});
  });
}

// An error nobody sees leaves a screen that is half drawn and answers no
// taps - which is exactly what a page in that state looks like from the
// outside: "the settings button doesn't press". One line, once, with the way
// out on it.
let brokeAlready = false;
function reportBreakage() {
  if (brokeAlready) return;
  brokeAlready = true;
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast toast-update show";
  const main = document.createElement("div");
  main.textContent = "⚠️ حدث خلل في هذه الشاشة";
  const row = document.createElement("div");
  row.className = "toast-update-actions";
  const go = document.createElement("button");
  go.className = "btn primary";
  go.textContent = "أعد التحميل";
  go.addEventListener("click", () => location.reload());
  const later = document.createElement("button");
  later.className = "btn";
  later.textContent = "تجاهل";
  later.addEventListener("click", () => el.remove());
  row.appendChild(go);
  row.appendChild(later);
  el.appendChild(main);
  el.appendChild(row);
  container.appendChild(el);
}
window.addEventListener("error", reportBreakage);
window.addEventListener("unhandledrejection", reportBreakage);

// The offer itself: a toast that stays until it is answered, with the reload
// on the button rather than on a timer.
function showUpdateToast() {
  const container = document.getElementById("toast-container");
  if (!container) return;
  if (container.querySelector(".toast-update")) return;
  const el = document.createElement("div");
  el.className = "toast toast-update show";
  const main = document.createElement("div");
  main.textContent = "✨ نسخة جديدة من تدبر جاهزة";
  const row = document.createElement("div");
  row.className = "toast-update-actions";
  const go = document.createElement("button");
  go.className = "btn primary";
  go.textContent = "حدّث الآن";
  go.addEventListener("click", () => {
    // The waiting worker takes over on this reload either way; asking it to
    // skip only saves it a wait.
    try {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }).catch(() => {});
    } catch (e) { /* nothing to ask */ }
    setTimeout(() => location.reload(), 150);
  });
  const later = document.createElement("button");
  later.className = "btn";
  later.textContent = "لاحقًا";
  later.addEventListener("click", () => el.remove());
  row.appendChild(go);
  row.appendChild(later);
  el.appendChild(main);
  el.appendChild(row);
  container.appendChild(el);
}

// ---------- Init ----------

// Each step on its own. They are independent pieces of the screen, and a
// failure in one is no reason for the rest of the app not to start - the
// alternative is what a single missing element produced: a page of empty
// cards with nothing wired to anything.
// ---------- Pull down to reload ----------
//
// The browser's own pull-to-refresh is off (overscroll-behavior-y: none,
// which is what stops the page bouncing away under a modal), and an
// installed app has no address bar to reload from - so when the app came
// back wrong there was no way out of it but killing it from the task
// switcher. This is that way out, in the gesture people already reach for.
//
// It clears the shell cache before reloading, not just the page: the
// failure it exists for is a stale half of the shell, and a plain reload
// would be answered from the very cache that is wrong. Only when online,
// though - deleting the offline copy and then failing to fetch a new one
// would leave nothing at all.

const PULL_TRIGGER = 78;   // px of travel before the release does anything
const PULL_MAX = 120;      // the indicator stops following the thumb here

// navigator.onLine is only trustworthy when it says false: a phone on a dead
// data connection reports true. So the bar goes up on the events (and on a
// definite false at start), and comes down when the browser says the
// connection is back - and the app's own fetches keep their error messages
// for the case the bar is wrong.
function renderOfflineBar() {
  const bar = document.getElementById("offline-bar");
  if (bar) bar.classList.toggle("hidden", navigator.onLine !== false);
}
window.addEventListener("offline", renderOfflineBar);
window.addEventListener("online", renderOfflineBar);
renderOfflineBar();

// Root-relative, because the app answers at /review and /learn/settings too:
// a relative "index.html" from there asks for /review/index.html, and the
// worker's own shell entries are the root ones.
const SHELL_FILES = ["/", "/index.html", "/css/style.css", "/js/app.js"];

// The shell is REPLACED, never emptied. It used to be deleted outright and
// the fresh copy left to the reload that followed - which is fine until the
// reload has no network, and then a registered worker has nothing at all to
// serve and every attempt after it is the browser's "site can't be reached".
// navigator.onLine does not protect against this: a phone on a dead data
// connection reports itself online. So the new copies are fetched first, and
// only a complete set replaces what is there; anything less leaves the old
// shell exactly where it was.
async function refreshShell() {
  if (!window.caches) return false;
  const keys = await caches.keys();
  const name = keys.find((k) => k.startsWith("tadabbur-shell"));
  if (!name) return false;
  // The ?shell-refresh marker makes the worker stand aside, so this reaches
  // the network or fails - it cannot be answered from the cache it is trying
  // to replace, which would let a refresh with no connection report success
  // and change nothing.
  const fresh = await Promise.all(
    SHELL_FILES.map((u) =>
      fetch(`${u}${u.includes("?") ? "&" : "?"}shell-refresh=${Date.now()}`, { cache: "reload" })
        .then((r) => (r && r.ok ? r : null))
        .catch(() => null)
    )
  );
  if (fresh.some((r) => !r)) return false;
  const cache = await caches.open(name);
  await Promise.all(SHELL_FILES.map((u, i) => cache.put(u, fresh[i])));
  return true;
}

async function hardReload() {
  try { await refreshShell(); } catch (e) { /* keep whatever is cached */ }
  location.reload();
}

(function setupPullToRefresh() {
  const el = document.getElementById("pull-refresh");
  if (!el) return;
  let startY = null, startX = 0, pulling = false, dist = 0;

  const overlayOpen = () => document.documentElement.classList.contains("modal-open");
  // Only from the very top, and never out of something that scrolls itself -
  // dragging down inside the ayah box or a combo list means to scroll it.
  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
  const inScroller = (target) =>
    !!(target && target.closest && target.closest(".ayah-scroll, .combo-list, .mushaf-map-grid, .wird-week, .mode-switch, [data-no-swipe]"));

  const reset = () => {
    startY = null; pulling = false; dist = 0;
    el.classList.remove("visible", "ready");
    el.style.transform = "";
  };

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || overlayOpen() || !atTop() || inScroller(e.target)) { startY = null; return; }
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (startY === null || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - startY;
    const dx = Math.abs(e.touches[0].clientX - startX);
    // A mostly sideways drag is the tab swipe, not this.
    if (dy <= 0 || dx > Math.abs(dy)) { if (!pulling) startY = null; return; }
    pulling = true;
    // Resisted, so it feels like pulling against something rather than
    // dragging a free object.
    dist = Math.min(PULL_MAX, dy * 0.55);
    el.classList.add("visible");
    el.classList.toggle("ready", dist >= PULL_TRIGGER);
    el.style.transform = `translateX(-50%) translateY(${dist}px)`;
  }, { passive: true });

  document.addEventListener("touchend", () => {
    if (!pulling) { reset(); return; }
    if (dist >= PULL_TRIGGER) {
      el.classList.add("spinning");
      el.style.transform = `translateX(-50%) translateY(${PULL_TRIGGER}px)`;
      hardReload();
      return;   // leave it showing; the page is on its way out
    }
    reset();
  }, { passive: true });

  document.addEventListener("touchcancel", reset, { passive: true });
})();

function startUp(name, fn) {
  try { fn(); } catch (e) { console.error(`تعذّر تهيئة ${name}`, e); }
}

startUp("المظهر", applyTheme);
startUp("حجم الخط", applyFontSize);
startUp("الخط", applyFont);
startUp("الخلفية", applyBackground);
startUp("شكل الأرقام", watchNumerals);
startUp("الإعدادات", initSettingsPanel);
startUp("بطاقة الورد", initWirdCard);
startUp("بطاقة المصحف", initMushafCard);
startUp("تبويب التصفح", initBrowseTab);
startUp("وجهة الإضافة", renderAddIntent);
// Set on every launch, not only when the toggle is touched: the timer lives
// in the page, and the page is new.
startUp("تذكير الورد", scheduleWirdReminder);
// The footer names where the ayat come from and where progress is kept.
// It is true on every tab and needed on none of them but the first: under
// the drill, the review and the browser it was a third card of small print
// repeating itself. It follows the route instead.
function syncFooterVisibility() {
  const footer = document.querySelector(".app-footer");
  if (footer) footer.classList.toggle("hidden", document.documentElement.dataset.route !== "dashboard");
}

startUp("شريط الاتصال", () => {
  const btn = document.getElementById("btn-connection-retry");
  if (btn) btn.addEventListener("click", retryFailedInits);
  renderConnectionBanner();
});

// Opens whatever the address bar asks for. The tab's panel is already the
// visible one (the head script saw the same URL), so this only runs its own
// setup - and rewrites an old #learn link, or an /index.html landing, as the
// address that tab now has. An overlay with nothing left to reopen (a reader
// whose pages aren't kept any more) drops off the address rather than
// opening empty.
startUp("العنوان", () => {
  const initialRoute = parseRoute();
  const initialOverlays = initialRoute.overlays.filter((name) => OVERLAY_ROUTES[name].restorable());
  writeRoute(initialRoute.tab, initialOverlays, true);
  switchTab(initialRoute.tab, { fromHistory: true });
  syncFooterVisibility();
  applyOverlays(initialOverlays);
});
// The markup that shipped with the page carries digits too, and it was drawn
// before the observer existed: one sweep now covers it.
applyNumerals();

// The head script armed a timer against this. Reaching it means every init
// step ran; not reaching it means the app is half-built, and the timer will
// clear the shell cache and reload once rather than leaving someone staring
// at blank buttons.
window.__tadabburBooted = true;
