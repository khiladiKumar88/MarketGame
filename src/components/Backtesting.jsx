// src/components/Backtesting.jsx
import { useState, useRef } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid
} from 'recharts';
import { fetchUpstoxCandles } from '../hooks/useUpstoxData';

// ── Helpers ─────────────────────────────────────────────────
function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '---';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Indicators ───────────────────────────────────────────────
function ema(arr, p) {
  if (arr.length < p) return [];
  const k = 2 / (p + 1);
  const result = new Array(p - 1).fill(null);
  let e = arr.slice(0, p).reduce((a, b) => a + b) / p;
  result.push(e);
  for (let i = p; i < arr.length; i++) { e = arr[i] * k + e * (1 - k); result.push(e); }
  return result;
}

function calcRSISeries(candles, p = 14) {
  const closes = candles.map(c => c.close);
  const result = new Array(p).fill(null);
  for (let i = p; i < closes.length; i++) {
    const slice = closes.slice(i - p, i + 1);
    const ch = slice.map((v, j) => j === 0 ? 0 : v - slice[j - 1]).slice(1);
    const ag = ch.map(x => x > 0 ? x : 0).reduce((a, b) => a + b) / p;
    const al = ch.map(x => x < 0 ? -x : 0).reduce((a, b) => a + b) / p;
    result.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return result;
}

function calcMACDSeries(candles) {
  const closes = candles.map(c => c.close);
  const e12arr = ema(closes, 12);
  const e26arr = ema(closes, 26);
  const macdLine = closes.map((_, i) =>
    e12arr[i] != null && e26arr[i] != null ? e12arr[i] - e26arr[i] : null
  );
  const macdVals = macdLine.filter(v => v != null);
  const signalRaw = ema(macdVals, 9);
  let sigIdx = 0;
  const signalLine = macdLine.map(v => v == null ? null : signalRaw[sigIdx++] ?? null);
  return macdLine.map((m, i) => ({
    macd: m,
    signal: signalLine[i],
    hist: m != null && signalLine[i] != null ? m - signalLine[i] : null,
    bull: m != null && signalLine[i] != null ? m > signalLine[i] : null,
  }));
}

function calcBBSeries(candles, p = 20) {
  return candles.map((_, i) => {
    if (i < p - 1) return { upper: null, lower: null, mid: null, pct: null };
    const cl = candles.slice(i - p + 1, i + 1).map(c => c.close);
    const mean = cl.reduce((a, b) => a + b) / p;
    const std = Math.sqrt(cl.reduce((a, b) => a + (b - mean) ** 2, 0) / p);
    const upper = mean + 2 * std, lower = mean - 2 * std;
    const last = candles[i].close;
    return { upper, lower, mid: mean, pct: (last - lower) / (upper - lower) * 100 };
  });
}

function calcSTSeries(candles, p = 7, m = 3) {
  const result = new Array(p + 1).fill(null);
  for (let i = p + 1; i < candles.length; i++) {
    const sl = candles.slice(i - p - 1, i + 1);
    const atrs = [];
    for (let j = 1; j < sl.length; j++) {
      const h = sl[j].high, l = sl[j].low, pc = sl[j - 1].close;
      atrs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const atr = atrs.reduce((a, b) => a + b) / p;
    const last = sl[sl.length - 1];
    const hl2 = (last.high + last.low) / 2;
    result.push(last.close > hl2 - m * atr ? 'UP' : 'DOWN');
  }
  return result;
}

function calcVWAPSeries(candles) {
  return candles.map((_, i) => {
    const sl = candles.slice(Math.max(0, i - 19), i + 1);
    let pv = 0, v = 0;
    sl.forEach(c => { const t = (c.high + c.low + c.close) / 3; pv += t * (c.volume || 1); v += (c.volume || 1); });
    return pv / v;
  });
}

// ── Strategy Definitions ─────────────────────────────────────
const STRATEGIES = {
  'RSI + Supertrend': {
    desc: 'Buy when RSI < 40 + Supertrend UP. Sell when RSI > 60 + Supertrend DOWN.',
    generate: (candles, rsi, macd, bb, st) =>
      candles.map((c, i) => {
        if (!rsi[i] || !st[i]) return 'NONE';
        if (rsi[i] < 40 && st[i] === 'UP')   return 'BUY';
        if (rsi[i] > 60 && st[i] === 'DOWN') return 'SELL';
        return 'NONE';
      }),
  },
  'MACD + Supertrend': {
    desc: 'Buy when MACD bullish crossover + Supertrend UP. Sell on reversal.',
    generate: (candles, rsi, macd, bb, st) =>
      candles.map((c, i) => {
        if (!macd[i]?.bull == null || !st[i]) return 'NONE';
        if (macd[i].bull && st[i] === 'UP')   return 'BUY';
        if (!macd[i].bull && st[i] === 'DOWN') return 'SELL';
        return 'NONE';
      }),
  },
  'RSI + MACD + BB': {
    desc: 'Buy when RSI oversold + MACD bullish + price below BB mid. Sell on reversal.',
    generate: (candles, rsi, macd, bb, st) =>
      candles.map((c, i) => {
        if (!rsi[i] || !macd[i] || !bb[i].pct) return 'NONE';
        if (rsi[i] < 45 && macd[i].bull && bb[i].pct < 50) return 'BUY';
        if (rsi[i] > 55 && !macd[i].bull && bb[i].pct > 50) return 'SELL';
        return 'NONE';
      }),
  },
  'Full AI Strategy': {
    desc: 'All 5 indicators must agree: RSI + MACD + Supertrend + BB + VWAP.',
    generate: (candles, rsi, macd, bb, st, vwap) =>
      candles.map((c, i) => {
        if (!rsi[i] || !macd[i] || !bb[i].pct || !st[i] || !vwap[i]) return 'NONE';
        const bullCount = [
          rsi[i] < 50, macd[i].bull, bb[i].pct < 50, st[i] === 'UP', c.close > vwap[i]
        ].filter(Boolean).length;
        const bearCount = [
          rsi[i] > 50, !macd[i].bull, bb[i].pct > 50, st[i] === 'DOWN', c.close < vwap[i]
        ].filter(Boolean).length;
        if (bullCount >= 4) return 'BUY';
        if (bearCount >= 4) return 'SELL';
        return 'NONE';
      }),
  },
};

// ── Backtest Engine ──────────────────────────────────────────
function runBacktest(candles, signals, config) {
  const { capital, slPct, tpPct, holdingDays } = config;
  const trades = [];
  let inTrade = false;
  let entry = null;

  for (let i = 1; i < candles.length; i++) {
    const sig  = signals[i];
    const prev = signals[i - 1];
    const c    = candles[i];

    if (!inTrade) {
      // Enter on signal change to BUY
      if (sig === 'BUY' && prev !== 'BUY') {
        entry = { idx: i, price: c.close, date: c.time, signal: 'BUY' };
        inTrade = true;
      }
    } else if (entry) {
      const pct = (c.close - entry.price) / entry.price * 100;
      const held = i - entry.idx;
      let exit = null;

      if (pct <= -slPct)               exit = { reason: 'Stop Loss',   price: c.close };
      else if (pct >= tpPct)           exit = { reason: 'Take Profit', price: c.close };
      else if (held >= holdingDays)    exit = { reason: 'Time Exit',   price: c.close };
      else if (sig === 'SELL')         exit = { reason: 'Signal Exit', price: c.close };

      if (exit) {
        const pnlPct = (exit.price - entry.price) / entry.price * 100;
        const shares = Math.floor(capital / entry.price);
        const pnl    = shares * (exit.price - entry.price);
        trades.push({
          id:       trades.length + 1,
          entryDate: entry.date,
          exitDate:  c.time,
          entryPrice: entry.price,
          exitPrice:  exit.price,
          pnlPct:    +pnlPct.toFixed(2),
          pnl:       +pnl.toFixed(2),
          shares,
          reason:    exit.reason,
          held,
          win:       pnl > 0,
        });
        inTrade = false;
        entry = null;
      }
    }
  }

  if (!trades.length) return null;

  // Stats
  const wins     = trades.filter(t => t.win);
  const losses   = trades.filter(t => !t.win);
  const totalPnl = trades.reduce((a, t) => a + t.pnl, 0);
  const winRate  = Math.round(wins.length / trades.length * 100);
  const avgWin   = wins.length   ? wins.reduce((a, t) => a + t.pnl, 0) / wins.length : 0;
  const avgLoss  = losses.length ? losses.reduce((a, t) => a + t.pnl, 0) / losses.length : 0;
  const maxWin   = wins.length   ? Math.max(...wins.map(t => t.pnl))   : 0;
  const maxLoss  = losses.length ? Math.min(...losses.map(t => t.pnl)) : 0;

  // Equity curve
  let equity = capital;
  const equityCurve = [{ date: candles[0].time, equity: capital, trade: 0 }];
  trades.forEach(t => {
    equity += t.pnl;
    equityCurve.push({ date: t.exitDate, equity: +equity.toFixed(2), trade: +t.pnl.toFixed(2) });
  });

  // Max drawdown
  let peak = capital, maxDD = 0;
  equityCurve.forEach(p => {
    if (p.equity > peak) peak = p.equity;
    const dd = (peak - p.equity) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  });

  // Consecutive wins/losses
  let maxConsecWins = 0, maxConsecLoss = 0, curW = 0, curL = 0;
  trades.forEach(t => {
    if (t.win) { curW++; curL = 0; maxConsecWins = Math.max(maxConsecWins, curW); }
    else       { curL++; curW = 0; maxConsecLoss = Math.max(maxConsecLoss, curL); }
  });

  return {
    trades, equityCurve, totalPnl, winRate, avgWin, avgLoss,
    maxWin, maxLoss, maxDD: +maxDD.toFixed(2),
    finalEquity: equity, returnPct: +((equity - capital) / capital * 100).toFixed(2),
    maxConsecWins, maxConsecLoss,
    totalTrades: trades.length, wins: wins.length, losses: losses.length,
    avgHoldingDays: +(trades.reduce((a, t) => a + t.held, 0) / trades.length).toFixed(1),
    profitFactor: avgLoss ? +(Math.abs(avgWin * wins.length) / Math.abs(avgLoss * losses.length)).toFixed(2) : 999,
  };
}

// ── Trade Table Row ──────────────────────────────────────────
function TradeRow({ t, i }) {
  return (
    <tr style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
      <td style={{ fontFamily: 'DM Mono', color: 'var(--text-muted)', fontSize: 11 }}>#{t.id}</td>
      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.entryDate}</td>
      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.exitDate}</td>
      <td style={{ fontFamily: 'DM Mono' }}>₹{fmt(t.entryPrice)}</td>
      <td style={{ fontFamily: 'DM Mono', color: t.win ? 'var(--green)' : 'var(--red)' }}>₹{fmt(t.exitPrice)}</td>
      <td style={{ fontFamily: 'DM Mono', fontWeight: 700, color: t.win ? 'var(--green)' : 'var(--red)' }}>
        {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct}%
      </td>
      <td style={{ fontFamily: 'DM Mono', fontWeight: 700, color: t.win ? 'var(--green)' : 'var(--red)' }}>
        {t.pnl >= 0 ? '+' : ''}₹{fmt(Math.abs(t.pnl), 0)}
      </td>
      <td style={{ fontSize: 11 }}>
        <span style={{
          padding: '2px 8px', borderRadius: 10, fontSize: 10,
          background: t.reason === 'Take Profit' ? 'rgba(34,197,94,0.15)' : t.reason === 'Stop Loss' ? 'rgba(239,68,68,0.15)' : 'rgba(201,168,76,0.15)',
          color: t.reason === 'Take Profit' ? 'var(--green)' : t.reason === 'Stop Loss' ? 'var(--red)' : 'var(--gold)',
        }}>{t.reason}</span>
      </td>
      <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>{t.held}d</td>
    </tr>
  );
}

// ── Stat Card ────────────────────────────────────────────────
function StatCard({ label, value, color, sub, big }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: big ? 26 : 20, fontWeight: 900, color: color || 'var(--text-primary)', fontFamily: 'DM Mono' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────
export default function Backtesting() {
  const TARGETS = [
    { sym: 'NIFTY 50',    token: 'NSE_INDEX|Nifty 50'          },
    { sym: 'BANK NIFTY',  token: 'NSE_INDEX|Nifty Bank'        },
    { sym: 'FIN NIFTY',   token: 'NSE_INDEX|Nifty Fin Service' },
    { sym: 'RELIANCE',    token: 'NSE_EQ|INE002A01018'         },
    { sym: 'TCS',         token: 'NSE_EQ|INE467B01029'         },
    { sym: 'HDFCBANK',    token: 'NSE_EQ|INE040A01034'         },
    { sym: 'INFY',        token: 'NSE_EQ|INE009A01021'         },
    { sym: 'ICICIBANK',   token: 'NSE_EQ|INE090A01021'         },
    { sym: 'SBIN',        token: 'NSE_EQ|INE062A01020'         },
    { sym: 'BAJFINANCE',  token: 'NSE_EQ|INE296A01024'         },
    { sym: 'TATAMOTORS',  token: 'NSE_EQ|INE155A01022'         },
  ];

  const [symbol,      setSymbol]      = useState('NIFTY 50');
  const [strategy,    setStrategy]    = useState('Full AI Strategy');
  const [capital,     setCapital]     = useState(100000);
  const [slPct,       setSlPct]       = useState(3);
  const [tpPct,       setTpPct]       = useState(6);
  const [holdDays,    setHoldDays]    = useState(5);
  const [candleCount, setCandleCount] = useState(200);
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState(null);
  const [error,       setError]       = useState('');
  const [showTrades,  setShowTrades]  = useState(false);
  const [activeChart, setActiveChart] = useState('equity');

  async function runTest() {
    setLoading(true); setResult(null); setError('');
    try {
      const target = TARGETS.find(t => t.sym === symbol);
      const candles = await fetchUpstoxCandles(target.token, 'day');
      if (!candles || candles.length < 50) throw new Error('Not enough historical data. Need at least 50 candles.');

      const slice = candles.slice(-candleCount);

      // Compute all indicator series
      const rsi   = calcRSISeries(slice);
      const macd  = calcMACDSeries(slice);
      const bb    = calcBBSeries(slice);
      const st    = calcSTSeries(slice);
      const vwap  = calcVWAPSeries(slice);

      const strat   = STRATEGIES[strategy];
      const signals = strat.generate(slice, rsi, macd, bb, st, vwap);
      const res     = runBacktest(slice, signals, { capital, slPct, tpPct, holdingDays: holdDays });

      if (!res) throw new Error('No trades were generated. Try a different strategy or longer period.');
      setResult(res);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const r = result;

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,rgba(251,191,36,0.1),rgba(10,14,26,0))',
        border: '1px solid rgba(251,191,36,0.25)', borderRadius: 14,
        padding: '16px 22px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: 28 }}>🧪</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Strategy Backtester</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Test your signal strategy on historical data · See what would have happened
          </div>
        </div>
      </div>

      {/* Config panel */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
          ⚙️ Test Configuration
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14, marginBottom: 16 }}>
          {/* Symbol */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Stock / Index</div>
            <select value={symbol} onChange={e => setSymbol(e.target.value)} className="ai-select" style={{ width: '100%' }}>
              {TARGETS.map(t => <option key={t.sym}>{t.sym}</option>)}
            </select>
          </div>

          {/* Strategy */}
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Strategy</div>
            <select value={strategy} onChange={e => setStrategy(e.target.value)} className="ai-select" style={{ width: '100%' }}>
              {Object.keys(STRATEGIES).map(s => <option key={s}>{s}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{STRATEGIES[strategy].desc}</div>
          </div>

          {/* Capital */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 6, fontWeight: 600 }}>Starting Capital ₹</div>
            <input type="number" value={capital} onChange={e => setCapital(Number(e.target.value))}
              style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'DM Mono', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Candle count */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>History (candles)</div>
            <select value={candleCount} onChange={e => setCandleCount(Number(e.target.value))} className="ai-select" style={{ width: '100%' }}>
              {[100, 200, 300, 500].map(n => <option key={n} value={n}>{n} days (~{Math.round(n / 20)} months)</option>)}
            </select>
          </div>

          {/* SL */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 6, fontWeight: 600 }}>Stop Loss %</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[2, 3, 5, 7].map(n => (
                <button key={n} onClick={() => setSlPct(n)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, border: '1px solid',
                  borderColor: slPct === n ? 'var(--red)' : 'var(--border)',
                  background: slPct === n ? 'rgba(239,68,68,0.15)' : 'var(--bg-primary)',
                  color: slPct === n ? 'var(--red)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}>{n}%</button>
              ))}
            </div>
          </div>

          {/* TP */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--green)', marginBottom: 6, fontWeight: 600 }}>Take Profit %</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[4, 6, 8, 10].map(n => (
                <button key={n} onClick={() => setTpPct(n)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, border: '1px solid',
                  borderColor: tpPct === n ? 'var(--green)' : 'var(--border)',
                  background: tpPct === n ? 'rgba(34,197,94,0.15)' : 'var(--bg-primary)',
                  color: tpPct === n ? 'var(--green)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}>{n}%</button>
              ))}
            </div>
          </div>

          {/* Hold days */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Max Hold Days</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[3, 5, 7, 10].map(n => (
                <button key={n} onClick={() => setHoldDays(n)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, border: '1px solid',
                  borderColor: holdDays === n ? 'var(--blue)' : 'var(--border)',
                  background: holdDays === n ? 'rgba(59,130,246,0.15)' : 'var(--bg-primary)',
                  color: holdDays === n ? 'var(--blue)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}>{n}d</button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={runTest} disabled={loading} style={{
          width: '100%', padding: '14px', borderRadius: 10, border: 'none',
          background: loading ? 'var(--bg-primary)' : 'linear-gradient(135deg,#fbbf24,#d97706)',
          color: loading ? 'var(--text-muted)' : '#000', fontSize: 15, fontWeight: 800,
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10
        }}>
          {loading
            ? <><div className="loader" style={{ width: 18, height: 18, borderWidth: 2 }} /> Running Backtest...</>
            : '▶ Run Backtest on ' + symbol}
        </button>

        {error && (
          <div style={{ marginTop: 12, padding: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Results */}
      {r && (
        <div className="fade-in">
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10, marginBottom: 20 }}>
            <StatCard label="Total Return" big
              value={(r.returnPct >= 0 ? '+' : '') + r.returnPct + '%'}
              color={r.returnPct >= 0 ? 'var(--green)' : 'var(--red)'}
              sub={'₹' + fmt(Math.abs(r.totalPnl), 0) + ' P&L'} />
            <StatCard label="Win Rate"
              value={r.winRate + '%'}
              color={r.winRate >= 50 ? 'var(--green)' : 'var(--red)'}
              sub={r.wins + 'W / ' + r.losses + 'L'} />
            <StatCard label="Total Trades"
              value={r.totalTrades}
              sub={'Avg hold ' + r.avgHoldingDays + 'd'} />
            <StatCard label="Profit Factor"
              value={r.profitFactor}
              color={r.profitFactor >= 1.5 ? 'var(--green)' : r.profitFactor >= 1 ? 'var(--gold)' : 'var(--red)'}
              sub={r.profitFactor >= 1.5 ? 'Excellent' : r.profitFactor >= 1 ? 'Acceptable' : 'Needs work'} />
            <StatCard label="Max Drawdown"
              value={r.maxDD + '%'}
              color={r.maxDD < 5 ? 'var(--green)' : r.maxDD < 15 ? 'var(--gold)' : 'var(--red)'}
              sub={'From peak'} />
            <StatCard label="Avg Win"
              value={'+₹' + fmt(r.avgWin, 0)}
              color="var(--green)" />
            <StatCard label="Avg Loss"
              value={'-₹' + fmt(Math.abs(r.avgLoss), 0)}
              color="var(--red)" />
            <StatCard label="Best Trade"
              value={'+₹' + fmt(r.maxWin, 0)}
              color="var(--green)" />
            <StatCard label="Worst Trade"
              value={'-₹' + fmt(Math.abs(r.maxLoss), 0)}
              color="var(--red)" />
            <StatCard label="Max Consec Wins"
              value={r.maxConsecWins}
              color="var(--green)" />
            <StatCard label="Max Consec Loss"
              value={r.maxConsecLoss}
              color="var(--red)" />
            <StatCard label="Final Capital"
              value={'₹' + fmt(r.finalEquity, 0)}
              color={r.finalEquity >= capital ? 'var(--green)' : 'var(--red)'}
              sub={'Started ₹' + fmt(capital, 0)} />
          </div>

          {/* Strategy rating */}
          <div style={{
            marginBottom: 20, padding: '14px 20px', borderRadius: 12,
            background: r.winRate >= 55 && r.profitFactor >= 1.5
              ? 'rgba(34,197,94,0.08)' : r.winRate >= 45 && r.profitFactor >= 1
              ? 'rgba(201,168,76,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${r.winRate >= 55 && r.profitFactor >= 1.5
              ? 'rgba(34,197,94,0.3)' : r.winRate >= 45 && r.profitFactor >= 1
              ? 'rgba(201,168,76,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {r.winRate >= 55 && r.profitFactor >= 1.5 ? '✅ Strong Strategy'
                    : r.winRate >= 45 && r.profitFactor >= 1 ? '⚠️ Average Strategy'
                    : '❌ Weak Strategy'} — {strategy} on {symbol}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {r.winRate >= 55 && r.profitFactor >= 1.5
                    ? 'This strategy has good win rate and profit factor. Worth trading with proper risk management.'
                    : r.winRate >= 45 && r.profitFactor >= 1
                    ? 'Borderline strategy. Consider tightening stop loss or only trading high-confidence signals.'
                    : 'This strategy underperforms on this instrument. Try different parameters or a different strategy.'}
                </div>
              </div>
              <div style={{ fontSize: 28 }}>
                {r.winRate >= 55 && r.profitFactor >= 1.5 ? '💚' : r.winRate >= 45 && r.profitFactor >= 1 ? '💛' : '🔴'}
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="panel" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[['equity', '📈 Equity Curve'], ['pnl', '📊 Trade P&L']].map(([k, l]) => (
                <button key={k} onClick={() => setActiveChart(k)} style={{
                  padding: '7px 16px', borderRadius: 7, border: '1px solid',
                  borderColor: activeChart === k ? 'var(--gold)' : 'var(--border)',
                  background: activeChart === k ? 'rgba(201,168,76,0.15)' : 'var(--bg-secondary)',
                  color: activeChart === k ? 'var(--gold)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}>{l}</button>
              ))}
            </div>

            {activeChart === 'equity' && (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={r.equityCurve} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={r.returnPct >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={r.returnPct >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fill: '#4a5578', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: '#4a5578', fontSize: 10, fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} orientation="right" tickFormatter={v => '₹' + (v / 1000).toFixed(0) + 'K'} />
                  <ReferenceLine y={capital} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                  <Tooltip contentStyle={{ background: '#131829', border: '1px solid #1e2640', borderRadius: 8, fontFamily: 'DM Mono', fontSize: 12 }}
                    formatter={(v, n) => [n === 'equity' ? '₹' + fmt(v, 0) : (v >= 0 ? '+' : '') + '₹' + fmt(v, 0), n === 'equity' ? 'Portfolio' : 'Trade P&L']} />
                  <Area type="monotone" dataKey="equity" stroke={r.returnPct >= 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} fill="url(#eqGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {activeChart === 'pnl' && (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={r.trades} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="id" tick={{ fill: '#4a5578', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#4a5578', fontSize: 10, fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} orientation="right" tickFormatter={v => '₹' + (v / 1000).toFixed(0) + 'K'} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Tooltip contentStyle={{ background: '#131829', border: '1px solid #1e2640', borderRadius: 8, fontFamily: 'DM Mono', fontSize: 12 }}
                    formatter={v => [(v >= 0 ? '+' : '') + '₹' + fmt(v, 0), 'P&L']} />
                  <Bar dataKey="pnl" fill="#22c55e" radius={[3, 3, 0, 0]}
                    label={false}
                    style={{ fill: 'url(#barGrad)' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Trade log */}
          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                📋 All {r.totalTrades} Trades
              </div>
              <button onClick={() => setShowTrades(s => !s)} style={{
                padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer'
              }}>{showTrades ? 'Hide' : 'Show All'}</button>
            </div>

            {showTrades && (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr><th>#</th><th>Entry</th><th>Exit</th><th>Entry ₹</th><th>Exit ₹</th><th>Return</th><th>P&L</th><th>Reason</th><th>Days</th></tr>
                  </thead>
                  <tbody>
                    {r.trades.map((t, i) => <TradeRow key={t.id} t={t} i={i} />)}
                  </tbody>
                </table>
              </div>
            )}

            {!showTrades && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 8 }}>
                {r.trades.slice(0, 6).map(t => (
                  <div key={t.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 8,
                    border: `1px solid ${t.win ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Trade #{t.id}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.entryDate} → {t.exitDate}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{t.reason}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: t.win ? 'var(--green)' : 'var(--red)', fontFamily: 'DM Mono' }}>
                        {t.pnl >= 0 ? '+' : ''}₹{fmt(Math.abs(t.pnl), 0)}
                      </div>
                      <div style={{ fontSize: 11, color: t.win ? 'var(--green)' : 'var(--red)' }}>
                        {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct}%
                      </div>
                    </div>
                  </div>
                ))}
                {r.trades.length > 6 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 14px',
                    background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)',
                    color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
                    onClick={() => setShowTrades(true)}>
                    +{r.trades.length - 6} more trades →
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <div style={{ marginTop: 14, padding: 12, background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            ⚠️ Backtesting shows past performance only. Past results do NOT guarantee future returns. This is for educational purposes and strategy testing only. Always use proper risk management with real money.
          </div>
        </div>
      )}

      {/* Empty state */}
      {!r && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧪</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Ready to Backtest</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto 20px', lineHeight: 1.8 }}>
            Configure your strategy above and click <strong>"Run Backtest"</strong> to see how it would have performed on real historical data.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {Object.entries(STRATEGIES).map(([name, s]) => (
              <div key={name} style={{ padding: '8px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}