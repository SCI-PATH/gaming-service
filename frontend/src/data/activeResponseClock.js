/**
 * Active response clock.
 * Measures time the question is actually on screen. Time while the tab is
 * hidden is not added. There is no deadline and the clock never auto-submits.
 */

export function createActiveResponseClock(now = Date.now()) {
  let startedAt = now;
  let accumulated = 0;
  let paused = false;
  let stopped = false;
  let stoppedMs = null;

  return {
    pause(at = Date.now()) {
      if (stopped || paused) return;
      accumulated += Math.max(0, at - startedAt);
      paused = true;
    },
    resume(at = Date.now()) {
      if (stopped || !paused) return;
      paused = false;
      startedAt = at;
    },
    elapsed(at = Date.now()) {
      if (stoppedMs != null) return stoppedMs;
      const live = paused ? 0 : Math.max(0, at - startedAt);
      return accumulated + live;
    },
    stop(at = Date.now()) {
      if (stopped) return stoppedMs;
      const live = paused ? 0 : Math.max(0, at - startedAt);
      stoppedMs = accumulated + live;
      stopped = true;
      paused = true;
      return stoppedMs;
    },
    /** Continue after a failed submit. Time spent waiting on the failure is not counted. */
    reopen(at = Date.now()) {
      if (!stopped) return;
      stopped = false;
      stoppedMs = null;
      paused = false;
      startedAt = at;
    },
    isStopped() {
      return stopped;
    },
  };
}
