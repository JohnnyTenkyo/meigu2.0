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

  // For intraday, we show the END of the period
  // If a 30m candle starts at 9:30, it represents 9:30-10:00, so we show 10:00
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

// US Stock list - Extended with user's watchlist (239 stocks)
export const US_STOCKS = [
  "QQQ", "SPY", "GDXU", "TSLA", "TSLL", "OPEN", "OPEX", "DJT", "DJTU", "ONDS",
  "NVTS", "DXYZ", "UPST", "RDDT", "IWM", "UVXY", "RGTI", "ASTS", "ALAB", "OKLO",
  "CVNA", "CRWV", "CRCL", "SOXL", "BBAI", "SMCI", "SOFI", "HOOD", "COIN", "AMD",
  "DPST", "FIG", "SBET", "RXRX", "PLTR", "HIMS", "SMR", "SOUN", "UNH", "MRNA",
  "MSTR", "TEM", "MP", "MU", "RKLB", "U", "STX", "AGQ", "CRWD", "FMCC",
  "FNMA", "CRML", "NVTX", "ONDL", "TSNF", "TSRS", "TSES", "TSIC", "TSSD", "NXDR",
  "TGL", "SMX", "WRD", "TQQQ", "GOOG", "AVGO", "AMZN", "ASML", "TSM", "LUNR",
  "ARM", "NAIL", "BETR", "SNGX", "DGNX", "SNDK", "WDC", "QS", "BMY", "VST",
  "AES", "DUOL", "OXY", "META", "AAPL", "APP", "QCOM", "NNE", "SERV", "APG",
  "WMT", "MSFT", "PZZA", "GRRR", "MARA", "NVO", "NKE", "NVDA", "ARQQ", "LAES",
  "IONQ", "NMAX", "AAL", "QMCO", "QUBT", "WOLF", "UPSX", "QBTS", "CRCA", "CWVX",
  "OKLL", "RGTX", "RDTL", "AMPX", "TGT", "BYND", "MEME", "POWI", "POET", "CIFR",
  "HUT", "IREN", "BTQ", "USAR", "TTD", "IBM", "FIGR", "GEMI", "ORBS", "ATAI",
  "BEKE", "OPAD", "DUO", "PDD", "KTOS", "CRM", "BLSH", "TLRY", "VSCO", "IXHL",
  "LHX", "XRPT", "BLK", "BTBT", "FUTU", "VOR", "ASST", "DDOG", "BMNR", "VGT",
  "VOO", "LULU", "AEVA", "TRON", "MRVL", "RBLX", "AGIG", "USO", "LBRT", "PSH",
  "PBR", "PFE", "AIRO", "AMGN", "ORCL", "CHYM", "NAKA", "BNS", "NBIS", "ZS",
  "APLD", "AI", "SHOP", "SPOT", "RGC", "PYPL", "SNAP", "PONY", "MELI", "LLY",
  "BA", "BULL", "TMC", "B", "NEM", "SQQQ", "UVIX", "BRK.B", "AFRM", "COST",
  "CLSK", "PM", "XOM", "GM", "JD", "HSAI", "KHC", "YINN", "VZ", "BILI",
  "HII", "NFLX", "V", "TLT", "VRT", "NIO", "DVN", "GDS", "GLD", ".VIX",
  "MCHP", "INTC", "APPS", "KO", "AA", "BTC", "LMT", "TMF", "GME", "WKEY",
  "CSCO", "AUR", "KITT", "ACHR", "RIVN", "CRNC", "RR", "XOVR", "HOLO", "SES",
  "CELH", "VRSN", "SIRI", "NUKK", "SNOW", "AVDL", "KC", "BABA", "LI",
];
