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
  signals: {
    type: string;
    label: string;
    detail: string;
  }[];
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

  // Logic Mode: 'AND' (同时满足) or 'OR' (任意满足)
  const [logicMode, setLogicMode] = useState<'AND' | 'OR'>('AND');

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

    // Get enabled conditions count
    const enabledConditionsCount = [bspEnabled, cdEnabled, ladderEnabled].filter(Boolean).length;

    const stocksToScan = US_STOCKS.slice(0, 50); // Increased scan range
    setProgress({ current: 0, total: stocksToScan.length });
    const found: ScreenerResult[] = [];

    for (let i = 0; i < stocksToScan.length; i++) {
      const symbol = stocksToScan[i];
      setProgress({ current: i + 1, total: stocksToScan.length });

      const stockSignals: ScreenerResult['signals'] = [];

      try {
        // 1. Check buy/sell pressure
        if (bspEnabled && bspLevels.length > 0) {
          for (const level of bspLevels) {
            try {
              const candles = await fetchStockData(symbol, level);
              if (candles.length >= 30) {
                const pressure = calculateBuySellPressure(candles);
                const recent = pressure.slice(-5);
                
                // Check for both up and down signals
                const strongUp = recent.find(p => p.signal === 'strong_up');
                const strongDown = recent.find(p => p.signal === 'strong_down');
                
                if (strongUp) {
                  stockSignals.push({
                    type: 'bsp',
                    label: `⚡ 买卖力道上涨 (${level})`,
                    detail: `+${strongUp.changeRate.toFixed(1)}%`,
                  });
                  break;
                } else if (strongDown) {
                  stockSignals.push({
                    type: 'bsp',
                    label: `💀 买卖力道下跌 (${level})`,
                    detail: `${strongDown.changeRate.toFixed(1)}%`,
                  });
                  break;
                }
              }
            } catch {}
            await new Promise(r => setTimeout(r, 50));
          }
        }

        // 2. Check CD signals
        if (cdEnabled && cdLevels.length > 0) {
          for (const level of cdLevels) {
            try {
              const candles = await fetchStockData(symbol, level);
              if (candles.length < 30) continue;
              const signals = calculateCDSignals(candles);
              const recentSignals = signals.filter(s => {
                const idx = candles.findIndex(c => c.time === s.time);
                return idx >= candles.length - SIGNAL_LOOKBACK && s.type === 'buy';
              });
              if (recentSignals.length > 0) {
                stockSignals.push({
                  type: 'cd',
                  label: `📈 CD抄底 (${level})`,
                  detail: recentSignals[0].label,
                });
                break;
              }
            } catch {}
            await new Promise(r => setTimeout(r, 50));
          }
        }

        // 3. Check blue ladder strength
        if (ladderEnabled && ladderLevels.length > 0) {
          for (const level of ladderLevels) {
            try {
              const candles = await fetchStockData(symbol, level);
              if (candles.length < 60) continue;
              if (checkBlueLadderStrength(candles)) {
                stockSignals.push({
                  type: 'ladder',
                  label: `🔵 蓝梯走强 (${level})`,
                  detail: '走势强劲',
                });
                break;
              }
            } catch {}
            await new Promise(r => setTimeout(r, 50));
          }
        }

        // Apply logic mode
        const uniqueConditionsMet = new Set(stockSignals.map(s => s.type)).size;
        
        if (logicMode === 'AND') {
          if (uniqueConditionsMet === enabledConditionsCount && enabledConditionsCount > 0) {
            found.push({ symbol, signals: stockSignals });
          }
        } else { // OR
          if (uniqueConditionsMet > 0) {
            found.push({ symbol, signals: stockSignals });
          }
        }

      } catch (err) {
        console.error(`Error scanning ${symbol}:`, err);
      }

      await new Promise(r => setTimeout(r, 100));
    }

    setResults(found);
    setLoading(false);
  }, [bspEnabled, bspLevels, cdEnabled, cdLevels, ladderEnabled, ladderLevels, hasCondition, logicMode]);

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
                <div className="flex gap-1">
                  <Zap size={18} className={bspEnabled ? 'text-purple-500' : 'text-muted-foreground'} />
                  <span className={bspEnabled ? 'text-green-500' : 'text-muted-foreground'}>💀</span>
                </div>
                <div>
                  <div className="text-sm font-medium">买卖力道双位数变动</div>
                  <div className="text-xs text-muted-foreground">动能变化率 ≥10% (⚡) 或 ≤-10% (💀)</div>
                </div>
              </button>
              {bspEnabled && (
                <LevelSelector levels={bspLevels} setLevels={setBspLevels} activeColor="bg-purple-500 text-white" />
              )}
            </div>

            {/* CD Signal with multi-level */}
            <div className={`rounded-lg border p-4 transition-colors ${cdEnabled ? 'border-up bg-up/5' : 'border-border bg-card'}`}>
              <button
                onClick={() => setCdEnabled(!cdEnabled)}
                className="flex items-center gap-3 w-full text-left"
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${cdEnabled ? 'border-up bg-up' : 'border-muted-foreground'}`}>
                  {cdEnabled && <span className="text-white text-xs">✓</span>}
                </div>
                <TrendingUp size={18} className={cdEnabled ? 'text-up' : 'text-muted-foreground'} />
                <div>
                  <div className="text-sm font-medium">CD抄底信号</div>
                  <div className="text-xs text-muted-foreground">往前10根K线内出现过抄底信号（可选多个级别）</div>
                </div>
              </button>
              {cdEnabled && (
                <LevelSelector levels={cdLevels} setLevels={setCdLevels} activeColor="bg-up text-white" />
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

        {/* Logic Selection */}
        <section className="bg-secondary/30 p-4 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">筛选逻辑</div>
            <div className="flex bg-secondary p-1 rounded-md">
              <button
                onClick={() => setLogicMode('AND')}
                className={`px-4 py-1.5 text-xs font-medium rounded transition-all ${logicMode === 'AND' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                同时满足 (AND)
              </button>
              <button
                onClick={() => setLogicMode('OR')}
                className={`px-4 py-1.5 text-xs font-medium rounded transition-all ${logicMode === 'OR' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                任意满足 (OR)
              </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {logicMode === 'AND' 
              ? '只有同时符合所有勾选条件的股票才会被筛选出来。' 
              : '只要符合勾选条件中的任意一项，股票就会被筛选出来。'}
          </p>
        </section>

        <Button
          onClick={runScreener}
          disabled={loading || !hasCondition}
          className="w-full py-6 text-base font-bold shadow-lg shadow-primary/20"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin mr-2" size={18} />
              正在深度扫描市场 ({progress.current}/{progress.total})
            </>
          ) : (
            '开始执行筛选'
          )}
        </Button>

        {/* Results */}
        {results.length > 0 && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                筛选结果: <span className="text-foreground font-bold">{results.length}</span> 只股票
              </h2>
              <div className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                逻辑: {logicMode === 'AND' ? '同时满足' : '任意满足'}
              </div>
            </div>
            <div className="grid gap-2">
              {results.map(r => (
                <div
                  key={r.symbol}
                  onClick={() => navigate(`/stock/${r.symbol}`)}
                  className="px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-base group-hover:text-primary transition-colors">{r.symbol}</span>
                    <ArrowLeft size={14} className="rotate-180 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.signals.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-secondary rounded text-[10px]">
                        <span className="text-primary font-medium">{s.label}</span>
                        <span className="text-muted-foreground">|</span>
                        <span className="text-foreground/70">{s.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && results.length === 0 && progress.total > 0 && (
          <div className="text-center py-12 rounded-xl border border-dashed border-border">
            <div className="text-muted-foreground text-sm mb-1">未找到符合条件的股票</div>
            <div className="text-xs text-muted-foreground/60">建议尝试切换为“任意满足”逻辑或调整筛选级别</div>
          </div>
        )}
      </main>
    </div>
  );
}
