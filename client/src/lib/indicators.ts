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

// ============ Helper functions for CD formula ============

/**
 * BARSLAST(condition): Returns the number of bars since the last time condition was true.
 * If condition is true at current bar, returns 0.
 * If condition was never true, returns a large number.
 */
function barslast(condition: boolean[], index: number): number {
  for (let i = index; i >= 0; i--) {
    if (condition[i]) return index - i;
  }
  return index + 1; // never occurred
}

/**
 * LLV(data, period): Lowest value in the last `period` bars (inclusive of current bar).
 */
function llv(data: number[], index: number, period: number): number {
  let min = data[index];
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) {
    if (data[i] < min) min = data[i];
  }
  return min;
}

/**
 * HHV(data, period): Highest value in the last `period` bars (inclusive of current bar).
 */
function hhv(data: number[], index: number, period: number): number {
  let max = data[index];
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) {
    if (data[i] > max) max = data[i];
  }
  return max;
}

/**
 * REF(data, n): Reference value n bars ago.
 */
function ref(data: number[], index: number, n: number): number {
  const refIdx = index - n;
  if (refIdx < 0) return 0;
  return data[refIdx];
}

function refBool(data: boolean[], index: number, n: number): boolean {
  const refIdx = index - n;
  if (refIdx < 0) return false;
  return data[refIdx];
}

/**
 * COUNT(condition, period): Count how many times condition was true in the last `period` bars.
 */
function count(condition: boolean[], index: number, period: number): number {
  let cnt = 0;
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) {
    if (condition[i]) cnt++;
  }
  return cnt;
}

// ============ CD Signal Detection (一比一还原源代码) ============
/**
 * Exact translation of the CD indicator source code:
 * 
 * DIFF : ((EMA(CLOSE,S) - EMA(CLOSE,P))),COLORBLACK;
 * DEA : EMA(DIFF,M),COLORBLACK;
 * MACD : ((DIFF - DEA) * 2),COLORBLACK;
 * 
 * Buy signal: DXDX (抄底) - bottom divergence with MACD confirmation
 * Sell signal: DBJGXC (卖出) - top divergence with MACD confirmation
 */
export function calculateCDSignals(candles: Candle[]): CDSignal[] {
  if (candles.length < 30) return [];
  
  const { diff, dea, macd } = calculateMACD(candles);
  const closes = candles.map(c => c.close);
  const n = candles.length;
  
  // Pre-compute conditions for BARSLAST
  // N1 := BARSLAST(((REF(MACD,1) >= 0) AND (MACD < 0)));
  // This is: MACD crossed from positive to negative (death cross of MACD histogram)
  const macdDeathCross: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    macdDeathCross[i] = (macd[i - 1] >= 0) && (macd[i] < 0);
  }
  
  // MM1 := BARSLAST(((REF(MACD,1) <= 0) AND (MACD > 0)));
  // This is: MACD crossed from negative to positive (golden cross of MACD histogram)
  const macdGoldenCross: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    macdGoldenCross[i] = (macd[i - 1] <= 0) && (macd[i] > 0);
  }
  
  // Compute N1, MM1 arrays
  const N1: number[] = new Array(n).fill(0);
  const MM1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    N1[i] = barslast(macdDeathCross, i);
    MM1[i] = barslast(macdGoldenCross, i);
  }
  
  // CC1 := LLV(CLOSE,(N1 + 1)); -- lowest close in current negative MACD phase
  const CC1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CC1[i] = llv(closes, i, N1[i] + 1);
  }
  
  // CC2 := REF(CC1,(MM1 + 1)); -- CC1 from the previous negative phase
  const CC2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CC2[i] = ref(CC1, i, MM1[i] + 1);
  }
  
  // CC3 := REF(CC2,(MM1 + 1)); -- CC2 from the phase before that
  const CC3: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CC3[i] = ref(CC2, i, MM1[i] + 1);
  }
  
  // DIFL1 := LLV(DIFF,(N1 + 1));
  const DIFL1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFL1[i] = llv(diff, i, N1[i] + 1);
  }
  
  // DIFL2 := REF(DIFL1,(MM1 + 1));
  const DIFL2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFL2[i] = ref(DIFL1, i, MM1[i] + 1);
  }
  
  // DIFL3 := REF(DIFL2,(MM1 + 1));
  const DIFL3: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFL3[i] = ref(DIFL2, i, MM1[i] + 1);
  }
  
  // CH1 := HHV(CLOSE,(MM1 + 1)); -- highest close in current positive MACD phase
  const CH1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CH1[i] = hhv(closes, i, MM1[i] + 1);
  }
  
  // CH2 := REF(CH1,(N1 + 1));
  const CH2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CH2[i] = ref(CH1, i, N1[i] + 1);
  }
  
  // CH3 := REF(CH2,(N1 + 1));
  const CH3: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CH3[i] = ref(CH2, i, N1[i] + 1);
  }
  
  // DIFH1 := HHV(DIFF,(MM1 + 1));
  const DIFH1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFH1[i] = hhv(diff, i, MM1[i] + 1);
  }
  
  // DIFH2 := REF(DIFH1,(N1 + 1));
  const DIFH2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFH2[i] = ref(DIFH1, i, N1[i] + 1);
  }
  
  // DIFH3 := REF(DIFH2,(N1 + 1));
  const DIFH3: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFH3[i] = ref(DIFH2, i, N1[i] + 1);
  }
  
  // ===== BUY SIGNALS (抄底) =====
  
  // AAA := ((CC1 < CC2) AND ((DIFL1 > DIFL2) AND ((REF(MACD,1) < 0) AND (DIFF < 0))));
  const AAA: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    AAA[i] = (CC1[i] < CC2[i]) && (DIFL1[i] > DIFL2[i]) && (macd[i - 1] < 0) && (diff[i] < 0);
  }
  
  // BBB := ((CC1 < CC3) AND ((DIFL1 < DIFL2) AND ((DIFL1 > DIFL3) AND ((REF(MACD,1) < 0) AND (DIFF < 0)))));
  const BBB: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    BBB[i] = (CC1[i] < CC3[i]) && (DIFL1[i] < DIFL2[i]) && (DIFL1[i] > DIFL3[i]) && (macd[i - 1] < 0) && (diff[i] < 0);
  }
  
  // CCC := ((AAA OR BBB) AND (DIFF < 0));
  const CCC: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    CCC[i] = (AAA[i] || BBB[i]) && (diff[i] < 0);
  }
  
  // LLL := ((REF(CCC,1) = 0) AND CCC); -- first bar where CCC becomes true
  const LLL: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    LLL[i] = !CCC[i - 1] && CCC[i];
  }
  
  // XXX := ((REF(AAA,1) AND ((DIFL1 <= DIFL2) AND (DIFF < DEA))) OR (REF(BBB,1) AND ((DIFL1 <= DIFL3) AND (DIFF < DEA))));
  const XXX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    XXX[i] = (AAA[i - 1] && (DIFL1[i] <= DIFL2[i]) && (diff[i] < dea[i])) ||
             (BBB[i - 1] && (DIFL1[i] <= DIFL3[i]) && (diff[i] < dea[i]));
  }
  
  // JJJ := (REF(CCC,1) AND (ABS(REF(DIFF,1)) >= (ABS(DIFF) * 1.01)));
  const JJJ: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    JJJ[i] = CCC[i - 1] && (Math.abs(diff[i - 1]) >= (Math.abs(diff[i]) * 1.01));
  }
  
  // BLBL := (REF(JJJ,1) AND (CCC AND ((ABS(REF(DIFF,1)) * 1.01) <= ABS(DIFF))));
  const BLBL: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    BLBL[i] = JJJ[i - 1] && CCC[i] && ((Math.abs(diff[i - 1]) * 1.01) <= Math.abs(diff[i]));
  }
  
  // DXDX := ((REF(JJJ,1) = 0) AND JJJ); -- first bar where JJJ becomes true = 抄底
  const DXDX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DXDX[i] = !JJJ[i - 1] && JJJ[i];
  }
  
  // DJGXX := (((CLOSE < CC2) OR (CLOSE < CC1)) AND ((REF(JJJ,(MM1 + 1)) OR REF(JJJ,MM1)) AND (NOT(REF(LLL,1)) AND (COUNT(JJJ,24) >= 1))));
  const DJGXX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const closeCondition = (closes[i] < CC2[i]) || (closes[i] < CC1[i]);
    const jjjRef1 = refBool(JJJ, i, MM1[i] + 1);
    const jjjRef2 = refBool(JJJ, i, MM1[i]);
    const notRefLLL = !refBool(LLL, i, 1);
    const countJJJ = count(JJJ, i, 24);
    DJGXX[i] = closeCondition && (jjjRef1 || jjjRef2) && notRefLLL && (countJJJ >= 1);
  }
  
  // DJXX := (NOT((COUNT(REF(DJGXX,1),2) >= 1)) AND DJGXX);
  const DJXX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    // COUNT(REF(DJGXX,1),2) means count of DJGXX[i-1] in last 2 bars
    // This is equivalent to: DJGXX[i-1] or DJGXX[i-2]
    const refDJGXX: boolean[] = new Array(n).fill(false);
    for (let j = 1; j < n; j++) {
      refDJGXX[j] = DJGXX[j - 1];
    }
    const cnt = count(refDJGXX, i, 2);
    DJXX[i] = !(cnt >= 1) && DJGXX[i];
  }
  
  // DXX := ((XXX OR DJXX) AND NOT(CCC));
  const DXX: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    DXX[i] = (XXX[i] || DJXX[i]) && !CCC[i];
  }
  
  // ===== SELL SIGNALS (卖出) =====
  
  // ZJDBL := ((CH1 > CH2) AND ((DIFH1 < DIFH2) AND ((REF(MACD,1) > 0) AND (DIFF > 0))));
  const ZJDBL: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    ZJDBL[i] = (CH1[i] > CH2[i]) && (DIFH1[i] < DIFH2[i]) && (macd[i - 1] > 0) && (diff[i] > 0);
  }
  
  // GXDBL := ((CH1 > CH3) AND ((DIFH1 > DIFH2) AND ((DIFH1 < DIFH3) AND ((REF(MACD,1) > 0) AND (DIFF > 0)))));
  const GXDBL: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    GXDBL[i] = (CH1[i] > CH3[i]) && (DIFH1[i] > DIFH2[i]) && (DIFH1[i] < DIFH3[i]) && (macd[i - 1] > 0) && (diff[i] > 0);
  }
  
  // DBBL := ((ZJDBL OR GXDBL) AND (DIFF > 0));
  const DBBL: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    DBBL[i] = (ZJDBL[i] || GXDBL[i]) && (diff[i] > 0);
  }
  
  // DBL := ((REF(DBBL,1) = 0) AND (DBBL AND (DIFF > DEA)));
  const DBL: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBL[i] = !DBBL[i - 1] && DBBL[i] && (diff[i] > dea[i]);
  }
  
  // DBLXS := ((REF(ZJDBL,1) AND ((DIFH1 >= DIFH2) AND (DIFF > DEA))) OR (REF(GXDBL,1) AND ((DIFH1 >= DIFH3) AND (DIFF > DEA))));
  const DBLXS: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBLXS[i] = (ZJDBL[i - 1] && (DIFH1[i] >= DIFH2[i]) && (diff[i] > dea[i])) ||
               (GXDBL[i - 1] && (DIFH1[i] >= DIFH3[i]) && (diff[i] > dea[i]));
  }
  
  // DBJG := (REF(DBBL,1) AND (REF(DIFF,1) >= (DIFF * 1.01)));
  const DBJG: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJG[i] = DBBL[i - 1] && (diff[i - 1] >= (diff[i] * 1.01));
  }
  
  // DBJGXC := (REF(NOT(DBJG),1) AND DBJG); -- first bar where DBJG becomes true = 卖出
  const DBJGXC: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJGXC[i] = !DBJG[i - 1] && DBJG[i];
  }
  
  // DBJGBL := (REF(DBJG,1) AND (DBBL AND ((REF(DIFF,1) * 1.01) <= DIFF)));
  const DBJGBL: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJGBL[i] = DBJG[i - 1] && DBBL[i] && ((diff[i - 1] * 1.01) <= diff[i]);
  }
  
  // ZZZZZ := (((CLOSE > CH2) OR (CLOSE > CH1)) AND ((REF(DBJG,(N1 + 1)) OR REF(DBJG,N1)) AND (NOT(REF(DBL,1)) AND (COUNT(DBJG,23) >= 1))));
  const ZZZZZ: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const closeCondition = (closes[i] > CH2[i]) || (closes[i] > CH1[i]);
    const dbjgRef1 = refBool(DBJG, i, N1[i] + 1);
    const dbjgRef2 = refBool(DBJG, i, N1[i]);
    const notRefDBL = !refBool(DBL, i, 1);
    const countDBJG = count(DBJG, i, 23);
    ZZZZZ[i] = closeCondition && (dbjgRef1 || dbjgRef2) && notRefDBL && (countDBJG >= 1);
  }
  
  // YYYYY := (NOT((COUNT(REF(ZZZZZ,1),2) >= 1)) AND ZZZZZ);
  const YYYYY: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const refZZZZZ: boolean[] = new Array(n).fill(false);
    for (let j = 1; j < n; j++) {
      refZZZZZ[j] = ZZZZZ[j - 1];
    }
    const cnt = count(refZZZZZ, i, 2);
    YYYYY[i] = !(cnt >= 1) && ZZZZZ[i];
  }
  
  // WWWWW := ((DBLXS OR YYYYY) AND NOT(DBBL));
  const WWWWW: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    WWWWW[i] = (DBLXS[i] || YYYYY[i]) && !DBBL[i];
  }
  
  // ===== Collect signals =====
  const signals: CDSignal[] = [];
  
  for (let i = 0; i < n; i++) {
    // DRAWTEXT(DXDX,(DIFF / 0.81),'抄底'),COLORRED;
    if (DXDX[i]) {
      signals.push({
        time: candles[i].time,
        type: 'buy',
        strength: 'strong',
        label: '抄底',
        diffValue: diff[i],
        deaValue: dea[i],
        macdValue: macd[i],
      });
    }
    
    // DRAWTEXT(DBJGXC,(DIFF * 1.21),'卖出'),COLORGREEN;
    if (DBJGXC[i]) {
      signals.push({
        time: candles[i].time,
        type: 'sell',
        strength: 'strong',
        label: '卖出',
        diffValue: diff[i],
        deaValue: dea[i],
        macdValue: macd[i],
      });
    }
  }
  
  return signals;
}

// ============ 买卖力道 (Buy/Sell Pressure) - Stricter Standards ============
export function calculateBuySellPressure(candles: Candle[]): BuySellPressure[] {
  if (candles.length < 10) return [];
  
  const result: BuySellPressure[] = [];
  const pressures: number[] = [];
  
  // Calculate average volume for normalization
  const avgVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
  
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const range = c.high - c.low;
    
    if (range === 0) {
      pressures.push(i > 0 ? pressures[i - 1] : 0);
    } else {
      // Buy pressure: close relative to range
      const buyRatio = (c.close - c.low) / range;
      const sellRatio = (c.high - c.close) / range;
      
      // Volume relative to average (normalized)
      const volRatio = c.volume / Math.max(avgVolume, 1);
      
      // Price momentum factor
      const priceChange = i > 0 ? (c.close - candles[i - 1].close) / candles[i - 1].close * 100 : 0;
      
      // Combined pressure: buy/sell ratio * volume weight * price momentum
      const netPressure = (buyRatio - sellRatio) * Math.sqrt(volRatio) * 100;
      
      // Add momentum component
      const pressure = netPressure + priceChange * volRatio;
      
      pressures.push(pressure);
    }
  }
  
  // Smooth with EMA(10) for more stability
  const smoothed = ema(pressures, 10);
  
  // Calculate rolling average of absolute pressure for threshold
  const absSmoothed = smoothed.map(v => Math.abs(v));
  const rollingAvg = ema(absSmoothed, 20);
  
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const changeRate = i > 0 && smoothed[i - 1] !== 0
      ? ((smoothed[i] - smoothed[i - 1]) / Math.abs(smoothed[i - 1])) * 100
      : 0;
    
    // Stricter signal criteria:
    // 1. Change rate must be >= 10% (double digit)
    // 2. Volume must be above average
    // 3. Pressure must be significantly above its rolling average
    let signal: 'strong_up' | 'strong_down' | undefined;
    
    const volAboveAvg = c.volume > (candles.reduce((s, cc) => s + cc.volume, 0) / candles.length) * 1.2;
    const pressureStrong = Math.abs(smoothed[i]) > rollingAvg[i] * 1.5;
    
    if (changeRate >= 10 && volAboveAvg && pressureStrong && smoothed[i] > 0) {
      signal = 'strong_up';
    } else if (changeRate <= -10 && volAboveAvg && pressureStrong && smoothed[i] < 0) {
      signal = 'strong_down';
    }
    
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
    // Additional data for screener: blue ladder direction
    blueMid: ema20[i],
    yellowMid: ema60[i],
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

// ============ Blue Ladder Strength Check (for screener) ============
export function checkBlueLadderStrength(candles: Candle[]): boolean {
  if (candles.length < 60) return false;
  
  const ladder = calculateLadder(candles);
  if (ladder.length < 3) return false;
  
  const last = ladder[ladder.length - 1];
  const prev = ladder[ladder.length - 2];
  const lastCandle = candles[candles.length - 1];
  
  // Conditions:
  // 1. Blue ladder trending up (blue mid rising)
  const blueRising = last.blueMid! > prev.blueMid!;
  // 2. Blue upper > Yellow upper
  const blueAboveYellow = last.blueUp > last.yellowUp;
  // 3. Close > Blue lower
  const closeAboveBlueDn = lastCandle.close > last.blueDn;
  
  return blueRising && blueAboveYellow && closeAboveBlueDn;
}
