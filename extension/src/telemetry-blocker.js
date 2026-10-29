/**
 * Newton Enhancer - In-Page Telemetry Blocker
 * Runs in the webpage execution context (world: "MAIN") at document_start.
 *
 * Provides two critical protections:
 * 1. Stubs tracking globals (Clarity, Mixpanel, CleverTap, OpenPanel, GTag, Pixels)
 *    with crash-proof recursive proxies to prevent Next.js / React application errors.
 * 2. Intercepts navigator.sendBeacon, fetch, and XMLHttpRequest to silently drop
 *    diagnostic uploads (/api/v1/user/report/) and tracking calls without network errors.
 */

(function () {
  if (window.__newtonBlockerInitialized) return;
  window.__newtonBlockerInitialized = true;

  const STORAGE_KEY = 'newton_enhancer_block_telemetry';

  // 1. Determine initial blocking state synchronously from localStorage
  let isBlockingEnabled = true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      isBlockingEnabled = stored === 'true';
    }
  } catch (e) {
    // Fallback default: enabled
    isBlockingEnabled = true;
  }

  function extractCleanAuthToken(raw) {
    if (!raw) return null;
    let parsed = raw;
    let attempts = 0;
    while (typeof parsed === 'string' && attempts < 3) {
      try {
        const temp = JSON.parse(parsed);
        if (typeof temp === 'object' || typeof temp === 'string') {
          parsed = temp;
        } else {
          break;
        }
      } catch (e) {
        break;
      }
      attempts++;
    }

    let tokenStr = null;
    if (typeof parsed === 'string') {
      const tokenMatch = parsed.match(/['"]?(?:access_)?token['"]?\s*:\s*['"]?([^'"}\s]+)['"]?/i);
      if (tokenMatch) {
        tokenStr = tokenMatch[1];
      } else {
        tokenStr = parsed;
      }
    } else if (typeof parsed === 'object' && parsed !== null) {
      tokenStr = parsed.token || parsed.access_token || parsed.authToken || parsed.auth_token || null;
    }

    if (typeof tokenStr === 'string') {
      return tokenStr.replace(/^Bearer\s+/i, '').trim();
    }
    return null;
  }

  // Hook localStorage.setItem to immediately detect auth-token when student logs in
  try {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      originalSetItem.apply(this, arguments);
      if (typeof key === 'string') {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey === 'auth-token' ||
          lowerKey === 'token' ||
          lowerKey === 'access_token' ||
          lowerKey === 'authtoken' ||
          lowerKey === 'auth_token' ||
          lowerKey === 'access_token_ns_student_web'
        ) {
          const clean = extractCleanAuthToken(value);
          if (clean) {
            try {
              window.postMessage({
                source: 'newton-enhancer-token-captured',
                rawToken: clean
              }, '*');
            } catch (e) {}
          }
        }
      }
    };
  } catch (e) {}

  // Hook HTML5 History API to notify content script of SPA route transitions (Next.js Link navigation)
  try {
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      const res = originalPushState.apply(this, args);
      try {
        window.dispatchEvent(new Event('newton-enhancer-location-change'));
      } catch (e) {}
      return res;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const res = originalReplaceState.apply(this, args);
      try {
        window.dispatchEvent(new Event('newton-enhancer-location-change'));
      } catch (e) {}
      return res;
    };
  } catch (e) {}

  function syncDocAttribute() {
    if (document.documentElement) {
      document.documentElement.setAttribute('data-newton-block-telemetry', isBlockingEnabled ? 'true' : 'false');
      document.documentElement.setAttribute('data-newton-blocker-active', 'true');
    }
  }
  syncDocAttribute();
  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded', syncDocAttribute, { once: true });
  }

  // 2. Listen for dynamic toggle events from content script / popup
  window.addEventListener('newton_enhancer_telemetry_toggle', (e) => {
    if (e.detail && typeof e.detail.enabled === 'boolean') {
      isBlockingEnabled = e.detail.enabled;
      syncDocAttribute();
      try {
        localStorage.setItem(STORAGE_KEY, isBlockingEnabled ? 'true' : 'false');
      } catch (err) {}
      console.log(`[Newton Enhancer] Telemetry blocker state: ${isBlockingEnabled ? 'ACTIVE' : 'DISABLED'}`);
    }
  });

  window.addEventListener('message', (e) => {
    if (e.data && e.data.source === 'newton-enhancer-telemetry' && typeof e.data.enabled === 'boolean') {
      isBlockingEnabled = e.data.enabled;
      syncDocAttribute();
      try {
        localStorage.setItem(STORAGE_KEY, isBlockingEnabled ? 'true' : 'false');
      } catch (err) {}
      console.log(`[Newton Enhancer] Telemetry blocker state (via postMessage): ${isBlockingEnabled ? 'ACTIVE' : 'DISABLED'}`);
    }
  });

  // 3. Known telemetry, analytics, and diagnostic URL patterns
  const BLOCKED_PATTERNS = [
    /\/api\/v1\/user\/report\//i,
    /clarity\.ms/i,
    /google-analytics\.com/i,
    /analytics\.google\.com/i,
    /googletagmanager\.com/i,
    /mixpanel\.com/i,
    /clevertap\.com/i,
    /wizrocket\.com/i,
    /openpanel\.dev/i,
    /openpanel-api\.newtonschool\.co/i,
    /openpanel/i,
    /facebook\.com\/tr/i,
    /connect\.facebook\.net/i,
    /px\.ads\.linkedin\.com/i,
    /snap\.licdn\.com/i,
    /trc\.taboola\.com/i,
    /q\.quora\.com/i,
    /hotjar\.com/i,
    /sentry\.io/i,
    /datadoghq\.com/i,
    /fullstory\.com/i,
    /logrocket\.io/i
  ];

  function isTelemetryUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return BLOCKED_PATTERNS.some(pattern => pattern.test(url));
  }

  // 4. Safe recursive Proxy stub factory
  function createStubProxy(name) {
    const noop = function () {
      return proxy;
    };
    const proxy = new Proxy(noop, {
      get(target, prop) {
        if (prop === 'then' || prop === Symbol.toPrimitive) {
          return undefined;
        }
        if (prop === 'toString' || prop === 'valueOf') {
          return () => `[Newton Enhancer Stub: ${name}]`;
        }
        if (prop === 'length') return 0;
        if (prop === '__isNewtonStub') return true;
        return proxy;
      },
      apply(target, thisArg, argumentsList) {
        return proxy;
      }
    });
    return proxy;
  }

  // 5. Setup Microsoft Clarity stub with queue support
  const stubClarity = function () {
    if (!isBlockingEnabled && typeof window._real_clarity === 'function') {
      return window._real_clarity.apply(this, arguments);
    }
  };
  stubClarity.q = [];
  stubClarity.consent = () => {};
  stubClarity.identify = () => {};
  stubClarity.set = () => {};
  stubClarity.event = () => {};
  stubClarity.upgrade = () => {};
  stubClarity.__isNewtonStub = true;

  const clarityProxy = new Proxy(stubClarity, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return createStubProxy('clarity.' + String(prop));
    }
  });

  // 6. Assign stubs to window globals (only if not already set by real scripts)
  if (!window.clarity) window.clarity = clarityProxy;
  if (!window.mixpanel) window.mixpanel = createStubProxy('mixpanel');
  if (!window.clevertap) window.clevertap = createStubProxy('clevertap');
  if (!window.openpanel) window.openpanel = createStubProxy('openpanel');
  if (!window.op) window.op = createStubProxy('op');
  if (!window.fbq) window.fbq = createStubProxy('fbq');
  if (!window.lintrk) window.lintrk = createStubProxy('lintrk');
  if (!window.qp) window.qp = createStubProxy('qp');
  if (!window.gtag) window.gtag = createStubProxy('gtag');
  if (!window.ga) window.ga = createStubProxy('ga');

  // GTM dataLayer push protection
  if (!window.dataLayer) {
    window.dataLayer = [];
  }
  const originalDataLayerPush = Array.prototype.push.bind(window.dataLayer);
  window.dataLayer.push = function (...args) {
    if (isBlockingEnabled) {
      return window.dataLayer.length;
    }
    return originalDataLayerPush(...args);
  };

  // 7. Intercept navigator.sendBeacon
  if (navigator && typeof navigator.sendBeacon === 'function') {
    const originalSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (isBlockingEnabled && isTelemetryUrl(url)) {
        // Return true to signal successful queuing so callers do not error or retry
        return true;
      }
      return originalSendBeacon(url, data);
    };
  }

  // Helper to inspect request headers and capture bearer tokens on login or API calls
  function inspectAndBroadcastAuthHeader(headers) {
    if (!headers) return null;
    try {
      let authHeader = null;
      if (typeof headers.get === 'function') {
        authHeader = headers.get('authorization') || headers.get('Authorization');
      } else if (typeof headers === 'object') {
        authHeader = headers.authorization || headers.Authorization;
      }
      if (typeof authHeader === 'string') {
        const clean = extractCleanAuthToken(authHeader);
        if (clean) {
          window.postMessage({
            source: 'newton-enhancer-token-captured',
            rawToken: clean
          }, '*');
          return clean;
        }
      }
    } catch (e) {}
    return null;
  }

  function getStoredPortalToken() {
    try {
      return (
        localStorage.getItem('auth-token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('access_token') ||
        localStorage.getItem('authToken') ||
        localStorage.getItem('auth_token') ||
        sessionStorage.getItem('auth-token') ||
        sessionStorage.getItem('token') ||
        sessionStorage.getItem('access_token')
      );
    } catch (e) {
      return null;
    }
  }

  // 8. Intercept window.fetch for diagnostic reports, telemetry, and quiz events
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      const method = (init && init.method ? init.method : (input && input.method ? input.method : 'GET')).toUpperCase();

      if (isBlockingEnabled && isTelemetryUrl(url)) {
        return new Response(JSON.stringify({ blocked: true, status: 'ok', source: 'newton-enhancer' }), {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check for auth header to capture token
      let capturedToken = null;
      if (init && init.headers) {
        capturedToken = inspectAndBroadcastAuthHeader(init.headers);
      } else if (input && input.headers) {
        capturedToken = inspectAndBroadcastAuthHeader(input.headers);
      }

      // 1. Intercept quiz opened: GET .../assessment/h/{assessmentHash}/questions/ or .../instructions/
      const quizOpenMatch = url.match(/\/api\/v[12]\/course\/(?:h\/)?([^/]+)\/assessment\/(?:h\/)?([^/]+)\/(?:questions|instructions)(?:\/|$|\?)/i);
      if (quizOpenMatch && method === 'GET') {
        const courseHash = quizOpenMatch[1];
        const assessmentHash = quizOpenMatch[2];
        try {
          window.postMessage({
            source: 'newton-enhancer-quiz-opened',
            courseHash,
            assessmentHash
          }, '*');
        } catch (e) {}
      }

      // 2. Intercept quiz submission: POST /api/v1/course/h/{courseHash}/assessment/h/{assessmentHash}/questions/?auto_submit=...
      const quizSubmitMatch = url.match(/\/api\/v[12]\/course\/(?:h\/)?([^/]+)\/assessment\/(?:h\/)?([^/]+)\/questions(?:\/|$|\?)/i);
      if (quizSubmitMatch && method === 'POST') {
        const courseHash = quizSubmitMatch[1];
        const assessmentHash = quizSubmitMatch[2];
        try {
          const rawToken = capturedToken || getStoredPortalToken();
          const authToken = extractCleanAuthToken(rawToken);
          window.postMessage({
            source: 'newton-enhancer-quiz-submitted',
            courseHash,
            assessmentHash,
            authToken
          }, '*');
        } catch (e) {}
      }

      return originalFetch(input, init);
    };
  }

  // 9. Intercept XMLHttpRequest
  if (typeof XMLHttpRequest !== 'undefined') {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._telemetryUrl = url;
      this._httpMethod = (method || 'GET').toUpperCase();
      this._authHeader = null;
      return originalOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
      if (typeof header === 'string' && header.toLowerCase() === 'authorization') {
        this._authHeader = value;
        const clean = extractCleanAuthToken(value);
        if (clean) {
          try {
            window.postMessage({
              source: 'newton-enhancer-token-captured',
              rawToken: clean
            }, '*');
          } catch (e) {}
        }
      }
      return originalSetRequestHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      if (isBlockingEnabled && isTelemetryUrl(this._telemetryUrl)) {
        Object.defineProperty(this, 'readyState', { value: 4, writable: true, configurable: true });
        Object.defineProperty(this, 'status', { value: 200, writable: true, configurable: true });
        Object.defineProperty(this, 'statusText', { value: 'OK', writable: true, configurable: true });
        Object.defineProperty(this, 'responseText', { value: '{"blocked":true,"status":"ok"}', writable: true, configurable: true });
        Object.defineProperty(this, 'response', { value: '{"blocked":true,"status":"ok"}', writable: true, configurable: true });

        setTimeout(() => {
          if (typeof this.onreadystatechange === 'function') {
            this.onreadystatechange(new Event('readystatechange'));
          }
          if (typeof this.onload === 'function') {
            this.onload(new ProgressEvent('load'));
          }
          if (typeof this.onloadend === 'function') {
            this.onloadend(new ProgressEvent('loadend'));
          }
          this.dispatchEvent(new Event('readystatechange'));
          this.dispatchEvent(new ProgressEvent('load'));
          this.dispatchEvent(new ProgressEvent('loadend'));
        }, 0);
        return;
      }

      // Check quiz open in XHR
      if (this._httpMethod === 'GET' && typeof this._telemetryUrl === 'string') {
        const quizOpenMatch = this._telemetryUrl.match(/\/api\/v[12]\/course\/(?:h\/)?([^/]+)\/assessment\/(?:h\/)?([^/]+)\/(?:questions|instructions)(?:\/|$|\?)/i);
        if (quizOpenMatch) {
          try {
            window.postMessage({
              source: 'newton-enhancer-quiz-opened',
              courseHash: quizOpenMatch[1],
              assessmentHash: quizOpenMatch[2]
            }, '*');
          } catch (e) {}
        }
      }

      // Check quiz submit in XHR
      if (this._httpMethod === 'POST' && typeof this._telemetryUrl === 'string') {
        const quizSubmitMatch = this._telemetryUrl.match(/\/api\/v[12]\/course\/(?:h\/)?([^/]+)\/assessment\/(?:h\/)?([^/]+)\/questions(?:\/|$|\?)/i);
        if (quizSubmitMatch) {
          try {
            const rawToken = this._authHeader || getStoredPortalToken();
            const authToken = extractCleanAuthToken(rawToken);
            window.postMessage({
              source: 'newton-enhancer-quiz-submitted',
              courseHash: quizSubmitMatch[1],
              assessmentHash: quizSubmitMatch[2],
              authToken
            }, '*');
          } catch (e) {}
        }
      }

      return originalSend.apply(this, arguments);
    };
  }

  console.log(`[Newton Enhancer] In-page telemetry blocker initialized (Active: ${isBlockingEnabled}).`);
})();
