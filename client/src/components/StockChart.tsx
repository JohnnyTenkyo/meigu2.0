import { useEffect, useRef, useMemo } from 'react';
import { createChart, IChartApi, CandlestickData, HistogramData, LineData, Time } from 'lightweight-charts';
import { Candle, TimeInterval, CDSignal, BuySellPressure } from '@/lib/types';
import { calculateMACD, calculateLadder } from '@/lib/indicators';
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
      timeVisible: !['1d', '1w', '1mo'].includes(interval),
      secondsVisible: false,
    },
    rightPriceScale: {
      borderColor: 'rgba(42, 46, 57, 0.5)',
    },
  }), [interval]);

  // Main chart
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

    // Candlestick series - Modified to Red Up, Green Down
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#ef4444', // Red for up
      downColor: '#22c55e', // Green for down
      borderUpColor: '#ef4444',
      borderDownColor: '#22c55e',
      wickUpColor: '#ef4444',
      wickDownColor: '#22c55e',
    });

    const candleData: CandlestickData[] = candles.map(c => ({
      time: toChartTime(c.time, interval),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(candleData);

    // Ladder lines
    const ladder = calculateLadder(candles);
    if (ladder.length > 0) {
      const blueUpSeries = chart.addLineSeries({
        color: 'rgba(59, 130, 246, 0.8)',
        lineWidth: 1,
        title: '蓝梯A',
        crosshairMarkerVisible: false,
      });
      const blueDnSeries = chart.addLineSeries({
        color: 'rgba(59, 130, 246, 0.8)',
        lineWidth: 1,
        title: '蓝梯B',
        crosshairMarkerVisible: false,
      });
      
      const yellowUpSeries = chart.addLineSeries({
        color: 'rgba(234, 179, 8, 0.8)',
        lineWidth: 1,
        title: '黄梯A1',
        crosshairMarkerVisible: false,
      });
      const yellowDnSeries = chart.addLineSeries({
        color: 'rgba(234, 179, 8, 0.8)',
        lineWidth: 1,
        title: '黄梯B1',
        crosshairMarkerVisible: false,
      });

      blueUpSeries.setData(ladder.map(l => ({ 
        time: toChartTime(l.time, interval), 
        value: l.blueUp 
      })));
      blueDnSeries.setData(ladder.map(l => ({ 
        time: toChartTime(l.time, interval), 
        value: l.blueDn 
      })));
      
      yellowUpSeries.setData(ladder.map(l => ({ 
        time: toChartTime(l.time, interval), 
        value: l.yellowUp 
      })));
      yellowDnSeries.setData(ladder.map(l => ({ 
        time: toChartTime(l.time, interval), 
        value: l.yellowDn 
      })));
    }

    // CD Signal markers - Modified to Red Buy, Green Sell
    if (cdSignals.length > 0) {
      const markers = cdSignals.map(s => ({
        time: toChartTime(s.time, interval),
        position: s.type === 'buy' ? 'belowBar' as const : 'aboveBar' as const,
        color: s.type === 'buy' ? '#ef4444' : '#22c55e', // Red for buy, Green for sell
        shape: s.type === 'buy' ? 'arrowUp' as const : 'arrowDown' as const,
        text: s.label,
      }));
      candleSeries.setMarkers(markers);
    }

    // Volume
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
      color: c.close >= c.open ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)', // Red Up, Green Down
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

  // MACD sub-chart
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
      color: macd[i] >= 0 
        ? (macd[i] >= (i > 0 ? macd[i-1] : 0) ? '#ef4444' : '#b91c1c') // Red for positive MACD
        : (macd[i] <= (i > 0 ? macd[i-1] : 0) ? '#22c55e' : '#15803d'), // Green for negative MACD
    }));

    diffSeries.setData(diffData);
    deaSeries.setData(deaData);
    macdSeries.setData(macdData);

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

    const markers = buySellPressure
      .filter(p => p.signal !== undefined)
      .map(p => ({
        time: toChartTime(p.time, interval),
        position: p.signal === 'strong_up' ? 'aboveBar' as const : 'belowBar' as const,
        color: p.signal === 'strong_up' ? '#a78bfa' : '#22c55e', // Purple for up, Green for down
        shape: 'circle' as const,
        text: p.signal === 'strong_up' ? '⚡' : '💀',
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
        <span className="text-xs">双位数上涨 = 动能强劲 ⚡ | 双位数下跌 = 动能衰竭 💀</span>
      </div>
      <div ref={pressureChartRef} className="w-full rounded-md overflow-hidden border border-border" />
    </div>
  );
}
