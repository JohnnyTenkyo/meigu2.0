import { Candle, CDSignal, BuySellPressure, LadderLevel, NXSignal } from './types';

// ============ EMA Calculation ============
function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  result[0] = data[0];
  const k = 2 / (period + 1);
  for (let i = 1; i < data.length; i++) {
    result[i] = data[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(data[i]);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      result.push(sum / period);
    }
  }
  return result;
}

// ============ MACD (CD指标) ============
export interface MACDResult {
  diff: number[];
  dea: number[];
  macd: number[];
}

export function calculateMACD(candles: Candle[], fast = 12, slow = 26, signal = 9): MACDResult {
  const closes = candles.map(c => c.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  
  const diff = emaFast.map((v, i) => v - emaSlow[i]);
  const dea = ema(diff, signal);
  const macd = diff.map((v, i) => 2 * (v - dea[i]));
  
  return { diff, dea, macd };
}

// ============ CD Signal Detection ============
export function calculateCDSignals(candles: Candle[]): CDSignal[] {
  if (candles.length < 60) return [];
  
  const { diff, dea, macd } = calculateMACD(candles);
  const signals: CDSignal[] = [];
  const closes = candles.map(c => c.close);
  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  
  // Look for divergence patterns
  for (let i = 30; i < candles.length; i++) {
    // Bottom divergence (DXDX): price makes lower low but MACD makes higher low
    if (i >= 5) {
      const lookback = 20;
      const start = Math.max(0, i - lookback);
      
      // Find recent MACD zero-cross points
      let prevCrossIdx = -1;
      for (let j = i - 1; j > start; j--) {
        if (macd[j] <= 0 && macd[j - 1] > 0) {
          prevCrossIdx = j;
          break;
        }
      }
      
      // DXDX: Strong buy - bottom divergence
      if (prevCrossIdx > 0 && macd[i] < 0 && macd[i] > macd[i - 1]) {
        // Price lower but MACD higher (divergence)
        const recentLow = Math.min(...lows.slice(Math.max(0, i - 5), i + 1));
        const prevLow = Math.min(...lows.slice(Math.max(0, prevCrossIdx - 5), prevCrossIdx + 1));
        const recentMacdLow = Math.min(...macd.slice(Math.max(0, i - 5), i + 1));
        const prevMacdLow = Math.min(...macd.slice(Math.max(0, prevCrossIdx - 5), prevCrossIdx + 1));
        
        if (recentLow < prevLow && recentMacdLow > prevMacdLow) {
          signals.push({
            time: candles[i].time,
            type: 'buy',
            strength: 'strong',
            label: '抄底',
          });
          continue;
        }
      }
      
      // LLL: Medium buy - MACD turning up from deep negative
      if (macd[i] < 0 && macd[i] > macd[i - 1] && macd[i - 1] < macd[i - 2] && diff[i] < dea[i]) {
        const macdMin = Math.min(...macd.slice(Math.max(0, i - 10), i));
        if (macdMin < -0.5 && Math.abs(macd[i] - macdMin) / Math.abs(macdMin) > 0.1) {
          signals.push({
            time: candles[i].time,
            type: 'buy',
            strength: 'medium',
            label: '抄底',
          });
          continue;
        }
      }
      
      // Golden cross
      if (diff[i] > dea[i] && diff[i - 1] <= dea[i - 1]) {
        signals.push({
          time: candles[i].time,
          type: 'buy',
          strength: 'weak',
          label: '金叉',
        });
        continue;
      }
      
      // Top divergence: price higher high but MACD lower high
      if (prevCrossIdx > 0 && macd[i] > 0 && macd[i] < macd[i - 1]) {
        const recentHigh = Math.max(...highs.slice(Math.max(0, i - 5), i + 1));
        const prevHigh = Math.max(...highs.slice(Math.max(0, prevCrossIdx - 5), prevCrossIdx + 1));
        const recentMacdHigh = Math.max(...macd.slice(Math.max(0, i - 5), i + 1));
        const prevMacdHigh = Math.max(...macd.slice(Math.max(0, prevCrossIdx - 5), prevCrossIdx + 1));
        
        if (recentHigh > prevHigh && recentMacdHigh < prevMacdHigh) {
          signals.push({
            time: candles[i].time,
            type: 'sell',
            strength: 'strong',
            label: '卖出',
          });
          continue;
        }
      }
      
      // Death cross
      if (diff[i] < dea[i] && diff[i - 1] >= dea[i - 1]) {
        signals.push({
          time: candles[i].time,
          type: 'sell',
          strength: 'weak',
          label: '死叉',
        });
        continue;
      }
    }
  }
  
  return signals;
}

// ============ 买卖力道 (Buy/Sell Pressure) ============
export function calculateBuySellPressure(candles: Candle[]): BuySellPressure[] {
  if (candles.length < 5) return [];
  
  const result: BuySellPressure[] = [];
  const pressures: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const range = c.high - c.low;
    
    if (range === 0) {
      pressures.push(i > 0 ? pressures[i - 1] : 0);
    } else {
      // Buy pressure: close relative to range, weighted by volume
      const buyRatio = (c.close - c.low) / range;
      const sellRatio = (c.high - c.close) / range;
      
      // Volume-weighted pressure
      const volNorm = i > 0 ? c.volume / Math.max(candles[i - 1].volume, 1) : 1;
      const pressure = (buyRatio - sellRatio) * volNorm * 100;
      
      pressures.push(pressure);
    }
  }
  
  // Smooth with EMA
  const smoothed = ema(pressures, 5);
  
  for (let i = 0; i < candles.length; i++) {
    const changeRate = i > 0 && smoothed[i - 1] !== 0
      ? ((smoothed[i] - smoothed[i - 1]) / Math.abs(smoothed[i - 1])) * 100
      : 0;
    
    let signal: 'strong_up' | 'strong_down' | undefined;
    if (changeRate >= 10) signal = 'strong_up';
    else if (changeRate <= -10) signal = 'strong_down';
    
    result.push({
      time: candles[i].time,
      pressure: smoothed[i],
      changeRate,
      signal,
    });
  }
  
  return result;
}

// ============ 黄蓝梯子 (Yellow-Blue Ladder) ============
export function calculateLadder(candles: Candle[]): LadderLevel[] {
  if (candles.length < 60) return [];
  
  const closes = candles.map(c => c.close);
  const ema20 = ema(closes, 20);
  const ema60 = ema(closes, 60);
  
  // Calculate bands based on ATR
  const atr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      atr.push(candles[i].high - candles[i].low);
    } else {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      atr.push(tr);
    }
  }
  const atr14 = ema(atr, 14);
  
  return candles.map((c, i) => ({
    time: c.time,
    blueUp: ema20[i] + atr14[i] * 2,
    blueDn: ema20[i] - atr14[i] * 2,
    yellowUp: ema60[i] + atr14[i] * 3,
    yellowDn: ema60[i] - atr14[i] * 3,
  }));
}

// ============ NX Signal ============
export function calculateNXSignals(candles: Candle[]): NXSignal[] {
  if (candles.length < 20) return [];
  
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const ema5 = ema(closes, 5);
  const ema10 = ema(closes, 10);
  const volEma = ema(volumes, 10);
  
  const signals: NXSignal[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    // Buy: EMA5 crosses above EMA10 with volume surge
    if (ema5[i] > ema10[i] && ema5[i - 1] <= ema10[i - 1] && volumes[i] > volEma[i] * 1.5) {
      signals.push({ time: candles[i].time, type: 'buy', label: '买入' });
    }
    // Sell: EMA5 crosses below EMA10
    if (ema5[i] < ema10[i] && ema5[i - 1] >= ema10[i - 1]) {
      signals.push({ time: candles[i].time, type: 'sell', label: '卖出' });
    }
  }
  
  return signals;
}
