/**
 * newNewton - Multi-Feature Extension Popup Controller
 *
 * Features:
 * 1. Top Navbar Navigation across 4 tabs:
 *    - Utilities (Theme Switcher & Telemetry Blocker)
 *    - Mess Menu (RU Campus Mess Schedule maintained by Garvit-png, weekly refresh)
 *    - Attendance (Rollup logic powered by nst-attendance by yats0x7)
 *    - Mystery (Placeholder)
 * 2. Mess Menu Subsystem:
 *    - Maintained upstream by Garvit-png (https://github.com/Garvit-png)
 *    - Fetches weekly menu from GitHub raw JSON (updates Mondays)
 *    - Caches locally in chrome.storage.local for 1 week
 *    - Classifies dishes into Specials & Staples via isSecondaryItem()
 *    - Identifies active meal ("Serving Now") & upcoming meal ("Next Up")
 *    - Dynamic 7-day pill selector with real-world today detection
 * 3. Attendance Subsystem:
 *    - Direct LMS API integration using bearer token from portal
 *    - Pure arithmetic rollup & skip budget calculation
 *    - Theory + Lab pairing with exact recovery/skip verdicts
 *    - Native HTML5 missed lectures breakdown
 *    - Dynamic safety target switcher (75%, 80%, 85%)
 */

import { fetchFullAttendanceData } from './attendance/portal-api.js';
import { summarize, combine, DEFAULT_TARGET } from './attendance/math.js';
import {
  fetchUnsubmittedQuizzes,
  submitQuizWithSupabaseSolutions,
  extractShortCourseName,
  sliderPosToSeconds,
  secondsToSliderPos,
  computeQuestionDelay
} from './quiz-client.js';


// ========================================================
// 1. CONSTANTS & DEFINITIONS
// ========================================================

const MENU_GITHUB_URL = 'https://raw.githubusercontent.com/suwupnil/newNewton/refs/heads/main/menu.json';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const MEAL_CONFIG = [
  {
    key: 'breakfast',
    label: 'Breakfast',
    time: '07:30 - 09:30 AM',
    startMin: 450,
    endMin: 570,
    iconClass: 'meal-icon-breakfast',
    svgIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>`
  },
  {
    key: 'lunch',
    label: 'Lunch',
    time: '12:00 - 02:30 PM',
    startMin: 720,
    endMin: 870,
    iconClass: 'meal-icon-lunch',
    svgIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
    </svg>`
  },
  {
    key: 'snacks',
    label: 'Snacks',
    time: '04:30 - 06:30 PM',
    startMin: 990,
    endMin: 1110,
    iconClass: 'meal-icon-snacks',
    svgIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
      <line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>
    </svg>`
  },
  {
    key: 'dinner',
    label: 'Dinner',
    time: '07:30 - 09:30 PM',
    startMin: 1170,
    endMin: 1290,
    iconClass: 'meal-icon-dinner',
    svgIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9ZM7 21h10M19.5 12 22 6"/>
      <path d="M16 3c0 1.5-1.5 2-1.5 3M11 3c0 1.5-1.5 2-1.5 3M6 3c0 1.5-1.5 2-1.5 3"/>
    </svg>`
  }
];

// Offline bundled fallback menu data
const FALLBACK_MENU = {
  "Monday": {
    "breakfast": ["Watermelon", "Dalia", "Cornflakes", "Onion Uttapam", "Sambar & Peanut Chutney", "Hot Milk", "Cold Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
    "lunch": ["Sweet Lassi", "Green Salad", "Rajma Masala", "Dhania Aloo", "Veg Poriyal", "Jeera Rice", "Chapati", "Gulab Jamun"],
    "snacks": ["Chana Chaat", "Chutney & Spice Pwd", "Cold Coffee", "Tea (D)"],
    "dinner": ["Cucumber Salad", "Chana Dal Punjabi Style", "Lauki Kofta Curry", "Rasam", "Rice", "Chapati"]
  },
  "Tuesday": {
    "breakfast": ["Banana", "Masala Oats", "Muesli", "Kulcha", "Matar", "Hot Milk (D)", "Cold Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
    "lunch": ["Rooh Afza", "Cucumber Salad", "Soya Chaap Masala", "Punjabi Mix Dal", "Onion Garlic Rasam", "Plain Rice", "Chapati"],
    "snacks": ["Veg Pakori", "Ketchup", "Hot Milk (D)", "Tea (D)", "Coffee Powder"],
    "dinner": ["Green Salad", "Achari Aloo", "Dal Makhni", "Tomato Sambar", "Jeera Rice", "Chapati", "Ice Cream"]
  },
  "Wednesday": {
    "breakfast": ["Watermelon", "Sandwich", "Chocos", "Vermicelli Upma", "Tomato Garlic Chutney", "Hot Milk (D)", "Cold Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
    "lunch": ["Butter Milk", "Pickle Onion", "Paneer Matar", "Arhar Dal Fry", "Ghee Rice", "Chapati", "Rice Kheer"],
    "snacks": ["Wada Pav", "Chutney", "Cold Coffee", "Tea (D)"],
    "dinner": ["Cucumber Carrot Salad", "Cabbage Tamatar Matar", "Chole Masala", "Pacchadi", "Plain Rice", "Chapati"]
  },
  "Thursday": {
    "breakfast": ["Banana", "Boiled Chana Sprout", "Cornflakes", "Veg Paratha", "Curd & Pickle", "Hot Milk (D)", "Cold Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
    "lunch": ["Boondi Raita", "Cucumber Salad", "Veg Biryani", "Mirch Ka Salan", "Karam Chutney", "Dhaba Dal", "Chapati"],
    "snacks": ["French Fries", "Hot Milk (D)", "Tea (D)", "Coffee Powder"],
    "dinner": ["Sprout Salad", "Chili Garlic Tofu", "Rajma Punjabi", "Cabbage Foogath", "Peas Rice", "Chapati", "Mango Mousse"]
  },
  "Friday": {
    "breakfast": ["Watermelon", "Chocos", "Maccaroni", "Pav", "Missal", "Hot Milk (D)", "Cold Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
    "lunch": ["Mango Crush", "Green Salad", "Kadhi Pakori", "Achara Sabzi", "Sambar", "Plain Rice", "Chapati", "Pineapple Halwa"],
    "snacks": ["Samosa", "Ketchup", "Cold Coffee", "Tea (D)", "Coffee Powder"],
    "dinner": ["Cucumber Salad", "Paneer Lababdar", "Panchratna Dal", "Jeera Rice", "Chapati"]
  },
  "Saturday": {
    "breakfast": ["Banana", "Muesli", "Masala Oats", "Aloo Pyaaz Paratha", "Curd, Green Chutney & Pickle", "Hot Milk (D)", "Cold Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
    "lunch": ["Chaas", "Cucumber Carrot Salad", "Bhindi Aloo Masaledar", "Dal Makhni", "Pappu Charu", "Plain Rice", "Chapati", "Ice Cream"],
    "snacks": ["Pizza", "Ketchup", "Hot Milk (D)", "Tea (D)", "Coffee Powder"],
    "dinner": ["Moong Sprout Salad", "Mix Veg Kolhapuri", "Bukhara Dal", "Suran Curry", "Ghee Rice", "Chapati", "Ice Cream"]
  },
  "Sunday": {
    "breakfast": ["Watermelon", "Cornflakes", "Pasta in Red Sauce", "Moong Chila", "Chatpati Chatni", "Cold/Hot Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
    "lunch": ["Butter Milk", "Laccha Onion", "Chole", "Khatta Meetha Sitaphal", "Brinjal Curry", "Plain Rice", "Bhature", "Sweet Boondi"],
    "snacks": ["Jhal Muri", "Cold Coffee", "Tea (D)", "Coffee Powder"],
    "dinner": ["Green Salad", "Capsicum Corn Masala", "Bhaba Dal", "Tamata Pacchadi", "Steamed Rice", "Chapati"]
  }
};

// ========================================================
// 2. DISH CLASSIFIER (Special vs. Mundane Secondary)
// ========================================================

/**
 * Classifies an item as a secondary (daily mundane staple) or special dish.
 */
function isSecondaryItem(item) {
  if (!item) return false;

  const name = item.toLowerCase();

  // List of specific common items from the source code
  const commonItems = new Set([
    "hot milk", "cold milk", "tea", "coffee powder", "cold coffee",
    "bread", "butter", "jam", "bread/butter/jam", "green salad",
    "tossed salad", "cucumber salad", "onion lachha", "laccha pyaaz",
    "chana sprout salad", "moong sprout salad", "cucumber-carrot salad",
    "ketchup", "chutney", "green chutney", "pickle", "curd",
    "sambar", "rasam", "chapati", "rice", "plain rice",
    "steamed rice", "jeera rice", "ghee rice", "dum pulao sada"
  ]);

  // List of keywords that automatically categorize an item as secondary
  const commonKeywords = ["milk", "tea", "bread", "chapati", "rice", "salad", "chutney", "ketchup", "rasam", "sambar"];

  // Check for exact match in the set
  if (commonItems.has(name)) return true;

  // Check if the item name includes any of the common keywords
  return commonKeywords.some(keyword => name.includes(keyword));
}

// ========================================================
// 3. DOM ELEMENT REFERENCES
// ========================================================

// Navbar & Tabs
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanes = document.querySelectorAll('.tab-pane');

// Utilities elements
const statusMessage = document.getElementById('statusMessage');
const segmentBtns = document.querySelectorAll('.segment-btn');
const telemetryToggle = document.getElementById('telemetryToggle');
const telemetryStatusTag = document.getElementById('telemetryStatusTag');
const privacyItems = document.querySelectorAll('.privacy-item');

// Mess Menu elements
const messDayHeading = document.getElementById('messDayHeading');
const messDateBadge = document.getElementById('messDateBadge');
const messWeekStatus = document.getElementById('messWeekStatus');
const btnGoToToday = document.getElementById('btnGoToToday');
const btnRefreshMenu = document.getElementById('btnRefreshMenu');
const dayButtons = document.querySelectorAll('.day-btn');
const messMealsContainer = document.getElementById('messMealsContainer');

// Attendance elements
const attOverallBadge = document.getElementById('attOverallBadge');
const attSyncStatus = document.getElementById('attSyncStatus');
const btnSyncAttendance = document.getElementById('btnSyncAttendance');
const attTargetPills = document.querySelectorAll('.att-target-pill');
const attendanceContainer = document.getElementById('attendanceContainer');

// Mystery elements
const mysteryHeroCount = document.getElementById('mysteryHeroCount');
const mysteryBadge = document.getElementById('mysteryBadge');
const mysterySyncStatus = document.getElementById('mysterySyncStatus');
const btnRefreshMystery = document.getElementById('btnRefreshMystery');
const btnSubmitAllMystery = document.getElementById('btnSubmitAllMystery');
const mysteryContainer = document.getElementById('mysteryContainer');

// Lazy Submit elements
const toggleLazySubmit = document.getElementById('toggleLazySubmit');
const lazyStatusPill = document.getElementById('lazyStatusPill');
const lazySlidersContainer = document.getElementById('lazySlidersContainer');
const delaySlider = document.getElementById('delaySlider');
const delayValBadge = document.getElementById('delayValBadge');
const entropySlider = document.getElementById('entropySlider');
const entropyValBadge = document.getElementById('entropyValBadge');
const lazyKeepBrowserOpenNote = document.getElementById('lazyKeepBrowserOpenNote');

// Live Progress Banner elements
const mysteryLiveBanner = document.getElementById('mysteryLiveBanner');
const liveQuizTitle = document.getElementById('liveQuizTitle');
const liveStatusText = document.getElementById('liveStatusText');
const liveProgressBar = document.getElementById('liveProgressBar');
const btnPauseResume = document.getElementById('btnPauseResume');
const btnFastForward = document.getElementById('btnFastForward');
const btnStopSubmission = document.getElementById('btnStopSubmission');

// State variables
let currentMenuData = null;
let selectedDay = 'Monday';
let todayDayName = 'Monday';

let currentAttendanceData = null;
let currentAttendanceTarget = DEFAULT_TARGET; // 0.75

let currentMysteryData = null;
let isMysteryLoading = false;
let isMysterySubmitting = false;

// Lazy Submit configuration state
let isLazySubmitEnabled = false;
let currentLazyDelay = 15;
let currentLazyEntropy = 5;
let skipRemainingDelay = false;
let isSubmissionStopped = false;
let activeWaitResolver = null;


// ========================================================
// 4. SHARED UTILITY FUNCTIONS
// ========================================================

function showStatus(text, isSuccess = true) {
  if (!statusMessage) return;
  statusMessage.textContent = text;
  statusMessage.className = isSuccess ? 'status-message success' : 'status-message';
  setTimeout(() => {
    statusMessage.textContent = '';
  }, 2500);
}

function resolveEffectiveTheme(mode) {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

function updatePopupUI(mode) {
  segmentBtns.forEach(btn => {
    if (btn.getAttribute('data-theme') === mode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const effectiveTheme = resolveEffectiveTheme(mode);
  const targetClass = effectiveTheme === 'dark' ? 'theme-dark' : 'theme-light';

  document.documentElement.classList.remove('theme-dark', 'theme-light', 'theme-system');
  document.body.classList.remove('theme-dark', 'theme-light', 'theme-system');

  document.documentElement.classList.add(targetClass);
  document.body.classList.add(targetClass);

  if (mode === 'system') {
    document.documentElement.classList.add('theme-system');
    document.body.classList.add('theme-system');
  }

  try {
    localStorage.setItem('popup_theme_mode', mode);
    localStorage.setItem('popup_theme_name', effectiveTheme);
  } catch (e) { }
}

function updateTelemetryUI(isBlocked) {
  if (!telemetryToggle) return;
  telemetryToggle.checked = isBlocked;
  if (isBlocked) {
    telemetryStatusTag.textContent = 'Blocked';
    telemetryStatusTag.className = 'theme-tag tag-blocked';
    privacyItems.forEach(item => item.classList.remove('disabled'));
  } else {
    telemetryStatusTag.textContent = 'Allowed';
    telemetryStatusTag.className = 'theme-tag tag-allowed';
    privacyItems.forEach(item => item.classList.add('disabled'));
  }
}

// ========================================================
// 5. TOP NAVBAR TAB SWITCHING
// ========================================================

function switchTab(targetTabId) {
  navTabs.forEach(tab => {
    const isActive = tab.getAttribute('data-tab') === targetTabId;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  tabPanes.forEach(pane => {
    const isTarget = pane.id === targetTabId;
    pane.classList.toggle('active', isTarget);
  });

  try {
    chrome.storage.local.set({ activeTab: targetTabId });
  } catch (e) { }

  // If opening mess menu and data not loaded yet, initiate load
  if (targetTabId === 'tabMessMenu' && !currentMenuData) {
    initMessMenu();
  }

  // If opening attendance and data not loaded yet, initiate load
  if (targetTabId === 'tabAttendance' && !currentAttendanceData) {
    initAttendance();
  }

  // If opening mystery and data not loaded yet, initiate load
  if (targetTabId === 'tabMystery' && !currentMysteryData) {
    initMystery();
  }
}

navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTabId = tab.getAttribute('data-tab');
    switchTab(targetTabId);
  });
});

// Restore last active tab (default to Utilities or Mess Menu)
chrome.storage.local.get(['activeTab'], (result) => {
  const initialTab = result.activeTab || 'tabUtilities';
  switchTab(initialTab);
});

// ========================================================
// 6. MESS MENU DATA FETCHING & WEEKLY REFRESH LOGIC
// ========================================================

/**
 * Calculates the timestamp of the most recent Monday at 00:00:00 local time.
 */
function getMostRecentMondayTimestamp() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const daysSinceMonday = (day + 6) % 7;
  const recentMonday = new Date(now);
  recentMonday.setDate(now.getDate() - daysSinceMonday);
  recentMonday.setHours(0, 0, 0, 0);
  return recentMonday.getTime();
}

/**
 * Checks if the cached menu needs a refresh.
 * Updates happen every Monday, or if older than 7 days.
 */
function isCacheExpired(lastFetched) {
  if (!lastFetched || typeof lastFetched !== 'number') return true;

  // If more than 7 days old
  if (Date.now() - lastFetched > 7 * 24 * 60 * 60 * 1000) return true;

  // If last fetch was before this week's Monday
  const recentMondayTs = getMostRecentMondayTimestamp();
  if (lastFetched < recentMondayTs) {
    return true;
  }

  return false;
}

/**
 * Fetches menu from GitHub raw JSON and persists to chrome.storage.local.
 */
async function fetchMenuFromUpstream() {
  try {
    const response = await fetch(MENU_GITHUB_URL, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data && data.Monday && data.Tuesday) {
      const timestamp = Date.now();
      await chrome.storage.local.set({
        mess_menu_data: data,
        mess_menu_last_fetched: timestamp
      });
      return { data, timestamp };
    }
    throw new Error('Invalid JSON format');
  } catch (err) {
    console.warn('[newNewton] Upstream menu fetch failed:', err);
    return null;
  }
}

/**
 * Loads menu data: checks local cache, determines if refresh is required,
 * and falls back to bundled menu when offline.
 */
async function loadMenuData(forceRefresh = false) {
  let cached = null;
  try {
    cached = await chrome.storage.local.get(['mess_menu_data', 'mess_menu_last_fetched']);
  } catch (e) { }

  const hasCachedData = cached && cached.mess_menu_data && typeof cached.mess_menu_data === 'object';
  const needsRefresh = forceRefresh || !hasCachedData || isCacheExpired(cached.mess_menu_last_fetched);

  // If we already have cached data, display it immediately for 0ms latency
  if (hasCachedData) {
    currentMenuData = cached.mess_menu_data;
    renderSelectedDayMenu();
    updateMenuStatusDisplay(cached.mess_menu_last_fetched);
  }

  // Fetch in background if refresh needed or force requested
  if (needsRefresh) {
    btnRefreshMenu?.classList.add('spinning');
    const upstreamResult = await fetchMenuFromUpstream();
    btnRefreshMenu?.classList.remove('spinning');

    if (upstreamResult) {
      currentMenuData = upstreamResult.data;
      renderSelectedDayMenu();
      updateMenuStatusDisplay(upstreamResult.timestamp);
      if (forceRefresh) {
        showStatus('Menu refreshed from GitHub');
      }
    } else if (!hasCachedData) {
      // Offline first-run fallback
      currentMenuData = FALLBACK_MENU;
      renderSelectedDayMenu();
      messWeekStatus.textContent = 'Weekly Menu (Offline fallback)';
    }
  } else if (!hasCachedData) {
    currentMenuData = FALLBACK_MENU;
    renderSelectedDayMenu();
    messWeekStatus.textContent = 'Weekly Menu (Offline fallback)';
  }
}

function updateMenuStatusDisplay(lastFetchedTimestamp) {
  if (!messWeekStatus) return;
  if (!lastFetchedTimestamp) {
    messWeekStatus.textContent = 'Weekly Menu • Refreshes Mondays';
    return;
  }
  const date = new Date(lastFetchedTimestamp);
  const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  messWeekStatus.textContent = `Synced ${formattedDate} • Refreshes Mondays`;
}

// ========================================================
// 7. MESS MENU UI RENDERING & MEAL CARDS
// ========================================================

/**
 * Formats a Date object to e.g. "Wed, 30 Sep"
 */
function formatShortDate(dateObj) {
  const weekdayShort = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNum = dateObj.getDate();
  const monthShort = dateObj.toLocaleDateString('en-US', { month: 'short' });
  return `${weekdayShort}, ${dayNum} ${monthShort}`;
}

/**
 * Calculates the calendar Date corresponding to a given weekday name in the current week.
 */
function getDateForWeekday(targetDayName) {
  const now = new Date();
  const currentDayIndex = (now.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const targetDayIndex = WEEKDAYS.indexOf(targetDayName);
  if (targetDayIndex === -1) return now;

  const diffDays = targetDayIndex - currentDayIndex;
  const result = new Date(now);
  result.setDate(now.getDate() + diffDays);
  return result;
}

/**
 * Determines current live status for a meal on today's view.
 * Returns: { isServing: boolean, isNext: boolean }
 */
function calculateMealLiveStatus(mealConfig, currentMin, isToday) {
  if (!isToday) return { isServing: false, isNext: false };

  // Currently serving
  if (currentMin >= mealConfig.startMin && currentMin <= mealConfig.endMin) {
    return { isServing: true, isNext: false };
  }

  // Next up
  if (currentMin < mealConfig.startMin) {
    return { isServing: false, isNext: true };
  }

  return { isServing: false, isNext: false };
}

/**
 * Renders the meals for the currently selected weekday.
 */
function renderSelectedDayMenu() {
  if (!messMealsContainer) return;

  const now = new Date();
  const currentDayIndex = (now.getDay() + 6) % 7;
  todayDayName = WEEKDAYS[currentDayIndex];
  const isViewingToday = selectedDay === todayDayName;

  // 1. Update header titles
  if (messDayHeading) {
    messDayHeading.textContent = isViewingToday ? 'Today' : selectedDay;
  }

  const targetDate = getDateForWeekday(selectedDay);
  if (messDateBadge) {
    messDateBadge.textContent = formatShortDate(targetDate);
  }

  // Show/Hide "Go to Today" button
  if (btnGoToToday) {
    btnGoToToday.style.display = isViewingToday ? 'none' : 'inline-flex';
  }

  // 2. Update 7-day selector pills
  dayButtons.forEach(btn => {
    const day = btn.getAttribute('data-day');
    btn.classList.toggle('active', day === selectedDay);
    btn.classList.toggle('is-today', day === todayDayName);
  });

  // 3. Verify menu data existence for selected day
  if (!currentMenuData || !currentMenuData[selectedDay]) {
    messMealsContainer.innerHTML = `
      <div class="mess-empty-state">
        <p>No menu data available for ${selectedDay}.</p>
      </div>
    `;
    return;
  }

  const dayMenu = currentMenuData[selectedDay];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Find next upcoming meal for today to open by default
  let nextMealFound = false;

  // Build Meal Cards HTML
  let cardsHtml = '';

  MEAL_CONFIG.forEach((meal, index) => {
    const mealItems = dayMenu[meal.key] || [];
    const specials = mealItems.filter(item => !isSecondaryItem(item));
    const staples = mealItems.filter(item => isSecondaryItem(item));

    const { isServing, isNext } = calculateMealLiveStatus(meal, currentMinutes, isViewingToday);

    // Determine auto-expanded state:
    // If today: expand active serving meal, or first upcoming meal.
    // If not today: expand breakfast by default.
    let shouldExpand = false;
    let statusBadgeHtml = '';

    if (isViewingToday) {
      if (isServing) {
        shouldExpand = true;
        statusBadgeHtml = `<span class="meal-status-badge badge-serving">● Serving Now</span>`;
      } else if (isNext && !nextMealFound) {
        shouldExpand = true;
        nextMealFound = true;
        statusBadgeHtml = `<span class="meal-status-badge badge-next">Next Up</span>`;
      }
    } else {
      // Non-today: expand breakfast initially
      if (index === 0) shouldExpand = true;
    }

    const specialsChips = specials.length > 0
      ? specials.map(dish => `
          <span class="item-chip special-chip" title="Special item">
            <span class="chip-dot"></span>
            ${escapeHtml(dish)}
          </span>
        `).join('')
      : '<span class="card-description">Standard items</span>';

    const staplesChips = staples.length > 0
      ? staples.map(dish => `
          <span class="item-chip staple-chip" title="Daily staple">
            ${escapeHtml(dish)}
          </span>
        `).join('')
      : '';

    cardsHtml += `
      <details class="meal-card ${isServing ? 'is-active-meal' : ''}" data-meal="${meal.key}" ${shouldExpand ? 'open' : ''}>
        <summary class="meal-card-header">
          <div class="meal-header-left">
            <div class="meal-icon-wrapper ${meal.iconClass}">
              ${meal.svgIcon}
            </div>
            <div class="meal-info">
              <div class="meal-title-row">
                <span class="meal-title">${meal.label}</span>
                ${statusBadgeHtml}
              </div>
              <span class="meal-time">${meal.time}</span>
            </div>
          </div>
          <span class="meal-toggle-btn" aria-hidden="true">
            <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </summary>

        <div class="meal-card-body">
          <!-- Specials Section -->
          <div class="meal-items-section specials-section">
            <div class="section-label">
              <span>✨ Special & Main</span>
              <span class="item-count-badge">${specials.length}</span>
            </div>
            <div class="items-chip-grid">
              ${specialsChips}
            </div>
          </div>

          <!-- Daily Staples Section -->
          ${staples.length > 0 ? `
            <div class="meal-items-section staples-section">
              <div class="section-label">
                <span>Daily Staples</span>
                <span class="item-count-badge">${staples.length}</span>
              </div>
              <div class="items-chip-grid">
                ${staplesChips}
              </div>
            </div>
          ` : ''}
        </div>
      </details>
    `;
  });

  messMealsContainer.innerHTML = cardsHtml;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 7-Day Buttons click listeners
dayButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    selectedDay = btn.getAttribute('data-day');
    renderSelectedDayMenu();
  });
});

// "Go to Today" button listener
btnGoToToday?.addEventListener('click', () => {
  selectedDay = todayDayName;
  renderSelectedDayMenu();
});

// "Refresh" button listener
btnRefreshMenu?.addEventListener('click', () => {
  loadMenuData(true);
});

// Initialize Mess Menu
function initMessMenu() {
  const now = new Date();
  const currentDayIndex = (now.getDay() + 6) % 7;
  todayDayName = WEEKDAYS[currentDayIndex];
  selectedDay = todayDayName;
  loadMenuData(false);
}

// ========================================================
// 8. UTILITIES TAB CONTROLLER (Theme & Telemetry Blocker)
// ========================================================

// Immediately apply theme from synchronous localStorage on script execution
try {
  const cachedMode = localStorage.getItem('popup_theme_mode') || 'system';
  updatePopupUI(cachedMode);
} catch (e) { }

// Load saved settings from chrome.storage.sync
chrome.storage.sync.get(['themeMode', 'themeName', 'blockTelemetry'], (result) => {
  const mode = result.themeMode || (result.themeName === 'dark' ? 'dark' : (localStorage.getItem('popup_theme_mode') || 'system'));
  updatePopupUI(mode);

  const isBlocked = result.blockTelemetry !== undefined ? result.blockTelemetry : true;
  updateTelemetryUI(isBlocked);
});

// Theme Segment Buttons
segmentBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    const selectedMode = btn.getAttribute('data-theme');
    updatePopupUI(selectedMode);

    const effectiveTheme = resolveEffectiveTheme(selectedMode);
    const targetClass = effectiveTheme === 'dark' ? 'grauity-theme-dark' : 'grauity-theme-light';

    await chrome.storage.sync.set({
      themeMode: selectedMode,
      themeName: effectiveTheme,
      isThemeEnabled: effectiveTheme === 'dark'
    });

    await notifyActiveTab(effectiveTheme, targetClass, selectedMode);
    showStatus(`Theme set to ${selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)}`);
  });
});

// Telemetry Blocker Switch
telemetryToggle?.addEventListener('change', async () => {
  const isBlocked = telemetryToggle.checked;
  updateTelemetryUI(isBlocked);

  await chrome.storage.sync.set({ blockTelemetry: isBlocked });

  chrome.runtime.sendMessage({
    action: 'SET_TELEMETRY_BLOCK',
    blockTelemetry: isBlocked
  });

  await notifyActiveTabTelemetry(isBlocked);
  showStatus(isBlocked ? 'Telemetry blocking enabled' : 'Telemetry blocking disabled');
});

// System Theme change listener
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
    chrome.storage.sync.get(['themeMode'], async (result) => {
      if (result.themeMode === 'system') {
        const newTheme = e.matches ? 'dark' : 'light';
        const targetClass = newTheme === 'dark' ? 'grauity-theme-dark' : 'grauity-theme-light';
        updatePopupUI('system');
        await chrome.storage.sync.set({ themeName: newTheme });
        await notifyActiveTab(newTheme, targetClass, 'system');
      }
    });
  });
}

// Active Tab Theme Synchronizer
async function notifyActiveTab(themeName, targetClass, themeMode) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    if (tab.url && tab.url.includes('newtonschool.co')) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'SET_THEME',
        themeName: themeName,
        targetClass: targetClass,
        themeMode: themeMode
      }, () => {
        if (chrome.runtime.lastError && chrome.scripting && chrome.scripting.executeScript) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (cls, name) => {
              document.body.classList.forEach(c => {
                if (c.startsWith('grauity-theme-') && c !== cls) {
                  document.body.classList.remove(c);
                }
              });
              document.body.classList.add(cls);
              try {
                localStorage.setItem('theme-preference', JSON.stringify({
                  themeName: name,
                  enable_platform_wide_dark_theme: name === 'dark'
                }));
                localStorage.setItem('app_theme_enabled', name === 'dark' ? 'true' : 'false');
              } catch (e) { }
            },
            args: [targetClass, themeName]
          }).catch(err => console.warn('Theme script fallback failed:', err));
        }
      });
    }
  } catch (err) {
    console.error('Error updating active tab theme:', err);
  }
}

// Active Tab Telemetry Synchronizer
async function notifyActiveTabTelemetry(isBlocked) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    if (tab.url && tab.url.includes('newtonschool.co')) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'SET_TELEMETRY_BLOCK',
        blockTelemetry: isBlocked
      }, () => {
        if (chrome.runtime.lastError && chrome.scripting && chrome.scripting.executeScript) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (blocked) => {
              try {
                localStorage.setItem('newton_enhancer_block_telemetry', blocked ? 'true' : 'false');
              } catch (e) { }
              if (document.documentElement) {
                document.documentElement.setAttribute('data-newton-block-telemetry', blocked ? 'true' : 'false');
              }
              window.dispatchEvent(new CustomEvent('newton_enhancer_telemetry_toggle', {
                detail: { enabled: blocked }
              }));
              window.postMessage({
                source: 'newton-enhancer-telemetry',
                enabled: blocked
              }, '*');
            },
            args: [isBlocked]
          }).catch(err => console.warn('Telemetry script fallback failed:', err));
        }
      });
    }
  } catch (err) {
    console.error('Error notifying tab of telemetry change:', err);
  }
}

// ========================================================
// 9. ATTENDANCE TAB CONTROLLER (Rollup Logic & UI)
// ========================================================

function plural(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

/** Which colour band a subject falls in: 'ok' | 'warn' | 'bad' | 'none' */
function getSubjectTone(subject) {
  if (subject.held === 0 || subject.percentage === null) return 'none';
  if (subject.headline === 'unreachable') return 'bad';
  return subject.meetsTarget ? 'ok' : 'warn';
}

/**
 * Returns the actionable verdict sentence from nst-attendance.
 */
function verdictSentence(subject) {
  const targetLabel = `${Math.round(currentAttendanceTarget * 100)}%`;
  const rest = (text) => `<span class="rest">${text}</span>`;

  switch (subject.headline) {
    case 'no-data':
      return `<strong>No classes held yet.</strong>`;

    case 'unreachable':
      return `<strong>Below ${targetLabel}.</strong> ${rest(`Target is arithmetically out of reach this term.`)}`;

    case 'recover': {
      const need = subject.classesToRecover;
      return `<strong>Attend next ${plural(need, 'class', 'classes')} in a row</strong> ${rest(`to reach ${targetLabel}.`)}`;
    }

    case 'skips':
    default: {
      return subject.skipsAffordable === 0
        ? `<strong>No room to skip</strong> ${rest(`— you are right on the ${targetLabel} threshold.`)}`
        : `<strong>Can skip ${plural(subject.skipsAffordable, 'class', 'classes')}</strong> ${rest(`and stay above ${targetLabel}.`)}`;
    }
  }
}

/**
 * Breakdown of components: "Lecture 14/15 · Lab 7/8 attended" or "21/23 classes attended"
 */
function countsSentence(subject) {
  if (!subject.units || subject.units.length <= 1) {
    return `${subject.attended || 0}/${subject.held || 0} classes attended`;
  }
  return (
    subject.units
      .map((u) => `${escapeHtml(u.component || 'Class')} ${Number(u.attended) || 0}/${Number(u.held) || 0}`)
      .join('<span class="att-sep">·</span>') + ' attended'
  );
}

function formatLectureDate(timestamp) {
  if (!timestamp) return '—';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

function isLabItem(item) {
  if (item?.isPractical === true) return true;
  if (item?.isPractical === false) return false;
  const comp = (item?.component || '').toLowerCase();
  return comp !== 'lecture' && comp !== 'theory';
}

function buildMissedClassesHtml(subject) {
  const missed = subject.missedLectures || [];
  if (missed.length === 0) {
    if (subject.held > 0) {
      return `
        <details class="missed-details">
          <summary class="missed-summary">
            <span>Missed Classes (0)</span>
            <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </summary>
          <div class="missed-group-empty" style="margin-top: 6px;">
            🎉 100% Perfect Attendance! No classes missed.
          </div>
        </details>
      `;
    }
    return '';
  }

  const theoryMissed = missed.filter(l => !isLabItem(l));
  const labMissed = missed.filter(l => isLabItem(l));

  const hasLabUnit = (subject.units || []).some(u => isLabItem(u));
  const hasTheoryUnit = (subject.units || []).some(u => !isLabItem(u));

  const renderLectureItem = (l) => `
    <li class="missed-item">
      <span class="missed-date">${formatLectureDate(l.start)}</span>
      <span class="missed-title" title="${escapeHtml(l.title)}">${escapeHtml(l.title)}</span>
    </li>
  `;

  let contentHtml = '';

  // If this subject combines both Theory and Lab components:
  if (hasTheoryUnit && hasLabUnit) {
    let theoryHtml = '';
    if (theoryMissed.length > 0) {
      theoryHtml = `
        <div class="missed-group">
          <div class="missed-group-header">
            <span class="missed-group-title">
              <svg class="missed-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              Theory Lectures
            </span>
            <span class="missed-group-count">${theoryMissed.length} missed</span>
          </div>
          <ul class="missed-list">
            ${theoryMissed.map(l => renderLectureItem(l)).join('')}
          </ul>
        </div>
      `;
    } else {
      theoryHtml = `
        <div class="missed-group-empty">
          <span>✨ Theory: 0 missed (All attended)</span>
        </div>
      `;
    }

    let labHtml = '';
    if (labMissed.length > 0) {
      labHtml = `
        <div class="missed-group">
          <div class="missed-group-header">
            <span class="missed-group-title">
              <svg class="missed-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 2v7.31L4.69 18.2A2 2 0 0 0 6.4 21h11.2a2 2 0 0 0 1.71-2.8L14 9.31V2"/>
                <path d="M8.5 2h7M7 16h10"/>
              </svg>
              Lab / Practical
            </span>
            <span class="missed-group-count">${labMissed.length} missed</span>
          </div>
          <ul class="missed-list">
            ${labMissed.map(l => renderLectureItem(l)).join('')}
          </ul>
        </div>
      `;
    } else {
      labHtml = `
        <div class="missed-group-empty">
          <span>✨ Lab: 0 missed (All attended)</span>
        </div>
      `;
    }

    contentHtml = `
      <div class="missed-groups-container">
        ${theoryHtml}
        <div class="missed-divider"></div>
        ${labHtml}
      </div>
    `;
  } else if (hasLabUnit) {
    // Only Lab component exists
    contentHtml = `
      <div class="missed-groups-container">
        <div class="missed-group">
          <div class="missed-group-header">
            <span class="missed-group-title">
              <svg class="missed-group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 2v7.31L4.69 18.2A2 2 0 0 0 6.4 21h11.2a2 2 0 0 0 1.71-2.8L14 9.31V2"/>
                <path d="M8.5 2h7M7 16h10"/>
              </svg>
              Lab / Practical
            </span>
            <span class="missed-group-count">${labMissed.length} missed</span>
          </div>
          <ul class="missed-list">
            ${labMissed.map(l => renderLectureItem(l)).join('')}
          </ul>
        </div>
      </div>
    `;
  } else {
    // Pure Theory component or single unit
    if (theoryMissed.length > 0 && labMissed.length > 0) {
      contentHtml = `
        <div class="missed-groups-container">
          <div class="missed-group">
            <div class="missed-group-header">
              <span class="missed-group-title">Theory Lectures</span>
              <span class="missed-group-count">${theoryMissed.length} missed</span>
            </div>
            <ul class="missed-list">
              ${theoryMissed.map(l => renderLectureItem(l)).join('')}
            </ul>
          </div>
          <div class="missed-divider"></div>
          <div class="missed-group">
            <div class="missed-group-header">
              <span class="missed-group-title">Lab / Practical</span>
              <span class="missed-group-count">${labMissed.length} missed</span>
            </div>
            <ul class="missed-list">
              ${labMissed.map(l => renderLectureItem(l)).join('')}
            </ul>
          </div>
        </div>
      `;
    } else {
      const isOnlyLab = labMissed.length > 0;
      const targetList = isOnlyLab ? labMissed : theoryMissed;
      contentHtml = `
        <div class="missed-groups-container">
          <div class="missed-group">
            <div class="missed-group-header">
              <span class="missed-group-title">${isOnlyLab ? 'Lab / Practical' : 'Theory Lectures'}</span>
              <span class="missed-group-count">${targetList.length} missed</span>
            </div>
            <ul class="missed-list">
              ${targetList.map(l => renderLectureItem(l)).join('')}
            </ul>
          </div>
        </div>
      `;
    }
  }

  return `
    <details class="missed-details">
      <summary class="missed-summary">
        <span>Missed Classes (${missed.length})</span>
        <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </summary>
      ${contentHtml}
    </details>
  `;
}

function renderAttendanceEmpty(customMessage = null, isExpired = false) {
  if (!attendanceContainer) return;
  const title = isExpired ? 'Portal Session Expired' : 'Portal Login Required';
  const desc = customMessage || (isExpired
    ? 'Your session on Newton School has expired. Please open the portal to log in and refresh your attendance.'
    : 'Connect to your Newton School portal to automatically sync your attendance, view rollups, and track missed classes.');

  attendanceContainer.innerHTML = `
    <div class="attendance-empty-card">
      <div class="empty-icon-circle">${isExpired ? '⚠️' : '🎓'}</div>
      <h3>${title}</h3>
      <p>${desc}</p>
      <button type="button" id="btnOpenPortal" class="open-portal-btn">Open Newton Portal</button>
    </div>
  `;

  document.getElementById('btnOpenPortal')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://my.newtonschool.co' });
  });

  if (attSyncStatus) {
    attSyncStatus.textContent = isExpired ? 'Session expired • Re-login required' : 'Not logged into portal';
  }
}

function renderAttendanceUI() {
  if (!attendanceContainer) return;

  if (!currentAttendanceData || !Array.isArray(currentAttendanceData.subjects) || currentAttendanceData.subjects.length === 0) {
    renderAttendanceEmpty();
    return;
  }

  const subjects = currentAttendanceData.subjects;

  // Calculate overall metrics
  let totalAttended = 0;
  let totalHeld = 0;
  subjects.forEach(s => {
    totalAttended += (Number(s.attended) || 0);
    totalHeld += (Number(s.held) || 0);
  });

  if (attOverallBadge) {
    const targetLabel = `${Math.round(currentAttendanceTarget * 100)}% Target`;
    if (totalHeld > 0) {
      const overallPct = ((totalAttended / totalHeld) * 100).toFixed(1);
      attOverallBadge.textContent = `${overallPct}% Overall • ${targetLabel}`;
    } else {
      attOverallBadge.textContent = targetLabel;
    }
  }

  if (attSyncStatus && currentAttendanceData.timestamp) {
    const d = new Date(currentAttendanceData.timestamp);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    attSyncStatus.textContent = `Synced ${dateStr} ${timeStr} • ${subjects.length} ${subjects.length === 1 ? 'Subject' : 'Subjects'}`;
  }

  // Stable ordering: subjects that need attention first (below target and held > 0), then others
  const atRisk = subjects.filter(s => !s.meetsTarget && s.held > 0);
  const safe = subjects.filter(s => s.meetsTarget || s.held === 0);
  const orderedSubjects = [...atRisk, ...safe];

  let cardsHtml = '';
  orderedSubjects.forEach(subject => {
    const tone = getSubjectTone(subject);
    const pct = subject.percentage !== null ? Math.min(100, Math.max(0, subject.percentage * 100)) : 0;
    const targetTickLeft = Math.round(currentAttendanceTarget * 100);

    const missedHtml = buildMissedClassesHtml(subject);

    cardsHtml += `
      <div class="att-subject-card band-${tone}">
        <div class="att-card-header">
          <div class="att-subject-title">${escapeHtml(subject.label)}</div>
          <div class="att-pct-badge band-${tone}">${subject.percentageFormatted}</div>
        </div>
        <p class="att-verdict">${verdictSentence(subject)}</p>
        ${subject.held > 0 ? `
          <div class="att-bar-track">
            <div class="att-bar-fill band-${tone}" style="width: ${pct}%;"></div>
            <div class="att-bar-tick" style="left: ${targetTickLeft}%;" title="Target: ${targetTickLeft}%"></div>
          </div>
        ` : ''}
        <div class="att-meta-row">
          <div class="att-counts">${countsSentence(subject)}</div>
        </div>
        ${missedHtml}
      </div>
    `;
  });

  attendanceContainer.innerHTML = cardsHtml;
}

function recomputeAttendanceWithTarget(newTarget) {
  currentAttendanceTarget = newTarget;

  // Update pills UI
  attTargetPills.forEach(pill => {
    const pillTarget = parseFloat(pill.getAttribute('data-target'));
    pill.classList.toggle('active', Math.abs(pillTarget - newTarget) < 0.001);
  });

  chrome.storage.local.set({ nst_attendance_target: newTarget });

  if (currentAttendanceData && Array.isArray(currentAttendanceData.subjects)) {
    currentAttendanceData.target = newTarget;
    currentAttendanceData.subjects.forEach(subject => {
      const summary = summarize(subject.units, { target: newTarget });
      subject.percentage = summary.percentage;
      subject.percentageFormatted = summary.percentage === null ? '—' : `${(summary.percentage * 100).toFixed(1)}%`;
      subject.meetsTarget = summary.meetsTarget;
      subject.headline = summary.headline;
      subject.skipsAffordable = summary.skipsAffordable;
      subject.classesToRecover = summary.classesToRecover;
      subject.target = newTarget;
    });

    chrome.storage.local.set({ nst_attendance_data: currentAttendanceData });
    renderAttendanceUI();
  }
}

async function getPortalAuthCredentials() {
  // 1. Try querying any open tab on my.newtonschool.co
  try {
    const tabs = await chrome.tabs.query({ url: '*://my.newtonschool.co/*' });
    if (tabs && tabs.length > 0) {
      for (const tab of tabs) {
        if (!tab.id) continue;
        try {
          const res = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, { action: 'GET_PORTAL_AUTH' }, (response) => {
              if (chrome.runtime.lastError) {
                resolve(null);
              } else {
                resolve(response);
              }
            });
          });
          if (res && res.token) {
            await chrome.storage.local.set({
              nst_auth_token: res.token,
              nst_portal_course_hash: res.courseHash || null,
              nst_portal_last_seen: Date.now()
            });
            return { token: res.token, courseHash: res.courseHash || null };
          }
        } catch (e) { }
      }
    }
  } catch (e) { }

  // 2. Fallback to cached token in storage
  try {
    const cached = await chrome.storage.local.get(['nst_auth_token', 'nst_portal_course_hash']);
    if (cached && cached.nst_auth_token) {
      return { token: cached.nst_auth_token, courseHash: cached.nst_portal_course_hash || null };
    }
  } catch (e) { }

  return null;
}

async function loadAttendanceData(forceSync = false) {
  // Load cached target if not yet set
  let cached = null;
  try {
    cached = await chrome.storage.local.get(['nst_attendance_data', 'nst_attendance_target']);
  } catch (e) { }

  if (cached && cached.nst_attendance_target) {
    currentAttendanceTarget = cached.nst_attendance_target;
    attTargetPills.forEach(pill => {
      const pillTarget = parseFloat(pill.getAttribute('data-target'));
      pill.classList.toggle('active', Math.abs(pillTarget - currentAttendanceTarget) < 0.001);
    });
  }

  const hasCachedData = cached && cached.nst_attendance_data && Array.isArray(cached.nst_attendance_data.subjects);

  if (hasCachedData) {
    currentAttendanceData = cached.nst_attendance_data;
    // Re-score with currentAttendanceTarget
    currentAttendanceData.target = currentAttendanceTarget;
    currentAttendanceData.subjects.forEach(subject => {
      const summary = summarize(subject.units, { target: currentAttendanceTarget });
      subject.percentage = summary.percentage;
      subject.percentageFormatted = summary.percentage === null ? '—' : `${(summary.percentage * 100).toFixed(1)}%`;
      subject.meetsTarget = summary.meetsTarget;
      subject.headline = summary.headline;
      subject.skipsAffordable = summary.skipsAffordable;
      subject.classesToRecover = summary.classesToRecover;
      subject.target = currentAttendanceTarget;
    });
    renderAttendanceUI();
  }

  // If force sync or no cache, initiate network fetch
  if (forceSync || !hasCachedData) {
    btnSyncAttendance?.classList.add('spinning');
    if (!hasCachedData && attendanceContainer) {
      attendanceContainer.innerHTML = `
        <div class="mess-loading-state">
          <div class="loading-spinner"></div>
          <span>Syncing attendance from portal...</span>
        </div>
      `;
    }
    if (attSyncStatus) {
      attSyncStatus.textContent = 'Syncing attendance from portal...';
    }

    try {
      const creds = await getPortalAuthCredentials();
      if (!creds || !creds.token) {
        btnSyncAttendance?.classList.remove('spinning');
        if (!hasCachedData) {
          renderAttendanceEmpty();
        } else {
          showStatus('Please log into portal to refresh', false);
        }
        return;
      }

      const freshData = await fetchFullAttendanceData({
        token: creds.token,
        preferredCourseHash: creds.courseHash,
        target: currentAttendanceTarget
      });

      if (freshData && Array.isArray(freshData.subjects)) {
        currentAttendanceData = freshData;
        await chrome.storage.local.set({ nst_attendance_data: freshData });
        renderAttendanceUI();
        if (forceSync) {
          showStatus('Attendance synced from portal');
        }
      } else {
        throw new Error('No attendance records found');
      }
    } catch (err) {
      console.warn('[newNewton] Attendance sync failed:', err);
      if (err.message === 'AUTH_EXPIRED') {
        renderAttendanceEmpty('Your Newton School portal session has expired. Please log in again to sync attendance.', true);
      } else if (!hasCachedData) {
        renderAttendanceEmpty(`Could not sync attendance (${err.message || 'Network error'}). Please ensure you are logged into the portal.`);
      } else {
        showStatus('Sync failed: ' + (err.message || 'Network error'), false);
      }
    } finally {
      btnSyncAttendance?.classList.remove('spinning');
    }
  }
}

function initAttendance() {
  loadAttendanceData(false);
}

// Target Attendance Pill Buttons
attTargetPills.forEach(pill => {
  pill.addEventListener('click', () => {
    const targetValue = parseFloat(pill.getAttribute('data-target'));
    if (!isNaN(targetValue)) {
      recomputeAttendanceWithTarget(targetValue);
    }
  });
});

// Sync Attendance Button
btnSyncAttendance?.addEventListener('click', () => {
  loadAttendanceData(true);
});

// ========================================================
// 10. MYSTERY TAB CONTROLLER (Unsubmitted Quizzes & Auto-Solver)
// ========================================================

function renderMysteryEmpty(customMessage = null, isExpired = false) {
  if (!mysteryContainer) return;

  const title = isExpired ? 'Portal Session Expired' : 'Portal Login Required';
  const desc = customMessage || (isExpired
    ? 'Your session on Newton School has expired. Please open the portal to log in and refresh your quizzes.'
    : 'Connect to your Newton School portal to automatically discover unsubmitted quizzes and solutions.');

  mysteryContainer.innerHTML = `
    <div class="attendance-empty-card mystery-empty-card">
      <div class="empty-icon-circle">${isExpired ? '⚠️' : '🎓'}</div>
      <h3>${title}</h3>
      <p>${desc}</p>
      <button type="button" id="btnOpenMysteryPortal" class="open-portal-btn">Open Newton Portal</button>
    </div>
  `;

  document.getElementById('btnOpenMysteryPortal')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://my.newtonschool.co' });
  });

  if (mysteryHeroCount) {
    mysteryHeroCount.textContent = '0';
  }
  if (mysteryBadge) {
    mysteryBadge.textContent = isExpired ? 'Expired' : 'Login Required';
  }
  if (mysterySyncStatus) {
    mysterySyncStatus.textContent = isExpired ? 'Session expired • Re-login required' : 'Not logged into portal';
  }
  if (btnSubmitAllMystery) {
    btnSubmitAllMystery.style.display = 'none';
  }
}

function formatMysteryDeadline(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (isToday) {
    return `Due Today, ${timeStr}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) {
    return `Due Tomorrow, ${timeStr}`;
  }
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Due ${dateStr}, ${timeStr}`;
}

/**
 * Resolves the short name for a course/subject (e.g. "PSP", "S&AI", "Maths I")
 * instead of the full institutional title.
 */
function getShortCourseTitle(rawName, quizzes = []) {
  for (const q of (quizzes || [])) {
    const shortDisplay = q?.rawItem?.course?.short_display_name || q?.rawItem?.course?.short_name;
    if (shortDisplay) {
      let clean = shortDisplay.replace(/\s*[-–—]\s*[A-Za-z0-9]+$/, '').trim();
      clean = clean.replace(/\s*[-–—:]?\s*\b(Labs?|Practicals?|Pracs?|Tutorials?|Tuts?|Workshops?)\b\s*\d*$/i, '').trim();
      if (clean) return clean;
    }
  }
  return extractShortCourseName(rawName);
}

function renderMysteryUI() {
  if (!mysteryContainer) return;

  if (!currentMysteryData || !Array.isArray(currentMysteryData.quizzes)) {
    renderMysteryEmpty();
    return;
  }

  const { quizzes, groupedBySubject, groupedByCourse, totalCount, solvableCount, timestamp } = currentMysteryData;

  // Header status
  if (mysteryHeroCount) {
    mysteryHeroCount.textContent = totalCount;
  }
  if (mysteryBadge) {
    mysteryBadge.textContent = totalCount === 0 ? 'All Completed' : `${totalCount} ${totalCount === 1 ? 'Quiz' : 'Quizzes'}`;
  }

  if (mysterySyncStatus) {
    const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Just now';
    if (totalCount === 0) {
      mysterySyncStatus.textContent = `Synced ${timeStr} • All caught up!`;
    } else {
      mysterySyncStatus.textContent = `Synced ${timeStr} • ${totalCount} unsubmitted ${totalCount === 1 ? 'quiz' : 'quizzes'}`;
    }
  }

  // If 0 unsubmitted quizzes
  if (totalCount === 0) {
    if (btnSubmitAllMystery) {
      btnSubmitAllMystery.style.display = 'none';
    }
    mysteryContainer.innerHTML = `
      <div class="attendance-empty-card mystery-empty-card">
        <div class="empty-icon-circle">🎉</div>
        <h3>All Caught Up!</h3>
        <p>No unsubmitted quizzes found across your courses. Great job staying on top of your coursework!</p>
      </div>
    `;
    return;
  }

  // Update top Submit All button visibility & state
  const solvableTotal = (quizzes || []).filter(q => q.hasAnswersInDb && !q.isSubmitted).length;
  if (btnSubmitAllMystery) {
    btnSubmitAllMystery.style.display = 'inline-flex';
    btnSubmitAllMystery.disabled = solvableTotal === 0 || isMysterySubmitting;
    btnSubmitAllMystery.title = solvableTotal === 0
      ? 'No database answers available for remaining quizzes'
      : `Submit all ${solvableTotal} unsolved quizzes with answers in database`;
  }

  // Render by subjects with lecture and lab separation
  const subjectGroups = groupedBySubject || {};
  let subjectKeys = Object.keys(subjectGroups);

  // Fallback to groupedByCourse if groupedBySubject is missing (e.g. from previous cache)
  if (subjectKeys.length === 0 && groupedByCourse) {
    Object.keys(groupedByCourse).forEach(k => {
      const qList = groupedByCourse[k] || [];
      const shortKey = getShortCourseTitle(k, qList);
      if (!subjectGroups[shortKey]) {
        subjectGroups[shortKey] = {
          subjectLabel: shortKey,
          quizzes: [],
          lectures: [],
          labs: []
        };
      }
      subjectGroups[shortKey].quizzes.push(...qList);
      subjectGroups[shortKey].lectures.push(...qList.filter(q => !q.isPractical));
      subjectGroups[shortKey].labs.push(...qList.filter(q => q.isPractical));
    });
    subjectKeys = Object.keys(subjectGroups);
  }

  let html = '';

  const renderCard = (quiz) => {
    // Dynamic deadline check & XP reduction: show half earnable points if deadline reached
    const isPastDeadline = Boolean((quiz.deadline && Date.now() > quiz.deadline) || quiz.isPastDeadline);
    let baseEarnable = Number(quiz.earnablePoints ?? quiz.rawXP ?? 0);
    if (!baseEarnable) {
      if (quiz.isPastDeadline && quiz.maxXP) {
        baseEarnable = quiz.maxXP * 2;
      } else {
        baseEarnable = Number(quiz.maxXP ?? 0);
      }
    }
    const displayXP = isPastDeadline ? Math.floor(baseEarnable / 2) : baseEarnable;

    const cleanCourseHash = String(quiz.courseHash || '').replace(/^h\//i, '').replace(/^\/+|\/+$/g, '').trim();
    const cleanQuizHash = String(quiz.hash || '').replace(/^h\//i, '').replace(/^\/+|\/+$/g, '').trim();
    const quizUrl = `https://my.newtonschool.co/course/${encodeURIComponent(cleanCourseHash)}/assessment/${encodeURIComponent(cleanQuizHash)}`;

    return `
      <div class="mystery-quiz-card" id="quiz-card-${quiz.hash}">
        <div class="quiz-card-header">
          <div class="quiz-title-row">
            <h4 class="quiz-title clickable-quiz-title" data-url="${quizUrl}" title="Click to open quiz in Newton School">${escapeHtml(quiz.title)}</h4>
          </div>
          <div class="quiz-xp-badge" title="${isPastDeadline ? `Past deadline: 50% XP (${displayXP} of ${baseEarnable} XP)` : `Earnable: ${displayXP} XP`}">
            <svg class="xp-icon" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            <span>${displayXP} XP</span>
          </div>
        </div>

        <div class="quiz-card-body-row">
          <div class="quiz-card-left-col">
            <div class="quiz-meta-row">
              ${isPastDeadline ? `
                <span class="quiz-deadline-tag tag-past-deadline" title="Past deadline - earnable XP reduced to half">Past Deadline</span>
              ` : ''}
              <div class="quiz-stat" title="Total number of questions">
                <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <span>${quiz.totalQuestions} Questions</span>
              </div>

              ${!isPastDeadline && quiz.deadline ? `
                <div class="quiz-stat quiz-stat-deadline" title="Submission deadline">
                  <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span>${formatMysteryDeadline(quiz.deadline)}</span>
                </div>
              ` : ''}
            </div>

            <!-- Status feedback message placed directly below number of questions -->
            <div class="quiz-status-feedback" id="quiz-status-${quiz.hash}" style="display: none;"></div>
          </div>

          <div class="quiz-action-col">
            ${quiz.hasAnswersInDb ? `
              <button type="button" class="mystery-btn mystery-btn-submit" data-hash="${quiz.hash}" data-course="${quiz.courseHash}" title="Auto-submit quiz with answers from database">
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>Submit</span>
              </button>
            ` : `
              <button type="button" class="mystery-btn mystery-btn-solve" data-url="${quizUrl}" title="Open quiz on Newton School to solve">
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                <span>Solve</span>
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  };

  subjectKeys.forEach(subjectKey => {
    const group = subjectGroups[subjectKey];
    if (!group || (!group.quizzes || group.quizzes.length === 0)) return;

    const subjectTitle = getShortCourseTitle(group.subjectLabel || subjectKey, group.quizzes);
    const lectures = group.lectures || [];
    const labs = group.labs || [];
    const totalSubjectQuizzes = (group.quizzes || []).length;
    const solvableInSubject = (group.quizzes || []).filter(q => q.hasAnswersInDb && !q.isSubmitted);
    const hasSolvableInSubject = solvableInSubject.length > 0;
    const subjectBtnLabel = solvableInSubject.length === totalSubjectQuizzes ? 'Submit All' : `Submit ${solvableInSubject.length}`;

    let componentsHtml = '';
    const hasLectures = lectures.length > 0;
    const hasLabs = labs.length > 0;

    if (hasLectures) {
      componentsHtml += `
        <div class="mystery-component-group">
          <div class="mystery-component-header">
            <span class="mystery-component-title">
              <svg class="component-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              Theory Lectures
            </span>
            <span class="mystery-count-circle">${lectures.length}</span>
          </div>
          <div class="mystery-cards-list">
            ${lectures.map(renderCard).join('')}
          </div>
        </div>
      `;
    }

    if (hasLabs) {
      componentsHtml += `
        <div class="mystery-component-group" style="${hasLectures ? 'margin-top: 14px;' : ''}">
          <div class="mystery-component-header">
            <span class="mystery-component-title">
              <svg class="component-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 2v7.31L4.69 18.2A2 2 0 0 0 6.4 21h11.2a2 2 0 0 0 1.71-2.8L14 9.31V2"/>
                <path d="M8.5 2h7M7 16h10"/>
              </svg>
              Lab / Practical
            </span>
            <span class="mystery-count-circle">${labs.length}</span>
          </div>
          <div class="mystery-cards-list">
            ${labs.map(renderCard).join('')}
          </div>
        </div>
      `;
    }

    html += `
      <details class="meal-card mystery-course-card" ${subjectKeys.indexOf(subjectKey) === 0 ? 'open' : ''} id="course-card-${escapeHtml(subjectKey)}">
        <summary class="meal-card-header mystery-course-summary">
          <div class="meal-header-left">
            <div class="meal-icon-wrapper meal-icon-dinner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
            <div class="meal-info">
              <div class="meal-title-row">
                <span class="meal-title mystery-course-title" title="${escapeHtml(subjectTitle)}">${escapeHtml(subjectTitle)}</span>
                <span class="mystery-count-circle" id="subject-badge-${escapeHtml(subjectKey)}">${totalSubjectQuizzes}</span>
              </div>
              <span class="meal-time">${hasLectures && hasLabs ? 'Theory & Lab Components' : (hasLabs ? 'Lab / Practical Component' : 'Theory Lectures')}</span>
            </div>
          </div>
          <div class="mystery-summary-actions">
            ${hasSolvableInSubject ? `
              <button type="button" class="mystery-subject-submit-btn" data-subject="${escapeHtml(subjectKey)}" ${isMysterySubmitting ? 'disabled' : ''} title="Submit ${solvableInSubject.length} unsolved quizzes for ${escapeHtml(subjectTitle)}">
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>${escapeHtml(subjectBtnLabel)}</span>
              </button>
            ` : ''}
            <span class="meal-toggle-btn" aria-hidden="true">
              <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </div>
        </summary>

        <div class="meal-card-body mystery-course-body">
          ${componentsHtml}
        </div>
      </details>
    `;
  });

  mysteryContainer.innerHTML = html;

  // Direct click listeners on subject submit buttons to prevent details toggle
  mysteryContainer.querySelectorAll('.mystery-subject-submit-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled || isMysterySubmitting) return;

      const subjectKey = btn.getAttribute('data-subject');
      const group = currentMysteryData?.groupedBySubject?.[subjectKey];
      const subjectQuizzes = (group?.quizzes || (currentMysteryData?.quizzes || []).filter(q => q.subjectKey === subjectKey || q.subjectLabel === subjectKey)).filter(q => !q.isSubmitted);
      await submitQuizzesBatch(subjectQuizzes, btn, subjectKey);
    });
  });
}

async function loadMysteryData(forceSync = false) {
  if (isMysteryLoading) return;
  isMysteryLoading = true;

  // 1. Check local storage cache for instant rendering
  let cached = null;
  try {
    cached = await chrome.storage.local.get(['nst_mystery_data']);
  } catch (e) {}

  const hasCache = cached && cached.nst_mystery_data && Array.isArray(cached.nst_mystery_data.quizzes);
  if (hasCache && !currentMysteryData) {
    currentMysteryData = cached.nst_mystery_data;
    renderMysteryUI();
  }

  // 2. Refresh from LMS if needed or forceSync
  if (forceSync || !hasCache) {
    btnRefreshMystery?.classList.add('spinning');
    if (!hasCache && mysteryContainer) {
      mysteryContainer.innerHTML = `
        <div class="mess-loading-state">
          <div class="loading-spinner"></div>
          <span>Checking unsubmitted quizzes...</span>
        </div>
      `;
    }
    if (mysterySyncStatus) {
      mysterySyncStatus.textContent = 'Checking unsubmitted quizzes...';
    }

    try {
      const creds = await getPortalAuthCredentials();
      if (!creds || !creds.token) {
        btnRefreshMystery?.classList.remove('spinning');
        isMysteryLoading = false;
        if (!hasCache) {
          renderMysteryEmpty();
        } else {
          showStatus('Please log into portal to refresh', false);
        }
        return;
      }

      const freshData = await fetchUnsubmittedQuizzes({
        token: creds.token,
        preferredCourseHash: creds.courseHash
      });

      freshData.timestamp = Date.now();
      currentMysteryData = freshData;
      await chrome.storage.local.set({ nst_mystery_data: freshData });
      renderMysteryUI();

      if (forceSync) {
        showStatus('Quizzes refreshed from portal');
      }
    } catch (err) {
      console.warn('[newNewton] Mystery quizzes load failed:', err);
      if (err.message === 'AUTH_EXPIRED') {
        renderMysteryEmpty('Your Newton School portal session has expired. Please log in again to sync quizzes.', true);
      } else if (!hasCache) {
        renderMysteryEmpty(`Could not load quizzes (${err.message || 'Network error'}). Please ensure you are logged into the portal.`);
      } else {
        showStatus('Sync failed: ' + (err.message || 'Network error'), false);
      }
    } finally {
      btnRefreshMystery?.classList.remove('spinning');
      isMysteryLoading = false;
    }
  } else {
    isMysteryLoading = false;
  }
}

function initMystery() {
  loadMysteryData(false);
  checkOngoingSubmission();
}

// ========================================================
// 10b. LAZY SUBMIT & LIVE PROGRESS CONTROLLERS
// ========================================================

function formatDelayDisplay(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatEntropyDisplay(seconds) {
  if (seconds === 0) return '±0s (Off)';
  if (seconds < 60) return `±${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `±${m}m ${s}s` : `±${m}m`;
}

function cancellableDelay(durationMs, onTick, checkCancelled) {
  return new Promise((resolve) => {
    let timerId = null;
    let intervalId = null;
    const startTime = Date.now();

    const cleanup = () => {
      if (timerId) clearTimeout(timerId);
      if (intervalId) clearInterval(intervalId);
      if (activeWaitResolver === triggerEarlyResolve) {
        activeWaitResolver = null;
      }
    };

    const triggerEarlyResolve = () => {
      cleanup();
      resolve(true);
    };

    activeWaitResolver = triggerEarlyResolve;

    if (durationMs <= 0 || (checkCancelled && checkCancelled())) {
      cleanup();
      resolve(true);
      return;
    }

    intervalId = setInterval(() => {
      if (checkCancelled && checkCancelled()) {
        cleanup();
        resolve(true);
        return;
      }
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, durationMs - elapsed);
      if (onTick) onTick(elapsed, remaining);
      if (remaining <= 0) {
        cleanup();
        resolve(true);
      }
    }, 100);

    timerId = setTimeout(() => {
      cleanup();
      resolve(true);
    }, durationMs);
  });
}

function triggerSubmitNow() {
  skipRemainingDelay = true;
  if (typeof activeWaitResolver === 'function') {
    activeWaitResolver();
  }
  if (liveStatusText) {
    liveStatusText.textContent = 'Submitting remaining without delay...';
  }
}

function triggerStopSubmission() {
  isSubmissionStopped = true;
  if (typeof activeWaitResolver === 'function') {
    activeWaitResolver();
  }
  if (liveStatusText) {
    liveStatusText.textContent = 'Stopping submission...';
  }
  showStatus('Submission stopped by user', false);
}

function showLiveBanner(quizTitle = 'Quiz', initialMessage = 'Preparing attempt...') {
  if (mysteryLiveBanner) {
    mysteryLiveBanner.style.display = 'block';
  }
  if (liveQuizTitle) {
    liveQuizTitle.textContent = `Submitting "${quizTitle}"`;
  }
  if (liveStatusText) {
    liveStatusText.textContent = initialMessage;
  }
  if (liveProgressBar) {
    liveProgressBar.style.width = '0%';
  }
}

function hideLiveBanner() {
  if (mysteryLiveBanner) {
    mysteryLiveBanner.style.display = 'none';
  }
  if (liveProgressBar) {
    liveProgressBar.style.width = '0%';
  }
  activeWaitResolver = null;
}

// ========================================================
// 10c. AUDIO NOTIFICATION CONTROLLER
// ========================================================

let sharedAudioCtx = null;

/**
 * Pre-warms the AudioContext during direct user click gestures
 * so modern browsers reliably allow audio playback even after long lazy-submit delays.
 */
function primeAudioContext() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContextClass();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
  } catch (e) {
    // AudioContext initialization caught safely
  }
}

/**
 * Plays a pleasant ascending completion chime (E5 -> G#5 -> B5 -> E6)
 * when quiz submission finishes.
 */
function playCompletionSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContextClass();
    }

    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }

    const ctx = sharedAudioCtx;
    const now = ctx.currentTime;

    // Harmonious major-chord ascending chime: E5 (659.25Hz), G#5 (830.61Hz), B5 (987.77Hz), E6 (1318.51Hz)
    const notes = [
      { freq: 659.25, start: 0.00, duration: 0.14, gain: 0.22 },
      { freq: 830.61, start: 0.09, duration: 0.14, gain: 0.22 },
      { freq: 987.77, start: 0.18, duration: 0.16, gain: 0.25 },
      { freq: 1318.51, start: 0.27, duration: 0.42, gain: 0.28 }
    ];

    notes.forEach(({ freq, start, duration, gain: peakGain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);

      // Bell envelope: rapid attack, smooth exponential decay
      gainNode.gain.setValueAtTime(0.0001, now + start);
      gainNode.gain.exponentialRampToValueAtTime(peakGain, now + start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + duration);
    });
  } catch (err) {
    console.warn('[newNewton] Could not play completion chime:', err);
  }
}

async function initLazySubmitSettings() {
  try {
    const saved = await chrome.storage.local.get([
      'nst_lazy_submit_enabled',
      'nst_lazy_submit_delay',
      'nst_lazy_submit_entropy'
    ]);

    isLazySubmitEnabled = Boolean(saved.nst_lazy_submit_enabled);
    currentLazyDelay = typeof saved.nst_lazy_submit_delay === 'number' ? saved.nst_lazy_submit_delay : 15;
    currentLazyEntropy = typeof saved.nst_lazy_submit_entropy === 'number' ? saved.nst_lazy_submit_entropy : 5;

    // Constraint: entropy cannot be more than delay
    if (currentLazyEntropy > currentLazyDelay) {
      currentLazyEntropy = currentLazyDelay;
    }

    if (toggleLazySubmit) {
      toggleLazySubmit.checked = isLazySubmitEnabled;
    }
    if (lazyStatusPill) {
      lazyStatusPill.textContent = isLazySubmitEnabled ? 'Active' : 'Off';
      lazyStatusPill.classList.toggle('active', isLazySubmitEnabled);
    }
    if (lazySlidersContainer) {
      lazySlidersContainer.style.display = isLazySubmitEnabled ? 'flex' : 'none';
    }

    if (delaySlider) {
      delaySlider.value = secondsToSliderPos(currentLazyDelay, 1, 1000);
    }
    if (delayValBadge) {
      delayValBadge.textContent = formatDelayDisplay(currentLazyDelay);
    }

    if (entropySlider) {
      entropySlider.value = secondsToSliderPos(currentLazyEntropy, 0, 1000);
    }
    if (entropyValBadge) {
      entropyValBadge.textContent = formatEntropyDisplay(currentLazyEntropy);
    }
  } catch (e) {
    console.warn('[newNewton] Failed to load lazy submit settings:', e);
  }
}

// Toggle Lazy Submit
toggleLazySubmit?.addEventListener('change', async (e) => {
  isLazySubmitEnabled = Boolean(e.target.checked);
  if (lazyStatusPill) {
    lazyStatusPill.textContent = isLazySubmitEnabled ? 'Active' : 'Off';
    lazyStatusPill.classList.toggle('active', isLazySubmitEnabled);
  }
  if (lazySlidersContainer) {
    lazySlidersContainer.style.display = isLazySubmitEnabled ? 'flex' : 'none';
  }
  try {
    await chrome.storage.local.set({ nst_lazy_submit_enabled: isLazySubmitEnabled });
  } catch (err) {}
});

// Delay Slider
delaySlider?.addEventListener('input', (e) => {
  currentLazyDelay = sliderPosToSeconds(e.target.value, 1, 1000);
  if (delayValBadge) {
    delayValBadge.textContent = formatDelayDisplay(currentLazyDelay);
  }
  // Constraint: entropy cannot be more than delay
  if (currentLazyEntropy > currentLazyDelay) {
    currentLazyEntropy = currentLazyDelay;
    if (entropySlider) {
      entropySlider.value = secondsToSliderPos(currentLazyEntropy, 0, 1000);
    }
    if (entropyValBadge) {
      entropyValBadge.textContent = formatEntropyDisplay(currentLazyEntropy);
    }
  }
});
delaySlider?.addEventListener('change', async () => {
  try {
    await chrome.storage.local.set({
      nst_lazy_submit_delay: currentLazyDelay,
      nst_lazy_submit_entropy: currentLazyEntropy
    });
  } catch (e) {}
});

// Entropy Slider
entropySlider?.addEventListener('input', (e) => {
  const selectedEntropy = sliderPosToSeconds(e.target.value, 0, 1000);
  // Constraint: entropy cannot be more than delay
  if (selectedEntropy > currentLazyDelay) {
    currentLazyEntropy = currentLazyDelay;
    entropySlider.value = secondsToSliderPos(currentLazyDelay, 0, 1000);
  } else {
    currentLazyEntropy = selectedEntropy;
  }
  if (entropyValBadge) {
    entropyValBadge.textContent = formatEntropyDisplay(currentLazyEntropy);
  }
});
entropySlider?.addEventListener('change', async () => {
  try {
    await chrome.storage.local.set({ nst_lazy_submit_entropy: currentLazyEntropy });
  } catch (e) {}
});

// Pause / Resume Button (Requirement 7)
btnPauseResume?.addEventListener('click', async () => {
  const isPaused = btnPauseResume.classList.contains('is-paused');
  if (isPaused) {
    await chrome.runtime.sendMessage({ action: 'RESUME_SUBMISSION' });
    btnPauseResume.classList.remove('is-paused');
    btnPauseResume.title = 'Pause submission';
    btnPauseResume.innerHTML = `
      <svg class="live-action-icon icon-pause" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1.5"></rect>
        <rect x="14" y="4" width="4" height="16" rx="1.5"></rect>
      </svg>
    `;
    if (liveStatusText) {
      liveStatusText.textContent = 'Resuming submission...';
    }
  } else {
    await chrome.runtime.sendMessage({ action: 'PAUSE_SUBMISSION' });
    btnPauseResume.classList.add('is-paused');
    btnPauseResume.title = 'Resume submission';
    btnPauseResume.innerHTML = `
      <svg class="live-action-icon icon-play" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="6 4 20 12 6 20 6 4"></polygon>
      </svg>
    `;
    if (liveStatusText) {
      liveStatusText.textContent = 'Submission paused';
    }
  }
});

// Fast Forward Button with confirmation warning
btnFastForward?.addEventListener('click', async () => {
  const confirmed = confirm('Are you sure you want to fast-forward? All remaining questions will be submitted immediately without human-like delays.');
  if (!confirmed) return;
  await chrome.runtime.sendMessage({ action: 'FAST_FORWARD_SUBMISSION' });
  triggerSubmitNow();
});

// Stop Submission Button
btnStopSubmission?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'STOP_SUBMISSION' });
  triggerStopSubmission();
});

// ========================================================
// 11. QUIZ CARD REMOVAL & BATCH SUBMISSION CONTROLLERS
// ========================================================

/**
 * Removes a quiz card using a card-slide transition, updates badge counts,
 * and clears empty component groups and subject containers.
 */
async function slideOutAndRemoveCard(assessmentHash, subjectLabel = null, isPractical = false) {
  const cardEl = document.getElementById(`quiz-card-${assessmentHash}`);
  if (cardEl) {
    cardEl.classList.add('card-slide-out');
    await new Promise(r => setTimeout(r, 430));

    const cardsList = cardEl.closest('.mystery-cards-list');
    const compGroup = cardEl.closest('.mystery-component-group');
    const courseCard = cardEl.closest('.mystery-course-card');

    cardEl.remove();

    // 1. Update component group badge and remove if empty
    if (cardsList && compGroup) {
      const remainingInGroup = cardsList.querySelectorAll('.mystery-quiz-card').length;
      const compBadge = compGroup.querySelector('.mystery-count-circle');
      if (compBadge) {
        compBadge.textContent = remainingInGroup;
      }
      if (remainingInGroup === 0) {
        compGroup.remove();
      }
    }

    // 2. Update subject card badge and remove/collapse if empty
    if (courseCard) {
      const remainingInSubject = courseCard.querySelectorAll('.mystery-quiz-card').length;
      const subjBadge = courseCard.querySelector('.mystery-count-circle');
      if (subjBadge) {
        subjBadge.textContent = remainingInSubject;
      }
      const subjSubmitBtn = courseCard.querySelector('.mystery-subject-submit-btn');
      const remainingSolvableInSubj = courseCard.querySelectorAll('.mystery-btn-submit').length;
      if (subjSubmitBtn && remainingSolvableInSubj === 0) {
        subjSubmitBtn.remove();
      }
      if (remainingInSubject === 0) {
        courseCard.classList.add('card-slide-out');
        await new Promise(r => setTimeout(r, 350));
        courseCard.remove();
      }
    }
  }

  // 3. Update memory data model
  if (currentMysteryData) {
    const targetQ = (currentMysteryData.quizzes || []).find(q => q.hash === assessmentHash);
    if (targetQ) {
      targetQ.isSubmitted = true;
    }
    currentMysteryData.quizzes = (currentMysteryData.quizzes || []).filter(q => q.hash !== assessmentHash && !q.isSubmitted);
    currentMysteryData.totalCount = currentMysteryData.quizzes.length;
    currentMysteryData.solvableCount = currentMysteryData.quizzes.filter(q => q.hasAnswersInDb).length;

    // Clean up groupedBySubject
    if (currentMysteryData.groupedBySubject) {
      Object.keys(currentMysteryData.groupedBySubject).forEach(sk => {
        const grp = currentMysteryData.groupedBySubject[sk];
        if (grp) {
          grp.quizzes = (grp.quizzes || []).filter(q => q.hash !== assessmentHash && !q.isSubmitted);
          grp.lectures = (grp.lectures || []).filter(q => q.hash !== assessmentHash && !q.isSubmitted);
          grp.labs = (grp.labs || []).filter(q => q.hash !== assessmentHash && !q.isSubmitted);
          if (grp.quizzes.length === 0) {
            delete currentMysteryData.groupedBySubject[sk];
          }
        }
      });
    }

    try {
      await chrome.storage.local.set({ nst_mystery_data: currentMysteryData });
    } catch (e) {}
  }

  // 4. Update header status and badges
  updateMysteryHeaderBadges();
}

/**
 * Updates top tab badges, sync status, and enables/disables batch submit buttons.
 */
function updateMysteryHeaderBadges() {
  if (!currentMysteryData) return;
  const remainingQuizzes = (currentMysteryData.quizzes || []).filter(q => !q.isSubmitted);
  const remainingCount = remainingQuizzes.length;
  currentMysteryData.totalCount = remainingCount;
  currentMysteryData.solvableCount = remainingQuizzes.filter(q => q.hasAnswersInDb).length;

  if (mysteryHeroCount) {
    mysteryHeroCount.textContent = remainingCount;
  }
  if (mysteryBadge) {
    mysteryBadge.textContent = remainingCount === 0 ? 'All Completed' : `${remainingCount} ${remainingCount === 1 ? 'Quiz' : 'Quizzes'}`;
  }
  if (mysterySyncStatus) {
    if (remainingCount === 0) {
      mysterySyncStatus.textContent = 'All caught up!';
    } else {
      mysterySyncStatus.textContent = `${remainingCount} unsubmitted ${remainingCount === 1 ? 'quiz' : 'quizzes'}`;
    }
  }

  if (btnSubmitAllMystery) {
    if (remainingCount === 0) {
      btnSubmitAllMystery.style.display = 'none';
    } else {
      btnSubmitAllMystery.style.display = 'inline-flex';
      btnSubmitAllMystery.disabled = currentMysteryData.solvableCount === 0 || isMysterySubmitting;
      const allText = currentMysteryData.solvableCount === remainingCount ? 'Submit All' : `Submit ${currentMysteryData.solvableCount}`;
      const spanEl = btnSubmitAllMystery.querySelector('span');
      if (spanEl) spanEl.textContent = allText;
      btnSubmitAllMystery.title = currentMysteryData.solvableCount === 0
        ? 'No answers in database for remaining quizzes'
        : (currentMysteryData.solvableCount === remainingCount
            ? `Submit all ${remainingCount} unsolved quizzes with answers in database`
            : `Submit ${currentMysteryData.solvableCount} unsolved quizzes with available answers`);
    }
  }

  // Update subject submit buttons based on remaining solvable in each subject
  document.querySelectorAll('.mystery-subject-submit-btn').forEach(sBtn => {
    const sKey = sBtn.getAttribute('data-subject');
    const sQuizzes = (currentMysteryData.quizzes || []).filter(q => (q.subjectKey === sKey || q.subjectLabel === sKey) && !q.isSubmitted);
    const sSolvable = sQuizzes.filter(q => q.hasAnswersInDb).length;
    if (sSolvable === 0) {
      sBtn.remove();
    } else {
      sBtn.style.display = 'inline-flex';
      sBtn.disabled = isMysterySubmitting;
      const sText = sSolvable === sQuizzes.length ? 'Submit All' : `Submit ${sSolvable}`;
      const sSpan = sBtn.querySelector('span');
      if (sSpan) sSpan.textContent = sText;
      sBtn.title = `Submit ${sSolvable} unsolved quizzes for ${sKey}`;
    }
  });

  if (remainingCount === 0 && mysteryContainer) {
    mysteryContainer.innerHTML = `
      <div class="attendance-empty-card mystery-empty-card">
        <div class="empty-icon-circle">🎉</div>
        <h3>All Caught Up!</h3>
        <p>No unsubmitted quizzes found across your courses. Great job staying on top of your coursework!</p>
      </div>
    `;
  }
}

/**
 * Executes sequential submission of an array of quizzes with UI feedback,
 * sliding cards out upon completion.
 */
/**
 * Executes sequential submission of an array of quizzes with UI feedback,
 * delegating execution to the background service worker so it continues even if the popup closes.
 */
async function submitQuizzesBatch(quizzesToSubmit, triggerBtn = null, batchName = 'quizzes') {
  primeAudioContext();
  if (isMysterySubmitting) return;

  if (!Array.isArray(quizzesToSubmit) || quizzesToSubmit.length === 0) {
    showStatus('No quizzes to submit', false);
    return;
  }

  const solvable = quizzesToSubmit.filter(q => q.hasAnswersInDb && !q.isSubmitted);
  if (solvable.length === 0) {
    showStatus(`No database solutions available for ${batchName}`, false);
    return;
  }

  // Warn using confirm() before user submits with lazy submit OFF
  if (!isLazySubmitEnabled) {
    const confirmed = confirm('Lazy Submit is turned OFF. Quizzes will be submitted instantly to Newton School without any human-like delays. Are you sure you want to proceed?');
    if (!confirmed) return;
  }

  isMysterySubmitting = true;
  skipRemainingDelay = false;
  isSubmissionStopped = false;

  const originalHtml = triggerBtn ? triggerBtn.innerHTML : '';
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.classList.add('is-loading');
    triggerBtn.innerHTML = `
      <div class="loading-spinner" style="width: 10px; height: 10px; border-width: 1.5px;"></div>
      <span>0/${solvable.length}</span>
    `;
  }

  // Disable all submit buttons during batch
  document.querySelectorAll('.mystery-btn-submit, .mystery-subject-submit-btn, #btnSubmitAllMystery').forEach(b => {
    b.disabled = true;
  });

  if (isLazySubmitEnabled && lazyKeepBrowserOpenNote) {
    lazyKeepBrowserOpenNote.style.display = 'flex';
  }

  showLiveBanner(solvable[0]?.title || 'Quiz Assessment', `Connecting to background worker (0/${solvable.length})...`);

  try {
    const creds = await getPortalAuthCredentials();
    if (!creds || !creds.token) {
      throw new Error('No authentication token found. Please log in to Newton School.');
    }

    // Hand off sequential submission to background worker (so popup closing won't stop it!)
    const response = await chrome.runtime.sendMessage({
      action: 'START_SUBMISSION',
      token: creds.token,
      quizzes: solvable,
      lazySettings: {
        enabled: isLazySubmitEnabled,
        delay: currentLazyDelay,
        entropy: currentLazyEntropy
      },
      batchName
    });

    if (response && response.state) {
      handleSubmissionStateUpdate(response.state);
    }
  } catch (err) {
    console.error('[newNewton] Failed to initiate background submission:', err);
    showStatus('Submission failed: ' + (err.message || 'Error'), false);
    isMysterySubmitting = false;
    hideLiveBanner();
    if (lazyKeepBrowserOpenNote) {
      lazyKeepBrowserOpenNote.style.display = 'none';
    }
    if (triggerBtn) {
      triggerBtn.classList.remove('is-loading');
      triggerBtn.innerHTML = originalHtml;
    }
    document.querySelectorAll('.mystery-btn-submit, .mystery-subject-submit-btn, #btnSubmitAllMystery').forEach(b => {
      b.disabled = false;
    });
    updateMysteryHeaderBadges();
  }
}

/**
 * Handles live updates from background submission manager
 */
function handleSubmissionStateUpdate(state) {
  if (!state) return;

  if (state.status === 'running' || state.status === 'paused') {
    isMysterySubmitting = true;
    showLiveBanner(
      state.currentQuiz?.title || 'Quiz Assessment',
      state.currentProgress?.message || (state.isPaused ? 'Submission paused' : 'Submitting in background...')
    );

    if (state.lazySettings?.enabled && lazyKeepBrowserOpenNote) {
      lazyKeepBrowserOpenNote.style.display = 'flex';
    }

    // Update Pause / Resume Button (Requirement 7)
    if (btnPauseResume) {
      if (state.isPaused) {
        btnPauseResume.classList.add('is-paused');
        btnPauseResume.title = 'Resume submission';
        btnPauseResume.innerHTML = `
          <svg class="live-action-icon icon-play" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 4 20 12 6 20 6 4"></polygon>
          </svg>
        `;
      } else {
        btnPauseResume.classList.remove('is-paused');
        btnPauseResume.title = 'Pause submission';
        btnPauseResume.innerHTML = `
          <svg class="live-action-icon icon-pause" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1.5"></rect>
            <rect x="14" y="4" width="4" height="16" rx="1.5"></rect>
          </svg>
        `;
      }
    }

    // Update progress bar
    if (liveProgressBar && state.currentProgress?.total) {
      const p = state.currentProgress;
      const stepFrac = p.delaySec ? Math.max(0, 1 - (p.remainingSec / p.delaySec)) : 0;
      const pct = Math.min(99, Math.round(((p.current - 1 + stepFrac) / p.total) * 100));
      liveProgressBar.style.width = `${pct}%`;
    }

    // Update current quiz card feedback
    if (state.currentQuiz?.hash) {
      const cardFeedback = document.getElementById(`quiz-status-${state.currentQuiz.hash}`);
      if (cardFeedback) {
        cardFeedback.style.display = 'inline-flex';
        cardFeedback.className = 'quiz-status-feedback status-progress';
        cardFeedback.textContent = state.currentProgress?.message || 'Auto-submitting...';
      }
    }

    // Disable submit buttons while active
    document.querySelectorAll('.mystery-btn-submit, .mystery-subject-submit-btn, #btnSubmitAllMystery').forEach(b => {
      b.disabled = true;
    });
  } else if (state.status === 'completed') {
    const wasSubmitting = isMysterySubmitting;
    isMysterySubmitting = false;
    hideLiveBanner();
    if (lazyKeepBrowserOpenNote) {
      lazyKeepBrowserOpenNote.style.display = 'none';
    }
    if (wasSubmitting && state.successCount > 0) {
      playCompletionSound();
      showStatus(`Submitted ${state.successCount} quizzes!`);
    }
    document.querySelectorAll('.mystery-btn-submit, .mystery-subject-submit-btn, #btnSubmitAllMystery').forEach(b => {
      b.disabled = false;
    });
    updateMysteryHeaderBadges();
  } else if (state.status === 'stopped') {
    isMysterySubmitting = false;
    hideLiveBanner();
    if (lazyKeepBrowserOpenNote) {
      lazyKeepBrowserOpenNote.style.display = 'none';
    }
    if (state.currentQuiz?.hash) {
      const cardFeedback = document.getElementById(`quiz-status-${state.currentQuiz.hash}`);
      if (cardFeedback) {
        cardFeedback.style.display = 'inline-flex';
        cardFeedback.className = 'quiz-status-feedback status-error';
        cardFeedback.textContent = 'Submission stopped';
      }
    }
    showStatus('Submission stopped by user', false);
    document.querySelectorAll('.mystery-btn-submit, .mystery-subject-submit-btn, #btnSubmitAllMystery').forEach(b => {
      b.disabled = false;
    });
    updateMysteryHeaderBadges();
  }
}

// Background submission runtime message listener
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'SUBMISSION_STATE_UPDATE') {
    handleSubmissionStateUpdate(msg.state);
  } else if (msg.action === 'QUIZ_SUBMITTED_SUCCESS') {
    slideOutAndRemoveCard(msg.quizHash, msg.subjectLabel, msg.isPractical);
  } else if (msg.action === 'QUIZ_SUBMITTED_ERROR') {
    const cardFeedback = document.getElementById(`quiz-status-${msg.quizHash}`);
    if (cardFeedback) {
      cardFeedback.style.display = 'inline-flex';
      cardFeedback.className = 'quiz-status-feedback status-error';
      cardFeedback.textContent = `Failed: ${msg.error || 'Error'}`;
    }
  }
});

// Check if a background submission is already ongoing when popup opens
async function checkOngoingSubmission() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'GET_SUBMISSION_STATE' });
    if (res && res.state) {
      handleSubmissionStateUpdate(res.state);
    }
  } catch (e) {}
}

// Refresh Mystery Quizzes Button
btnRefreshMystery?.addEventListener('click', () => {
  loadMysteryData(true);
});

// Top Submit All Unsolved Quizzes Button
btnSubmitAllMystery?.addEventListener('click', async () => {
  primeAudioContext();
  if (btnSubmitAllMystery.disabled || isMysterySubmitting) return;
  const quizzes = (currentMysteryData?.quizzes || []).filter(q => !q.isSubmitted);
  await submitQuizzesBatch(quizzes, btnSubmitAllMystery, 'all quizzes');
});

// Event Delegation for Mystery Container (Title Click, Solve, Subject Submit, and Individual Submit)
mysteryContainer?.addEventListener('click', async (e) => {
  // A. Quiz Title Click -> Open quiz in new tab
  const titleEl = e.target.closest('.clickable-quiz-title');
  if (titleEl) {
    const url = titleEl.getAttribute('data-url');
    if (url) {
      chrome.tabs.create({ url });
    }
    return;
  }

  // B. Solve Button Click -> Redirect to quiz
  const solveBtn = e.target.closest('.mystery-btn-solve');
  if (solveBtn) {
    const url = solveBtn.getAttribute('data-url');
    if (url) {
      chrome.tabs.create({ url });
    }
    return;
  }

  // B. Subject Submit Button Click (via delegation as backup)
  const subjectSubmitBtn = e.target.closest('.mystery-subject-submit-btn');
  if (subjectSubmitBtn) {
    e.preventDefault();
    e.stopPropagation();
    primeAudioContext();
    if (subjectSubmitBtn.disabled || isMysterySubmitting) return;

    const subjectKey = subjectSubmitBtn.getAttribute('data-subject');
    const group = currentMysteryData?.groupedBySubject?.[subjectKey];
    const subjectQuizzes = (group?.quizzes || (currentMysteryData?.quizzes || []).filter(q => q.subjectKey === subjectKey || q.subjectLabel === subjectKey)).filter(q => !q.isSubmitted);
    await submitQuizzesBatch(subjectQuizzes, subjectSubmitBtn, subjectKey);
    return;
  }

  // C. Individual Submit Button Click -> Automate solution submission
  const submitBtn = e.target.closest('.mystery-btn-submit');
  if (submitBtn && !submitBtn.disabled && !isMysterySubmitting) {
    const assessmentHash = submitBtn.getAttribute('data-hash');
    const courseHash = submitBtn.getAttribute('data-course');
    if (!assessmentHash || !courseHash) return;

    const quiz = (currentMysteryData?.quizzes || []).find(q => q.hash === assessmentHash);
    if (!quiz) return;

    await submitQuizzesBatch([quiz], submitBtn, quiz.title || 'quiz');
    return;
  }
});

// ========================================================
// 8. EXTENSION AUTO-UPDATE NOTIFIER
// ========================================================

/**
 * Compares two semantic version strings (e.g. "1.3.0" vs "1.2.2").
 * Returns 1 if v1 > v2, -1 if v1 < v2, and 0 if equal.
 */
function compareSemver(v1, v2) {
  const clean1 = (v1 || '').replace(/^v/i, '').trim();
  const clean2 = (v2 || '').replace(/^v/i, '').trim();
  const parts1 = clean1.split('.').map(n => parseInt(n, 10) || 0);
  const parts2 = clean2.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Checks GitHub Releases API for newer newNewton versions.
 * Employs a 1-hour local storage cache to stay within GitHub rate limits.
 */
async function checkForExtensionUpdates() {
  const versionBadge = document.getElementById('extVersionBadge');
  if (!versionBadge) return;

  const currentVersion = chrome.runtime?.getManifest?.()?.version || '1.2.2';
  versionBadge.textContent = `v${currentVersion}`;
  versionBadge.title = `newNewton v${currentVersion} (Click for release notes)`;

  const CACHE_KEY = 'newnewton_update_check';
  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  try {
    const cached = await chrome.storage.local.get([CACHE_KEY]);
    const cachedData = cached[CACHE_KEY];
    const now = Date.now();

    let releaseData = null;

    if (cachedData && (now - cachedData.timestamp) < CACHE_TTL_MS && cachedData.latestVersion) {
      releaseData = cachedData;
    } else {
      // Query GitHub Releases list (first release in list is the newest)
      const res = await fetch('https://api.github.com/repos/suwupnil/newNewton/releases?per_page=1', {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });

      if (res.ok) {
        const releases = await res.json();
        if (Array.isArray(releases) && releases.length > 0) {
          const latest = releases[0];
          const rawTag = latest.tag_name || latest.name || '';
          const cleanTag = rawTag.replace(/^v/i, '').trim();
          
          // Look for .zip or .crx download asset if available
          const zipAsset = latest.assets?.find(a => a.name?.endsWith('.zip'));
          const crxAsset = latest.assets?.find(a => a.name?.endsWith('.crx'));
          const downloadUrl = zipAsset?.browser_download_url || crxAsset?.browser_download_url || latest.html_url || 'https://github.com/suwupnil/newNewton/releases/latest';

          releaseData = {
            timestamp: now,
            latestVersion: cleanTag,
            releaseUrl: latest.html_url || 'https://github.com/suwupnil/newNewton/releases/latest',
            downloadUrl
          };

          await chrome.storage.local.set({ [CACHE_KEY]: releaseData });
        }
      }
    }

    if (releaseData && releaseData.latestVersion) {
      if (compareSemver(releaseData.latestVersion, currentVersion) > 0) {
        // Newer version available!
        versionBadge.classList.add('badge-update-available');
        versionBadge.href = releaseData.releaseUrl;
        versionBadge.title = `Update available: v${releaseData.latestVersion}! Click to install update (.zip/.crx)`;
        versionBadge.innerHTML = `
          <svg class="badge-update-icon" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          <span>v${releaseData.latestVersion} Update</span>
        `;
      }
    }
  } catch (err) {
    console.debug('[newNewton] Update check skipped or failed:', err);
  }
}

// Auto-initialize Mess Menu, Attendance, Mystery, Lazy Submit, and Update Checker on start
initMessMenu();
initAttendance();
initMystery();
initLazySubmitSettings();
checkForExtensionUpdates();



