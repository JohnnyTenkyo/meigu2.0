import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface WatchlistContextType {
  watchlist: string[];
  addStock: (symbol: string) => void;
  removeStock: (symbol: string) => void;
  isInWatchlist: (symbol: string) => boolean;
  toggleStock: (symbol: string) => void;
}

const WatchlistContext = createContext<WatchlistContextType | null>(null);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    const saved = localStorage.getItem('watchlist');
    return saved ? JSON.parse(saved) : ['TSLA', 'AAPL', 'NVDA', 'MSFT', 'AMZN'];
  });

  useEffect(() => {
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  const addStock = useCallback((symbol: string) => {
    setWatchlist(prev => prev.includes(symbol) ? prev : [...prev, symbol]);
  }, []);

  const removeStock = useCallback((symbol: string) => {
    setWatchlist(prev => prev.filter(s => s !== symbol));
  }, []);

  const isInWatchlist = useCallback((symbol: string) => {
    return watchlist.includes(symbol);
  }, [watchlist]);

  const toggleStock = useCallback((symbol: string) => {
    setWatchlist(prev => prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]);
  }, []);

  return (
    <WatchlistContext.Provider value={{ watchlist, addStock, removeStock, isInWatchlist, toggleStock }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider');
  return ctx;
}
