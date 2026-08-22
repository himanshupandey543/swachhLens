/* =========================================================
 * SwachLens — Static hero headline
 * -----------------------------------------------------------------
 * Renders the full hero headline instantly (no typewriter loop).
 * The trailing accent (default "report.") is rendered into its own
 * `.lv-em` span so it keeps the green italic styling while the rest
 * of the phrase is white — mirroring the previous accent treatment.
 *
 * Phrase + accent come from data attributes on the h1:
 *   data-hero-phrase="A cleaner city starts with one report."
 *   data-hero-accent="report."
 *
 * The gentle floating motion is pure CSS on [data-hero-type].
 * ========================================================= */

(function () {
  var root = document.querySelector('[data-hero-type]');
  if (!root) return;

  var textEl = root.querySelector('[data-hero-type-text]');
  var accentEl = root.querySelector('[data-hero-type-accent]');
  if (!textEl) return;

  function render() {
    /* Translation-aware: if js/lang.js is loaded, prefer t('hero.h1') /
     * t('hero.h1accent'); otherwise fall back to the data attributes. */
    var phrase = (window.t && window.t('hero.h1') !== 'hero.h1')
      ? window.t('hero.h1')
      : (root.getAttribute('data-hero-phrase') || 'A cleaner city starts with one report.');
    var accent = (window.t && window.t('hero.h1accent') !== 'hero.h1accent')
      ? window.t('hero.h1accent')
      : (root.getAttribute('data-hero-accent') || 'report.');
    var accentAt = phrase.indexOf(accent);
    if (accentAt < 0) accentAt = phrase.length; // accent not found → all plain

    /* Show the full phrase once — no typing / deleting loop. */
    textEl.textContent = phrase.slice(0, accentAt);
    accentEl.textContent = phrase.slice(accentAt);
  }

  render();
  document.addEventListener('swachlens:lang', render);
})();
