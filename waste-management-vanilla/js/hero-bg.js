/* =========================================================
 * SwachLens — Hero background video driver
 * Plays the screen-recording background (assets/hero-demo.mp4)
 * as a muted, looping ambient layer behind the hero content.
 *
 * Behaviour mirrors the old WebGL layer it replaced:
 *  - pauses when the tab is hidden, resumes when visible
 *  - honours prefers-reduced-motion: paused on a static frame
 *  - no-op if the element or video is missing (gradient shows)
 *
 * No external deps.
 * ========================================================= */

(function () {
  var video = document.getElementById('heroBg');
  if (!video || video.tagName.toLowerCase() !== 'video') return;

  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---- playback control ---- */
  var playing = false;
  function play() {
    if (playing) return;
    playing = true;
    var p = video.play();
    // Autoplay can be rejected (data saver / policy) — swallow quietly;
    // the hero gradient + scrim still render fine underneath.
    if (p && typeof p.then === 'function') p.catch(function () {});
  }
  function pause() {
    playing = false;
    try { video.pause(); } catch (e) {}
  }

  /* ---- lifecycle ---- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause(); else if (!motion.matches) play();
  });
  motion.addEventListener('change', function () {
    if (motion.matches) pause(); else play();
  });

  if (motion.matches) {
    pause();
    // Show a static first frame for reduced-motion users.
    if (video.readyState >= 1) video.currentTime = 0;
  } else {
    play();
  }
})();
