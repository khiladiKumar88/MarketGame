// src/hooks/useCryptoData.js
import { useState, useEffect } from 'react';

const BINANCE = 'https://api.binance.com/api/v3';

export const TOP_COINS = [
  { sym: 'BTC',   name: 'Bitcoin',       pair: 'BTCUSDT',   color: '#f7931a' },
  { sym: 'ETH',   name: 'Ethereum',      pair: 'ETHUSDT',   color: '#627eea' },
  { sym: 'BNB',   name: 'BNB',           pair: 'BNBUSDT',   color: '#f3ba2f' },
  { sym: 'SOL',   name: 'Solana',        pair: 'SOLUSDT',   color: '#9945ff' },
  { sym: 'XRP',   name: 'XRP',           pair: 'XRPUSDT',   color: '#346aa9' },
  { sym: 'DOGE',  name: 'Dogecoin',      pair: 'DOGEUSDT',  color: '#c2a633' },
  { sym: 'ADA',   name: 'Cardano',       pair: 'ADAUSDT',   color: '#0033ad' },
  { sym: 'AVAX',  name: 'Avalanche',     pair: 'AVAXUSDT',  color: '#e84142' },
  { sym: 'SHIB',  name: 'Shiba Inu',     pair: 'SHIBUSDT',  color: '#ffa409' },
  { sym: 'DOT',   name: 'Polkadot',      pair: 'DOTUSDT',   color: '#e6007a' },
  { sym: 'LINK',  name: 'Chainlink',     pair: 'LINKUSDT',  color: '#2a5ada' },
  { sym: 'MATIC', name: 'Polygon',       pair: 'MATICUSDT', color: '#8247e5' },
  { sym: 'UNI',   name: 'Uniswap',       pair: 'UNIUSDT',   color: '#ff007a' },
  { sym: 'LTC',   name: 'Litecoin',      pair: 'LTCUSDT',   color: '#bfbbbb' },
  { sym: 'ATOM',  name: 'Cosmos',        pair: 'ATOMUSDT',  color: '#6f7390' },
  { sym: 'XLM',   name: 'Stellar',       pair: 'XLMUSDT',   color: '#08b5e5' },
  { sym: 'NEAR',  name: 'NEAR Protocol', pair: 'NEARUSDT',  color: '#00ec97' },
  { sym: 'APT',   name: 'Aptos',         pair: 'APTUSDT',   color: '#00b4d8' },
  { sym: 'ARB',   name: 'Arbitrum',      pair: 'ARBUSDT',   color: '#28a0f0' },
  { sym: 'OP',    name: 'Optimism',      pair: 'OPUSDT',    color: '#ff0420' },
];

// ── Fetch all 24hr tickers in one call ─────────────────────
export async function fetchAllTickers() {
  try {
    const pairs = TOP_COINS.map(c => `"${c.pair}"`).join(',');
    const res   = await fetch(`${BINANCE}/ticker/24hr?symbols=[${pairs}]`);
    const data  = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(t => {
      const coin = TOP_COINS.find(c => c.pair === t.symbol);
      if (!coin) return null;
      return {
        ...coin,
        price:    parseFloat(t.lastPrice),
        change:   parseFloat(t.priceChange),
        chgPct:   parseFloat(t.priceChangePercent),
        high:     parseFloat(t.highPrice),
        low:      parseFloat(t.lowPrice),
        volume:   parseFloat(t.volume),
        quoteVol: parseFloat(t.quoteVolume),
        open:     parseFloat(t.openPrice),
      };
    }).filter(Boolean);
  } catch (e) {
    console.error('fetchAllTickers error:', e);
    return [];
  }
}

// ── Fetch OHLC candles ─────────────────────────────────────
// interval: '1m' '5m' '15m' '1h' '4h' '1d' '1w'
export async function fetchCryptoCandles(pair, interval = '1d', limit = 100) {
  try {
    const res  = await fetch(`${BINANCE}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(k => ({
      time:   new Date(k[0]).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (e) {
    console.error('fetchCryptoCandles error:', e);
    return [];
  }
}

// ── Hook: live tickers with 30s auto-refresh ───────────────
export function useCryptoTickers() {
  const [tickers, setTickers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const data = await fetchAllTickers();
      if (!cancelled && data.length) {
        setTickers(data);
        setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return { tickers, loading };
}