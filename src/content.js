/**
 * Newton Enhancer - Content Script
 * Synchronizes and enforces the selected Grauity theme on Newton School pages.
 */

(function () {
  const GRAUITY_LIGHT = 'grauity-theme-light';
  const GRAUITY_DARK = 'grauity-theme-dark';
  const THEME_PREF_KEY = 'theme-preference';
  const APP_THEME_KEY = 'app_theme_enabled';

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

  // Listen for real-time messages from extension popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'SET_THEME') {
        applyGrauityTheme(request.themeName);
        sendResponse({ success: true, theme: request.themeName });
      }
      return true;
    });
  }

  /**
   * Automatically tag key Newton School UI components with stable semantic data attributes.
   * This ensures dark theme styling remains 100% resilient across frontend rebuilds
   * without relying on volatile styled-components class hashes.
   */
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
  }

  let tagTimeout = null;
  function scheduleTagging() {
    if (tagTimeout) return;
    tagTimeout = setTimeout(() => {
      tagTimeout = null;
      tagSemanticElements(document.body);
    }, 150);
  }

  // Observer to ensure Next.js route transitions or re-renders do not strip the theme class
  // and keep semantic attributes synchronized
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

  // Initial tagging immediately when DOM is ready without waiting on debounce timeout
  if (document.body) {
    tagSemanticElements(document.body);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => tagSemanticElements(document.body), { once: true });
  }
})();
