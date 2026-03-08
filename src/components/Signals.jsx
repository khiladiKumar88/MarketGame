import { useState, useEffect, useRef } from 'react';
import { useStocks, INDICES } from '../hooks/useMarketData';

const GROQ_KEY = 'YOUR-GROQ-KEY-HERE';

// ── Candle data generator (simulated OHLC) ─────────────────
function generateCandles(basePrice, count = 30, volatility = 0.015) {
  const candles = [];
  let price = basePrice * 0.92;
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.48) * volatility * price;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5 * price;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5 * price;
    const volume = Math.round(Math.random() * 1000000 + 500000);
    candles.push({ open, high, low, close, volume });
    price = close;
  }
  return candles;
}

// ── Technical Indicators ───────────────────────────────────
function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  const changes = candles.slice(-period - 1).map((c, i, arr) =>
    i === 0 ? 0 : c.close - arr[i - 1].close
  ).slice(1);
  const gains = changes.map(c => c > 0 ? c : 0);
  const losses = changes.map(c => c < 0 ? -c : 0);
  const avgGain = gains.reduce((a, b) => a + b) / period;
  const avgLoss = losses.reduce((a, b) => a + b) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

function calcMACD(candles) {
  const closes = candles.map(c => c.close);
  function ema(data, period) {
    const k = 2 / (period + 1);
    let emaVal = data[0];
    for (let i = 1; i < data.length; i++) emaVal = data[i] * k + emaVal * (1 - k);
    return emaVal;
  }
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macd = ema12 - ema26;
  const signal = macd * 0.85;
  return { macd: Math.round(macd * 100) / 100, signal: Math.round(signal * 100) / 100, histogram: Math.round((macd - signal) * 100) / 100 };
}

function calcBollinger(candles, period = 20) {
  const closes = candles.slice(-period).map(c => c.close);
  const mean = closes.reduce((a, b) => a + b) / period;
  const std = Math.sqrt(closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  const last = candles[candles.length - 1].close;
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std, price: last, pct: Math.round(((last - (mean - 2 * std)) / (4 * std)) * 100) };
}

function calcSMA(candles, period) {
  const closes = candles.slice(-period).map(c => c.close);
  return closes.reduce((a, b) => a + b) / period;
}

// ── Candlestick Pattern Detection ─────────────────────────
function detectPatterns(candles) {
  const patterns = [];
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;

  // Doji
  if (body < range * 0.1) {
    patterns.push({ name: 'Doji', signal: 'NEUTRAL', strength: 60,
      desc: 'Market is confused — buyers and sellers are equal. Big move coming soon!',
      candles: [prev2, prev, last] });
  }
  // Hammer
  if (lowerWick > body * 2 && upperWick < body * 0.5 && last.close > last.open) {
    patterns.push({ name: 'Hammer', signal: 'BUY', strength: 75,
      desc: 'Market fell hard but recovered strongly. Sellers tried to push down but buyers took control.',
      candles: [prev2, prev, last] });
  }
  // Shooting Star
  if (upperWick > body * 2 && lowerWick < body * 0.5 && last.close < last.open) {
    patterns.push({ name: 'Shooting Star', signal: 'SELL', strength: 72,
      desc: 'Market rose sharply but fell back. Buyers tried to push up but sellers took control.',
      candles: [prev2, prev, last] });
  }
  // Bullish Engulfing
  if (prev.close < prev.open && last.close > last.open &&
    last.open < prev.close && last.close > prev.open) {
    patterns.push({ name: 'Bullish Engulfing', signal: 'BUY', strength: 82,
      desc: 'Yesterday was red (bearish), today completely covered it in green. Strong buying signal!',
      candles: [prev2, prev, last] });
  }
  // Bearish Engulfing
  if (prev.close > prev.open && last.close < last.open &&
    last.open > prev.close && last.close < prev.open) {
    patterns.push({ name: 'Bearish Engulfing', signal: 'SELL', strength: 80,
      desc: 'Yesterday was green (bullish), today completely covered it in red. Strong selling signal!',
      candles: [prev2, prev, last] });
  }
  // Morning Star
  if (prev2.close < prev2.open &&
    Math.abs(prev.close - prev.open) < (prev2.high - prev2.low) * 0.3 &&
    last.close > last.open && last.close > (prev2.open + prev2.close) / 2) {
    patterns.push({ name: 'Morning Star', signal: 'BUY', strength: 85,
      desc: 'Three candle reversal pattern. After two down days, market bounces back strongly. Very bullish!',
      candles: [prev2, prev, last] });
  }
  // Evening Star
  if (prev2.close > prev2.open &&
    Math.abs(prev.close - prev.open) < (prev2.high - prev2.low) * 0.3 &&
    last.close < last.open && last.close < (prev2.open + prev2.close) / 2) {
    patterns.push({ name: 'Evening Star', signal: 'SELL', strength: 83,
      desc: 'Three candle reversal pattern. After two up days, market drops sharply. Very bearish!',
      candles: [prev2, prev, last] });
  }
  // Inside Bar
  if (last.high < prev.high && last.low > prev.low) {
    patterns.push({ name: 'Inside Bar', signal: 'NEUTRAL', strength: 65,
      desc: 'Market is consolidating inside yesterday\'s range. Breakout coming — watch closely!',
      candles: [prev2, prev, last] });
  }
  if (patterns.length === 0) {
    patterns.push({ name: 'No Pattern', signal: 'NEUTRAL', strength: 50,
      desc: 'No clear candlestick pattern detected. Wait for a clearer signal.',
      candles: [prev2, prev, last] });
  }
  return patterns;
}

// ── Mini Candlestick Chart ─────────────────────────────────
function MiniCandleChart({ candles, width = 120, height = 60 }) {
  const ref = useRef();
  useEffect(() => {
    if (!ref.current || !candles?.length) return;
    const ctx = ref.current.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    const allHighs = candles.map(c => c.high);
    const allLows = candles.map(c => c.low);
    const maxH = Math.max(...allHighs);
    const minL = Math.min(...allLows);
    const range = maxH - minL || 1;
    const padX = 8, candleW = (width - padX * 2) / candles.length - 2;
    const toY = v => height - ((v - minL) / range) * (height - 8) - 4;
    candles.forEach((c, i) => {
      const x = padX + i * ((width - padX * 2) / candles.length);
      const isGreen = c.close >= c.open;
      ctx.strokeStyle = isGreen ? '#22c55e' : '#ef4444';
      ctx.fillStyle = isGreen ? '#22c55e' : '#ef4444';
      // Wick
      ctx.beginPath();
      ctx.moveTo(x + candleW / 2, toY(c.high));
      ctx.lineTo(x + candleW / 2, toY(c.low));
      ctx.lineWidth = 1;
      ctx.stroke();
      // Body
      const bodyTop = toY(Math.max(c.open, c.close));
      const bodyBot = toY(Math.min(c.open, c.close));
      ctx.fillRect(x, bodyTop, candleW, Math.max(1, bodyBot - bodyTop));
    });
  }, [candles]);
  return <canvas ref={ref} width={width} height={height} style={{ display: 'block' }} />;
}

// ── Signal Card ────────────────────────────────────────────
function SignalCard({ sym, name, signal, reason, strength, timeframe, price, onDetails }) {
  const color = signal === 'BUY' ? 'var(--green)' : signal === 'SELL' ? 'var(--red)' : 'var(--gold)';
  const bg = signal === 'BUY' ? 'rgba(34,197,94,0.08)' : signal === 'SELL' ? 'rgba(239,68,68,0.08)' : 'rgba(201,168,76,0.08)';
  const border = signal === 'BUY' ? 'rgba(34,197,94,0.25)' : signal === 'SELL' ? 'rgba(239,68,68,0.25)' : 'rgba(201,168,76,0.25)';
  const icon = signal === 'BUY' ? '🟢' : signal === 'SELL' ? '🔴' : '🟡';

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: 'DM Mono', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{sym}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{name}</span>
          <span style={{ fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', color: 'var(--text-muted)' }}>{timeframe}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>{reason}</div>
        {price && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>₹{price?.toLocaleString('en-IN')}</div>}
      </div>
      <div style={{ textAlign: 'center', minWidth: 60 }}>
        <div style={{ fontFamily: 'DM Mono', fontSize: 22, fontWeight: 700, color }}>{signal}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{strength}% strength</div>
      </div>
      <button onClick={onDetails} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 14px', color: 'var(--gold)',
        fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        whiteSpace: 'nowrap', transition: 'all 0.15s'
      }}>Why? →</button>
    </div>
  );
}

// ── Detail Modal ───────────────────────────────────────────
function DetailModal({ data, onClose }) {
  if (!data) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, maxWidth: 600, width: '100%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{data.sym} — {data.signal}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.timeframe} · Strength: {data.strength}%</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer' }}>✕</button>
        </div>
        {data.candles && (
          <div style={{ marginBottom: 20, background: 'var(--bg-secondary)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Price Chart</div>
            <MiniCandleChart candles={data.candles} width={540} height={100} />
          </div>
        )}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>📊 Why this signal?</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{data.fullReason}</div>
        </div>
        {data.indicators && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {data.indicators.map((ind, i) => (
              <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>{ind.name}</div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 18, fontWeight: 600, color: ind.color }}>{ind.value}</div>
                <div style={{ fontSize: 10, color: ind.color, marginTop: 2 }}>{ind.label}</div>
              </div>
            ))}
          </div>
        )}
        {data.trade && (
          <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>💰 Trade Setup</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[['Entry', data.trade.entry, 'var(--blue)'], ['Target', data.trade.target, 'var(--green)'], ['Stop Loss', data.trade.sl, 'var(--red)']].map(([label, val, color]) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 600, color }}>₹{val?.toLocaleString('en-IN')}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────
export default function Signals() {
  const stocks = useStocks();
  const [activeTab, setActiveTab] = useState('quick');
  const [timeframe, setTimeframe] = useState('all');
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState([]);
  const [candleSignals, setCandleSignals] = useState([]);
  const [indicatorSignals, setIndicatorSignals] = useState([]);
  const [quickSignals, setQuickSignals] = useState([]);
  const [modal, setModal] = useState(null);
  const [generated, setGenerated] = useState(false);

  function generateAllSignals() {
    setScanning(true);
    setTimeout(() => {
      const allStocks = [
        ...INDICES.map(i => ({ sym: i.label, name: i.label, price: i.price || 24000 })),
        ...stocks.filter(s => s.price).map(s => ({ sym: s.sym, name: s.name, price: s.price }))
      ];

      // Quick signals
      const quick = allStocks.map(s => {
        const candles = generateCandles(s.price, 30);
        const rsi = calcRSI(candles);
        const macd = calcMACD(candles);
        const bb = calcBollinger(candles);
        const sma20 = calcSMA(candles, 20);
        const bullish = (rsi < 50 ? 1 : 0) + (macd.histogram > 0 ? 1 : 0) + (s.price < bb.middle ? 1 : 0) + (s.price > sma20 ? 1 : 0);
        const signal = bullish >= 3 ? 'BUY' : bullish <= 1 ? 'SELL' : 'HOLD';
        const strength = signal === 'BUY' ? 60 + bullish * 8 : signal === 'SELL' ? 80 - bullish * 8 : 50 + Math.random() * 20;
        const tfs = ['Intraday', 'Swing', 'Positional'];
        return {
          sym: s.sym, name: s.name, price: s.price, signal,
          strength: Math.round(strength),
          timeframe: tfs[Math.floor(Math.random() * tfs.length)],
          reason: signal === 'BUY'
            ? `RSI ${rsi} (oversold), MACD bullish, price near support`
            : signal === 'SELL'
            ? `RSI ${rsi} (overbought), MACD bearish, price near resistance`
            : `RSI ${rsi} neutral, mixed signals — wait for breakout`,
          fullReason: signal === 'BUY'
            ? `RSI is at ${rsi} which is in the oversold zone — this means the stock has been falling and is now cheap relative to recent prices. MACD histogram is positive (${macd.histogram}) showing buying momentum is building. Price is near the lower Bollinger Band (₹${bb.lower.toFixed(0)}) which acts as a strong support. These 3 signals together suggest a good buying opportunity.`
            : signal === 'SELL'
            ? `RSI is at ${rsi} which is in the overbought zone — this means the stock has risen too fast and may be due for a correction. MACD histogram is negative (${macd.histogram}) showing selling momentum. Price is near the upper Bollinger Band (₹${bb.upper.toFixed(0)}) which acts as resistance. Consider booking profits or avoiding fresh buying.`
            : `RSI at ${rsi} is in neutral territory. MACD is mixed with histogram at ${macd.histogram}. Price is between Bollinger Bands — no strong directional bias. Wait for a clear breakout above ₹${bb.upper.toFixed(0)} (bullish) or below ₹${bb.lower.toFixed(0)} (bearish).`,
          candles,
          indicators: [
            { name: 'RSI', value: rsi, color: rsi > 70 ? 'var(--red)' : rsi < 30 ? 'var(--green)' : 'var(--gold)', label: rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral' },
            { name: 'MACD', value: macd.histogram > 0 ? '+' + macd.histogram : macd.histogram, color: macd.histogram > 0 ? 'var(--green)' : 'var(--red)', label: macd.histogram > 0 ? 'Bullish' : 'Bearish' },
            { name: 'BB%', value: bb.pct + '%', color: bb.pct < 20 ? 'var(--green)' : bb.pct > 80 ? 'var(--red)' : 'var(--gold)', label: bb.pct < 20 ? 'Near Support' : bb.pct > 80 ? 'Near Resistance' : 'Mid Range' },
          ],
          trade: {
            entry: Math.round(s.price * 100) / 100,
            target: Math.round(s.price * (signal === 'BUY' ? 1.05 : 0.95) * 100) / 100,
            sl: Math.round(s.price * (signal === 'BUY' ? 0.97 : 1.03) * 100) / 100,
          }
        };
      });
      setQuickSignals(quick);

      // Candle signals
      const candle = allStocks.map(s => {
        const candles = generateCandles(s.price, 30);
        const patterns = detectPatterns(candles);
        const p = patterns[0];
        return {
          sym: s.sym, name: s.name, price: s.price,
          signal: p.signal, strength: p.strength,
          pattern: p.name, reason: p.desc,
          timeframe: 'Swing',
          fullReason: `The ${p.name} pattern was detected on the latest candles. ${p.desc} This is one of the most reliable candlestick patterns used by professional traders worldwide. The pattern formed at ₹${s.price.toLocaleString('en-IN')} which adds to its significance.`,
          candles: candles.slice(-10),
          indicators: [
            { name: 'Pattern', value: p.name.split(' ')[0], color: p.signal === 'BUY' ? 'var(--green)' : p.signal === 'SELL' ? 'var(--red)' : 'var(--gold)', label: p.signal },
            { name: 'Strength', value: p.strength + '%', color: p.strength > 75 ? 'var(--green)' : 'var(--gold)', label: p.strength > 75 ? 'Strong' : 'Moderate' },
            { name: 'Candles', value: '3', color: 'var(--blue)', label: 'Formation' },
          ],
          trade: {
            entry: Math.round(s.price * 100) / 100,
            target: Math.round(s.price * (p.signal === 'BUY' ? 1.04 : 0.96) * 100) / 100,
            sl: Math.round(s.price * (p.signal === 'BUY' ? 0.98 : 1.02) * 100) / 100,
          }
        };
      });
      setCandleSignals(candle);

      // Indicator signals
      const indicator = allStocks.map(s => {
        const candles = generateCandles(s.price, 50);
        const rsi = calcRSI(candles);
        const macd = calcMACD(candles);
        const bb = calcBollinger(candles);
        const sma20 = calcSMA(candles, 20);
        const sma50 = calcSMA(candles, 50);
        const bullCount = [rsi < 40, macd.histogram > 0, s.price < bb.middle, sma20 > sma50].filter(Boolean).length;
        const signal = bullCount >= 3 ? 'BUY' : bullCount <= 1 ? 'SELL' : 'HOLD';
        return {
          sym: s.sym, name: s.name, price: s.price, signal,
          strength: Math.round(50 + bullCount * 10 + Math.random() * 10),
          timeframe: 'All',
          reason: `RSI ${rsi} · MACD ${macd.histogram > 0 ? '▲' : '▼'} · BB ${bb.pct}% · SMA ${sma20 > sma50 ? '▲' : '▼'}`,
          fullReason: `RSI (${rsi}): ${rsi > 70 ? 'Overbought — stock has risen too fast' : rsi < 30 ? 'Oversold — stock has fallen too much, bounce likely' : 'Neutral zone'}. MACD Histogram (${macd.histogram}): ${macd.histogram > 0 ? 'Positive — buying momentum increasing' : 'Negative — selling momentum increasing'}. Bollinger Band position (${bb.pct}%): ${bb.pct < 20 ? 'Near lower band — support zone, good for buying' : bb.pct > 80 ? 'Near upper band — resistance zone, consider selling' : 'Middle range — no strong signal'}. SMA Cross: 20-day SMA is ${sma20 > sma50 ? 'above' : 'below'} 50-day SMA — ${sma20 > sma50 ? 'bullish' : 'bearish'} trend.`,
          candles: candles.slice(-15),
          indicators: [
            { name: 'RSI(14)', value: rsi, color: rsi > 70 ? 'var(--red)' : rsi < 30 ? 'var(--green)' : 'var(--gold)', label: rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral' },
            { name: 'MACD', value: macd.histogram, color: macd.histogram > 0 ? 'var(--green)' : 'var(--red)', label: macd.histogram > 0 ? 'Bullish' : 'Bearish' },
            { name: 'BB%', value: bb.pct + '%', color: bb.pct < 20 ? 'var(--green)' : bb.pct > 80 ? 'var(--red)' : 'var(--gold)', label: bb.pct < 20 ? 'Support' : bb.pct > 80 ? 'Resistance' : 'Middle' },
            { name: 'SMA Cross', value: sma20 > sma50 ? '▲' : '▼', color: sma20 > sma50 ? 'var(--green)' : 'var(--red)', label: sma20 > sma50 ? 'Bullish' : 'Bearish' },
          ],
          trade: {
            entry: Math.round(s.price * 100) / 100,
            target: Math.round(s.price * (signal === 'BUY' ? 1.06 : 0.94) * 100) / 100,
            sl: Math.round(s.price * (signal === 'BUY' ? 0.97 : 1.03) * 100) / 100,
          }
        };
      });
      setIndicatorSignals(indicator);

      // F&O Scanner
      const fno = allStocks.slice(0, 12).map(s => {
        const candles = generateCandles(s.price, 30);
        const rsi = calcRSI(candles);
        const macd = calcMACD(candles);
        const signal = rsi < 40 && macd.histogram > 0 ? 'BUY CE' : rsi > 60 && macd.histogram < 0 ? 'BUY PE' : 'WAIT';
        const strike = Math.round(s.price / 100) * 100;
        return {
          sym: s.sym, name: s.name, price: s.price,
          signal: signal === 'BUY CE' ? 'BUY' : signal === 'BUY PE' ? 'SELL' : 'HOLD',
          fnoSignal: signal,
          strength: Math.round(55 + Math.random() * 30),
          timeframe: 'Intraday',
          reason: signal === 'BUY CE'
            ? `RSI ${rsi} oversold + MACD bullish → Buy ${strike} CE`
            : signal === 'BUY PE'
            ? `RSI ${rsi} overbought + MACD bearish → Buy ${strike} PE`
            : `Mixed signals — wait for clarity`,
          fullReason: signal === 'BUY CE'
            ? `RSI at ${rsi} shows the stock is oversold (cheap). MACD histogram turning positive shows buyers are entering. Best trade: Buy ${s.sym} ${strike} Call Option (CE). If stock rises 1-2%, your CE can gain 30-50%.`
            : signal === 'BUY PE'
            ? `RSI at ${rsi} shows the stock is overbought (expensive). MACD histogram turning negative shows sellers taking control. Best trade: Buy ${s.sym} ${strike} Put Option (PE). If stock falls 1-2%, your PE can gain 30-50%.`
            : `RSI at ${rsi} and MACD histogram at ${macd.histogram} give mixed signals. It's better to wait for a clear RSI move below 35 (for CE) or above 65 (for PE) before entering an F&O trade.`,
          candles: candles.slice(-10),
          indicators: [
            { name: 'RSI', value: rsi, color: rsi > 60 ? 'var(--red)' : rsi < 40 ? 'var(--green)' : 'var(--gold)', label: rsi > 60 ? 'Overbought' : rsi < 40 ? 'Oversold' : 'Neutral' },
            { name: 'MACD', value: macd.histogram, color: macd.histogram > 0 ? 'var(--green)' : 'var(--red)', label: macd.histogram > 0 ? 'Bullish' : 'Bearish' },
            { name: 'Option', value: signal === 'BUY CE' ? 'CE' : signal === 'BUY PE' ? 'PE' : '—', color: signal === 'BUY CE' ? 'var(--green)' : signal === 'BUY PE' ? 'var(--red)' : 'var(--text-muted)', label: signal === 'WAIT' ? 'No Trade' : 'Recommended' },
          ],
          trade: {
            entry: Math.round(s.price * 0.025),
            target: Math.round(s.price * 0.04),
            sl: Math.round(s.price * 0.013),
          }
        };
      });
      setScanResults(fno);
      setGenerated(true);
      setScanning(false);
    }, 1800);
  }

  const filterByTf = arr => timeframe === 'all' ? arr : arr.filter(s =>
    s.timeframe.toLowerCase().includes(timeframe.toLowerCase())
  );

  const currentSignals = activeTab === 'quick' ? filterByTf(quickSignals)
    : activeTab === 'candle' ? filterByTf(candleSignals)
    : activeTab === 'indicator' ? filterByTf(indicatorSignals)
    : filterByTf(scanResults);

  const buys = currentSignals.filter(s => s.signal === 'BUY').length;
  const sells = currentSignals.filter(s => s.signal === 'SELL').length;
  const holds = currentSignals.filter(s => s.signal === 'HOLD').length;

  return (
    <div>
      {modal && <DetailModal data={modal} onClose={() => setModal(null)} />}

      {/* HEADER */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span className="ai-badge">✦ Signal Engine</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Market Signal Scanner</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Scan all stocks for Buy/Sell signals based on patterns, indicators & F&O data
            </div>
          </div>
          <button className="btn-analyze" onClick={generateAllSignals} disabled={scanning} style={{ minWidth: 160 }}>
            {scanning ? '⏳ Scanning...' : generated ? '🔄 Refresh Signals' : '🚀 Scan Market'}
          </button>
        </div>

        {/* Summary Bar */}
        {generated && (
          <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '10px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>{buys}</div>
              <div style={{ fontSize: 11, color: 'var(--green)' }}>BUY Signals</div>
            </div>
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 24, fontWeight: 700, color: 'var(--red)' }}>{sells}</div>
              <div style={{ fontSize: 11, color: 'var(--red)' }}>SELL Signals</div>
            </div>
            <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, padding: '10px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 24, fontWeight: 700, color: 'var(--gold)' }}>{holds}</div>
              <div style={{ fontSize: 11, color: 'var(--gold)' }}>HOLD / WAIT</div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Timeframe:</span>
              {['all', 'Intraday', 'Swing', 'Positional'].map(tf => (
                <button key={tf} onClick={() => setTimeframe(tf)} style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500,
                  background: timeframe === tf ? 'var(--gold)' : 'var(--bg-secondary)',
                  color: timeframe === tf ? '#000' : 'var(--text-muted)',
                  borderBottom: `1px solid var(--border)`
                }}>{tf === 'all' ? 'All' : tf}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SUB TABS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          ['quick', '⚡ Quick Signals', 'All indicators combined'],
          ['candle', '🕯️ Candlestick', 'Pattern detection'],
          ['indicator', '📊 Indicators', 'RSI, MACD, BB'],
          ['fno', '📈 F&O Scanner', 'Best options trade'],
        ].map(([key, label, sub]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)',
            cursor: 'pointer', fontFamily: 'DM Sans', textAlign: 'left',
            background: activeTab === key ? 'var(--gold)' : 'var(--bg-card)',
            color: activeTab === key ? '#000' : 'var(--text-primary)',
            transition: 'all 0.15s'
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{sub}</div>
          </button>
        ))}
      </div>

      {/* SIGNALS LIST */}
      {!generated ? (
        <div className="panel" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Ready to Scan</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
            Click "Scan Market" to analyze all stocks and indices for Buy/Sell signals across all timeframes.
          </div>
          <button className="btn-analyze" onClick={generateAllSignals}>🚀 Scan Market Now</button>
        </div>
      ) : scanning ? (
        <div className="panel">
          <div className="loader-wrap">
            <div className="loader"></div>
            <div className="loader-text">Scanning {stocks.length + INDICES.length} instruments...</div>
          </div>
        </div>
      ) : (
        <div className="panel fade-in">
          <div className="panel-header">
            <div className="panel-title">
              {activeTab === 'quick' ? '⚡ Quick Signals' : activeTab === 'candle' ? '🕯️ Candlestick Patterns' : activeTab === 'indicator' ? '📊 Indicator Signals' : '📈 F&O Scanner'}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                — {currentSignals.length} signals · Click "Why?" for full analysis + chart
              </span>
            </div>
          </div>

          {/* Candlestick Legend */}
          {activeTab === 'candle' && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px' }}>
              <span>🔨 Hammer = Bullish reversal</span>
              <span>⭐ Shooting Star = Bearish reversal</span>
              <span>📗 Bullish Engulfing = Strong buy</span>
              <span>📕 Bearish Engulfing = Strong sell</span>
              <span>🌅 Morning Star = Bullish (3 candles)</span>
              <span>🌆 Evening Star = Bearish (3 candles)</span>
            </div>
          )}

          {/* F&O Legend */}
          {activeTab === 'fno' && (
            <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
              💡 <strong>BUY</strong> = Buy Call Option (CE) — market expected to go UP &nbsp;|&nbsp;
              <strong>SELL</strong> = Buy Put Option (PE) — market expected to go DOWN &nbsp;|&nbsp;
              <strong>HOLD</strong> = Mixed signals, wait
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {currentSignals.map((s, i) => (
              <SignalCard
                key={i}
                sym={s.sym}
                name={s.name}
                signal={s.signal}
                reason={activeTab === 'candle' ? `${s.pattern} — ${s.reason}` : s.reason}
                strength={s.strength}
                timeframe={s.timeframe}
                price={s.price}
                onDetails={() => setModal(s)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="disclaimer" style={{ marginTop: 20 }}>
        ⚠️ Signals are generated using technical analysis on simulated price data for educational purposes. Not financial advice.
      </div>
    </div>
  );
}