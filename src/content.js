/**
 * Newton Enhancer - Content Script
 * Synchronizes and enforces the selected Grauity theme on Newton School pages.
 */

(function () {
  const GRAUITY_LIGHT = 'grauity-theme-light';
  const GRAUITY_DARK = 'grauity-theme-dark';
  const THEME_PREF_KEY = 'theme-preference';
  const APP_THEME_KEY = 'app_theme_enabled';
  const SIDEBARS_HIDDEN_KEY = 'newton_sidebars_hidden';

  // Restore sidebar hidden preference as early as possible to avoid layout flash
  const initialSidebarsHidden = (function () {
    try {
      return localStorage.getItem(SIDEBARS_HIDDEN_KEY) === 'true';
    } catch (e) {
      return false;
    }
  })();

  if (initialSidebarsHidden) {
    if (document.documentElement) {
      document.documentElement.setAttribute('data-newton-sidebars-hidden', 'true');
    }
    if (document.body) {
      document.body.classList.add('newton-sidebars-hidden');
      document.body.setAttribute('data-newton-sidebars-hidden', 'true');
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.classList.add('newton-sidebars-hidden');
        document.body.setAttribute('data-newton-sidebars-hidden', 'true');
      }, { once: true });
    }
  }

  function resolveEffectiveTheme(mode) {
    if (mode === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode;
  }

  /**
   * Apply Grauity theme class to document body and sync with Newton School localStorage
   */
  function applyGrauityTheme(themeName) {
    const isDark = themeName === 'dark';
    const targetClass = isDark ? GRAUITY_DARK : GRAUITY_LIGHT;
    const previousClass = isDark ? GRAUITY_LIGHT : GRAUITY_DARK;

    // 1. Update DOM body classes
    if (document.body) {
      document.body.classList.remove(previousClass);
      document.body.classList.add(targetClass);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.classList.remove(previousClass);
        document.body.classList.add(targetClass);
      }, { once: true });
    }

    // 2. Synchronize with Newton School internal theme state in localStorage
    try {
      localStorage.setItem(THEME_PREF_KEY, JSON.stringify({
        themeName: themeName,
        enable_platform_wide_dark_theme: isDark
      }));
      localStorage.setItem(APP_THEME_KEY, isDark ? 'true' : 'false');
    } catch (e) {
      console.warn('[Newton Enhancer] Could not persist theme to localStorage:', e);
    }
  }

  // Initial load: check chrome.storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['themeMode', 'themeName'], (result) => {
      const mode = result.themeMode || 'light';
      const effectiveTheme = resolveEffectiveTheme(mode);
      applyGrauityTheme(effectiveTheme);
    });
  }

  // Listen for system theme changes in background
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['themeMode'], (result) => {
          if (result.themeMode === 'system') {
            applyGrauityTheme(e.matches ? 'dark' : 'light');
          }
        });
      }
    });
  }

  // Listen for real-time messages from extension popup or other contexts
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'SET_THEME') {
        applyGrauityTheme(request.themeName);
        sendResponse({ success: true, theme: request.themeName });
      } else if (request.action === 'TOGGLE_SIDEBARS') {
        const newState = toggleSidebars();
        sendResponse({ success: true, hidden: newState });
      } else if (request.action === 'GET_SIDEBAR_STATE') {
        sendResponse({ success: true, hidden: isSidebarsHidden() });
      } else if (request.action === 'SET_SIDEBARS_HIDDEN') {
        const newState = setSidebarsHidden(request.hidden);
        sendResponse({ success: true, hidden: newState });
      }
      return true;
    });
  }

  /**
   * Check whether sidebars are currently hidden (focus mode active)
   */
  function isSidebarsHidden() {
    if (document.body && document.body.classList.contains('newton-sidebars-hidden')) {
      return true;
    }
    if (document.documentElement && document.documentElement.getAttribute('data-newton-sidebars-hidden') === 'true') {
      return true;
    }
    try {
      return localStorage.getItem(SIDEBARS_HIDDEN_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  /**
   * Synchronize button visual state, ARIA attributes, and tooltip
   */
  function updateButtonState(btn, isHidden) {
    if (!btn) return;
    const tooltipText = isHidden ? 'Show Sidebars (Alt+S)' : 'Hide Sidebars (Alt+S)';
    btn.setAttribute('title', tooltipText);
    btn.setAttribute('aria-label', tooltipText);
    btn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
    btn.classList.toggle('active', isHidden);
    btn.classList.toggle('newton-sidebars-collapsed', isHidden);
  }

  /**
   * Set sidebar collapse state, updating DOM classes, attributes, localStorage, and button
   */
  function setSidebarsHidden(hidden) {
    const isHidden = Boolean(hidden);
    try {
      localStorage.setItem(SIDEBARS_HIDDEN_KEY, isHidden ? 'true' : 'false');
    } catch (e) {
      console.warn('[Newton Enhancer] Could not persist sidebar state to localStorage:', e);
    }

    if (document.body) {
      document.body.classList.toggle('newton-sidebars-hidden', isHidden);
      document.body.setAttribute('data-newton-sidebars-hidden', isHidden ? 'true' : 'false');
    }
    if (document.documentElement) {
      document.documentElement.setAttribute('data-newton-sidebars-hidden', isHidden ? 'true' : 'false');
    }

    const btn = document.getElementById('newton-sidebar-toggle-btn');
    if (btn) {
      updateButtonState(btn, isHidden);
    }
    return isHidden;
  }

  /**
   * Toggle sidebars hidden/shown
   */
  function toggleSidebars() {
    return setSidebarsHidden(!isSidebarsHidden());
  }

  /**
   * Locate the top header / navbar and suitable insertion anchor
   */
  function findHeaderMountPoint() {
    const headerCandidates = [
      'header',
      '[role="navigation"]',
      '#__next > div > div:first-child > header',
      '#__next > div > div:first-child nav',
      '#__next > div > div:first-child',
      '[class*="sc-3fcd8b21-1"]',
      '[class*="sc-3d4c1f9d-0"]'
    ];

    let header = null;
    for (let i = 0; i < headerCandidates.length; i++) {
      const el = document.querySelector(headerCandidates[i]);
      if (el) {
        if (headerCandidates[i] === '#__next > div > div:first-child' && el.classList.contains('main-container')) {
          continue;
        }
        header = el;
        break;
      }
    }

    if (!header) return null;

    // Search for user actions, avatar, or right-hand items in header
    const actionSelectors = [
      '[class*="profile" i]',
      '[class*="avatar" i]',
      'img[alt*="avatar" i]',
      'img[src*="avatar" i]',
      '[class*="user" i]',
      '[class*="dropdown" i]',
      '[class*="right" i]',
      'button[class*="ant-btn"]'
    ];

    for (let j = 0; j < actionSelectors.length; j++) {
      const actionEl = header.querySelector(actionSelectors[j]);
      if (actionEl && actionEl.id !== 'newton-sidebar-toggle-btn') {
        const actionContainer = actionEl.closest('div');
        if (actionContainer && header.contains(actionContainer)) {
          return { container: actionContainer.parentElement || header, beforeNode: actionContainer };
        }
      }
    }

    const headerDivs = header.querySelectorAll(':scope > div');
    if (headerDivs.length > 1) {
      const lastDiv = headerDivs[headerDivs.length - 1];
      return { container: lastDiv, beforeNode: lastDiv.firstChild };
    } else if (headerDivs.length === 1) {
      return { container: headerDivs[0], beforeNode: null };
    }

    return { container: header, beforeNode: null };
  }

  /**
   * Ensure sidebar toggle button exists and is mounted in header (or floating fallback)
   */
  function ensureSidebarToggleButton() {
    let btn = document.getElementById('newton-sidebar-toggle-btn');
    const isHidden = isSidebarsHidden();

    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'newton-sidebar-toggle-btn';
      btn.className = 'ant-btn ant-btn-default ant-btn-icon-only sc-ec795657-0 newton-sidebar-toggle-btn';
      btn.setAttribute('type', 'button');
      btn.setAttribute('data-newton-sidebar-toggle', 'true');
      btn.innerHTML = `
        <svg class="newton-toggle-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="8" y1="3" x2="8" y2="21" class="newton-sidebar-line-left"></line>
          <line x1="16" y1="3" x2="16" y2="21" class="newton-sidebar-line-right"></line>
        </svg>
      `;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSidebars();
      });
    }

    updateButtonState(btn, isHidden);

    // Mount to header or fallback
    const mount = findHeaderMountPoint();
    if (mount && mount.container) {
      if (btn.parentElement !== mount.container || (mount.beforeNode && btn.nextSibling !== mount.beforeNode)) {
        btn.classList.remove('newton-floating-toggle');
        if (mount.beforeNode && mount.beforeNode.parentElement === mount.container) {
          mount.container.insertBefore(btn, mount.beforeNode);
        } else {
          mount.container.appendChild(btn);
        }
      }
    } else if (document.body && !document.body.contains(btn)) {
      btn.classList.add('newton-floating-toggle');
      document.body.appendChild(btn);
    }

    return btn;
  }

  /**
   * Identify and semantically tag sidebar columns and center content
   */
  function tagSidebarLayout(root = document.body) {
    if (!root) return;

    // 1. Tag layout containers inside .main-container or root
    const containers = root.querySelectorAll('.main-container > div:first-child, .main-container');
    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      if (container.id === 'dashboard-container' && !container.classList.contains('main-container')) {
        continue;
      }
      const children = Array.from(container.children).filter(el => {
        return !['SCRIPT', 'STYLE'].includes(el.tagName) && !el.hasAttribute('data-newton-sidebar-toggle');
      });

      if (children.length >= 2) {
        let leftCol = null;
        let centerCol = null;
        let rightCol = null;

        for (let c = 0; c < children.length; c++) {
          const child = children[c];
          const text = child.textContent || '';
          const isLeft = child.classList.contains('sc-2974f9d9-0') ||
                         child.classList.contains('dzfdrs') ||
                         child.querySelector('a[href*="/home"], a[href*="/courses"], a[href*="/timeline"]') ||
                         (c === 0 && children.length >= 3 && /home/i.test(text) && /courses/i.test(text));

          const isRight = child.classList.contains('sc-3a0afb14-6') ||
                          child.classList.contains('cJtEaa') ||
                          child.hasAttribute('data-newton-calendar') ||
                          child.querySelector('[data-newton-calendar], [class*="sc-3a0afb14"]') ||
                          (c === children.length - 1 && children.length >= 3 && /calendar/i.test(text));

          const isCenter = child.classList.contains('sc-fd4f3244-0') ||
                           child.querySelector('[data-newton-card], [class*="sc-48b8f391"], [data-newton-lockin-block], h2, h3');

          if (isLeft && !leftCol) {
            leftCol = child;
          } else if (isRight && !rightCol) {
            rightCol = child;
          } else if (isCenter && !centerCol) {
            centerCol = child;
          }
        }

        if (children.length === 3) {
          if (!leftCol) leftCol = children[0];
          if (!centerCol) centerCol = children[1];
          if (!rightCol) rightCol = children[2];
        }

        if (leftCol) leftCol.setAttribute('data-newton-sidebar-left', 'true');
        if (rightCol) rightCol.setAttribute('data-newton-sidebar-right', 'true');
        if (centerCol) centerCol.setAttribute('data-newton-main-content', 'true');
        if (leftCol || rightCol || centerCol) {
          container.setAttribute('data-newton-layout-container', 'true');
        }
      }
    }

    // 2. Class-based elements
    const leftEls = root.querySelectorAll('.sc-2974f9d9-0, .dzfdrs');
    for (let i = 0; i < leftEls.length; i++) {
      leftEls[i].setAttribute('data-newton-sidebar-left', 'true');
    }

    const centerEls = root.querySelectorAll('.sc-fd4f3244-0');
    for (let i = 0; i < centerEls.length; i++) {
      centerEls[i].setAttribute('data-newton-main-content', 'true');
    }

    const rightEls = root.querySelectorAll('.sc-3a0afb14-6, .cJtEaa');
    for (let i = 0; i < rightEls.length; i++) {
      rightEls[i].setAttribute('data-newton-sidebar-right', 'true');
    }

    // 3. Calendar column ancestor
    const calEls = root.querySelectorAll('[data-newton-calendar]');
    for (let i = 0; i < calEls.length; i++) {
      let node = calEls[i];
      while (node && node.parentElement && !node.parentElement.classList.contains('main-container') && !node.parentElement.hasAttribute('data-newton-layout-container')) {
        if (node.parentElement === document.body) break;
        node = node.parentElement;
      }
      if (node && node !== document.body && !node.classList.contains('main-container') && !node.hasAttribute('data-newton-main-content')) {
        node.setAttribute('data-newton-sidebar-right', 'true');
      }
    }
  }

  // Keyboard shortcut: Alt+S (or Option+S on macOS)
  function handleKeyDown(e) {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S' || e.key === 'ß')) {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.isContentEditable ||
        activeEl.getAttribute('role') === 'textbox'
      );
      if (!isInput) {
        e.preventDefault();
        toggleSidebars();
      }
    }
  }
  window.addEventListener('keydown', handleKeyDown);

  /**
   * Automatically tag key Newton School UI components with stable semantic data attributes.
   * This ensures dark theme styling remains 100% resilient across frontend rebuilds
   * without relying on volatile styled-components class hashes.
   */
  function tagSemanticElements(root = document.body) {
    if (!root) return;

    // 1. Tag leaf and near-leaf text elements
    const elements = root.querySelectorAll('div, span, p, h1, h2, h3, h4, button');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const text = el.textContent ? el.textContent.trim() : '';
      if (!text) continue;

      // Leaf elements checks (badges, stats, headers)
      if (el.children.length === 0) {
        // Due / deadline badge (e.g. "due tomorrow", "due on 25 Sept")
        if (/^due\s+(tomorrow|today|on|\d)/i.test(text)) {
          el.setAttribute('data-newton-due-badge', 'true');
        }
        // Section headings
        else if (text === 'Calendar' && el.parentElement) {
          el.parentElement.setAttribute('data-newton-calendar', 'true');
        } else if (text === 'Your lectures' && el.parentElement) {
          el.parentElement.setAttribute('data-newton-lectures', 'true');
        } else if (text === 'Your Sessions' && el.parentElement) {
          el.parentElement.setAttribute('data-newton-sessions', 'true');
        } else if (/^\d+%\s*(\(\d+\/\d+\))?$/.test(text) || /^(\d+\/\d+)$/.test(text)) {
          el.setAttribute('data-newton-perf-stat', 'true');
        }
      }

      // Motivation text ("Backlog zone", "Time to lock in", "Almost There!")
      if (/backlog zone|time to lock in|lock in\b|almost there/i.test(text) && el.children.length === 0) {
        el.setAttribute('data-newton-motivation-text', 'true');
        // Traverse up to find the enclosing motivation banner block
        let curr = el.parentElement;
        let outerBanner = null;
        while (curr && curr !== root && curr !== document.body) {
          // Stop if we hit dashboard container, page main, or an element with other content/sections
          if (
            curr.classList.contains('main-container') ||
            curr.tagName === 'MAIN' ||
            curr.id === 'dashboard-container' ||
            curr.querySelector('header, nav, [data-newton-calendar], [data-newton-lectures], [data-newton-card]')
          ) {
            break;
          }
          curr.setAttribute('data-newton-lockin-block', 'true');
          outerBanner = curr;

          // If the parent contains multiple cards/sections, curr is the outermost banner container
          if (curr.parentElement) {
            const siblingsHaveCards = curr.parentElement.querySelector('[data-newton-card], [class*="sc-48b8f391-10"], button:not([data-newton-lockin-block] *)');
            if (siblingsHaveCards && !curr.querySelector('[data-newton-card], [class*="sc-48b8f391-10"]')) {
              break;
            }
          }
          if (curr.matches && curr.matches('[class*="hNZhIJ"], [class*="oDEDp"]')) {
            break;
          }
          curr = curr.parentElement;
        }
        if (outerBanner) {
          outerBanner.setAttribute('data-newton-motivation-banner', 'true');
          outerBanner.setAttribute('data-newton-lockin-block', 'true');
        }
      }

      // Solved counter text (e.g. "0/5 Solved", "3/3 Solved", "Questions Solved")
      // Handles elements with up to 3 children (e.g. <span>0</span>/5 Solved) and under 40 chars
      if (el.children.length <= 3 && text.length < 40) {
        const solvedRegex = /(\d+\s*\/\s*\d+|\b\d+\b)\s*(questions?\s*)?solved/i;
        const solvedLabelRegex = /^(questions?\s+solved|number\s+of\s+questions?\s+solved)$/i;
        if (solvedRegex.test(text) || solvedLabelRegex.test(text)) {
          // Ensure this is the innermost matching container
          const childMatches = Array.from(el.children).some(child => {
            const ct = child.textContent?.trim() || '';
            return ct && (solvedRegex.test(ct) || solvedLabelRegex.test(ct));
          });
          if (!childMatches) {
            el.setAttribute('data-newton-solved-block', 'true');
            // Check if all questions are solved (e.g. "3/3 Solved", "10/10 Solved")
            const ratioMatch = text.match(/(\d+)\s*\/\s*(\d+)\s*solved/i);
            const isAllSolved = ratioMatch && ratioMatch[1] === ratioMatch[2] && parseInt(ratioMatch[1], 10) > 0;
            if (el.getAttribute('primarycolor') === '#007A51' || isAllSolved || el.classList?.contains('TCIGy')) {
              el.setAttribute('data-newton-completed', 'true');
            }
          }
        }
      }
    }

    // 2. Tag motivation banners by legacy class directly
    const motivationBanners = root.querySelectorAll('[class*="hNZhIJ"], [class*="oDEDp"]');
    for (let i = 0; i < motivationBanners.length; i++) {
      motivationBanners[i].setAttribute('data-newton-motivation-banner', 'true');
      motivationBanners[i].setAttribute('data-newton-lockin-block', 'true');
    }

    // 3. Tag solved blocks by attribute & legacy class
    const solvedBlocks = root.querySelectorAll('[primarycolor], [secondarycolor], [class*="sc-48b8f391-22"], .fMZYpR, .TCIGy');
    for (let i = 0; i < solvedBlocks.length; i++) {
      const sb = solvedBlocks[i];
      sb.setAttribute('data-newton-solved-block', 'true');
      if (sb.getAttribute('primarycolor') === '#007A51' || sb.classList?.contains('TCIGy')) {
        sb.setAttribute('data-newton-completed', 'true');
      }
    }

    // 4. Tag card footers and task cards structurally from solved blocks
    const allSolved = root.querySelectorAll('[data-newton-solved-block], [primarycolor]');
    for (let i = 0; i < allSolved.length; i++) {
      const solved = allSolved[i];
      const footer = solved.parentElement;
      if (footer && footer !== root && footer !== document.body) {
        footer.setAttribute('data-newton-card-footer', 'true');
        // Find enclosing card
        let card = footer.parentElement;
        while (card && card !== root && card !== document.body) {
          if (card.querySelector('h3') || card.classList?.contains('sc-48b8f391-10')) {
            break;
          }
          card = card.parentElement;
        }
        if (!card || card === root || card === document.body) {
          card = footer.parentElement;
        }
        if (card && card !== root && card !== document.body && !card.hasAttribute('data-newton-motivation-banner')) {
          card.setAttribute('data-newton-card', 'true');
          const cardText = card.textContent || '';
          const isCompleted =
            solved.getAttribute('primarycolor') === '#007A51' ||
            solved.hasAttribute('data-newton-completed') ||
            card.classList?.contains('osmtW') ||
            card.className?.includes('osmtW') ||
            /re-solve/i.test(cardText) ||
            /\bcompleted\b/i.test(cardText);
          if (isCompleted) {
            card.setAttribute('data-newton-card-completed', 'true');
            solved.setAttribute('data-newton-completed', 'true');
          }
        }
      }
    }

    // 5. Structural card tagging via Action buttons
    const buttons = root.querySelectorAll('button');
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const btnText = btn.textContent?.trim() || '';
      if (/^(solve|re-solve|submit|start|continue)$/i.test(btnText)) {
        const footer = btn.closest('[data-newton-card-footer]') || btn.parentElement;
        if (footer && footer !== root && footer !== document.body) {
          footer.setAttribute('data-newton-card-footer', 'true');
          let card = footer.closest('[data-newton-card]');
          if (!card) {
            card = footer.parentElement;
            while (card && card !== root && card !== document.body) {
              if (card.querySelector('h3') || card.classList?.contains('sc-48b8f391-10')) {
                break;
              }
              card = card.parentElement;
            }
          }
          if (!card || card === root || card === document.body) {
            card = footer.parentElement;
          }
          if (card && card !== root && card !== document.body && !card.hasAttribute('data-newton-motivation-banner')) {
            card.setAttribute('data-newton-card', 'true');
            const cardText = card.textContent || '';
            if (
              /re-solve/i.test(btnText) ||
              card.classList?.contains('osmtW') ||
              card.className?.includes('osmtW') ||
              /\bcompleted\b/i.test(cardText)
            ) {
              card.setAttribute('data-newton-card-completed', 'true');
              const innerSolved = card.querySelector('[data-newton-solved-block]');
              if (innerSolved) {
                innerSolved.setAttribute('data-newton-completed', 'true');
              }
            }
          }
        }
      }
    }

    // 6. Propagate completed state to inner solved blocks
    const completedCards = root.querySelectorAll('[data-newton-card-completed]');
    for (let i = 0; i < completedCards.length; i++) {
      const sb = completedCards[i].querySelector('[data-newton-solved-block]');
      if (sb) {
        sb.setAttribute('data-newton-completed', 'true');
      }
    }

    // 7. Tag sidebar columns and mount toggle button
    tagSidebarLayout(root);
    ensureSidebarToggleButton();
  }

  let tagTimeout = null;
  function scheduleTagging() {
    if (tagTimeout) return;
    tagTimeout = setTimeout(() => {
      tagTimeout = null;
      tagSemanticElements(document.body);
      tagSidebarLayout(document.body);
      ensureSidebarToggleButton();
    }, 150);
  }

  // Observer to ensure Next.js route transitions or re-renders do not strip the theme class
  // or sidebar collapse state, and keep semantic attributes synchronized
  const observer = new MutationObserver((mutations) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(['themeMode', 'themeName'], (result) => {
        const mode = result.themeMode || 'light';
        const effectiveTheme = resolveEffectiveTheme(mode);
        const expectedClass = effectiveTheme === 'dark' ? GRAUITY_DARK : GRAUITY_LIGHT;
        if (document.body && !document.body.classList.contains(expectedClass)) {
          document.body.classList.forEach(c => {
            if (c.startsWith('grauity-theme-') && c !== expectedClass) {
              document.body.classList.remove(c);
            }
          });
          document.body.classList.add(expectedClass);
        }
      });
    }

    // Ensure body keeps newton-sidebars-hidden class if Next.js route change stripped it
    const shouldBeHidden = isSidebarsHidden();
    if (document.body && shouldBeHidden && !document.body.classList.contains('newton-sidebars-hidden')) {
      document.body.classList.add('newton-sidebars-hidden');
      document.body.setAttribute('data-newton-sidebars-hidden', 'true');
    }

    // Schedule semantic tagging on DOM changes
    scheduleTagging();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true
    });
  }

  // Expose for explicit test execution
  window.tagSemanticElements = tagSemanticElements;
  window.tagSidebarLayout = tagSidebarLayout;
  window.ensureSidebarToggleButton = ensureSidebarToggleButton;
  window.toggleSidebars = toggleSidebars;
  window.setSidebarsHidden = setSidebarsHidden;
  window.isSidebarsHidden = isSidebarsHidden;

  // Initial tagging and button mounting immediately when DOM is ready
  if (document.body) {
    tagSemanticElements(document.body);
    tagSidebarLayout(document.body);
    ensureSidebarToggleButton();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      tagSemanticElements(document.body);
      tagSidebarLayout(document.body);
      ensureSidebarToggleButton();
    }, { once: true });
  }
})();
