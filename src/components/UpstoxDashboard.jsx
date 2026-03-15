import { useState, useEffect, useCallback } from 'react';
import {
  useUpstoxIndices, useUpstoxStocks,
  fetchUpstoxCandles, UPSTOX_INDICES
} from '../hooks/useUpstoxData';
import UpstoxSignals from './UpstoxSignals';
import IntradayPlanner from './IntradayPlanner';
import OptionTracker from './OptionTracker';
import MarketScanner from './MarketScanner';
import PaperTrading from './PaperTrading';
import TradeJournal from './TradeJournal';
import PortfolioTracker from './PortfolioTracker';
import Backtesting from './Backtesting.jsx';
import PriceAlerts from './PriceAlerts';
import CandlestickChart from './CandlestickChart';
import SmartSignals from './SmartSignals';

const GROQ_KEY = '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';

function fmt(n, d = 2) {
  if (n == null) return '---';
  return n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function ChgBadge({ change, chgPct }) {
  if (change == null) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>---</span>;
  const up = change >= 0;
  return (
    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'DM Mono', color: up ? 'var(--green)' : 'var(--red)' }}>
      {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)} ({Math.abs(chgPct ?? 0).toFixed(2)}%)
    </span>
  );
}

function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  const changes = candles.slice(-period - 1).map((c, i, a) => i === 0 ? 0 : c.close - a[i - 1].close).slice(1);
  const gains  = changes.map(c => c > 0 ? c : 0);
  const losses = changes.map(c => c < 0 ? -c : 0);
  const ag = gains.reduce((a, b) => a + b) / period;
  const al = losses.reduce((a, b) => a + b) / period;
  if (al === 0) return 100;
  return Math.round(100 - 100 / (1 + ag / al));
}

function calcMACD(candles) {
  if (candles.length < 26) return { macd: 0, histogram: 0 };
  const closes = candles.map(c => c.close);
  const ema = (data, p) => {
    const k = 2 / (p + 1); let e = data[0];
    for (let i = 1; i < data.length; i++) e = data[i] * k + e * (1 - k);
    return e;
  };
  const m = ema(closes, 12) - ema(closes, 26);
  return { macd: Math.round(m * 100) / 100, histogram: Math.round((m - m * 0.82) * 100) / 100 };
}

function calcBB(candles, period = 20) {
  if (candles.length < period) return { pct: 50 };
  const closes = candles.slice(-period).map(c => c.close);
  const mean   = closes.reduce((a, b) => a + b) / period;
  const std    = Math.sqrt(closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  const last   = candles[candles.length - 1]?.close ?? mean;
  const lower  = mean - 2 * std;
  const upper  = mean + 2 * std;
  return { upper, middle: mean, lower, pct: Math.round(((last - lower) / (upper - lower || 1)) * 100) };
}

function IndexCard({ idx, active, onClick }) {
  return (
    <div className={`index-card ${active ? 'active' : ''}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="index-label">{idx.label}</div>
      {idx.price == null
        ? <div className="skeleton" style={{ height: 36, marginBottom: 8 }} />
        : <div className="index-value">{fmt(idx.price)}</div>
      }
      <div style={{ marginTop: 4 }}>
        <ChgBadge change={idx.change} chgPct={idx.chgPct} />
      </div>
      {idx.high != null && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
          H: {fmt(idx.high)} · L: {fmt(idx.low)}
        </div>
      )}
    </div>
  );
}

function StockRow({ s, onAnalyze }) {
  return (
    <div className="mover-item" onClick={() => onAnalyze(s)} style={{ cursor: 'pointer' }}>
      <div>
        <div className="mover-sym">{s.sym}</div>
        <div className="mover-name">{s.name}</div>
        {s.volume && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Vol: {(s.volume / 1e6).toFixed(2)}M
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="mover-price">{s.price ? '₹' + fmt(s.price) : '---'}</div>
        <ChgBadge change={s.change} chgPct={s.chgPct} />
        {s.high && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            H:{fmt(s.high)} L:{fmt(s.low)}
          </div>
        )}
      </div>
    </div>
  );
}

function UpstoxAI({ stocks, indices, preSelected }) {
  const [selected,  setSelected]  = useState(preSelected?.sym ?? '');
  const [customSym, setCustomSym] = useState('');
  const [timeframe, setTimeframe] = useState('swing');
  const [capital,   setCapital]   = useState(50000);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState('');

  async function analyze() {
    const sym = customSym.trim().toUpperCase() || selected;
    if (!sym) { setError('Please select a stock or index.'); return; }
    setError(''); setLoading(true); setResult(null);

    const stockData = stocks.find(s => s.sym === sym);
    const idxData   = indices.find(i => i.label === sym);
    const item      = stockData ?? idxData;
    const price     = item?.price;
    const token     = item?.token;

    if (!price) { setError('Price not loaded yet. Wait a moment and try again.'); setLoading(false); return; }

    let candleData = [];
    if (token) candleData = await fetchUpstoxCandles(token, 'day');

    const rsi  = calcRSI(candleData);
    const macd = calcMACD(candleData);
    const bb   = calcBB(candleData);
    const shares = Math.floor(capital / price);

    const prompt = `You are MarketSaathi, an expert Indian stock market analyst helping a BEGINNER investor.

Stock/Index: ${sym}
Live Price (Upstox Real-time): ₹${price.toLocaleString('en-IN')}
Today Change: ${item.change >= 0 ? '+' : ''}${item.change?.toFixed(2)} (${item.chgPct?.toFixed(2)}%)
RSI(14): ${rsi}
MACD Histogram: ${macd.histogram}
Bollinger Band %B: ${bb.pct}%
Timeframe: ${timeframe}
Capital Available: ₹${capital.toLocaleString('en-IN')}
Max Shares Possible: ${shares}

Give a complete trade analysis using the REAL technical indicators above.
Entry price MUST be very close to ₹${price.toFixed(2)}.
Explain in simple words a beginner can understand.

Respond ONLY in JSON, no markdown, no extra text:
{
  "signal": "BUY or SELL or HOLD",
  "confidence": 75,
  "entry": ${price.toFixed(2)},
  "target": 0.00,
  "stopLoss": 0.00,
  "riskReward": "1:2.0",
  "shares": ${shares},
  "capitalUsed": 0.00,
  "rsiAnalysis": "simple explanation of RSI ${rsi} for this stock",
  "macdAnalysis": "simple explanation of MACD ${macd.histogram} for this stock",
  "bbAnalysis": "simple explanation of BB% ${bb.pct} for this stock",
  "analysis": "2-3 sentences in simple English explaining why this signal",
  "risks": ["Risk 1", "Risk 2", "Risk 3"]
}`;

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await res.json();
      if (data.error) { setError(data.error.message); setLoading(false); return; }
      const raw = data.choices[0].message.content;
      setResult(JSON.parse(raw.replace(/```json|```/g, '').trim()));
    } catch (e) { setError('Analysis failed: ' + e.message); }
    setLoading(false);
  }

  const sigColor = result?.signal === 'BUY' ? 'var(--green)' : result?.signal === 'SELL' ? 'var(--red)' : 'var(--gold)';
  const sigIcon  = result?.signal === 'BUY' ? '🟢' : result?.signal === 'SELL' ? '🔴' : '🟡';

  return (
    <div className="panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="ai-badge">✦ AI + Upstox Live</span>
          <span className="panel-title">AI Trade Signal</span>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        Uses real-time Upstox prices + actual OHLC candle data for technical analysis.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="ai-select" value={selected} onChange={e => { setSelected(e.target.value); setCustomSym(''); setResult(null); }}>
          <option value="">Select Stock / Index</option>
          <optgroup label="── Indices ──">
            {indices.map(i => <option key={i.label} value={i.label}>{i.label} {i.price ? `— ₹${fmt(i.price)}` : '(loading...)'}</option>)}
          </optgroup>
          <optgroup label="── Stocks ──">
            {stocks.map(s => <option key={s.sym} value={s.sym}>{s.sym} — {s.name} {s.price ? `₹${fmt(s.price)}` : '(loading...)'}</option>)}
          </optgroup>
        </select>
        <span style={{ color: 'var(--text-muted)', fontSize: 13, alignSelf: 'center' }}>OR</span>
        <input className="ai-input" placeholder="Type NSE symbol e.g. ZOMATO" value={customSym}
          onChange={e => { setCustomSym(e.target.value.toUpperCase()); setSelected(''); setResult(null); }}
          onKeyDown={e => e.key === 'Enter' && analyze()} style={{ width: 200 }} />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select className="ai-select" value={timeframe} onChange={e => setTimeframe(e.target.value)}>
          <option value="intraday">Intraday</option>
          <option value="swing">Swing (2–5 days)</option>
          <option value="positional">Positional (2–4 weeks)</option>
          <option value="investment">Investment (3–6 months)</option>
        </select>
        <input className="ai-input" type="number" placeholder="Capital (₹)" value={capital} onChange={e => setCapital(Number(e.target.value))} style={{ width: 150 }} />
        <button className="btn-analyze" onClick={analyze} disabled={loading}>
          {loading ? '⏳ Analyzing...' : '🔍 Analyze with Upstox Data'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--red)', fontSize: 13, margin: '12px 0' }}>⚠️ {error}</p>}
      {loading && (
        <div className="ai-result">
          <div className="loader-wrap">
            <div className="loader" />
            <div className="loader-text">Fetching live Upstox data & generating AI signal...</div>
          </div>
        </div>
      )}
      {result && !loading && (
        <div className="ai-result fade-in">
          <div className={`signal-banner ${result.signal?.toLowerCase()}`}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Signal</div>
              <div className="signal-word" style={{ color: sigColor }}>{sigIcon} {result.signal}</div>
            </div>
            <div className="signal-meta">
              <div className="signal-stock">{customSym || selected}</div>
              <div className="signal-info">{result.shares} shares · ₹{Number(result.capitalUsed).toLocaleString('en-IN')} used</div>
            </div>
            <div className="confidence">
              <div className="confidence-label">Confidence</div>
              <div className="confidence-value">{result.confidence}%</div>
            </div>
          </div>
          <div className="trade-levels">
            {[['Entry', result.entry, 'entry'], ['Target', result.target, 'target'], ['Stop Loss', result.stopLoss, 'stoploss'], ['Risk:Reward', result.riskReward, 'rr']].map(([l, v, cls]) => (
              <div key={l} className="level-card">
                <div className="level-label">{l}</div>
                <div className={`level-value ${cls}`}>{cls === 'rr' ? v : '₹' + fmt(Number(v))}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
            {[['RSI Analysis', result.rsiAnalysis], ['MACD Analysis', result.macdAnalysis], ['Bollinger Band', result.bbAnalysis]].map(([title, text]) => (
              <div key={title} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</div>
              </div>
            ))}
          </div>
          <div className="analysis-text">{result.analysis}</div>
          <div className="risk-box">
            <div className="risk-title">⚠️ Key Risks</div>
            <div className="risk-points">{result.risks?.map((r, i) => <div key={i}>{i + 1}. {r}</div>)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function FnOOptionsChain({ indices }) {
  const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];
  const [symbol,      setSymbol]      = useState('NIFTY');
  const [expiries,    setExpiries]    = useState([]);
  const [expiry,      setExpiry]      = useState('');
  const [chain,       setChain]       = useState([]);
  const [livePrices,  setLivePrices]  = useState({});
  const [loading,     setLoading]     = useState(false);
  const [loadingLive, setLoadingLive] = useState(false);
  const [error,       setError]       = useState('');
  const [atm,         setAtm]         = useState(null);
  const [strikeRange, setStrikeRange] = useState(10);

  const spotPrice = (() => {
    if (symbol === 'NIFTY')     return indices.find(i => i.label === 'NIFTY 50')?.price;
    if (symbol === 'BANKNIFTY') return indices.find(i => i.label === 'BANK NIFTY')?.price;
    return null;
  })();

  useEffect(() => {
    setExpiries([]); setExpiry(''); setChain([]); setLivePrices({}); setError('');
    fetch(`http://localhost:5000/api/upstox/expiry/${symbol}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'success' && data.data?.length) {
          const dates = [...new Set(data.data.map(d => d.expiry))].sort();
          setExpiries(dates);
          setExpiry(dates[0]);
        } else {
          setError('Could not load expiry dates. Make sure Upstox token is refreshed.');
        }
      })
      .catch(() => setError('Server error loading expiry dates.'));
  }, [symbol]);

  useEffect(() => {
    if (!expiry) return;
    setLoading(true); setChain([]); setLivePrices({}); setError('');
    fetch(`http://localhost:5000/api/upstox/options/${symbol}/${expiry}`)
      .then(r => r.json())
      .then(data => {
        if (data.status !== 'success' || !data.data?.length) {
          setError('No options data for this expiry.'); setLoading(false); return;
        }
        const map = {};
        data.data.forEach(opt => {
          const k = opt.strike_price;
          if (!map[k]) map[k] = { strike: k };
          if (opt.instrument_type === 'CE') map[k].ce = opt;
          else if (opt.instrument_type === 'PE') map[k].pe = opt;
        });
        const allStrikes = Object.values(map).sort((a, b) => a.strike - b.strike);
        let atmStrike = allStrikes[0]?.strike;
        if (spotPrice) {
          atmStrike = allStrikes.reduce((prev, cur) =>
            Math.abs(cur.strike - spotPrice) < Math.abs(prev.strike - spotPrice) ? cur : prev
          ).strike;
        }
        setAtm(atmStrike);
        setChain(allStrikes);
        setLoading(false);
        fetchLivePrices(allStrikes, atmStrike, data.data);
      })
      .catch(() => { setError('Failed to load options chain.'); setLoading(false); });
  }, [expiry, symbol]);

  async function fetchLivePrices(allStrikes, atmStrike, allOpts) {
    setLoadingLive(true);
    try {
      const idx = allStrikes.findIndex(s => s.strike === atmStrike);
      const lo  = Math.max(0, idx - strikeRange);
      const hi  = Math.min(allStrikes.length - 1, idx + strikeRange);
      const visibleStrikes = allStrikes.slice(lo, hi + 1).map(s => s.strike);
      const instruments = allOpts.filter(o => visibleStrikes.includes(o.strike_price)).map(o => o.instrument_key);
      if (!instruments.length) { setLoadingLive(false); return; }
      const keys = instruments.join(',');
      const res  = await fetch(`http://localhost:5000/api/upstox/quotes?keys=${encodeURIComponent(keys)}`);
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        const prices = {};
        Object.entries(data.data).forEach(([key, val]) => {
          prices[key] = { ltp: val.last_price, change: val.net_change, oi: val.oi, volume: val.volume };
        });
        setLivePrices(prices);
      }
    } catch {}
    setLoadingLive(false);
  }

  const visibleChain = (() => {
    if (!atm || !chain.length) return chain;
    const idx = chain.findIndex(s => s.strike === atm);
    if (idx === -1) return chain;
    return chain.slice(Math.max(0, idx - strikeRange), Math.min(chain.length - 1, idx + strikeRange) + 1);
  })();

  const ltp  = opt => opt ? livePrices[opt.instrument_key]?.ltp ?? null : null;
  const oi   = opt => { if (!opt) return '---'; const v = livePrices[opt.instrument_key]?.oi; return v != null ? (v/1000).toFixed(0)+'K' : '---'; };
  const vol  = opt => { if (!opt) return '---'; const v = livePrices[opt.instrument_key]?.volume; return v != null ? (v/1000).toFixed(0)+'K' : '---'; };
  const chg  = opt => opt ? livePrices[opt.instrument_key]?.change ?? null : null;
  const pcr  = (() => {
    let ce = 0, pe = 0;
    visibleChain.forEach(r => { ce += livePrices[r.ce?.instrument_key]?.oi ?? 0; pe += livePrices[r.pe?.instrument_key]?.oi ?? 0; });
    return ce ? (pe/ce).toFixed(2) : '---';
  })();

  return (
    <div className="fade-in">
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Underlying</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {SYMBOLS.map(s => (
                <button key={s} onClick={() => setSymbol(s)} style={{
                  padding: '6px 14px', borderRadius: 6, border: '1px solid',
                  borderColor: symbol === s ? 'var(--gold)' : 'var(--border)',
                  background: symbol === s ? 'rgba(201,168,76,0.15)' : 'var(--bg-secondary)',
                  color: symbol === s ? 'var(--gold)' : 'var(--text-secondary)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Expiry</div>
            <select className="ai-select" value={expiry} onChange={e => setExpiry(e.target.value)} style={{ minWidth: 160 }}>
              {expiries.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Strikes ±ATM</div>
            <select className="ai-select" value={strikeRange} onChange={e => setStrikeRange(Number(e.target.value))}>
              {[5,10,15,20].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'center' }}>
            {spotPrice && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Spot</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'DM Mono', color: 'var(--text-primary)' }}>₹{fmt(spotPrice)}</div>
              </div>
            )}
            {pcr !== '---' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>PCR</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'DM Mono', color: parseFloat(pcr) > 1 ? 'var(--green)' : parseFloat(pcr) < 0.7 ? 'var(--red)' : 'var(--gold)' }}>{pcr}</div>
              </div>
            )}
            {loadingLive && <div style={{ fontSize: 11, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}><div className="loader" style={{ width: 14, height: 14 }} /> Fetching live prices...</div>}
          </div>
        </div>
      </div>
      {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 14, marginBottom: 16, color: 'var(--red)', fontSize: 13 }}>⚠️ {error}</div>}
      {loading && <div style={{ padding: 60, textAlign: 'center' }}><div className="loader" style={{ margin: '0 auto 12px' }} /><div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading options chain...</div></div>}
      {!loading && visibleChain.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 20, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{symbol} Options Chain · {expiry}</span>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--green)' }}>■ CALLS (CE)</span>
              <span style={{ color: 'var(--red)' }}>■ PUTS (PE)</span>
              <span style={{ background: 'rgba(201,168,76,0.2)', padding: '1px 6px', borderRadius: 3, color: 'var(--gold)', fontWeight: 600 }}>ATM = {atm}</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'DM Mono' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={{ padding: '10px 8px', color: 'var(--green)', textAlign: 'right' }}>OI</th>
                  <th style={{ padding: '10px 8px', color: 'var(--green)', textAlign: 'right' }}>Vol</th>
                  <th style={{ padding: '10px 8px', color: 'var(--green)', textAlign: 'right' }}>Chg</th>
                  <th style={{ padding: '10px 8px', color: 'var(--green)', textAlign: 'right', fontWeight: 700 }}>LTP (CE)</th>
                  <th style={{ padding: '10px 8px', color: 'var(--gold)', textAlign: 'center', fontWeight: 800, fontSize: 13 }}>STRIKE</th>
                  <th style={{ padding: '10px 8px', color: 'var(--red)', textAlign: 'left', fontWeight: 700 }}>LTP (PE)</th>
                  <th style={{ padding: '10px 8px', color: 'var(--red)', textAlign: 'left' }}>Chg</th>
                  <th style={{ padding: '10px 8px', color: 'var(--red)', textAlign: 'left' }}>Vol</th>
                  <th style={{ padding: '10px 8px', color: 'var(--red)', textAlign: 'left' }}>OI</th>
                </tr>
              </thead>
              <tbody>
                {visibleChain.map(row => {
                  const isAtm  = row.strike === atm;
                  const ceLtp  = ltp(row.ce), peLtp = ltp(row.pe);
                  const ceChg  = chg(row.ce), peChg = chg(row.pe);
                  const itmCe  = spotPrice && row.strike < spotPrice;
                  const itmPe  = spotPrice && row.strike > spotPrice;
                  return (
                    <tr key={row.strike} style={{ borderBottom: '1px solid var(--border)', background: isAtm ? 'rgba(201,168,76,0.08)' : 'transparent' }}>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-muted)', background: itmCe ? 'rgba(34,197,94,0.04)' : 'transparent' }}>{oi(row.ce)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-muted)', background: itmCe ? 'rgba(34,197,94,0.04)' : 'transparent' }}>{vol(row.ce)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: ceChg != null ? (ceChg >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)', background: itmCe ? 'rgba(34,197,94,0.04)' : 'transparent' }}>{ceChg != null ? (ceChg >= 0 ? '+' : '') + ceChg.toFixed(2) : '---'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: 'var(--green)', background: itmCe ? 'rgba(34,197,94,0.04)' : 'transparent' }}>{ceLtp != null ? '₹' + fmt(ceLtp) : '---'}</td>
                      <td style={{ padding: '8px', textAlign: 'center', fontWeight: isAtm ? 800 : 600, fontSize: isAtm ? 13 : 12, color: isAtm ? 'var(--gold)' : 'var(--text-primary)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                        {isAtm && <span style={{ marginRight: 4, fontSize: 10 }}>★</span>}
                        {row.strike.toLocaleString('en-IN')}
                        {isAtm && <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 400 }}>ATM</div>}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'left', fontWeight: 600, color: 'var(--red)', background: itmPe ? 'rgba(239,68,68,0.04)' : 'transparent' }}>{peLtp != null ? '₹' + fmt(peLtp) : '---'}</td>
                      <td style={{ padding: '8px', textAlign: 'left', color: peChg != null ? (peChg >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)', background: itmPe ? 'rgba(239,68,68,0.04)' : 'transparent' }}>{peChg != null ? (peChg >= 0 ? '+' : '') + peChg.toFixed(2) : '---'}</td>
                      <td style={{ padding: '8px', textAlign: 'left', color: 'var(--text-muted)', background: itmPe ? 'rgba(239,68,68,0.04)' : 'transparent' }}>{vol(row.pe)}</td>
                      <td style={{ padding: '8px', textAlign: 'left', color: 'var(--text-muted)', background: itmPe ? 'rgba(239,68,68,0.04)' : 'transparent' }}>{oi(row.pe)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 20, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span>★ ATM = At The Money</span>
            <span style={{ color: 'rgba(34,197,94,0.5)' }}>■ Green bg = ITM Call</span>
            <span style={{ color: 'rgba(239,68,68,0.5)' }}>■ Red bg = ITM Put</span>
            <span style={{ marginLeft: 'auto' }}>{visibleChain.length} strikes shown · Lot size: {visibleChain[0]?.ce?.lot_size ?? visibleChain[0]?.pe?.lot_size ?? 65}</span>
          </div>
        </div>
      )}
      {!loading && !error && visibleChain.length === 0 && expiry && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No options data available for this selection.</div>
      )}
    </div>
  );
}

export default function UpstoxDashboard() {
  const indices  = useUpstoxIndices();
  const stocks   = useUpstoxStocks();
  const [activeTab, setActiveTab] = useState('overview');
  const [activeIdx, setActiveIdx] = useState(0);
  const [aiStock,   setAiStock]   = useState(null);
  const [search,    setSearch]    = useState('');

  function handleAnalyze(s) { setAiStock(s); setActiveTab('analysis'); }

  const sorted    = [...stocks].filter(s => s.change != null).sort((a, b) => b.chgPct - a.chgPct);
  const gainers   = sorted.slice(0, 5);
  const losers    = [...sorted].reverse().slice(0, 5);
  const filtered  = stocks.filter(s => s.sym.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase()));
  const topMovers = [...stocks].filter(s => s.change != null).sort((a, b) => Math.abs(b.chgPct) - Math.abs(a.chgPct)).slice(0, 8);

  return (
    <div>
      {/* BANNER */}
      <div style={{ background: 'linear-gradient(135deg,rgba(59,130,246,0.1),rgba(10,14,26,0))', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 28 }}>📡</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>Upstox Live Data</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Real-time NSE/BSE prices · Refreshes every 30 seconds · Official Upstox API</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Connected</span>
        </div>
      </div>

      {/* SUB NAV — Row 1: Market */}
      <div style={{ marginBottom: 20 }}>
        <div className="nav-tabs" style={{ marginBottom: 6 }}>
          {[
            ['overview',  '📊 Overview'],
            ['analysis',  '🤖 AI Analysis'],
            ['watchlist', '⭐ Watchlist'],
            ['gainers',   '📈 Gainers/Losers'],
            ['fno',       '🎯 F&O Options'],
            ['signals',   '⚡ AI Signals'],
          ].map(([key, label]) => (
            <button key={key} className={`nav-tab ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>{label}</button>
          ))}
        </div>
        {/* Row 2: Tools */}
        <div className="nav-tabs">
          {[
            ['planner',   '📋 Trade Planner'],
            ['tracker',   '📡 Option Tracker'],
            ['scanner',   '🔭 Live Scanner'],
            ['paper',     '📝 Paper Trade'],
            ['journal',   '📓 Journal'],
            ['portfolio', '💼 Portfolio'],
            ['backtest',  '🧪 Backtest'],
            ['alerts',    '🔔 Price Alerts'],
          ].map(([key, label]) => (
            <button key={key} className={`nav-tab ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>{label}</button>
          ))}
        </div>
      </div>

      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="fade-in">
          <div className="index-grid">
            {indices.map((idx, i) => (
              <IndexCard key={idx.label} idx={idx} active={activeIdx === i} onClick={() => setActiveIdx(i)} />
            ))}
          </div>
          <div className="dashboard-grid">
            {/* ✅ Candlestick chart — replaces old ChartPanel */}
            <CandlestickChart activeIdx={activeIdx} />
            <div className="panel" style={{ overflowY: 'auto', maxHeight: 430 }}>
              <div className="panel-header">
                <div className="panel-title">Top Movers</div>
                <div className="panel-sub">Real-time · Click to analyze</div>
              </div>
              {topMovers.length === 0
                ? <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Loading stocks...</div>
                : topMovers.map(s => <StockRow key={s.sym} s={s} onAnalyze={handleAnalyze} />)
              }
            </div>
          </div>
        </div>
      )}

      {activeTab === 'analysis' && (
        <div className="fade-in">
          <UpstoxAI stocks={stocks} indices={indices} preSelected={aiStock} />
        </div>
      )}

      {activeTab === 'watchlist' && (
        <div className="fade-in panel">
          <div className="panel-header">
            <div className="panel-title">⭐ Watchlist — Upstox Live Prices</div>
            <div className="panel-sub">Refreshes every 30s</div>
          </div>
          <div className="search-bar">
            <span>🔍</span>
            <input placeholder="Search stocks..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <table className="data-table">
            <thead>
              <tr><th>Symbol</th><th>Company</th><th>Price</th><th>Change</th><th>High</th><th>Low</th><th>Volume</th><th>Action</th></tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.sym}>
                  <td style={{ fontWeight: 600 }}>{s.sym}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{s.name}</td>
                  <td style={{ fontFamily: 'DM Mono' }}>{s.price ? '₹' + fmt(s.price) : '---'}</td>
                  <td><ChgBadge change={s.change} chgPct={s.chgPct} /></td>
                  <td style={{ color: 'var(--green)', fontFamily: 'DM Mono' }}>{s.high ? '₹' + fmt(s.high) : '---'}</td>
                  <td style={{ color: 'var(--red)', fontFamily: 'DM Mono' }}>{s.low ? '₹' + fmt(s.low) : '---'}</td>
                  <td style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>{s.volume ? (s.volume / 1e6).toFixed(2) + 'M' : '---'}</td>
                  <td>
                    <button onClick={() => handleAnalyze(s)} style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Analyze</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'gainers' && (
        <div className="fade-in bottom-grid">
          <div className="panel">
            <div className="panel-header"><div className="panel-title">🟢 Top Gainers</div><div className="panel-sub">Real-time Upstox</div></div>
            <table className="data-table">
              <thead><tr><th>Stock</th><th>Company</th><th>Price</th><th>Change</th><th>High</th><th>Volume</th></tr></thead>
              <tbody>
                {gainers.map(s => (
                  <tr key={s.sym} style={{ cursor: 'pointer' }} onClick={() => handleAnalyze(s)}>
                    <td style={{ fontWeight: 600 }}>{s.sym}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.name}</td>
                    <td style={{ fontFamily: 'DM Mono' }}>₹{fmt(s.price)}</td>
                    <td style={{ color: 'var(--green)', fontFamily: 'DM Mono' }}>+{s.chgPct?.toFixed(2)}%</td>
                    <td style={{ fontFamily: 'DM Mono' }}>₹{fmt(s.high)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.volume ? (s.volume / 1e6).toFixed(2) + 'M' : '---'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <div className="panel-header"><div className="panel-title">🔴 Top Losers</div><div className="panel-sub">Real-time Upstox</div></div>
            <table className="data-table">
              <thead><tr><th>Stock</th><th>Company</th><th>Price</th><th>Change</th><th>Low</th><th>Volume</th></tr></thead>
              <tbody>
                {losers.map(s => (
                  <tr key={s.sym} style={{ cursor: 'pointer' }} onClick={() => handleAnalyze(s)}>
                    <td style={{ fontWeight: 600 }}>{s.sym}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.name}</td>
                    <td style={{ fontFamily: 'DM Mono' }}>₹{fmt(s.price)}</td>
                    <td style={{ color: 'var(--red)', fontFamily: 'DM Mono' }}>{s.chgPct?.toFixed(2)}%</td>
                    <td style={{ fontFamily: 'DM Mono' }}>₹{fmt(s.low)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.volume ? (s.volume / 1e6).toFixed(2) + 'M' : '---'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'fno'       && <div className="fade-in"><FnOOptionsChain indices={indices} /></div>}
      {activeTab === 'signals'   && <UpstoxSignals indices={indices} stocks={stocks} />}
      {activeTab === 'planner'   && <IntradayPlanner indices={indices} />}
      {activeTab === 'tracker'   && <OptionTracker />}
      {activeTab === 'scanner'   && <MarketScanner indices={indices} />}
      {activeTab === 'paper'     && <PaperTrading />}
      {activeTab === 'journal'   && <TradeJournal />}
      {activeTab === 'portfolio' && <PortfolioTracker />}
      {activeTab === 'backtest'  && <Backtesting />}
      {activeTab === 'alerts'    && <PriceAlerts indices={indices} />}
    </div>
  );
}









// import { useState, useEffect, useCallback } from 'react';
// import {
//   AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer
// } from 'recharts';
// import {
//   useUpstoxIndices, useUpstoxStocks,
//   fetchUpstoxCandles, UPSTOX_INDICES
// } from '../hooks/useUpstoxData';
// import UpstoxSignals from './UpstoxSignals';
// import IntradayPlanner from './IntradayPlanner';
// import OptionTracker from './OptionTracker';
// import MarketScanner   from './MarketScanner';
// import PaperTrading    from './PaperTrading';
// import TradeJournal    from './TradeJournal';
// import PortfolioTracker from './PortfolioTracker';
// import Backtesting from './Backtesting.jsx';
// import PriceAlerts from './PriceAlerts';
// import CandlestickChart from './CandlestickChart';


// const GROQ_KEY = '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';

// // ── Helpers ────────────────────────────────────────────────
// function fmt(n, d = 2) {
//   if (n == null) return '---';
//   return n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
// }

// function ChgBadge({ change, chgPct }) {
//   if (change == null) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>---</span>;
//   const up = change >= 0;
//   return (
//     <span style={{
//       fontSize: 12, fontWeight: 600, fontFamily: 'DM Mono',
//       color: up ? 'var(--green)' : 'var(--red)'
//     }}>
//       {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)} ({Math.abs(chgPct ?? 0).toFixed(2)}%)
//     </span>
//   );
// }

// // ── Technical Indicators ───────────────────────────────────
// function calcRSI(candles, period = 14) {
//   if (candles.length < period + 1) return 50;
//   const changes = candles.slice(-period - 1)
//     .map((c, i, a) => i === 0 ? 0 : c.close - a[i - 1].close).slice(1);
//   const gains  = changes.map(c => c > 0 ? c : 0);
//   const losses = changes.map(c => c < 0 ? -c : 0);
//   const ag = gains.reduce((a, b) => a + b) / period;
//   const al = losses.reduce((a, b) => a + b) / period;
//   if (al === 0) return 100;
//   return Math.round(100 - 100 / (1 + ag / al));
// }

// function calcMACD(candles) {
//   if (candles.length < 26) return { macd: 0, histogram: 0 };
//   const closes = candles.map(c => c.close);
//   const ema = (data, p) => {
//     const k = 2 / (p + 1); let e = data[0];
//     for (let i = 1; i < data.length; i++) e = data[i] * k + e * (1 - k);
//     return e;
//   };
//   const m = ema(closes, 12) - ema(closes, 26);
//   return { macd: Math.round(m * 100) / 100, histogram: Math.round((m - m * 0.82) * 100) / 100 };
// }

// function calcBB(candles, period = 20) {
//   if (candles.length < period) return { pct: 50 };
//   const closes = candles.slice(-period).map(c => c.close);
//   const mean   = closes.reduce((a, b) => a + b) / period;
//   const std    = Math.sqrt(closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
//   const last   = candles[candles.length - 1]?.close ?? mean;
//   const lower  = mean - 2 * std;
//   const upper  = mean + 2 * std;
//   return { upper, middle: mean, lower, pct: Math.round(((last - lower) / (upper - lower || 1)) * 100) };
// }

// // ── Index Card ─────────────────────────────────────────────
// function IndexCard({ idx, active, onClick }) {
//   const up = (idx.change ?? 0) >= 0;
//   return (
//     <div className={`index-card ${active ? 'active' : ''}`} onClick={onClick}
//       style={{ cursor: 'pointer' }}>
//       <div className="index-label">{idx.label}</div>
//       {idx.price == null
//         ? <div className="skeleton" style={{ height: 36, marginBottom: 8 }} />
//         : <div className="index-value">{fmt(idx.price)}</div>
//       }
//       <div style={{ marginTop: 4 }}>
//         <ChgBadge change={idx.change} chgPct={idx.chgPct} />
//       </div>
//       {idx.high != null && (
//         <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
//           H: {fmt(idx.high)} · L: {fmt(idx.low)}
//         </div>
//       )}
//     </div>
//   );
// }

// // ── Stock Row ──────────────────────────────────────────────
// function StockRow({ s, onAnalyze }) {
//   return (
//     <div className="mover-item" onClick={() => onAnalyze(s)} style={{ cursor: 'pointer' }}>
//       <div>
//         <div className="mover-sym">{s.sym}</div>
//         <div className="mover-name">{s.name}</div>
//         {s.volume && (
//           <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
//             Vol: {(s.volume / 1e6).toFixed(2)}M
//           </div>
//         )}
//       </div>
//       <div style={{ textAlign: 'right' }}>
//         <div className="mover-price">{s.price ? '₹' + fmt(s.price) : '---'}</div>
//         <ChgBadge change={s.change} chgPct={s.chgPct} />
//         {s.high && (
//           <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
//             H:{fmt(s.high)} L:{fmt(s.low)}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// // ── Chart Panel ────────────────────────────────────────────
// function ChartPanel({ activeIdx }) {
//   const idx = UPSTOX_INDICES[activeIdx];
//   const [candles,   setCandles]   = useState([]);
//   const [interval,  setIntervalV] = useState('day');
//   const [loading,   setLoading]   = useState(true);

//   useEffect(() => {
//     setLoading(true);
//     fetchUpstoxCandles(idx.token, interval)
//       .then(d => { setCandles(d); setLoading(false); })
//       .catch(() => setLoading(false));
//   }, [idx.token, interval]);

//   const isUp  = candles.length >= 2
//     ? candles[candles.length - 1].close >= candles[0].close
//     : true;
//   const color = isUp ? '#22c55e' : '#ef4444';

//   return (
//     <div className="panel">
//       <div className="panel-header">
//         <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//           {idx.label} — Real-time Chart
//           <span style={{
//             fontSize: 10, background: 'rgba(201,168,76,0.15)',
//             color: 'var(--gold)', padding: '2px 8px', borderRadius: 4, fontFamily: 'DM Mono'
//           }}>UPSTOX LIVE</span>
//         </div>
//         <div className="btn-group">
//           {[['30minute','30M'],['day','1D'],['week','1W'],['month','1M']].map(([val, label]) => (
//             <button key={val}
//               className={`btn-range ${interval === val ? 'active' : ''}`}
//               onClick={() => setIntervalV(val)}>{label}
//             </button>
//           ))}
//         </div>
//       </div>

//       {loading ? (
//         <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//           <div className="loader" />
//         </div>
//       ) : candles.length === 0 ? (
//         <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
//           No chart data available
//         </div>
//       ) : (
//         <ResponsiveContainer width="100%" height={300}>
//           <AreaChart data={candles} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
//             <defs>
//               <linearGradient id="upGradU" x1="0" y1="0" x2="0" y2="1">
//                 <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
//                 <stop offset="95%" stopColor={color} stopOpacity={0} />
//               </linearGradient>
//             </defs>
//             <XAxis dataKey="time"
//               tick={{ fill: '#4a5578', fontSize: 10, fontFamily: 'DM Mono' }}
//               tickLine={false} axisLine={false} interval="preserveStartEnd" />
//             <YAxis
//               domain={['auto', 'auto']}
//               tick={{ fill: '#4a5578', fontSize: 10, fontFamily: 'DM Mono' }}
//               tickLine={false} axisLine={false} orientation="right"
//               tickFormatter={v => v.toLocaleString('en-IN')} />
//             <Tooltip
//               contentStyle={{ background: '#131829', border: '1px solid #1e2640', borderRadius: 8, fontFamily: 'DM Mono', fontSize: 12 }}
//               labelStyle={{ color: '#8892b0' }}
//               formatter={v => ['₹' + fmt(v), 'Price']} />
//             <Area type="monotone" dataKey="close"
//               stroke={color} strokeWidth={2}
//               fill="url(#upGradU)" dot={false}
//               activeDot={{ r: 4, fill: color }} />
//           </AreaChart>
//         </ResponsiveContainer>
//       )}
//     </div>
//   );
// }

// // ── AI Analysis ────────────────────────────────────────────
// function UpstoxAI({ stocks, indices, preSelected }) {
//   const [selected,  setSelected]  = useState(preSelected?.sym ?? '');
//   const [customSym, setCustomSym] = useState('');
//   const [timeframe, setTimeframe] = useState('swing');
//   const [capital,   setCapital]   = useState(50000);
//   const [loading,   setLoading]   = useState(false);
//   const [result,    setResult]    = useState(null);
//   const [error,     setError]     = useState('');

//   async function analyze() {
//     const sym = customSym.trim().toUpperCase() || selected;
//     if (!sym) { setError('Please select a stock or index.'); return; }
//     setError(''); setLoading(true); setResult(null);

//     const stockData = stocks.find(s => s.sym === sym);
//     const idxData   = indices.find(i => i.label === sym);
//     const item      = stockData ?? idxData;
//     const price     = item?.price;
//     const token     = item?.token;

//     if (!price) { setError('Price not loaded yet. Wait a moment and try again.'); setLoading(false); return; }

//     let candleData = [];
//     if (token) candleData = await fetchUpstoxCandles(token, 'day');

//     const rsi  = calcRSI(candleData);
//     const macd = calcMACD(candleData);
//     const bb   = calcBB(candleData);
//     const shares = Math.floor(capital / price);

//     const prompt = `You are Market KA Khiladi, an expert Indian stock market analyst helping a BEGINNER investor.

// Stock/Index: ${sym}
// Live Price (Upstox Real-time): ₹${price.toLocaleString('en-IN')}
// Today Change: ${item.change >= 0 ? '+' : ''}${item.change?.toFixed(2)} (${item.chgPct?.toFixed(2)}%)
// RSI(14): ${rsi}
// MACD Histogram: ${macd.histogram}
// Bollinger Band %B: ${bb.pct}%
// Timeframe: ${timeframe}
// Capital Available: ₹${capital.toLocaleString('en-IN')}
// Max Shares Possible: ${shares}

// Give a complete trade analysis using the REAL technical indicators above.
// Entry price MUST be very close to ₹${price.toFixed(2)}.
// Explain in simple words a beginner can understand.

// Respond ONLY in JSON, no markdown, no extra text:
// {
//   "signal": "BUY or SELL or HOLD",
//   "confidence": 75,
//   "entry": ${price.toFixed(2)},
//   "target": 0.00,
//   "stopLoss": 0.00,
//   "riskReward": "1:2.0",
//   "shares": ${shares},
//   "capitalUsed": 0.00,
//   "rsiAnalysis": "simple explanation of RSI ${rsi} for this stock",
//   "macdAnalysis": "simple explanation of MACD ${macd.histogram} for this stock",
//   "bbAnalysis": "simple explanation of BB% ${bb.pct} for this stock",
//   "analysis": "2-3 sentences in simple English explaining why this signal",
//   "risks": ["Risk 1", "Risk 2", "Risk 3"]
// }`;

//     try {
//       const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
//         body: JSON.stringify({
//           model: 'llama-3.3-70b-versatile', max_tokens: 1000,
//           messages: [{ role: 'user', content: prompt }]
//         })
//       });
//       const data = await res.json();
//       if (data.error) { setError(data.error.message); setLoading(false); return; }
//       const raw = data.choices[0].message.content;
//       setResult(JSON.parse(raw.replace(/```json|```/g, '').trim()));
//     } catch (e) { setError('Analysis failed: ' + e.message); }
//     setLoading(false);
//   }

//   const sigColor = result?.signal === 'BUY' ? 'var(--green)' : result?.signal === 'SELL' ? 'var(--red)' : 'var(--gold)';
//   const sigIcon  = result?.signal === 'BUY' ? '🟢' : result?.signal === 'SELL' ? '🔴' : '🟡';

//   return (
//     <div className="panel">
//       <div className="panel-header">
//         <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//           <span className="ai-badge">✦ AI + Upstox Live</span>
//           <span className="panel-title">AI Trade Signal</span>
//         </div>
//       </div>
//       <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
//         Uses real-time Upstox prices + actual OHLC candle data for technical analysis.
//       </p>

//       <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
//         <select className="ai-select" value={selected}
//           onChange={e => { setSelected(e.target.value); setCustomSym(''); setResult(null); }}>
//           <option value="">Select Stock / Index</option>
//           <optgroup label="── Indices ──">
//             {indices.map(i => (
//               <option key={i.label} value={i.label}>
//                 {i.label} {i.price ? `— ₹${fmt(i.price)}` : '(loading...)'}
//               </option>
//             ))}
//           </optgroup>
//           <optgroup label="── Stocks ──">
//             {stocks.map(s => (
//               <option key={s.sym} value={s.sym}>
//                 {s.sym} — {s.name} {s.price ? `₹${fmt(s.price)}` : '(loading...)'}
//               </option>
//             ))}
//           </optgroup>
//         </select>
//         <span style={{ color: 'var(--text-muted)', fontSize: 13, alignSelf: 'center' }}>OR</span>
//         <input className="ai-input" placeholder="Type NSE symbol e.g. ZOMATO"
//           value={customSym}
//           onChange={e => { setCustomSym(e.target.value.toUpperCase()); setSelected(''); setResult(null); }}
//           onKeyDown={e => e.key === 'Enter' && analyze()}
//           style={{ width: 200 }} />
//       </div>
//       <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
//         <select className="ai-select" value={timeframe} onChange={e => setTimeframe(e.target.value)}>
//           <option value="intraday">Intraday</option>
//           <option value="swing">Swing (2–5 days)</option>
//           <option value="positional">Positional (2–4 weeks)</option>
//           <option value="investment">Investment (3–6 months)</option>
//         </select>
//         <input className="ai-input" type="number" placeholder="Capital (₹)"
//           value={capital} onChange={e => setCapital(Number(e.target.value))} style={{ width: 150 }} />
//         <button className="btn-analyze" onClick={analyze} disabled={loading}>
//           {loading ? '⏳ Analyzing...' : '🔍 Analyze with Upstox Data'}
//         </button>
//       </div>

//       {error && <p style={{ color: 'var(--red)', fontSize: 13, margin: '12px 0' }}>⚠️ {error}</p>}

//       {loading && (
//         <div className="ai-result">
//           <div className="loader-wrap">
//             <div className="loader" />
//             <div className="loader-text">Fetching live Upstox data & generating AI signal...</div>
//           </div>
//         </div>
//       )}

//       {result && !loading && (
//         <div className="ai-result fade-in">
//           <div className={`signal-banner ${result.signal?.toLowerCase()}`}>
//             <div>
//               <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Signal</div>
//               <div className="signal-word" style={{ color: sigColor }}>{sigIcon} {result.signal}</div>
//             </div>
//             <div className="signal-meta">
//               <div className="signal-stock">{customSym || selected}</div>
//               <div className="signal-info">{result.shares} shares · ₹{Number(result.capitalUsed).toLocaleString('en-IN')} used</div>
//             </div>
//             <div className="confidence">
//               <div className="confidence-label">Confidence</div>
//               <div className="confidence-value">{result.confidence}%</div>
//             </div>
//           </div>

//           <div className="trade-levels">
//             {[
//               ['Entry',     result.entry,    'entry'],
//               ['Target',    result.target,   'target'],
//               ['Stop Loss', result.stopLoss, 'stoploss'],
//               ['Risk:Reward', result.riskReward, 'rr'],
//             ].map(([l, v, cls]) => (
//               <div key={l} className="level-card">
//                 <div className="level-label">{l}</div>
//                 <div className={`level-value ${cls}`}>
//                   {cls === 'rr' ? v : '₹' + fmt(Number(v))}
//                 </div>
//               </div>
//             ))}
//           </div>

//           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
//             {[
//               ['RSI Analysis',  result.rsiAnalysis],
//               ['MACD Analysis', result.macdAnalysis],
//               ['Bollinger Band',result.bbAnalysis],
//             ].map(([title, text]) => (
//               <div key={title} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12 }}>
//                 <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{title}</div>
//                 <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</div>
//               </div>
//             ))}
//           </div>

//           <div className="analysis-text">{result.analysis}</div>

//           <div className="risk-box">
//             <div className="risk-title">⚠️ Key Risks</div>
//             <div className="risk-points">
//               {result.risks?.map((r, i) => <div key={i}>{i + 1}. {r}</div>)}
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// // ── F&O Options Chain ──────────────────────────────────────
// function FnOOptionsChain({ indices }) {
//   const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];

//   const [symbol,      setSymbol]      = useState('NIFTY');
//   const [expiries,    setExpiries]    = useState([]);
//   const [expiry,      setExpiry]      = useState('');
//   const [chain,       setChain]       = useState([]);  // [{strike, ce, pe}]
//   const [livePrices,  setLivePrices]  = useState({});
//   const [loading,     setLoading]     = useState(false);
//   const [loadingLive, setLoadingLive] = useState(false);
//   const [error,       setError]       = useState('');
//   const [atm,         setAtm]         = useState(null);
//   const [strikeRange, setStrikeRange] = useState(10); // show ±10 strikes from ATM

//   // spot price from indices
//   const spotPrice = (() => {
//     if (symbol === 'NIFTY')     return indices.find(i => i.label === 'NIFTY 50')?.price;
//     if (symbol === 'BANKNIFTY') return indices.find(i => i.label === 'BANK NIFTY')?.price;
//     return null;
//   })();

//   // 1. Load expiry dates
//   useEffect(() => {
//     setExpiries([]); setExpiry(''); setChain([]); setLivePrices({}); setError('');
//     fetch(`http://localhost:5000/api/upstox/expiry/${symbol}`)
//       .then(r => r.json())
//       .then(data => {
//         if (data.status === 'success' && data.data?.length) {
//           // extract unique sorted expiry dates
//           const dates = [...new Set(data.data.map(d => d.expiry))].sort();
//           setExpiries(dates);
//           setExpiry(dates[0]); // default: nearest expiry
//         } else {
//           setError('Could not load expiry dates. Make sure Upstox token is refreshed.');
//         }
//       })
//       .catch(() => setError('Server error loading expiry dates.'));
//   }, [symbol]);

//   // 2. Load options chain for selected expiry
//   useEffect(() => {
//     if (!expiry) return;
//     setLoading(true); setChain([]); setLivePrices({}); setError('');

//     fetch(`http://localhost:5000/api/upstox/options/${symbol}/${expiry}`)
//       .then(r => r.json())
//       .then(data => {
//         if (data.status !== 'success' || !data.data?.length) {
//           setError('No options data for this expiry.'); setLoading(false); return;
//         }

//         // Group by strike → {ce, pe}
//         const map = {};
//         data.data.forEach(opt => {
//           const k = opt.strike_price;
//           if (!map[k]) map[k] = { strike: k };
//           if (opt.instrument_type === 'CE') map[k].ce = opt;
//           else if (opt.instrument_type === 'PE') map[k].pe = opt;
//         });

//         const allStrikes = Object.values(map).sort((a, b) => a.strike - b.strike);

//         // Find ATM
//         let atmStrike = allStrikes[0]?.strike;
//         if (spotPrice) {
//           atmStrike = allStrikes.reduce((prev, cur) =>
//             Math.abs(cur.strike - spotPrice) < Math.abs(prev.strike - spotPrice) ? cur : prev
//           ).strike;
//         }
//         setAtm(atmStrike);
//         setChain(allStrikes);
//         setLoading(false);

//         // Fetch live prices for visible options
//         fetchLivePrices(allStrikes, atmStrike, data.data);
//       })
//       .catch(() => { setError('Failed to load options chain.'); setLoading(false); });
//   }, [expiry, symbol]);

//   // 3. Fetch live prices for options instruments
//   async function fetchLivePrices(allStrikes, atmStrike, allOpts) {
//     setLoadingLive(true);
//     try {
//       // pick ±strikeRange strikes from ATM
//       const idx = allStrikes.findIndex(s => s.strike === atmStrike);
//       const lo  = Math.max(0, idx - strikeRange);
//       const hi  = Math.min(allStrikes.length - 1, idx + strikeRange);
//       const visibleStrikes = allStrikes.slice(lo, hi + 1).map(s => s.strike);

//       const instruments = allOpts
//         .filter(o => visibleStrikes.includes(o.strike_price))
//         .map(o => o.instrument_key);

//       if (!instruments.length) { setLoadingLive(false); return; }

//       // Upstox market quotes endpoint (via our proxy)
//       const keys = instruments.join(',');
//       const res  = await fetch(`http://localhost:5000/api/upstox/quotes?keys=${encodeURIComponent(keys)}`);
//       const data = await res.json();

//       if (data.status === 'success' && data.data) {
//         const prices = {};
//         Object.entries(data.data).forEach(([key, val]) => {
//           prices[key] = {
//             ltp:    val.last_price,
//             change: val.net_change,
//             oi:     val.oi,
//             volume: val.volume,
//             bid:    val.depth?.buy?.[0]?.price,
//             ask:    val.depth?.sell?.[0]?.price,
//           };
//         });
//         setLivePrices(prices);
//       }
//     } catch (e) {
//       // live prices failed — chain still shows without LTP
//     }
//     setLoadingLive(false);
//   }

//   // Visible strikes (±strikeRange from ATM)
//   const visibleChain = (() => {
//     if (!atm || !chain.length) return chain;
//     const idx = chain.findIndex(s => s.strike === atm);
//     if (idx === -1) return chain;
//     const lo = Math.max(0, idx - strikeRange);
//     const hi = Math.min(chain.length - 1, idx + strikeRange);
//     return chain.slice(lo, hi + 1);
//   })();

//   function ltp(opt) {
//     if (!opt) return null;
//     return livePrices[opt.instrument_key]?.ltp ?? null;
//   }
//   function oi(opt) {
//     if (!opt) return null;
//     const v = livePrices[opt.instrument_key]?.oi;
//     return v != null ? (v / 1000).toFixed(0) + 'K' : '---';
//   }
//   function vol(opt) {
//     if (!opt) return null;
//     const v = livePrices[opt.instrument_key]?.volume;
//     return v != null ? (v / 1000).toFixed(0) + 'K' : '---';
//   }
//   function chg(opt) {
//     if (!opt) return null;
//     return livePrices[opt.instrument_key]?.change ?? null;
//   }

//   const pcr = (() => {
//     let totalCeOi = 0, totalPeOi = 0;
//     visibleChain.forEach(row => {
//       const ceOi = livePrices[row.ce?.instrument_key]?.oi ?? 0;
//       const peOi = livePrices[row.pe?.instrument_key]?.oi ?? 0;
//       totalCeOi += ceOi;
//       totalPeOi += peOi;
//     });
//     return totalCeOi ? (totalPeOi / totalCeOi).toFixed(2) : '---';
//   })();

//   return (
//     <div className="fade-in">
//       {/* Controls */}
//       <div className="panel" style={{ marginBottom: 16 }}>
//         <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
//           {/* Symbol selector */}
//           <div>
//             <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Underlying</div>
//             <div style={{ display: 'flex', gap: 6 }}>
//               {SYMBOLS.map(s => (
//                 <button key={s} onClick={() => setSymbol(s)}
//                   style={{
//                     padding: '6px 14px', borderRadius: 6, border: '1px solid',
//                     borderColor: symbol === s ? 'var(--gold)' : 'var(--border)',
//                     background:  symbol === s ? 'rgba(201,168,76,0.15)' : 'var(--bg-secondary)',
//                     color:       symbol === s ? 'var(--gold)' : 'var(--text-secondary)',
//                     fontSize: 12, fontWeight: 600, cursor: 'pointer'
//                   }}>{s}</button>
//               ))}
//             </div>
//           </div>

//           {/* Expiry selector */}
//           <div>
//             <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Expiry</div>
//             <select className="ai-select" value={expiry} onChange={e => setExpiry(e.target.value)}
//               style={{ minWidth: 160 }}>
//               {expiries.map(e => (
//                 <option key={e} value={e}>{e}</option>
//               ))}
//             </select>
//           </div>

//           {/* Strike range */}
//           <div>
//             <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Strikes ±ATM</div>
//             <select className="ai-select" value={strikeRange} onChange={e => setStrikeRange(Number(e.target.value))}>
//               {[5,10,15,20].map(n => <option key={n} value={n}>{n}</option>)}
//             </select>
//           </div>

//           {/* Spot price + PCR */}
//           <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'center' }}>
//             {spotPrice && (
//               <div style={{ textAlign: 'center' }}>
//                 <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Spot</div>
//                 <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'DM Mono', color: 'var(--text-primary)' }}>
//                   ₹{fmt(spotPrice)}
//                 </div>
//               </div>
//             )}
//             {pcr !== '---' && (
//               <div style={{ textAlign: 'center' }}>
//                 <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>PCR</div>
//                 <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'DM Mono',
//                   color: parseFloat(pcr) > 1 ? 'var(--green)' : parseFloat(pcr) < 0.7 ? 'var(--red)' : 'var(--gold)'
//                 }}>{pcr}</div>
//               </div>
//             )}
//             {loadingLive && (
//               <div style={{ fontSize: 11, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}>
//                 <div className="loader" style={{ width: 14, height: 14 }} /> Fetching live prices...
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       {error && (
//         <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
//           borderRadius: 8, padding: 14, marginBottom: 16, color: 'var(--red)', fontSize: 13 }}>
//           ⚠️ {error}
//         </div>
//       )}

//       {loading && (
//         <div style={{ padding: 60, textAlign: 'center' }}>
//           <div className="loader" style={{ margin: '0 auto 12px' }} />
//           <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading options chain...</div>
//         </div>
//       )}

//       {!loading && visibleChain.length > 0 && (
//         <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
//           {/* Legend */}
//           <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)',
//             display: 'flex', gap: 20, alignItems: 'center' }}>
//             <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
//               {symbol} Options Chain · {expiry}
//             </span>
//             <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)' }}>
//               <span style={{ color: 'var(--green)' }}>■ CALLS (CE)</span>
//               <span style={{ color: 'var(--red)' }}>■ PUTS (PE)</span>
//               <span style={{ background: 'rgba(201,168,76,0.2)', padding: '1px 6px', borderRadius: 3,
//                 color: 'var(--gold)', fontWeight: 600 }}>ATM = {atm}</span>
//             </div>
//           </div>

//           {/* Table */}
//           <div style={{ overflowX: 'auto' }}>
//             <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'DM Mono' }}>
//               <thead>
//                 <tr style={{ background: 'var(--bg-secondary)' }}>
//                   {/* CE side */}
//                   <th style={{ padding: '10px 8px', color: 'var(--green)', textAlign: 'right', width: '8%' }}>OI</th>
//                   <th style={{ padding: '10px 8px', color: 'var(--green)', textAlign: 'right', width: '7%' }}>Vol</th>
//                   <th style={{ padding: '10px 8px', color: 'var(--green)', textAlign: 'right', width: '7%' }}>Chg</th>
//                   <th style={{ padding: '10px 8px', color: 'var(--green)', textAlign: 'right', width: '8%', fontWeight: 700 }}>LTP (CE)</th>
//                   {/* Strike */}
//                   <th style={{ padding: '10px 8px', color: 'var(--gold)', textAlign: 'center', width: '10%',
//                     fontWeight: 800, fontSize: 13 }}>STRIKE</th>
//                   {/* PE side */}
//                   <th style={{ padding: '10px 8px', color: 'var(--red)', textAlign: 'left', width: '8%', fontWeight: 700 }}>LTP (PE)</th>
//                   <th style={{ padding: '10px 8px', color: 'var(--red)', textAlign: 'left', width: '7%' }}>Chg</th>
//                   <th style={{ padding: '10px 8px', color: 'var(--red)', textAlign: 'left', width: '7%' }}>Vol</th>
//                   <th style={{ padding: '10px 8px', color: 'var(--red)', textAlign: 'left', width: '8%' }}>OI</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {visibleChain.map(row => {
//                   const isAtm    = row.strike === atm;
//                   const ceLtp    = ltp(row.ce);
//                   const peLtp    = ltp(row.pe);
//                   const ceChange = chg(row.ce);
//                   const peChange = chg(row.pe);
//                   const itm_ce   = spotPrice && row.strike < spotPrice;
//                   const itm_pe   = spotPrice && row.strike > spotPrice;

//                   return (
//                     <tr key={row.strike} style={{
//                       borderBottom: '1px solid var(--border)',
//                       background: isAtm
//                         ? 'rgba(201,168,76,0.08)'
//                         : 'transparent',
//                     }}>
//                       {/* CE columns */}
//                       <td style={{ padding: '8px', textAlign: 'right',
//                         color: 'var(--text-muted)',
//                         background: itm_ce ? 'rgba(34,197,94,0.04)' : 'transparent'
//                       }}>{oi(row.ce)}</td>
//                       <td style={{ padding: '8px', textAlign: 'right',
//                         color: 'var(--text-muted)',
//                         background: itm_ce ? 'rgba(34,197,94,0.04)' : 'transparent'
//                       }}>{vol(row.ce)}</td>
//                       <td style={{ padding: '8px', textAlign: 'right',
//                         color: ceChange != null ? (ceChange >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)',
//                         background: itm_ce ? 'rgba(34,197,94,0.04)' : 'transparent'
//                       }}>
//                         {ceChange != null ? (ceChange >= 0 ? '+' : '') + ceChange.toFixed(2) : '---'}
//                       </td>
//                       <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600,
//                         color: 'var(--green)',
//                         background: itm_ce ? 'rgba(34,197,94,0.04)' : 'transparent'
//                       }}>
//                         {ceLtp != null ? '₹' + fmt(ceLtp) : '---'}
//                       </td>

//                       {/* STRIKE */}
//                       <td style={{ padding: '8px', textAlign: 'center',
//                         fontWeight: isAtm ? 800 : 600,
//                         fontSize: isAtm ? 13 : 12,
//                         color: isAtm ? 'var(--gold)' : 'var(--text-primary)',
//                         borderLeft:  '1px solid var(--border)',
//                         borderRight: '1px solid var(--border)',
//                       }}>
//                         {isAtm && <span style={{ marginRight: 4, fontSize: 10 }}>★</span>}
//                         {row.strike.toLocaleString('en-IN')}
//                         {isAtm && <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 400 }}>ATM</div>}
//                       </td>

//                       {/* PE columns */}
//                       <td style={{ padding: '8px', textAlign: 'left', fontWeight: 600,
//                         color: 'var(--red)',
//                         background: itm_pe ? 'rgba(239,68,68,0.04)' : 'transparent'
//                       }}>
//                         {peLtp != null ? '₹' + fmt(peLtp) : '---'}
//                       </td>
//                       <td style={{ padding: '8px', textAlign: 'left',
//                         color: peChange != null ? (peChange >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)',
//                         background: itm_pe ? 'rgba(239,68,68,0.04)' : 'transparent'
//                       }}>
//                         {peChange != null ? (peChange >= 0 ? '+' : '') + peChange.toFixed(2) : '---'}
//                       </td>
//                       <td style={{ padding: '8px', textAlign: 'left',
//                         color: 'var(--text-muted)',
//                         background: itm_pe ? 'rgba(239,68,68,0.04)' : 'transparent'
//                       }}>{vol(row.pe)}</td>
//                       <td style={{ padding: '8px', textAlign: 'left',
//                         color: 'var(--text-muted)',
//                         background: itm_pe ? 'rgba(239,68,68,0.04)' : 'transparent'
//                       }}>{oi(row.pe)}</td>
//                     </tr>
//                   );
//                 })}
//               </tbody>
//             </table>
//           </div>

//           {/* Footer info */}
//           <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)',
//             display: 'flex', gap: 20, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
//             <span>★ ATM = At The Money</span>
//             <span style={{ color: 'rgba(34,197,94,0.5)' }}>■ Green bg = ITM Call</span>
//             <span style={{ color: 'rgba(239,68,68,0.5)' }}>■ Red bg = ITM Put</span>
//             <span style={{ marginLeft: 'auto' }}>
//               {visibleChain.length} strikes shown · Lot size: {visibleChain[0]?.ce?.lot_size ?? visibleChain[0]?.pe?.lot_size ?? 65}
//             </span>
//           </div>
//         </div>
//       )}

//       {!loading && !error && visibleChain.length === 0 && expiry && (
//         <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
//           No options data available for this selection.
//         </div>
//       )}
//     </div>
//   );
// }

// // ── Main Dashboard ─────────────────────────────────────────
// export default function UpstoxDashboard() {
//   const indices  = useUpstoxIndices();
//   const stocks   = useUpstoxStocks();
//   const [activeTab, setActiveTab] = useState('overview');
//   const [activeIdx, setActiveIdx] = useState(0);
//   const [aiStock,   setAiStock]   = useState(null);
//   const [search,    setSearch]    = useState('');

//   function handleAnalyze(s) { setAiStock(s); setActiveTab('analysis'); }

//   const sorted  = [...stocks].filter(s => s.change != null).sort((a, b) => b.chgPct - a.chgPct);
//   const gainers = sorted.slice(0, 5);
//   const losers  = [...sorted].reverse().slice(0, 5);
//   const filtered = stocks.filter(s =>
//     s.sym.toLowerCase().includes(search.toLowerCase()) ||
//     s.name.toLowerCase().includes(search.toLowerCase())
//   );
//   const topMovers = [...stocks]
//     .filter(s => s.change != null)
//     .sort((a, b) => Math.abs(b.chgPct) - Math.abs(a.chgPct))
//     .slice(0, 8);

//   return (
//     <div>
//       {/* UPSTOX BANNER */}
//       <div style={{
//         background: 'linear-gradient(135deg,rgba(59,130,246,0.1),rgba(10,14,26,0))',
//         border: '1px solid rgba(59,130,246,0.2)',
//         borderRadius: 12, padding: '14px 20px', marginBottom: 20,
//         display: 'flex', alignItems: 'center', gap: 14
//       }}>
//         <span style={{ fontSize: 28 }}>📡</span>
//         <div>
//           <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>Upstox Live Data</div>
//           <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
//             Real-time NSE/BSE prices · Refreshes every 30 seconds · Official Upstox API
//           </div>
//         </div>
//         <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
//           <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite' }} />
//           <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Connected</span>
//         </div>
//       </div>

//       {/* SUB NAV */}
//       {/* <div className="nav-tabs" style={{ marginBottom: 20 }}>
//         {[
//           ['overview',  '📊 Overview'],
//           ['analysis',  '🤖 AI Analysis'],
//           ['watchlist', '⭐ Watchlist'],
//           ['gainers',   '📈 Gainers/Losers'],
//           ['fno',       '🎯 F&O Options'],
//           ['signals', '🎯 AI Signals'],
//           ['planner', '📋 Trade Planner'],
//           ['tracker', '📡 Option Tracker'],
//           ['scanner',   '🔭 Live Scanner'],
// ['paper',     '📝 Paper Trade'],
// ['journal',   '📓 Journal'],
// ['portfolio', '💼 Portfolio'],
// ['backtest', '🧪 Backtest'],
// ['alerts', '🔔 Price Alerts'],




//         ].map(([key, label]) => (
//           <button key={key} className={`nav-tab ${activeTab === key ? 'active' : ''}`}
//             onClick={() => setActiveTab(key)}>{label}
//           </button>
//         ))}
//       </div> */}



// <div style={{ marginBottom: 20 }}>
//   {/* Row 1: Core tabs */}
//   <div className="nav-tabs" style={{ marginBottom: 6 }}>
//     {[
//       ['overview',  '📊 Overview'],
//       ['analysis',  '🤖 AI Analysis'],
//       ['watchlist', '⭐ Watchlist'],
//       ['gainers',   '📈 Gainers/Losers'],
//       ['fno',       '🎯 F&O Options'],
//       ['signals',   '⚡ AI Signals'],
//     ].map(([key, label]) => (
//       <button
//         key={key}
//         className={`nav-tab ${activeTab === key ? 'active' : ''}`}
//         onClick={() => setActiveTab(key)}
//       >
//         {label}
//       </button>
//     ))}
//   </div>
 
//   {/* Row 2: Tools tabs */}
//   <div className="nav-tabs">
//     {[
//       ['planner',   '📋 Trade Planner'],
//       ['tracker',   '📡 Option Tracker'],
//       ['scanner',   '🔭 Live Scanner'],
//       ['paper',     '📝 Paper Trade'],
//       ['journal',   '📓 Journal'],
//       ['portfolio', '💼 Portfolio'],
//       ['backtest',  '🧪 Backtest'],
//       ['alerts',    '🔔 Price Alerts'],
//     ].map(([key, label]) => (
//       <button
//         key={key}
//         className={`nav-tab ${activeTab === key ? 'active' : ''}`}
//         onClick={() => setActiveTab(key)}
//       >
//         {label}
//       </button>
//     ))}
//   </div>
// </div>
 


//       {/* OVERVIEW */}

      
//       {activeTab === 'overview' && (
//         <div className="fade-in">
//           <div className="index-grid">
//             {indices.map((idx, i) => (
//               <IndexCard key={idx.label} idx={idx} active={activeIdx === i} onClick={() => setActiveIdx(i)} />
//             ))}
//           </div>
//           <div className="dashboard-grid">
//             <ChartPanel activeIdx={activeIdx} />
//             <div className="panel" style={{ overflowY: 'auto', maxHeight: 430 }}>
//               <div className="panel-header">
//                 <div className="panel-title">Top Movers</div>
//                 <div className="panel-sub">Real-time · Click to analyze</div>
//               </div>
//               {topMovers.length === 0
//                 ? <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Loading stocks...</div>
//                 : topMovers.map(s => <StockRow key={s.sym} s={s} onAnalyze={handleAnalyze} />)
//               }
//             </div>
//           </div>
//         </div>
//       )}

//       {/* AI ANALYSIS */}
//       {activeTab === 'analysis' && (
//         <div className="fade-in">
//           <UpstoxAI stocks={stocks} indices={indices} preSelected={aiStock} />
//         </div>
//       )}

//       {/* WATCHLIST */}
//       {activeTab === 'watchlist' && (
//         <div className="fade-in panel">
//           <div className="panel-header">
//             <div className="panel-title">⭐ Watchlist — Upstox Live Prices</div>
//             <div className="panel-sub">Refreshes every 30s</div>
//           </div>
//           <div className="search-bar">
//             <span>🔍</span>
//             <input placeholder="Search stocks..."
//               value={search} onChange={e => setSearch(e.target.value)} />
//           </div>
//           <table className="data-table">
//             <thead>
//               <tr><th>Symbol</th><th>Company</th><th>Price</th><th>Change</th><th>High</th><th>Low</th><th>Volume</th><th>Action</th></tr>
//             </thead>
//             <tbody>
//               {filtered.map(s => (
//                 <tr key={s.sym}>
//                   <td style={{ fontWeight: 600 }}>{s.sym}</td>
//                   <td style={{ color: 'var(--text-secondary)' }}>{s.name}</td>
//                   <td style={{ fontFamily: 'DM Mono' }}>{s.price ? '₹' + fmt(s.price) : '---'}</td>
//                   <td><ChgBadge change={s.change} chgPct={s.chgPct} /></td>
//                   <td style={{ color: 'var(--green)', fontFamily: 'DM Mono' }}>{s.high ? '₹' + fmt(s.high) : '---'}</td>
//                   <td style={{ color: 'var(--red)', fontFamily: 'DM Mono' }}>{s.low ? '₹' + fmt(s.low) : '---'}</td>
//                   <td style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>{s.volume ? (s.volume / 1e6).toFixed(2) + 'M' : '---'}</td>
//                   <td>
//                     <button onClick={() => handleAnalyze(s)} style={{
//                       background: 'var(--gold)', color: '#000', border: 'none',
//                       borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer'
//                     }}>Analyze</button>
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       )}

//       {/* GAINERS / LOSERS */}
//       {activeTab === 'gainers' && (
//         <div className="fade-in bottom-grid">
//           <div className="panel">
//             <div className="panel-header">
//               <div className="panel-title">🟢 Top Gainers</div>
//               <div className="panel-sub">Real-time Upstox</div>
//             </div>
//             <table className="data-table">
//               <thead><tr><th>Stock</th><th>Company</th><th>Price</th><th>Change</th><th>High</th><th>Volume</th></tr></thead>
//               <tbody>
//                 {gainers.map(s => (
//                   <tr key={s.sym} style={{ cursor: 'pointer' }} onClick={() => handleAnalyze(s)}>
//                     <td style={{ fontWeight: 600 }}>{s.sym}</td>
//                     <td style={{ color: 'var(--text-muted)' }}>{s.name}</td>
//                     <td style={{ fontFamily: 'DM Mono' }}>₹{fmt(s.price)}</td>
//                     <td style={{ color: 'var(--green)', fontFamily: 'DM Mono' }}>+{s.chgPct?.toFixed(2)}%</td>
//                     <td style={{ fontFamily: 'DM Mono' }}>₹{fmt(s.high)}</td>
//                     <td style={{ color: 'var(--text-muted)' }}>{s.volume ? (s.volume / 1e6).toFixed(2) + 'M' : '---'}</td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>

//           <div className="panel">
//             <div className="panel-header">
//               <div className="panel-title">🔴 Top Losers</div>
//               <div className="panel-sub">Real-time Upstox</div>
//             </div>
//             <table className="data-table">
//               <thead><tr><th>Stock</th><th>Company</th><th>Price</th><th>Change</th><th>Low</th><th>Volume</th></tr></thead>
//               <tbody>
//                 {losers.map(s => (
//                   <tr key={s.sym} style={{ cursor: 'pointer' }} onClick={() => handleAnalyze(s)}>
//                     <td style={{ fontWeight: 600 }}>{s.sym}</td>
//                     <td style={{ color: 'var(--text-muted)' }}>{s.name}</td>
//                     <td style={{ fontFamily: 'DM Mono' }}>₹{fmt(s.price)}</td>
//                     <td style={{ color: 'var(--red)', fontFamily: 'DM Mono' }}>{s.chgPct?.toFixed(2)}%</td>
//                     <td style={{ fontFamily: 'DM Mono' }}>₹{fmt(s.low)}</td>
//                     <td style={{ color: 'var(--text-muted)' }}>{s.volume ? (s.volume / 1e6).toFixed(2) + 'M' : '---'}</td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         </div>
//       )}

//       {/* F&O OPTIONS */}
//       {activeTab === 'fno' && (
//         <div className="fade-in">
//           <FnOOptionsChain indices={indices} />
//         </div>
//       )}


//       {activeTab === 'signals' && (
//   <UpstoxSignals indices={indices} stocks={stocks} />
// )}

// {activeTab === 'planner' && <IntradayPlanner indices={indices} />}
// {activeTab === 'tracker' && <OptionTracker />}

// {activeTab === 'scanner'   && <MarketScanner indices={indices} />}
// {activeTab === 'paper'     && <PaperTrading />}
// {activeTab === 'journal'   && <TradeJournal />}
// {activeTab === 'portfolio' && <PortfolioTracker />}
// {activeTab === 'backtest' && <Backtesting />}
// {activeTab === 'alerts' && <PriceAlerts indices={indices} />}


//     </div>
//   );
// }







