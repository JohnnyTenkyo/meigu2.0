import { useEffect, useRef, useMemo } from 'react';
import { createChart, IChartApi, CandlestickData, HistogramData, LineData, Time } from 'lightweight-charts';
import { Candle, TimeInterval, CDSignal, BuySellPressure } from '@/lib/types';
import { calculateMACD, calculateBuySellPressure, calculateLadder, calculateCDSignals } from '@/lib/indicators';
import { toFutuTime } from '@/lib/stockApi';

interface StockChartProps {
  candles: Candle[];
  interval: TimeInterval;
  cdSignals: CDSignal[];
  buySellPressure: BuySellPressure[];
  height?: number;
}

function toChartTime(ts: number, interval: TimeInterval): Time {
  const futuTs = toFutuTime(ts, interval);
  return (futuTs / 1000) as Time;
}

export default function StockChart({ candles, interval, cdSignals, buySellPressure, height = 400 }: StockChartProps) {
  const mainChartRef = useRef<HTMLDivElement>(null);
  const macdChartRef = useRef<HTMLDivElement>(null);
  const pressureChartRef = useRef<HTMLDivElement>(null);
  const mainChartApi = useRef<IChartApi | null>(null);
  const macdChartApi = useRef<IChartApi | null>(null);
  const pressureChartApi = useRef<IChartApi | null>(null);

  const chartOptions = useMemo(() => ({
    layout: {
      background: { color: '#0a0e17' },
      textColor: '#9ca3af',
      fontSize: 11,
    },
    grid: {
      vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
      horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
    },
    crosshair: {
      mode: 0,
      vertLine: { color: 'rgba(6, 182, 212, 0.3)', width: 1 as const, style: 2 as const },
      horzLine: { color: 'rgba(6, 182, 212, 0.3)', width: 1 as const, style: 2 as const },
    },
    timeScale: {
      borderColor: 'rgba(42, 46, 57, 0.5)',
      timeVisible: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '3h', '4h'].includes(interval),
      secondsVisible: false,
    },
    rightPriceScale: {
      borderColor: 'rgba(42, 46, 57, 0.5)',
    },
  }), [interval]);

  // Main chart (K-line + Ladder with smooth styling + vertical lines)
  useEffect(() => {
    if (!mainChartRef.current || candles.length === 0) return;

    if (mainChartApi.current) {
      mainChartApi.current.remove();
      mainChartApi.current = null;
    }

    const chart = createChart(mainChartRef.current, {
      ...chartOptions,
      width: mainChartRef.current.clientWidth,
      height,
    });
    mainChartApi.current = chart;

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const candleData: CandlestickData[] = candles.map(c => ({
      time: toChartTime(c.time, interval),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(candleData);

    // Ladder lines - smoother with area fill effect
    const ladder = calculateLadder(candles);
    if (ladder.length > 0) {
      // Blue ladder - upper and lower with mid line
      const blueUpSeries = chart.addLineSeries({
        color: 'rgba(59, 130, 246, 0.8)',
        lineWidth: 2,
        title: '蓝梯上轨',
        crosshairMarkerVisible: false,
      });
      const blueDnSeries = chart.addLineSeries({
        color: 'rgba(59, 130, 246, 0.8)',
        lineWidth: 2,
        title: '蓝梯下轨',
        crosshairMarkerVisible: false,
      });
      // Blue mid line (vertical reference inside the channel)
      const blueMidSeries = chart.addLineSeries({
        color: 'rgba(59, 130, 246, 0.3)',
        lineWidth: 1,
        lineStyle: 2, // dashed
        title: '',
        crosshairMarkerVisible: false,
      });

      // Yellow ladder - upper and lower with mid line
      const yellowUpSeries = chart.addLineSeries({
        color: 'rgba(234, 179, 8, 0.8)',
        lineWidth: 2,
        title: '黄梯上轨',
        crosshairMarkerVisible: false,
      });
      const yellowDnSeries = chart.addLineSeries({
        color: 'rgba(234, 179, 8, 0.8)',
        lineWidth: 2,
        title: '黄梯下轨',
        crosshairMarkerVisible: false,
      });
      // Yellow mid line
      const yellowMidSeries = chart.addLineSeries({
        color: 'rgba(234, 179, 8, 0.3)',
        lineWidth: 1,
        lineStyle: 2, // dashed
        title: '',
        crosshairMarkerVisible: false,
      });

      blueUpSeries.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.blueUp })));
      blueDnSeries.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.blueDn })));
      blueMidSeries.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: (l.blueUp + l.blueDn) / 2 })));
      yellowUpSeries.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.yellowUp })));
      yellowDnSeries.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: l.yellowDn })));
      yellowMidSeries.setData(ladder.map(l => ({ time: toChartTime(l.time, interval), value: (l.yellowUp + l.yellowDn) / 2 })));
    }

    // CD Signal markers on main chart
    if (cdSignals.length > 0) {
      const markers = cdSignals.map(s => ({
        time: toChartTime(s.time, interval),
        position: s.type === 'buy' ? 'belowBar' as const : 'aboveBar' as const,
        color: s.type === 'buy' ? '#ef4444' : '#22c55e',
        shape: s.type === 'buy' ? 'arrowUp' as const : 'arrowDown' as const,
        text: s.label,
      }));
      candleSeries.setMarkers(markers);
    }

    // Volume as histogram overlay
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeries.setData(candles.map(c => ({
      time: toChartTime(c.time, interval),
      value: c.volume,
      color: c.close >= c.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    })));

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (mainChartRef.current) {
        chart.applyOptions({ width: mainChartRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      mainChartApi.current = null;
    };
  }, [candles, interval, cdSignals, height, chartOptions]);

  // MACD sub-chart with CD signal text markers
  useEffect(() => {
    if (!macdChartRef.current || candles.length === 0) return;

    if (macdChartApi.current) {
      macdChartApi.current.remove();
      macdChartApi.current = null;
    }

    const chart = createChart(macdChartRef.current, {
      ...chartOptions,
      width: macdChartRef.current.clientWidth,
      height: 180,
    });
    macdChartApi.current = chart;

    const { diff, dea, macd } = calculateMACD(candles);

    const diffSeries = chart.addLineSeries({ color: '#06b6d4', lineWidth: 1, title: 'DIFF' });
    const deaSeries = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'DEA' });
    const macdSeries = chart.addHistogramSeries({ title: 'MACD' });

    const diffData: LineData[] = candles.map((c, i) => ({ time: toChartTime(c.time, interval), value: diff[i] }));
    const deaData: LineData[] = candles.map((c, i) => ({ time: toChartTime(c.time, interval), value: dea[i] }));
    const macdData: HistogramData[] = candles.map((c, i) => ({
      time: toChartTime(c.time, interval),
      value: macd[i],
      color: macd[i] >= 0 ? (macd[i] >= (i > 0 ? macd[i-1] : 0) ? '#22c55e' : '#15803d') : (macd[i] <= (i > 0 ? macd[i-1] : 0) ? '#ef4444' : '#b91c1c'),
    }));

    diffSeries.setData(diffData);
    deaSeries.setData(deaData);
    macdSeries.setData(macdData);

    // Add CD signal markers on DIFF line in MACD sub-chart
    // DRAWTEXT(DXDX,(DIFF / 0.81),'抄底'),COLORRED;
    // DRAWTEXT(DBJGXC,(DIFF * 1.21),'卖出'),COLORGREEN;
    if (cdSignals.length > 0) {
      const markers = cdSignals.map(s => ({
        time: toChartTime(s.time, interval),
        position: s.type === 'buy' ? 'belowBar' as const : 'aboveBar' as const,
        color: s.type === 'buy' ? '#ef4444' : '#22c55e',
        shape: 'circle' as const,
        text: s.label,
      }));
      diffSeries.setMarkers(markers);
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (macdChartRef.current) chart.applyOptions({ width: macdChartRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      macdChartApi.current = null;
    };
  }, [candles, interval, cdSignals, chartOptions]);

  // Buy/Sell Pressure sub-chart
  useEffect(() => {
    if (!pressureChartRef.current || buySellPressure.length === 0) return;

    if (pressureChartApi.current) {
      pressureChartApi.current.remove();
      pressureChartApi.current = null;
    }

    const chart = createChart(pressureChartRef.current, {
      ...chartOptions,
      width: pressureChartRef.current.clientWidth,
      height: 150,
    });
    pressureChartApi.current = chart;

    const pressureSeries = chart.addLineSeries({ color: '#a78bfa', lineWidth: 2, title: '买卖力道' });
    const pressureData: LineData[] = buySellPressure.map(p => ({
      time: toChartTime(p.time, interval),
      value: p.pressure,
    }));
    pressureSeries.setData(pressureData);

    // Add markers for strong signals (lightning bolt)
    const markers = buySellPressure
      .filter(p => p.signal === 'strong_up')
      .map(p => ({
        time: toChartTime(p.time, interval),
        position: 'aboveBar' as const,
        color: '#a78bfa',
        shape: 'circle' as const,
        text: '⚡',
      }));
    if (markers.length > 0) {
      pressureSeries.setMarkers(markers);
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (pressureChartRef.current) chart.applyOptions({ width: pressureChartRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      pressureChartApi.current = null;
    };
  }, [buySellPressure, interval, chartOptions]);

  // Sync time scales
  useEffect(() => {
    const charts = [mainChartApi.current, macdChartApi.current, pressureChartApi.current].filter(Boolean) as IChartApi[];
    if (charts.length < 2) return;

    const syncFns: Array<{ chart: IChartApi; fn: (range: any) => void }> = [];
    for (let i = 0; i < charts.length; i++) {
      for (let j = 0; j < charts.length; j++) {
        if (i === j) continue;
        const fn = (range: any) => {
          if (range) charts[j].timeScale().setVisibleLogicalRange(range);
        };
        charts[i].timeScale().subscribeVisibleLogicalRangeChange(fn);
        syncFns.push({ chart: charts[i], fn });
      }
    }

    return () => {
      syncFns.forEach(({ chart, fn }) => {
        try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(fn); } catch {}
      });
    };
  }, [candles, buySellPressure]);

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground px-2 py-1 flex items-center gap-2">
        <span className="font-medium text-foreground">主图</span>
        <span>K线 + 黄蓝梯子</span>
      </div>
      <div ref={mainChartRef} className="w-full rounded-md overflow-hidden border border-border" />
      
      <div className="text-xs text-muted-foreground px-2 py-1 flex items-center gap-2">
        <span className="font-medium text-foreground">副图</span>
        <span>CD抄底指标 (MACD)</span>
        <span className="text-xs text-red-400 ml-1">抄底</span>
        <span className="text-xs text-green-400">/</span>
        <span className="text-xs text-green-400">卖出</span>
      </div>
      <div ref={macdChartRef} className="w-full rounded-md overflow-hidden border border-border" />
      
      <div className="text-xs text-muted-foreground px-2 py-1 flex items-center gap-2">
        <span className="font-medium text-purple">副图</span>
        <span className="text-purple">买卖力道</span>
        <span className="text-xs">双位数上涨 = 动能强劲 ⚡</span>
      </div>
      <div ref={pressureChartRef} className="w-full rounded-md overflow-hidden border border-border" />
    </div>
  );
}
