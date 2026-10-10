// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { refreshWhenBackInView, keepsLiveChannel, REFRESH_AFTER_MS, REFRESH_JITTER_MS } from '../src/lib/liveRefresh';

// A shopper's page has no live connection. It re-reads when it comes back into view after a while away, after a
// random wait, so thousands of pages returning together do not all ask the database in the same instant.
let clock = 0;
const now = () => clock;
const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
};
const comeBack = () => { setVisibility('visible'); document.dispatchEvent(new Event('visibilitychange')); };
const leave = () => { setVisibility('hidden'); document.dispatchEvent(new Event('visibilitychange')); };
const wait = (ms: number) => { clock += ms; vi.advanceTimersByTime(ms); };

let stop: (() => void) | null = null;
beforeEach(() => { vi.useFakeTimers(); clock = 1_000_000; setVisibility('visible'); });
afterEach(() => { stop?.(); stop = null; vi.useRealTimers(); });

describe('who keeps a live channel', () => {
  it('only an administrator or a seller', () => {
    expect(keepsLiveChannel({ isAdminUser: true, isSellerUser: false })).toBe(true);
    expect(keepsLiveChannel({ isAdminUser: false, isSellerUser: true })).toBe(true);
    expect(keepsLiveChannel({ isAdminUser: false, isSellerUser: false })).toBe(false);
  });
});

describe('a page that was away', () => {
  it('re-reads once after being away for a minute, not before', () => {
    const refresh = vi.fn();
    stop = refreshWhenBackInView(refresh, { random: () => 0.5 });
    leave();
    wait(REFRESH_AFTER_MS - 1);
    comeBack();
    wait(REFRESH_JITTER_MS * 2);
    expect(refresh).not.toHaveBeenCalled();   // away 59.999 s: too soon
    leave();
    wait(2);
    comeBack();
    expect(refresh).not.toHaveBeenCalled();   // not at the instant it returns: it waits first
    wait(REFRESH_JITTER_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('waits a random time up to the jitter, never longer', () => {
    for (const [random, expected] of [[0, 0], [0.5, 2500], [0.999, 4995]] as const) {
      const refresh = vi.fn();
      const stopThis = refreshWhenBackInView(refresh, { random: () => random });
      wait(REFRESH_AFTER_MS);
      comeBack();
      wait(expected > 0 ? expected - 1 : 0);
      expect(refresh).toHaveBeenCalledTimes(expected === 0 ? 1 : 0);
      wait(1);
      expect(refresh).toHaveBeenCalledTimes(1);
      stopThis();
    }
  });

  it('does not stack: several returns while one re-read is waiting are one re-read', () => {
    const refresh = vi.fn();
    stop = refreshWhenBackInView(refresh, { random: () => 0.9 });
    wait(REFRESH_AFTER_MS);
    for (let i = 0; i < 10; i += 1) { comeBack(); leave(); }
    comeBack();
    wait(REFRESH_JITTER_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('needs another minute away before the next re-read', () => {
    const refresh = vi.fn();
    stop = refreshWhenBackInView(refresh, { random: () => 0 });
    wait(REFRESH_AFTER_MS);
    comeBack(); wait(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    leave(); wait(10_000); comeBack(); wait(REFRESH_JITTER_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    leave(); wait(REFRESH_AFTER_MS); comeBack(); wait(1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('ignores the page being hidden', () => {
    const refresh = vi.fn();
    stop = refreshWhenBackInView(refresh, { random: () => 0 });
    wait(REFRESH_AFTER_MS * 5);
    leave();
    wait(REFRESH_JITTER_MS * 2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('also re-reads when the network comes back after a long time', () => {
    const refresh = vi.fn();
    stop = refreshWhenBackInView(refresh, { random: () => 0 });
    wait(REFRESH_AFTER_MS);
    window.dispatchEvent(new Event('online'));
    wait(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('stopping', () => {
  it('stops listening and cancels a waiting re-read', () => {
    const refresh = vi.fn();
    const stopNow = refreshWhenBackInView(refresh, { random: () => 0.9 });
    wait(REFRESH_AFTER_MS);
    comeBack();
    stopNow();
    wait(REFRESH_JITTER_MS * 2);
    comeBack();
    window.dispatchEvent(new Event('online'));
    wait(REFRESH_JITTER_MS * 2);
    expect(refresh).not.toHaveBeenCalled();
  });
});
