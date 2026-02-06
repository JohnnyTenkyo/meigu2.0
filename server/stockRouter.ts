import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import axios from "axios";

// In-memory cache
const cache: Map<string, { data: any; expires: number }> = new Map();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expires) return entry.data as T;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any, ttlMs: number) {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Aggregate 1h candles to 4h (US market hours)
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

// Aggregate daily to monthly
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

// Interval to Yahoo params mapping
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

async function fetchYahooChart(symbol: string, interval: string, range: string): Promise<Candle[]> {
  const cacheKey = `yahoo:${symbol}:${interval}:${range}`;
  const cached = getCached<Candle[]>(cacheKey);
  if (cached) return cached;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includeAdjustedClose=true`;

  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    timeout: 30000,
  });

  const data = res.data;
  if (!data?.chart?.result?.[0]) throw new Error('No data from Yahoo Finance');

  const result = data.chart.result[0];
  const timestamps = result.timestamp || [];
  const quotes = result.indicators.quote[0];

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (quotes.open[i] != null && quotes.close[i] != null && quotes.volume[i] != null) {
      candles.push({
        time: timestamps[i] * 1000,
        open: quotes.open[i],
        high: quotes.high[i],
        low: quotes.low[i],
        close: quotes.close[i],
        volume: quotes.volume[i],
      });
    }
  }

  const ttl = ['1d', '1wk', '1mo'].includes(interval) ? 600000 : 120000;
  setCache(cacheKey, candles, ttl);
  return candles;
}

export const stockRouter = router({
  getChart: publicProcedure
    .input(z.object({
      symbol: z.string(),
      interval: z.string(),
    }))
    .query(async ({ input }) => {
      const { symbol, interval } = input;
      const { yahooInterval, range } = getYahooParams(interval);

      let candles = await fetchYahooChart(symbol, yahooInterval, range);

      if (interval === '4h') {
        candles = aggregate1hTo4h(candles);
      }

      return candles;
    }),

  getQuote: publicProcedure
    .input(z.object({
      symbol: z.string(),
    }))
    .query(async ({ input }) => {
      const cacheKey = `quote:${input.symbol}`;
      const cached = getCached<any>(cacheKey);
      if (cached) return cached;

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(input.symbol)}?interval=1d&range=1d`;
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 15000,
      });

      const data = res.data;
      if (!data?.chart?.result?.[0]) throw new Error('No quote data');

      const meta = data.chart.result[0].meta;
      const price = meta.regularMarketPrice;
      const prevClose = meta.previousClose || meta.chartPreviousClose;

      const quote = {
        symbol: meta.symbol,
        name: meta.longName || meta.shortName || input.symbol,
        price,
        change: price - prevClose,
        changePercent: ((price - prevClose) / prevClose) * 100,
        volume: meta.regularMarketVolume || 0,
      };

      setCache(cacheKey, quote, 120000);
      return quote;
    }),

  batchQuotes: publicProcedure
    .input(z.object({
      symbols: z.array(z.string()),
    }))
    .query(async ({ input }) => {
      const results: Record<string, any> = {};
      
      // Fetch quotes sequentially to avoid rate limiting
      for (const symbol of input.symbols) {
        try {
          const cacheKey = `quote:${symbol}`;
          const cached = getCached<any>(cacheKey);
          if (cached) {
            results[symbol] = cached;
            continue;
          }

          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
          const res = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: 10000,
          });

          const data = res.data;
          if (data?.chart?.result?.[0]) {
            const meta = data.chart.result[0].meta;
            const price = meta.regularMarketPrice;
            const prevClose = meta.previousClose || meta.chartPreviousClose;

            const quote = {
              symbol: meta.symbol,
              name: meta.longName || meta.shortName || symbol,
              price,
              change: price - prevClose,
              changePercent: ((price - prevClose) / prevClose) * 100,
              volume: meta.regularMarketVolume || 0,
            };

            setCache(cacheKey, quote, 120000);
            results[symbol] = quote;
          }
        } catch {
          // Skip failed quotes
        }
      }

      return results;
    }),
});
