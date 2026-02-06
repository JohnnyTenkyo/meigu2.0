import { Candle, StockQuote, TimeInterval } from './types';

// Convert K-line time to Futu standard (end time)
// 1m K线第一根9:30开始 → 显示9:31
// 30m K线第一根9:30开始 → 显示10:00
export function toFutuTime(timestamp: number, interval: TimeInterval): number {
  if (['1d', '1w', '1mo'].includes(interval)) return timestamp;

  const intervalMs: Record<string, number> = {
    '1m': 60000,
    '3m': 180000,
    '5m': 300000,
    '15m': 900000,
    '30m': 1800000,
    '1h': 3600000,
    '2h': 7200000,
    '3h': 10800000,
    '4h': 14400000,
  };

  return timestamp + (intervalMs[interval] || 0);
}

// Helper to call tRPC with superjson format
async function trpcQuery<T>(path: string, input: Record<string, unknown>): Promise<T> {
  const encoded = encodeURIComponent(JSON.stringify({ "0": { json: input } }));
  const res = await fetch(`/api/trpc/${path}?batch=1&input=${encoded}`, {
    credentials: 'include',
  });
  const json = await res.json();
  
  // batch response format: [{ result: { data: { json: ... } } }]
  if (Array.isArray(json)) {
    const first = json[0];
    if (first?.result?.data?.json !== undefined) {
      return first.result.data.json as T;
    }
    if (first?.result?.data !== undefined) {
      return first.result.data as T;
    }
    if (first?.error) {
      throw new Error(first.error.json?.message || 'API Error');
    }
  }
  
  // non-batch response format
  if (json?.result?.data?.json !== undefined) {
    return json.result.data.json as T;
  }
  if (json?.result?.data !== undefined) {
    return json.result.data as T;
  }
  
  throw new Error('Failed to fetch data from API');
}

// Fetch stock chart data via tRPC backend (no CORS issues)
export async function fetchStockData(symbol: string, interval: TimeInterval): Promise<Candle[]> {
  return trpcQuery<Candle[]>('stock.getChart', { symbol, interval });
}

// Fetch stock quote via tRPC backend
export async function fetchStockQuote(symbol: string): Promise<StockQuote> {
  return trpcQuery<StockQuote>('stock.getQuote', { symbol });
}

// Batch fetch quotes via tRPC backend
export async function fetchBatchQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
  return trpcQuery<Record<string, StockQuote>>('stock.batchQuotes', { symbols });
}

// US Stock list
export const US_STOCKS = [
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "BRK.B", "AVGO", "JPM",
  "LLY", "V", "UNH", "MA", "COST", "HD", "PG", "JNJ", "NFLX", "CRM",
  "AMD", "ORCL", "BAC", "ADBE", "KO", "MRK", "PEP", "TMO", "ACN", "MCD",
  "CSCO", "ABT", "WMT", "DHR", "NKE", "DIS", "INTC", "VZ", "CMCSA", "PFE",
  "QCOM", "TXN", "PM", "IBM", "GE", "CAT", "BA", "RTX", "AMAT", "BKNG",
  "PLTR", "COIN", "SOFI", "HOOD", "MSTR", "ARM", "SMCI", "RKLB", "IONQ", "RGTI",
  "SOUN", "APP", "CRWD", "SNOW", "DDOG", "NET", "SHOP", "SQ", "PYPL", "ROKU",
  "RIVN", "LCID", "NIO", "LI", "XPEV", "BABA", "JD", "PDD", "BIDU", "FUTU",
  "GME", "AMC", "BBBY", "MARA", "RIOT", "CLSK", "HUT", "BTBT", "CIFR", "IREN",
];
