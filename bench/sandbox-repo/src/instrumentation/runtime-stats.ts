// Phase 2: per-replica request stats served by /api/v1/scalability/metrics.
// In-memory only — replica restart = stats reset. We expose restartCount
// and startedAt so the dashboard makes that visible.

export interface RuntimeSnapshot {
  latency: { p50Ms: number; p95Ms: number; p99Ms: number; sampleSize: number };
  throughput: { rpmLast1m: number; rpmLast5m: number; rpmLast15m: number };
  uptime: { startedAt: string; restartCount: number };
}

export class RuntimeStats {
  private readonly bufferSize: number;
  private durations: number[] = [];
  private timestamps: number[] = [];
  private readonly startedAt = new Date().toISOString();
  private readonly restartCount = Number(process.env.EAM_RESTART_COUNT ?? '0');

  constructor(opts: { bufferSize?: number } = {}) {
    this.bufferSize = opts.bufferSize ?? 1000;
  }

  recordRequest(durationMs: number, atMs: number = Date.now()): void {
    this.durations.push(durationMs);
    if (this.durations.length > this.bufferSize) this.durations.shift();
    this.timestamps.push(atMs);
    // Trim timestamps older than 15 min on every record so memory stays bounded.
    const cutoff = atMs - 15 * 60_000;
    while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) this.timestamps.shift();
  }

  snapshot(nowMs: number = Date.now()): RuntimeSnapshot {
    const sorted = [...this.durations].sort((a, b) => a - b);
    const pick = (p: number): number => {
      if (sorted.length === 0) return 0;
      const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
      return sorted[idx];
    };
    const inWindow = (windowMs: number): number =>
      this.timestamps.filter((t) => t >= nowMs - windowMs).length;

    return {
      latency: {
        p50Ms: pick(0.5),
        p95Ms: pick(0.95),
        p99Ms: pick(0.99),
        sampleSize: sorted.length,
      },
      throughput: {
        rpmLast1m: inWindow(60_000),
        rpmLast5m: inWindow(5 * 60_000) / 5,
        rpmLast15m: inWindow(15 * 60_000) / 15,
      },
      uptime: {
        startedAt: this.startedAt,
        restartCount: this.restartCount,
      },
    };
  }
}

// Process-wide singleton used by Fastify hooks and the /scalability route.
export const runtimeStats = new RuntimeStats();
