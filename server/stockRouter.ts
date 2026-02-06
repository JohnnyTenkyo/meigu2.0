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

// Get ET (Eastern Time) hour from UTC timestamp
function getETHour(timestamp: number): { etH: number; etM: number; dateStr: string } {
  const d = new Date(timestamp);
  const month = d.getUTCMonth();
  // Simplified DST check: March-November = DST (UTC-4), else EST (UTC-5)
  const isDST = month >= 2 && month <= 10;
  const etOffset = isDST ? 4 : 5;
  
  let etH = d.getUTCHours() - etOffset;
  let etDay = d.getUTCDate();
  let etMonth = d.getUTCMonth();
  let etYear = d.getUTCFullYear();
  
  if (etH < 0) {
    etH += 24;
    etDay -= 1;
    if (etDay < 1) {
      etMonth -= 1;
      if (etMonth < 0) {
        etMonth = 11;
        etYear -= 1;
      }
      etDay = new Date(etYear, etMonth + 1, 0).getDate();
    }
  }
  
  const etM = d.getUTCMinutes();
  const dateStr = `${etYear}-${String(etMonth + 1).padStart(2, '0')}-${String(etDay).padStart(2, '0')}`;
  
  return { etH, etM, dateStr };
}

// Generic aggregation: aggregate smaller candles into larger time blocks
function aggregateCandles(candles: Candle[], targetMinutes: number): Candle[] {
  if (!candles.length) return [];

  const groups = new Map<string, Candle[]>();

  for (const c of candles) {
    const { etH, etM, dateStr } = getETHour(c.time);
    
    // Calculate total minutes from market open (9:30)
    // 09:30 is minute 0. 09:31 is minute 1.
    const totalMinutes = (etH - 9) * 60 + (etM - 30);
    
    // Filter for regular market hours (9:30 AM - 4:00 PM ET)
    if (totalMinutes < 0 || totalMinutes >= 390) continue; 
    
    // Group by block
    // If targetMinutes = 30, then 0-29 is block 0 (9:30-9:59), 30-59 is block 1 (10:00-10:29)
    const blockIndex = Math.floor(totalMinutes / targetMinutes);
    const key = `${dateStr}-${blockIndex}`;
    
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

// Aggregate daily candles to weekly (Mon-Fri)
function aggregateDailyToWeekly(candles: Candle[]): Candle[] {
  const groups = new Map<string, Candle[]>();
  for (const c of candles) {
    const d = new Date(c.time);
    // Get ISO week start (Monday)
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
    const key = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
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
function getYahooParams(interval: string): { yahooInterval: string; range: string; aggregateMinutes?: number; aggregateWeekly?: boolean } {
  const map: Record<string, { yahooInterval: string; range: string; aggregateMinutes?: number; aggregateWeekly?: boolean }> = {
    '1m': { yahooInterval: '1m', range: '7d' },
    '3m': { yahooInterval: '1m', range: '7d', aggregateMinutes: 3 },
    '5m': { yahooInterval: '5m', range: '60d' },
    '15m': { yahooInterval: '15m', range: '60d' },
    '30m': { yahooInterval: '30m', range: '60d' },
    '1h': { yahooInterval: '60m', range: '730d' },
    '2h': { yahooInterval: '60m', range: '730d', aggregateMinutes: 120 },
    '3h': { yahooInterval: '60m', range: '730d', aggregateMinutes: 180 },
    '4h': { yahooInterval: '60m', range: '730d', aggregateMinutes: 240 },
    '1d': { yahooInterval: '1d', range: '5y' },
    '1w': { yahooInterval: '1d', range: '10y', aggregateWeekly: true },
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
      const params = getYahooParams(interval);
      const { yahooInterval, range, aggregateMinutes } = params;

      let candles = await fetchYahooChart(symbol, yahooInterval, range);

      // Filter and aggregate for intraday intervals
      if (['1m', '3m', '5m', '15m', '30m', '1h', '2h', '3h', '4h'].includes(interval)) {
        // For 1m, 5m, 15m, 30m, 1h, we still pass through aggregateCandles to filter hours and align time
        const aggMin = aggregateMinutes || (
          interval === '1m' ? 1 :
          interval === '5m' ? 5 :
          interval === '15m' ? 15 :
          interval === '30m' ? 30 :
          interval === '1h' ? 60 : 1
        );
        candles = aggregateCandles(candles, aggMin);
      }

      // Aggregate daily to weekly
      if (params.aggregateWeekly) {
        candles = aggregateDailyToWeekly(candles);
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
