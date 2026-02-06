import { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Filter, Loader2, Zap, TrendingUp, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchStockData } from '@/lib/stockApi';
import { calculateBuySellPressure, calculateCDSignals } from '@/lib/indicators';
import { US_STOCKS } from '@/lib/stockApi';

interface ScreenerResult {
  symbol: string;
  signal: string;
  detail: string;
}

const SCREENER_CONDITIONS = [
  { id: 'bsp_strong_up', label: '买卖力道双位数上涨', desc: '动能变化率≥10%，表示动能强劲，适合进场', icon: Zap },
  { id: 'cd_buy', label: 'CD抄底信号', desc: '最近出现CD抄底买入信号', icon: TrendingUp },
  { id: 'cd_strong_buy', label: 'CD强力抄底', desc: '最近出现强力底部背离信号', icon: BarChart3 },
];

export default function Screener() {
  const [, navigate] = useLocation();
  const [selectedConditions, setSelectedConditions] = useState<string[]>(['bsp_strong_up']);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const toggleCondition = (id: string) => {
    setSelectedConditions(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const runScreener = useCallback(async () => {
    if (selectedConditions.length === 0) return;
    setLoading(true);
    setResults([]);

    const stocksToScan = US_STOCKS.slice(0, 30); // Limit for API rate
    setProgress({ current: 0, total: stocksToScan.length });
    const found: ScreenerResult[] = [];

    for (let i = 0; i < stocksToScan.length; i++) {
      const symbol = stocksToScan[i];
      setProgress({ current: i + 1, total: stocksToScan.length });

      try {
        const candles = await fetchStockData(symbol, '1d');
        if (candles.length < 30) continue;

        // Check conditions
        if (selectedConditions.includes('bsp_strong_up')) {
          const pressure = calculateBuySellPressure(candles);
          const recent = pressure.slice(-5);
          const strongUp = recent.find(p => p.signal === 'strong_up');
          if (strongUp) {
            found.push({
              symbol,
              signal: '⚡ 买卖力道双位数上涨',
              detail: `变化率: +${strongUp.changeRate.toFixed(1)}%`,
            });
            continue;
          }
        }

        if (selectedConditions.includes('cd_buy') || selectedConditions.includes('cd_strong_buy')) {
          const signals = calculateCDSignals(candles);
          const recentBuy = signals.slice(-3).filter(s => s.type === 'buy');
          if (selectedConditions.includes('cd_strong_buy')) {
            const strong = recentBuy.find(s => s.strength === 'strong');
            if (strong) {
              found.push({ symbol, signal: '🔥 CD强力抄底', detail: strong.label });
              continue;
            }
          }
          if (selectedConditions.includes('cd_buy') && recentBuy.length > 0) {
            found.push({ symbol, signal: '📈 CD抄底信号', detail: recentBuy[0].label });
            continue;
          }
        }
      } catch {
        // Skip failed stocks
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    setResults(found);
    setLoading(false);
  }, [selectedConditions]);

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
          <div className="grid gap-2">
            {SCREENER_CONDITIONS.map(cond => {
              const Icon = cond.icon;
              const selected = selectedConditions.includes(cond.id);
              return (
                <button
                  key={cond.id}
                  onClick={() => toggleCondition(cond.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                    selected
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent/50'
                  }`}
                >
                  <Icon size={18} className={selected ? 'text-primary' : ''} />
                  <div>
                    <div className="text-sm font-medium">{cond.label}</div>
                    <div className="text-xs text-muted-foreground">{cond.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <Button
          onClick={runScreener}
          disabled={loading || selectedConditions.length === 0}
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
                    <span className="ml-2 text-xs text-purple">{r.signal}</span>
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
