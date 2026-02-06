import { Candle, CDSignal, BuySellPressure, LadderLevel, NXSignal } from './types';

// ============ EMA Calculation ============
function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  if (data.length === 0) return result;
  
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

function barslast(condition: boolean[], index: number): number {
  for (let i = index; i >= 0; i--) {
    if (condition[i]) return index - i;
  }
  return index + 1; // never occurred
}

function llv(data: number[], index: number, period: number): number {
  let min = data[index];
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) {
    if (data[i] < min) min = data[i];
  }
  return min;
}

function hhv(data: number[], index: number, period: number): number {
  let max = data[index];
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) {
    if (data[i] > max) max = data[i];
  }
  return max;
}

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

function count(condition: boolean[], index: number, period: number): number {
  let cnt = 0;
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) {
    if (condition[i]) cnt++;
  }
  return cnt;
}

// ============ CD Signal Detection (一比一还原源代码) ============
export function calculateCDSignals(candles: Candle[]): CDSignal[] {
  if (candles.length < 30) return [];
  
  const { diff, dea, macd } = calculateMACD(candles);
  const closes = candles.map(c => c.close);
  const n = candles.length;
  
  const macdDeathCross: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    macdDeathCross[i] = (macd[i - 1] >= 0) && (macd[i] < 0);
  }
  
  const macdGoldenCross: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    macdGoldenCross[i] = (macd[i - 1] <= 0) && (macd[i] > 0);
  }
  
  const N1: number[] = new Array(n).fill(0);
  const MM1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    N1[i] = barslast(macdDeathCross, i);
    MM1[i] = barslast(macdGoldenCross, i);
  }
  
  const CC1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CC1[i] = llv(closes, i, N1[i] + 1);
  }
  
  const CC2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CC2[i] = ref(CC1, i, MM1[i] + 1);
  }
  
  const CC3: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CC3[i] = ref(CC2, i, MM1[i] + 1);
  }
  
  const DIFL1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFL1[i] = llv(diff, i, N1[i] + 1);
  }
  
  const DIFL2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFL2[i] = ref(DIFL1, i, MM1[i] + 1);
  }
  
  const DIFL3: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFL3[i] = ref(DIFL2, i, MM1[i] + 1);
  }
  
  const CH1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CH1[i] = hhv(closes, i, MM1[i] + 1);
  }
  
  const CH2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CH2[i] = ref(CH1, i, N1[i] + 1);
  }
  
  const CH3: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    CH3[i] = ref(CH2, i, N1[i] + 1);
  }
  
  const DIFH1: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFH1[i] = hhv(diff, i, MM1[i] + 1);
  }
  
  const DIFH2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFH2[i] = ref(DIFH1, i, N1[i] + 1);
  }
  
  const DIFH3: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    DIFH3[i] = ref(DIFH2, i, N1[i] + 1);
  }
  
  const AAA: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    AAA[i] = (CC1[i] < CC2[i]) && (DIFL1[i] > DIFL2[i]) && (macd[i - 1] < 0) && (diff[i] < 0);
  }
  
  const BBB: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    BBB[i] = (CC1[i] < CC3[i]) && (DIFL1[i] < DIFL2[i]) && (DIFL1[i] > DIFL3[i]) && (macd[i - 1] < 0) && (diff[i] < 0);
  }
  
  const CCC: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    CCC[i] = (AAA[i] || BBB[i]) && (diff[i] < 0);
  }
  
  const LLL: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    LLL[i] = !CCC[i - 1] && CCC[i];
  }
  
  const XXX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    XXX[i] = (AAA[i - 1] && (DIFL1[i] <= DIFL2[i]) && (diff[i] < dea[i])) ||
             (BBB[i - 1] && (DIFL1[i] <= DIFL3[i]) && (diff[i] < dea[i]));
  }
  
  const JJJ: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    JJJ[i] = CCC[i - 1] && (Math.abs(diff[i - 1]) >= (Math.abs(diff[i]) * 1.01));
  }
  
  const BLBL: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    BLBL[i] = JJJ[i - 1] && CCC[i] && ((Math.abs(diff[i - 1]) * 1.01) <= Math.abs(diff[i]));
  }
  
  const DXDX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DXDX[i] = !JJJ[i - 1] && JJJ[i];
  }
  
  const DJGXX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const closeCondition = (closes[i] < CC2[i]) || (closes[i] < CC1[i]);
    const jjjRef1 = refBool(JJJ, i, MM1[i] + 1);
    const jjjRef2 = refBool(JJJ, i, MM1[i]);
    const notRefLLL = !refBool(LLL, i, 1);
    const countJJJ = count(JJJ, i, 24);
    DJGXX[i] = closeCondition && (jjjRef1 || jjjRef2) && notRefLLL && (countJJJ >= 1);
  }
  
  const DJXX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const refDJGXX: boolean[] = new Array(n).fill(false);
    for (let j = 1; j < n; j++) {
      refDJGXX[j] = DJGXX[j - 1];
    }
    const cnt = count(refDJGXX, i, 2);
    DJXX[i] = !(cnt >= 1) && DJGXX[i];
  }
  
  const DXX: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    DXX[i] = (XXX[i] || DJXX[i]) && !CCC[i];
  }
  
  const DBJG: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJG[i] = (CH1[i] > CH2[i]) && (DIFH1[i] < DIFH2[i]) && (macd[i - 1] > 0) && (diff[i] > 0);
  }
  
  const DBJG2: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJG2[i] = (CH1[i] > CH3[i]) && (DIFH1[i] > DIFH2[i]) && (DIFH1[i] < DIFH3[i]) && (macd[i - 1] > 0) && (diff[i] > 0);
  }
  
  const DBJG3: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    DBJG3[i] = (DBJG[i] || DBJG2[i]) && (diff[i] > 0);
  }
  
  const DBJGLLL: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJGLLL[i] = !DBJG3[i - 1] && DBJG3[i];
  }
  
  const DBJGXXX: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJGXXX[i] = (DBJG[i - 1] && (DIFH1[i] >= DIFH2[i]) && (diff[i] > dea[i])) ||
                 (DBJG2[i - 1] && (DIFH1[i] >= DIFH3[i]) && (diff[i] > dea[i]));
  }
  
  const DBJGJJJ: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJGJJJ[i] = DBJG3[i - 1] && (Math.abs(diff[i - 1]) <= (Math.abs(diff[i]) * 0.99));
  }
  
  const DBJGXC: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    DBJGXC[i] = !DBJGJJJ[i - 1] && DBJGJJJ[i];
  }
  
  const signals: CDSignal[] = [];
  for (let i = 0; i < n; i++) {
    if (DXDX[i]) {
      signals.push({ time: candles[i].time, type: 'buy', strength: 'strong', label: '抄底' });
    } else if (DBJGXC[i]) {
      signals.push({ time: candles[i].time, type: 'sell', strength: 'strong', label: '卖出' });
    }
  }
  
  return signals;
}

// ============ 买卖力道 (Buy/Sell Pressure) ============
export function calculateBuySellPressure(candles: Candle[]): BuySellPressure[] {
  if (candles.length < 20) return [];
  
  const closes = candles.map(c => c.close);
  const ema5 = ema(closes, 5);
  const ema10 = ema(closes, 10);
  
  const result: BuySellPressure[] = [];
  for (let i = 0; i < candles.length; i++) {
    const pressure = (ema5[i] - ema10[i]) / ema10[i] * 1000;
    const prevPressure = i > 0 ? result[i - 1].pressure : pressure;
    const changeRate = pressure - prevPressure;
    
    let signal: 'strong_up' | 'strong_down' | undefined;
    // 双位数上涨提醒 (变化率 > 10%)
    if (changeRate > 10) signal = 'strong_up';
    // 双位数下跌提醒 (变化率 < -10%)
    if (changeRate < -10) signal = 'strong_down';
    
    result.push({
      time: candles[i].time,
      pressure,
      changeRate,
      signal
    });
  }
  
  return result;
}

// ============ 黄蓝梯子 (Yellow-Blue Ladder) - 一比一复刻富途源代码 ============
/**
 * 富途源代码逻辑:
 * A:EMA(HIGH,24),COLORBLUE;
 * B:EMA(LOW,23),COLORBLUE;
 * STICKLINE(C>A,A,B,0.1,1),COLORBLUE;
 * STICKLINE(C<B,A,B,0.1,1),COLORBLUE;
 * A1:EMA(H,89),COLORYELLOW;
 * B1:EMA(L,90),COLORYELLOW;
 * STICKLINE(C>A1,A1,B1,0.1,1),COLORYELLOW;
 * STICKLINE(C<B1,A1,B1,0.1,1),COLORYELLOW;
 */
export function calculateLadder(candles: Candle[]): LadderLevel[] {
  if (candles.length === 0) return [];
  
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  
  // 蓝梯子: A = EMA(HIGH, 24), B = EMA(LOW, 23)
  const A = ema(highs, 24);
  const B = ema(lows, 23);
  
  // 黄梯子: A1 = EMA(HIGH, 89), B1 = EMA(LOW, 90)
  const A1 = ema(highs, 89);
  const B1 = ema(lows, 90);
  
  return candles.map((c, i) => {
    // 逻辑: 只有当 C > A 或 C < B 时才显示蓝梯子 (对应 STICKLINE 条件)
    // 这里我们返回原始值，但在绘图层根据条件决定是否显示/填充
    return {
      time: c.time,
      blueUp: A[i],
      blueDn: B[i],
      yellowUp: A1[i],
      yellowDn: B1[i],
      // 辅助字段
      blueMid: (A[i] + B[i]) / 2,
      yellowMid: (A1[i] + B1[i]) / 2,
      // 状态标记
      showBlue: closes[i] > A[i] || closes[i] < B[i],
      showYellow: closes[i] > A1[i] || closes[i] < B1[i]
    };
  });
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
    if (ema5[i] > ema10[i] && ema5[i - 1] <= ema10[i - 1] && volumes[i] > volEma[i] * 1.5) {
      signals.push({ time: candles[i].time, type: 'buy', label: '买入' });
    }
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
  
  // 选股逻辑保持一定的趋势性
  const blueRising = last.blueMid! > prev.blueMid!;
  const blueAboveYellow = last.blueUp > last.yellowUp;
  const closeAboveBlueDn = lastCandle.close > last.blueDn;
  
  return blueRising && blueAboveYellow && closeAboveBlueDn;
}
