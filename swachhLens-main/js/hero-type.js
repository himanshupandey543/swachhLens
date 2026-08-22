/* =========================================================
 * SwachLens — Whole-headline typewriter
 * -----------------------------------------------------------------
 * Types the full hero headline character-by-character, holds,
 * deletes, then retypes — looping forever. The trailing accent
 * (default "report.") is rendered into its own `.lv-em` span so it
 * keeps the green italic styling while the rest of the phrase is
 * white — mirroring the previous accent treatment.
 *
 * Phrase + accent come from data attributes on the h1:
 *   data-hero-phrase="A cleaner city starts with one report."
 *   data-hero-accent="report."
 *
 * Cursor blink is pure CSS (.hero-cursor). Reduced motion shows the
 * full phrase statically and the CSS stops the blink.
 * -----------------------------------------------------------------
 * No external deps. setTimeout chain (per upstream Typewriter) so
 * typing / holding / deleting keep their own delays.
 * ========================================================= */

(function () {
  var root = document.querySelector('[data-hero-type]');
  if (!root) return;

  var textEl = root.querySelector('[data-hero-type-text]');
  var accentEl = root.querySelector('[data-hero-type-accent]');
  if (!textEl) return;

  var phrase = root.getAttribute('data-hero-phrase') || 'A cleaner city starts with one report.';
  var accent = root.getAttribute('data-hero-accent') || 'report.';
  var accentAt = phrase.indexOf(accent);
  if (accentAt < 0) accentAt = phrase.length; // accent not found → all plain

  var typeDelayMs = 65;      // per-character typing
  var holdMs = 1500;         // hold fully-typed phrase before deleting
  var deleteDelayMs = 90;    // per-character deletion

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var charIndex = 0;
  var deleting = false;
  var timer = null;

  /* Chars up to accentAt land in the plain span; the rest in the accent span. */
  function render() {
    if (charIndex <= accentAt) {
      textEl.textContent = phrase.slice(0, charIndex);
      accentEl.textContent = '';
    } else {
      textEl.textContent = phrase.slice(0, accentAt);
      accentEl.textContent = phrase.slice(accentAt, charIndex);
    }
  }

  function step() {
    if (deleting) {
      if (charIndex === 0) {
        deleting = false;
        timer = setTimeout(step, holdMs); // brief hold at empty, then retype
      } else {
        charIndex -= 1;
        render();
        timer = setTimeout(step, deleteDelayMs);
      }
    } else if (charIndex < phrase.length) {
      charIndex += 1;
      render();
      timer = setTimeout(step, typeDelayMs);
    } else {
      deleting = true; // fully typed → hold, then delete
      timer = setTimeout(step, holdMs);
    }
  }

  function stop() { if (timer) clearTimeout(timer); }

  /* Pause the chain when the tab is hidden (matches hero-bg behavior). */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else step();
  });

  if (reduceMotion) {
    textEl.textContent = phrase.slice(0, accentAt);
    accentEl.textContent = accent;
    return; // no blink either — disabled via CSS
  }

  step();
})();
