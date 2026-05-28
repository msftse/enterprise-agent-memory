import { describe, it, expect, beforeEach } from 'vitest';
import { RuntimeStats } from '../../instrumentation/runtime-stats.js';

describe('RuntimeStats', () => {
  let stats: RuntimeStats;
  beforeEach(() => {
    stats = new RuntimeStats({ bufferSize: 1000 });
  });

  it('computes p50/p95/p99 from recorded durations', () => {
    for (let i = 1; i <= 100; i++) stats.recordRequest(i);
    const s = stats.snapshot();
    // Sorted [1..100]; p50 ~= 50, p95 ~= 95, p99 ~= 99
    expect(s.latency.p50Ms).toBeGreaterThanOrEqual(49);
    expect(s.latency.p50Ms).toBeLessThanOrEqual(51);
    expect(s.latency.p95Ms).toBeGreaterThanOrEqual(94);
    expect(s.latency.p95Ms).toBeLessThanOrEqual(96);
    expect(s.latency.p99Ms).toBeGreaterThanOrEqual(98);
    expect(s.latency.p99Ms).toBeLessThanOrEqual(100);
    expect(s.latency.sampleSize).toBe(100);
  });

  it('returns zero percentiles when no samples recorded', () => {
    const s = stats.snapshot();
    expect(s.latency.p50Ms).toBe(0);
    expect(s.latency.p95Ms).toBe(0);
    expect(s.latency.p99Ms).toBe(0);
    expect(s.latency.sampleSize).toBe(0);
  });

  it('caps the circular buffer at bufferSize', () => {
    for (let i = 0; i < 1500; i++) stats.recordRequest(i);
    expect(stats.snapshot().latency.sampleSize).toBe(1000);
  });

  it('counts requests in rolling 1m/5m/15m windows', () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 3; i++) stats.recordRequest(10, now);
    for (let i = 0; i < 2; i++) stats.recordRequest(10, now - 2 * 60_000);
    stats.recordRequest(10, now - 10 * 60_000);
    stats.recordRequest(10, now - 20 * 60_000);

    const s = stats.snapshot(now);
    expect(s.throughput.rpmLast1m).toBe(3);
    expect(s.throughput.rpmLast5m).toBeCloseTo((3 + 2) / 5, 2);
    expect(s.throughput.rpmLast15m).toBeCloseTo((3 + 2 + 1) / 15, 2);
  });

  it('exposes startedAt + restartCount in uptime', () => {
    const s = stats.snapshot();
    expect(s.uptime.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof s.uptime.restartCount).toBe('number');
  });
});
