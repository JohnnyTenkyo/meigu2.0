import { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Filter, Loader2, Zap, TrendingUp, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchStockData } from '@/lib/stockApi';
import { calculateBuySellPressure, calculateCDSignals, checkBlueLadderStrength } from '@/lib/indicators';
import { US_STOCKS } from '@/lib/stockApi';
import { TimeInterval } from '@/lib/types';

interface ScreenerResult {
  symbol: string;
  signal: string;
  detail: string;
}

// Time levels for all screening conditions (including daily and weekly)
const TIME_LEVELS: { value: TimeInterval; label: string }[] = [
  { value: '5m', label: '5分钟' },
  { value: '15m', label: '15分钟' },
  { value: '30m', label: '30分钟' },
  { value: '1h', label: '1小时' },
  { value: '2h', label: '2小时' },
  { value: '3h', label: '3小时' },
  { value: '4h', label: '4小时' },
  { value: '1d', label: '日线' },
  { value: '1w', label: '周线' },
];

// Lookback: check last 10 candles for signals
const SIGNAL_LOOKBACK = 10;

export default function Screener() {
  const [, navigate] = useLocation();
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Buy/Sell Pressure - now with levels
  const [bspEnabled, setBspEnabled] = useState(false);
  const [bspLevels, setBspLevels] = useState<TimeInterval[]>(['1d']);

  // CD Signal
  const [cdEnabled, setCdEnabled] = useState(true);
  const [cdLevels, setCdLevels] = useState<TimeInterval[]>(['4h']);

  // Blue Ladder
  const [ladderEnabled, setLadderEnabled] = useState(false);
  const [ladderLevels, setLadderLevels] = useState<TimeInterval[]>(['4h']);

  const toggleLevel = (setter: React.Dispatch<React.SetStateAction<TimeInterval[]>>, level: TimeInterval) => {
    setter(prev =>
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
    );
  };

  const hasCondition = (bspEnabled && bspLevels.length > 0) || (cdEnabled && cdLevels.length > 0) || (ladderEnabled && ladderLevels.length > 0);

  const runScreener = useCallback(async () => {
    if (!hasCondition) return;
    setLoading(true);
    setResults([]);

    const stocksToScan = US_STOCKS.slice(0, 30);
    setProgress({ current: 0, total: stocksToScan.length });
    const found: ScreenerResult[] = [];

    for (let i = 0; i < stocksToScan.length; i++) {
      const symbol = stocksToScan[i];
      setProgress({ current: i + 1, total: stocksToScan.length });

      try {
        // Check buy/sell pressure at selected levels
        if (bspEnabled && bspLevels.length > 0) {
          let bspFound = false;
          for (const level of bspLevels) {
            try {
              const candles = await fetchStockData(symbol, level);
              if (candles.length >= 30) {
                const pressure = calculateBuySellPressure(candles);
                const recent = pressure.slice(-5);
                const strongUp = recent.find(p => p.signal === 'strong_up');
                if (strongUp) {
                  found.push({
                    symbol,
                    signal: `⚡ 买卖力道双位数上涨 (${level})`,
                    detail: `变化率: +${strongUp.changeRate.toFixed(1)}%`,
                  });
                  bspFound = true;
                  break;
                }
              }
            } catch {
              // Skip failed level
            }
            await new Promise(r => setTimeout(r, 100));
          }
          if (bspFound) continue;
        }

        // Check CD signals at selected levels
        if (cdEnabled && cdLevels.length > 0) {
          let cdFound = false;
          for (const level of cdLevels) {
            try {
              const candles = await fetchStockData(symbol, level);
              if (candles.length < 30) continue;
              const signals = calculateCDSignals(candles);
              // Check last SIGNAL_LOOKBACK candles for buy signals
              const recentSignals = signals.filter(s => {
                const idx = candles.findIndex(c => c.time === s.time);
                return idx >= candles.length - SIGNAL_LOOKBACK && s.type === 'buy';
              });
              if (recentSignals.length > 0) {
                found.push({
                  symbol,
                  signal: `📈 CD抄底 (${level})`,
                  detail: `${recentSignals[0].label}`,
                });
                cdFound = true;
                break;
              }
            } catch {
              // Skip failed level
            }
            await new Promise(r => setTimeout(r, 100));
          }
          if (cdFound) continue;
        }

        // Check blue ladder strength at selected levels
        if (ladderEnabled && ladderLevels.length > 0) {
          let ladderFound = false;
          for (const level of ladderLevels) {
            try {
              const candles = await fetchStockData(symbol, level);
              if (candles.length < 60) continue;
              if (checkBlueLadderStrength(candles)) {
                found.push({
                  symbol,
                  signal: `🔵 蓝色梯子走强 (${level})`,
                  detail: '蓝梯向上 + 蓝梯上轨>黄梯上轨 + 收盘>蓝梯下轨',
                });
                ladderFound = true;
                break;
              }
            } catch {
              // Skip failed level
            }
            await new Promise(r => setTimeout(r, 100));
          }
          if (ladderFound) continue;
        }
      } catch {
        // Skip failed stocks
      }

      await new Promise(r => setTimeout(r, 200));
    }

    setResults(found);
    setLoading(false);
  }, [bspEnabled, bspLevels, cdEnabled, cdLevels, ladderEnabled, ladderLevels, hasCondition]);

  // Reusable level selector component
  const LevelSelector = ({ levels, setLevels, activeColor }: {
    levels: TimeInterval[];
    setLevels: React.Dispatch<React.SetStateAction<TimeInterval[]>>;
    activeColor: string;
  }) => (
    <div className="mt-3 ml-8 flex flex-wrap gap-2">
      {TIME_LEVELS.map(level => (
        <button
          key={level.value}
          onClick={() => toggleLevel(setLevels, level.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            levels.includes(level.value)
              ? activeColor
              : 'bg-secondary text-secondary-foreground hover:bg-accent'
          }`}
        >
          {level.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container flex items-center h-14 gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft size={16} className="mr-1" /> 返回
          </Button>
          <h1 className="text-lg font-bold">条件选股</h1>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Conditions */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Filter size={14} /> 筛选条件
          </h2>
          <div className="space-y-4">

            {/* Buy/Sell Pressure with multi-level */}
            <div className={`rounded-lg border p-4 transition-colors ${bspEnabled ? 'border-purple-500 bg-purple-500/5' : 'border-border bg-card'}`}>
              <button
                onClick={() => setBspEnabled(!bspEnabled)}
                className="flex items-center gap-3 w-full text-left"
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${bspEnabled ? 'border-purple-500 bg-purple-500' : 'border-muted-foreground'}`}>
                  {bspEnabled && <span className="text-white text-xs">✓</span>}
                </div>
                <Zap size={18} className={bspEnabled ? 'text-purple-500' : 'text-muted-foreground'} />
                <div>
                  <div className="text-sm font-medium">买卖力道双位数上涨</div>
                  <div className="text-xs text-muted-foreground">成交量放大+动能变化率≥10%（可选多个级别）</div>
                </div>
              </button>
              {bspEnabled && (
                <LevelSelector levels={bspLevels} setLevels={setBspLevels} activeColor="bg-purple-500 text-white" />
              )}
            </div>

            {/* CD Signal with multi-level */}
            <div className={`rounded-lg border p-4 transition-colors ${cdEnabled ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
              <button
                onClick={() => setCdEnabled(!cdEnabled)}
                className="flex items-center gap-3 w-full text-left"
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${cdEnabled ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                  {cdEnabled && <span className="text-white text-xs">✓</span>}
                </div>
                <TrendingUp size={18} className={cdEnabled ? 'text-primary' : 'text-muted-foreground'} />
                <div>
                  <div className="text-sm font-medium">CD抄底信号</div>
                  <div className="text-xs text-muted-foreground">往前10根K线内出现过抄底信号（可选多个级别）</div>
                </div>
              </button>
              {cdEnabled && (
                <LevelSelector levels={cdLevels} setLevels={setCdLevels} activeColor="bg-primary text-primary-foreground" />
              )}
            </div>

            {/* Blue Ladder Strength with multi-level */}
            <div className={`rounded-lg border p-4 transition-colors ${ladderEnabled ? 'border-blue-500 bg-blue-500/5' : 'border-border bg-card'}`}>
              <button
                onClick={() => setLadderEnabled(!ladderEnabled)}
                className="flex items-center gap-3 w-full text-left"
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${ladderEnabled ? 'border-blue-500 bg-blue-500' : 'border-muted-foreground'}`}>
                  {ladderEnabled && <span className="text-white text-xs">✓</span>}
                </div>
                <Activity size={18} className={ladderEnabled ? 'text-blue-500' : 'text-muted-foreground'} />
                <div>
                  <div className="text-sm font-medium">蓝色梯子走强</div>
                  <div className="text-xs text-muted-foreground">蓝梯向上 + 蓝梯上轨 &gt; 黄梯上轨 + 收盘价 &gt; 蓝梯下轨</div>
                </div>
              </button>
              {ladderEnabled && (
                <LevelSelector levels={ladderLevels} setLevels={setLadderLevels} activeColor="bg-blue-500 text-white" />
              )}
            </div>
          </div>
        </section>

        <Button
          onClick={runScreener}
          disabled={loading || !hasCondition}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin mr-2" size={16} />
              扫描中 ({progress.current}/{progress.total})
            </>
          ) : (
            '开始筛选'
          )}
        </Button>

        {/* Results */}
        {results.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              找到 {results.length} 只股票
            </h2>
            <div className="grid gap-2">
              {results.map(r => (
                <div
                  key={r.symbol}
                  onClick={() => navigate(`/stock/${r.symbol}`)}
                  className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <div>
                    <span className="font-semibold text-sm">{r.symbol}</span>
                    <span className="ml-2 text-xs text-primary">{r.signal}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{r.detail}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && results.length === 0 && progress.total > 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            未找到符合条件的股票，请调整筛选条件后重试
          </div>
        )}
      </main>
    </div>
  );
}
