/**
 * web-main.js - Web app entry point for newNewton
 */

import './chrome-shim.js';
import '../extension/src/popup.js';

// Setup additional web helpers (Token save helper, platform badges)
document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('webTokenInput');
  const btnSaveToken = document.getElementById('btnSaveWebToken');
  const tokenStatusBadge = document.getElementById('authTokenStatusBadge');

  if (btnSaveToken && tokenInput) {
    // Populate existing token if present
    window.chrome.storage.local.get(['nst_auth_token'], (res) => {
      if (res && res.nst_auth_token) {
        tokenInput.value = res.nst_auth_token;
        if (tokenStatusBadge) tokenStatusBadge.textContent = 'Token Connected';
      }
    });

    btnSaveToken.addEventListener('click', () => {
      const val = tokenInput.value.trim();
      if (!val) {
        window.chrome.storage.local.remove(['nst_auth_token'], () => {
          alert('Token cleared. Using demo/cached state.');
          if (tokenStatusBadge) tokenStatusBadge.textContent = 'Demo Mode';
        });
        return;
      }

      window.chrome.storage.local.set({ nst_auth_token: val }, () => {
        if (tokenStatusBadge) tokenStatusBadge.textContent = 'Token Saved';
        const syncBtn = document.getElementById('btnSyncAttendance');
        if (syncBtn) syncBtn.click();
      });
    });
  }
});
