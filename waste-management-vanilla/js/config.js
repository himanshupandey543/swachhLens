/* =====================================================================
 * SwachLens — App configuration
 * ---------------------------------------------------------------------
 * 1) Paste your Clerk publishable key below to switch auth to Clerk.
 * 2) While the key is empty, the app runs on a built-in mock auth
 *    provider (works offline, same API shape) so you can demo every flow.
 * ===================================================================== */
window.SW_CONFIG = {
  CLERK_PUBLISHABLE_KEY: '',          // ← paste "pk_test_..." here to enable Clerk
  USE_CLERK: false,                    // auto-overridden when a key is present
  APP_NAME: 'SwachLens',
  TICKER: 'Smart Waste Management',
};
