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

// State variables
let currentMenuData = null;
let selectedDay = 'Monday';
let todayDayName = 'Monday';

let currentAttendanceData = null;
let currentAttendanceTarget = DEFAULT_TARGET; // 0.75

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

// Auto-initialize Mess Menu and Attendance on start
initMessMenu();
initAttendance();

