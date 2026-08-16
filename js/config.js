/* =====================================================================
 * SwachLens — App configuration
 * ---------------------------------------------------------------------
 * API_URL automatically detects production vs local environment.
 * In production, update the production URL after deploying to Railway.
 * ===================================================================== */
window.SW_CONFIG = {
  APP_NAME: 'SwachLens',
  TICKER: 'Smart Waste Management',
  API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : window.location.origin,
};
