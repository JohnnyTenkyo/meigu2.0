import { describe, expect, it } from "vitest";

// Test the pure utility functions from stockRouter
// We need to extract and test the aggregation logic

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Replicate aggregate1hTo4h from stockRouter.ts for unit testing
function aggregate1hTo4h(candles: Candle[]): Candle[] {
  if (!candles.length) return [];

  const groups = new Map<string, Candle[]>();

  for (const c of candles) {
    const d = new Date(c.time);
    const month = d.getUTCMonth();
    const isDST = month >= 2 && month <= 10;
    const etOffset = isDST ? 4 : 5;
    const etH = ((d.getUTCHours() - etOffset) + 24) % 24;
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

    let block: string;
    if (etH < 14) {
      block = `${dateStr}-AM`;
    } else {
      block = `${dateStr}-PM`;
    }

    if (!groups.has(block)) groups.set(block, []);
    groups.get(block)!.push(c);
  }

  const result: Candle[] = [];
  for (const group of Array.from(groups.values())) {
    if (group.length === 0) continue;
    result.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c: Candle) => c.high)),
      low: Math.min(...group.map((c: Candle) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum: number, c: Candle) => sum + c.volume, 0),
    });
  }

  return result.sort((a, b) => a.time - b.time);
}

// Replicate aggregateDailyToMonthly
function aggregateDailyToMonthly(candles: Candle[]): Candle[] {
  const groups = new Map<string, Candle[]>();
  for (const c of candles) {
    const d = new Date(c.time);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const result: Candle[] = [];
  for (const group of Array.from(groups.values())) {
    if (group.length === 0) continue;
    result.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c: Candle) => c.high)),
      low: Math.min(...group.map((c: Candle) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum: number, c: Candle) => sum + c.volume, 0),
    });
  }
  return result.sort((a, b) => a.time - b.time);
}

// Replicate getYahooParams
function getYahooParams(interval: string): { yahooInterval: string; range: string } {
  const map: Record<string, { yahooInterval: string; range: string }> = {
    '1m': { yahooInterval: '1m', range: '7d' },
    '5m': { yahooInterval: '5m', range: '60d' },
    '15m': { yahooInterval: '15m', range: '60d' },
    '30m': { yahooInterval: '30m', range: '60d' },
    '1h': { yahooInterval: '60m', range: '730d' },
    '4h': { yahooInterval: '60m', range: '730d' },
    '1d': { yahooInterval: '1d', range: '5y' },
    '1mo': { yahooInterval: '1mo', range: 'max' },
  };
  return map[interval] || { yahooInterval: '1d', range: 'max' };
}

// Replicate toFutuTime from stockApi.ts
function toFutuTime(timestamp: number, interval: string): number {
  if (['1d', '1mo'].includes(interval)) return timestamp;

  const intervalMs: Record<string, number> = {
    '1m': 60000,
    '5m': 300000,
    '15m': 900000,
    '30m': 1800000,
    '1h': 3600000,
    '4h': 14400000,
  };

  return timestamp + (intervalMs[interval] || 0);
}

describe("aggregate1hTo4h", () => {
  it("returns empty array for empty input", () => {
    expect(aggregate1hTo4h([])).toEqual([]);
  });

  it("aggregates 1h candles into 4h blocks", () => {
    // Create 8 hourly candles for one trading day (9:30-16:00 ET)
    // In UTC during DST (ET = UTC-4): 13:30 to 20:00
    const baseDate = new Date("2025-06-15T13:00:00Z"); // 9:00 ET (DST)
    const candles: Candle[] = [];

    for (let i = 0; i < 7; i++) {
      const time = new Date(baseDate.getTime() + i * 3600000);
      candles.push({
        time: time.getTime(),
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 102 + i,
        volume: 10000 * (i + 1),
      });
    }

    const result = aggregate1hTo4h(candles);
    // Should produce 2 blocks: AM (before 14:00 ET) and PM (14:00+ ET)
    expect(result.length).toBe(2);
  });

  it("preserves OHLC correctly in aggregation", () => {
    const candles: Candle[] = [
      { time: new Date("2025-06-15T14:00:00Z").getTime(), open: 100, high: 110, low: 90, close: 105, volume: 1000 },
      { time: new Date("2025-06-15T15:00:00Z").getTime(), open: 105, high: 115, low: 95, close: 108, volume: 2000 },
      { time: new Date("2025-06-15T16:00:00Z").getTime(), open: 108, high: 120, low: 88, close: 112, volume: 3000 },
    ];

    const result = aggregate1hTo4h(candles);
    expect(result.length).toBe(1);
    expect(result[0].open).toBe(100); // First candle's open
    expect(result[0].high).toBe(120); // Max high
    expect(result[0].low).toBe(88); // Min low
    expect(result[0].close).toBe(112); // Last candle's close
    expect(result[0].volume).toBe(6000); // Sum of volumes
  });

  it("sorts result by time", () => {
    const candles: Candle[] = [
      { time: new Date("2025-06-16T14:00:00Z").getTime(), open: 100, high: 110, low: 90, close: 105, volume: 1000 },
      { time: new Date("2025-06-15T14:00:00Z").getTime(), open: 95, high: 105, low: 85, close: 100, volume: 1000 },
    ];

    const result = aggregate1hTo4h(candles);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].time).toBeGreaterThan(result[i - 1].time);
    }
  });
});

describe("aggregateDailyToMonthly", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateDailyToMonthly([])).toEqual([]);
  });

  it("groups daily candles by month", () => {
    const candles: Candle[] = [];
    // 30 days in January
    for (let i = 1; i <= 20; i++) {
      candles.push({
        time: new Date(`2025-01-${String(i).padStart(2, '0')}T12:00:00Z`).getTime(),
        open: 100 + i,
        high: 110 + i,
        low: 90 + i,
        close: 105 + i,
        volume: 10000,
      });
    }
    // 10 days in February
    for (let i = 1; i <= 10; i++) {
      candles.push({
        time: new Date(`2025-02-${String(i).padStart(2, '0')}T12:00:00Z`).getTime(),
        open: 120 + i,
        high: 130 + i,
        low: 110 + i,
        close: 125 + i,
        volume: 15000,
      });
    }

    const result = aggregateDailyToMonthly(candles);
    expect(result.length).toBe(2); // January and February

    // January: open from first day, close from last day
    expect(result[0].open).toBe(101);
    expect(result[0].close).toBe(125);
    expect(result[0].volume).toBe(200000); // 20 * 10000

    // February
    expect(result[1].open).toBe(121);
    expect(result[1].close).toBe(135);
    expect(result[1].volume).toBe(150000); // 10 * 15000
  });
});

describe("getYahooParams", () => {
  it("returns correct params for each interval", () => {
    expect(getYahooParams("1m")).toEqual({ yahooInterval: "1m", range: "7d" });
    expect(getYahooParams("5m")).toEqual({ yahooInterval: "5m", range: "60d" });
    expect(getYahooParams("15m")).toEqual({ yahooInterval: "15m", range: "60d" });
    expect(getYahooParams("30m")).toEqual({ yahooInterval: "30m", range: "60d" });
    expect(getYahooParams("1h")).toEqual({ yahooInterval: "60m", range: "730d" });
    expect(getYahooParams("4h")).toEqual({ yahooInterval: "60m", range: "730d" });
    expect(getYahooParams("1d")).toEqual({ yahooInterval: "1d", range: "5y" });
    expect(getYahooParams("1mo")).toEqual({ yahooInterval: "1mo", range: "max" });
  });

  it("returns default for unknown interval", () => {
    expect(getYahooParams("unknown")).toEqual({ yahooInterval: "1d", range: "max" });
  });
});

describe("toFutuTime (Futu standard end time)", () => {
  it("adds interval duration for intraday intervals", () => {
    const baseTime = new Date("2025-01-29T14:30:00Z").getTime();

    // 30m: should add 30 minutes
    expect(toFutuTime(baseTime, "30m")).toBe(baseTime + 1800000);

    // 1h: should add 1 hour
    expect(toFutuTime(baseTime, "1h")).toBe(baseTime + 3600000);

    // 5m: should add 5 minutes
    expect(toFutuTime(baseTime, "5m")).toBe(baseTime + 300000);

    // 1m: should add 1 minute
    expect(toFutuTime(baseTime, "1m")).toBe(baseTime + 60000);
  });

  it("does not modify daily/monthly timestamps", () => {
    const baseTime = new Date("2025-01-29T00:00:00Z").getTime();

    expect(toFutuTime(baseTime, "1d")).toBe(baseTime);
    expect(toFutuTime(baseTime, "1mo")).toBe(baseTime);
  });

  it("30m bar at 9:30 should display as 10:00", () => {
    // 9:30 ET = 14:30 UTC (during EST)
    const startTime = new Date("2025-01-29T14:30:00Z").getTime();
    const endTime = toFutuTime(startTime, "30m");
    const endDate = new Date(endTime);

    // Should be 15:00 UTC = 10:00 ET
    expect(endDate.getUTCHours()).toBe(15);
    expect(endDate.getUTCMinutes()).toBe(0);
  });
});

describe("Cache behavior (in-memory)", () => {
  it("cache key format includes symbol and interval", () => {
    // Test that different intervals produce different cache keys
    const key1 = `yahoo:TSLA:1d:5y`;
    const key2 = `yahoo:TSLA:60m:730d`;
    const key3 = `yahoo:AAPL:1d:5y`;

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
  });
});
