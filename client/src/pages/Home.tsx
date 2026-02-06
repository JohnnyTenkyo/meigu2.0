import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Search, Star, TrendingUp, Zap, BarChart3, LogIn, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoginDialog from '@/components/LoginDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useWatchlist } from '@/contexts/WatchlistContext';
import { fetchStockQuote, US_STOCKS } from '@/lib/stockApi';
import { StockQuote } from '@/lib/types';

const HOT_STOCKS = ['TSLA', 'AAPL', 'NVDA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD', 'PLTR', 'COIN', 'SOFI', 'BABA', 'NIO', 'MSTR', 'ARM'];

export default function Home() {
  const [, navigate] = useLocation();
  const { isLoggedIn, username, logout } = useAuth();
  const { watchlist, isInWatchlist, toggleStock } = useWatchlist();
  const [searchQuery, setSearchQuery] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [loadingQuotes, setLoadingQuotes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadQuotes = async () => {
      const combined = Array.from(new Set([...HOT_STOCKS, ...watchlist]));
      const stocksToLoad = combined.slice(0, 20);
      for (const symbol of stocksToLoad) {
        if (quotes[symbol]) continue;
        setLoadingQuotes(prev => new Set(prev).add(symbol));
        try {
          const q = await fetchStockQuote(symbol);
          setQuotes(prev => ({ ...prev, [symbol]: q }));
        } catch {
          // Skip failed quotes
        }
        setLoadingQuotes(prev => {
          const next = new Set(prev);
          next.delete(symbol);
          return next;
        });
      }
    };
    loadQuotes();
  }, []);

  const filteredStocks = searchQuery.trim()
    ? US_STOCKS.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 20)
    : [];

  const handleStockClick = useCallback((symbol: string) => {
    navigate(`/stock/${symbol}`);
  }, [navigate]);

  const handleFavorite = (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    if (!isLoggedIn) {
      setShowLogin(true);
      return;
    }
    toggleStock(symbol);
  };

  const StockRow = ({ symbol, showStar = true }: { symbol: string; showStar?: boolean }) => {
    const q = quotes[symbol];
    const isLoading = loadingQuotes.has(symbol);
    const isFav = isInWatchlist(symbol);

    return (
      <div
        onClick={() => handleStockClick(symbol)}
        className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
      >
        <div className="flex items-center gap-3">
          {showStar && (
            <button onClick={(e) => handleFavorite(e, symbol)} className="text-muted-foreground hover:text-yellow-400 transition-colors">
              <Star size={16} className={isFav ? 'fill-yellow-400 text-yellow-400' : ''} />
            </button>
          )}
          <span className="font-semibold text-sm tracking-wide">{symbol}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {isLoading ? (
            <span className="text-muted-foreground text-xs">加载中...</span>
          ) : q ? (
            <>
              <span className="data-mono font-medium">${q.price.toFixed(2)}</span>
              <span className={`data-mono text-xs px-2 py-0.5 rounded ${q.change >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-muted-foreground text-xs">--</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <BarChart3 size={22} className="text-primary" />
            <h1 className="text-lg font-bold tracking-tight">美股智能分析</h1>
          </div>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <User size={14} /> {username}
                </span>
                <Button variant="ghost" size="sm" onClick={logout}>
                  <LogOut size={14} />
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setShowLogin(true)}>
                <LogIn size={14} className="mr-1" /> 登录
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {!isLoggedIn && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">登录后可使用收藏自选股等更多功能</p>
            <Button variant="outline" size="sm" onClick={() => setShowLogin(true)} className="text-xs">
              登录注册
            </Button>
          </div>
        )}

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索股票代码 (如 TSLA, AAPL, NVDA...)"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {filteredStocks.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-border bg-popover shadow-xl max-h-64 overflow-y-auto">
              {filteredStocks.map(s => (
                <button
                  key={s}
                  onClick={() => { handleStockClick(s); setSearchQuery(''); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors flex items-center justify-between"
                >
                  <span className="font-medium">{s}</span>
                  <TrendingUp size={14} className="text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>

        {watchlist.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
              <Star size={14} className="text-yellow-400" /> 我的自选 ({watchlist.length})
            </h2>
            <div className="grid gap-2">
              {watchlist.map(s => <StockRow key={s} symbol={s} />)}
            </div>
          </section>
        )}

        <div
          onClick={() => navigate('/screener')}
          className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-primary/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-primary" />
            <div>
              <div className="text-sm font-medium">条件选股</div>
              <div className="text-xs text-muted-foreground">买卖力道 · CD抄底 · 智能筛选</div>
            </div>
          </div>
          <span className="text-xs text-primary">开始筛选 →</span>
        </div>

        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Zap size={14} className="text-primary" /> 热门股票
          </h2>
          <div className="grid gap-2">
            {HOT_STOCKS.map(s => <StockRow key={s} symbol={s} />)}
          </div>
        </section>
      </main>

      <LoginDialog open={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
