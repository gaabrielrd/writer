const DURATION = 240;

/** One transition for the whole theme, independent of component hover timings. */
export function transitionTheme(update: () => void, animate: boolean): () => void {
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduced) {
    update();
    return () => {};
  }
  let active = true;
  const clear = () => {
    if (active) root.removeAttribute('data-theme-transition');
  };
  if (typeof document.startViewTransition === 'function') {
    root.setAttribute('data-theme-transition', 'snapshot');
    const transition = document.startViewTransition(() => {
      if (active) update();
    });
    void transition.finished.catch(() => {}).finally(clear);
    return () => {
      clear();
      active = false;
      transition.skipTransition();
    };
  }
  root.setAttribute('data-theme-transition', 'colors');
  // Commit the common timing before changing tokens.
  void root.offsetWidth;
  update();
  const timer = setTimeout(clear, DURATION);
  return () => {
    clear();
    active = false;
    clearTimeout(timer);
  };
}
