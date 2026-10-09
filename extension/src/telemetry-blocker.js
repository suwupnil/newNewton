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

  // 8. Intercept window.fetch for diagnostic reports and tracking requests
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (isBlockingEnabled && isTelemetryUrl(url)) {
        return new Response(JSON.stringify({ blocked: true, status: 'ok', source: 'newton-enhancer' }), {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // Intercept quiz submission endpoints: POST /api/v1/course/h/{courseHash}/assessment/h/{assessmentHash}/questions/?auto_submit=...
      const quizSubmitMatch = url.match(/\/api\/v1\/course\/h\/([^/]+)\/assessment\/h\/([^/]+)\/questions\//i);
      if (quizSubmitMatch && init && init.method && init.method.toUpperCase() === 'POST') {
        const courseHash = quizSubmitMatch[1];
        const assessmentHash = quizSubmitMatch[2];
        try {
          let authToken = null;
          const rawToken = localStorage.getItem('auth-token');
          if (rawToken) {
            authToken = rawToken.startsWith('"') ? JSON.parse(rawToken) : rawToken;
          }
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
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._telemetryUrl = url;
      return originalOpen.apply(this, [method, url, ...rest]);
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
      return originalSend.apply(this, arguments);
    };
  }

  console.log(`[Newton Enhancer] In-page telemetry blocker initialized (Active: ${isBlockingEnabled}).`);
})();
