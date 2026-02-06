export interface Candle {
  time: number; // Unix timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

export interface CDSignal {
  time: number;
  type: 'buy' | 'sell';
  strength: 'strong' | 'medium' | 'weak';
  label: string;
  diffValue?: number;
  deaValue?: number;
  macdValue?: number;
}

export interface BuySellPressure {
  time: number;
  pressure: number;
  changeRate: number;
  signal?: 'strong_up' | 'strong_down';
}

export interface LadderLevel {
  time: number;
  blueUp: number;
  blueDn: number;
  yellowUp: number;
  yellowDn: number;
  blueMid?: number;
  yellowMid?: number;
}

export interface NXSignal {
  time: number;
  type: 'buy' | 'sell';
  label: string;
}

export type TimeInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '3h' | '4h' | '1d' | '1w' | '1mo';
