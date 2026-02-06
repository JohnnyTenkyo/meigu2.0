import { CDSignal, BuySellPressure, NXSignal } from '@/lib/types';
import { TrendingUp, TrendingDown, Zap, Activity } from 'lucide-react';

interface SignalPanelProps {
  cdSignals: CDSignal[];
  buySellPressure: BuySellPressure[];
  nxSignals: NXSignal[];
}

export default function SignalPanel({ cdSignals, buySellPressure, nxSignals }: SignalPanelProps) {
  const cdBuy = cdSignals.filter(s => s.type === 'buy').length;
  const cdSell = cdSignals.filter(s => s.type === 'sell').length;
  const lastCd = cdSignals[cdSignals.length - 1];

  const strongUp = buySellPressure.filter(p => p.signal === 'strong_up').length;
  const strongDown = buySellPressure.filter(p => p.signal === 'strong_down').length;
  const lastPressure = buySellPressure[buySellPressure.length - 1];
  const lastStrongSignal = [...buySellPressure].reverse().find(p => p.signal);

  const nxBuy = nxSignals.filter(s => s.type === 'buy').length;
  const nxSell = nxSignals.filter(s => s.type === 'sell').length;
  const lastNx = nxSignals[nxSignals.length - 1];

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* CD Signal Stats */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-cyan" />
          <span className="text-sm font-medium">CD抄底信号</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={14} className="text-up" />
            <span className="text-muted-foreground">买入:</span>
            <span className="data-mono text-up font-medium">{cdBuy}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingDown size={14} className="text-down" />
            <span className="text-muted-foreground">卖出:</span>
            <span className="data-mono text-down font-medium">{cdSell}</span>
          </div>
        </div>
        {lastCd && (
          <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
            最近: <span className={lastCd.type === 'buy' ? 'text-up' : 'text-down'}>{lastCd.label}</span>
            <span className="ml-1">({formatTime(lastCd.time)})</span>
          </div>
        )}
      </div>

      {/* Buy/Sell Pressure Stats */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-purple" />
          <span className="text-sm font-medium">买卖力道信号</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <Zap size={14} className="text-purple" />
            <span className="text-muted-foreground">动能强劲:</span>
            <span className="data-mono text-purple font-medium">{strongUp}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingDown size={14} className="text-down" />
            <span className="text-muted-foreground">动能减弱:</span>
            <span className="data-mono text-down font-medium">{strongDown}</span>
          </div>
        </div>
        {lastStrongSignal && (
          <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
            最近: <span className={lastStrongSignal.signal === 'strong_up' ? 'text-purple' : 'text-down'}>
              {lastStrongSignal.signal === 'strong_up' ? '⚡ 动能强劲' : '动能减弱'}
            </span>
            <span className="ml-1">({formatTime(lastStrongSignal.time)})</span>
          </div>
        )}
        {lastPressure && (
          <div className="mt-1 text-xs text-muted-foreground">
            当前力道: <span className="data-mono">{lastPressure.pressure.toFixed(2)}</span>
            <span className="ml-1">变化率: <span className={`data-mono ${lastPressure.changeRate >= 0 ? 'text-up' : 'text-down'}`}>{lastPressure.changeRate >= 0 ? '+' : ''}{lastPressure.changeRate.toFixed(1)}%</span></span>
          </div>
        )}
      </div>

      {/* NX Signal Stats */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-cyan" />
          <span className="text-sm font-medium">NX指标信号</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={14} className="text-up" />
            <span className="text-muted-foreground">买入:</span>
            <span className="data-mono text-up font-medium">{nxBuy}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingDown size={14} className="text-down" />
            <span className="text-muted-foreground">卖出:</span>
            <span className="data-mono text-down font-medium">{nxSell}</span>
          </div>
        </div>
        {lastNx && (
          <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
            最近: <span className={lastNx.type === 'buy' ? 'text-up' : 'text-down'}>{lastNx.label}</span>
            <span className="ml-1">({formatTime(lastNx.time)})</span>
          </div>
        )}
      </div>
    </div>
  );
}
