// src/components/IntradayPlanner.jsx
import { useState, useEffect } from 'react';
import { fetchUpstoxCandles, UPSTOX_INDICES } from '../hooks/useUpstoxData';

const GROQ_KEY = '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';

// ── Helpers ─────────────────────────────────────────────────
function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '---';
  return n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function ema(arr, p) {
  if (arr.length < p) return null;
  const k = 2 / (p + 1);
  let e = arr.slice(0, p).reduce((a, b) => a + b) / p;
  for (let i = p; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}
function roundToStrike(price, step) {
  return Math.round(price / step) * step;
}
function getStrikeStep(sym) {
  return sym === 'BANKNIFTY' ? 100 : 50;
}
function getNow() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist;
}
function getMarketStatus() {
  const ist = getNow();
  const h = ist.getHours(), m = ist.getMinutes();
  const mins = h * 60 + m;
  if (mins < 9 * 60)           return { status: 'pre',    label: 'Pre-Market', color: 'var(--gold)' };
  if (mins < 9 * 60 + 15)      return { status: 'open15', label: 'Opening (9:00–9:15)', color: '#f7931a' };
  if (mins <= 15 * 60 + 30)    return { status: 'live',   label: 'Market Live', color: 'var(--green)' };
  return                               { status: 'closed', label: 'Market Closed', color: 'var(--red)' };
}

// ── Technical calculations ──────────────────────────────────
function calcSupRes(candles) {
  // Support = lowest low of last 10 candles, Resistance = highest high
  const recent = candles.slice(-10);
  const support    = Math.min(...recent.map(c => c.low));
  const resistance = Math.max(...recent.map(c => c.high));
  return { support: +support.toFixed(2), resistance: +resistance.toFixed(2) };
}
function calcPivot(candles) {
  if (!candles.length) return null;
  const prev = candles[candles.length - 2] ?? candles[candles.length - 1];
  const h = prev.high, l = prev.low, c = prev.close;
  const pivot = (h + l + c) / 3;
  return {
    pivot: +pivot.toFixed(2),
    r1:    +(2 * pivot - l).toFixed(2),
    r2:    +(pivot + (h - l)).toFixed(2),
    s1:    +(2 * pivot - h).toFixed(2),
    s2:    +(pivot - (h - l)).toFixed(2),
  };
}
function calcRSI(candles, p = 14) {
  if (candles.length < p + 1) return null;
  const ch = candles.slice(-p - 1).map((c, i, a) => i === 0 ? 0 : c.close - a[i - 1].close).slice(1);
  const ag = ch.map(x => x > 0 ? x : 0).reduce((a, b) => a + b) / p;
  const al = ch.map(x => x < 0 ? -x : 0).reduce((a, b) => a + b) / p;
  return al === 0 ? 100 : +((100 - 100 / (1 + ag / al)).toFixed(1));
}
function calcTrend(candles) {
  if (candles.length < 20) return 'SIDEWAYS';
  const closes = candles.map(c => c.close);
  const ema9  = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const last  = closes[closes.length - 1];
  if (ema9 > ema21 && last > ema9) return 'BULLISH';
  if (ema9 < ema21 && last < ema9) return 'BEARISH';
  return 'SIDEWAYS';
}
function calcVWAP(candles) {
  const sl = candles.slice(-20);
  let pv = 0, v = 0;
  sl.forEach(c => { const t = (c.high + c.low + c.close) / 3; pv += t * (c.volume || 1); v += (c.volume || 1); });
  return +(pv / v).toFixed(2);
}
function calcBBWidth(candles, p = 20) {
  if (candles.length < p) return null;
  const cl   = candles.slice(-p).map(c => c.close);
  const mean = cl.reduce((a, b) => a + b) / p;
  const std  = Math.sqrt(cl.reduce((a, b) => a + (b - mean) ** 2, 0) / p);
  return { width: +((4 * std / mean) * 100).toFixed(2), squeeze: std / mean < 0.008 };
}
function prevDayChange(candles) {
  if (candles.length < 2) return 0;
  const c = candles[candles.length - 1].close;
  const p = candles[candles.length - 2].close;
  return +((c - p) / p * 100).toFixed(2);
}

// ── AI Plan Generator ───────────────────────────────────────
async function generatePlan(symbol, data, capital) {
  const {
    price, rsi, trend, vwap, bbWidth, pivot, supRes,
    candles, prevChg
  } = data;

  const step    = getStrikeStep(symbol);
  const atmStrike = roundToStrike(price, step);
  const otmCallStrike = atmStrike + step;
  const otmPutStrike  = atmStrike - step;

  // Pre-calculate fallback values
  const direction = trend === 'BULLISH' ? 'CE' : trend === 'BEARISH' ? 'PE' : (rsi > 55 ? 'CE' : rsi < 45 ? 'PE' : 'CE');
  const estPrem   = symbol === 'BANKNIFTY' ? 200 : 100;
  const lotSize   = symbol === 'BANKNIFTY' ? 15  : 75;
  const lots      = Math.max(1, Math.floor(capital / (estPrem * lotSize)));
  const maxRisk   = lots * lotSize * estPrem;

  const prompt =
    'You are an expert NSE intraday options trader. Generate a precise trade plan for TODAY.\n\n' +
    'Index: ' + symbol + '\n' +
    'Current Price: ₹' + price.toFixed(2) + '\n' +
    'Previous Day Change: ' + prevChg + '%\n' +
    'Trend (EMA9 vs EMA21): ' + trend + '\n' +
    'RSI(14): ' + rsi + '\n' +
    'VWAP: ₹' + vwap + ' (price ' + (price > vwap ? 'ABOVE' : 'BELOW') + ')\n' +
    'Bollinger Width: ' + bbWidth?.width + '% ' + (bbWidth?.squeeze ? '(SQUEEZE - big move expected!)' : '') + '\n' +
    'Pivot: ₹' + pivot?.pivot + ' | R1: ₹' + pivot?.r1 + ' | R2: ₹' + pivot?.r2 + '\n' +
    'S1: ₹' + pivot?.s1 + ' | S2: ₹' + pivot?.s2 + '\n' +
    'Support: ₹' + supRes?.support + ' | Resistance: ₹' + supRes?.resistance + '\n' +
    'ATM Strike: ' + atmStrike + '\n' +
    'Trader Capital: ₹' + capital.toLocaleString('en-IN') + '\n' +
    'Estimated lots possible: ' + lots + '\n\n' +
    'Rules:\n' +
    '- Only ONE trade direction: CE (bullish) or PE (bearish)\n' +
    '- Entry ONLY between 9:15 AM and 10:30 AM\n' +
    '- MUST exit by 3:15 PM no matter what\n' +
    '- Strike should be ATM or one step OTM for best risk/reward\n' +
    '- All prices in INR\n\n' +
    'Respond with ONLY this JSON (no markdown):\n' +
    '{"direction":"CE or PE",' +
    '"strike":' + atmStrike + ',' +
    '"optionName":"' + symbol + ' ' + atmStrike + ' CE Weekly",' +
    '"entryPremium":"₹XX–₹YY",' +
    '"entryTimeWindow":"9:15 AM – 10:00 AM",' +
    '"target1Premium":"₹XX (+XX%)",' +
    '"target2Premium":"₹XX (+XX%)",' +
    '"slPremium":"₹XX (-XX%)",' +
    '"mandatoryExitTime":"3:15 PM",' +
    '"lots":' + lots + ',' +
    '"lotSize":' + lotSize + ',' +
    '"capitalAtRisk":"₹' + maxRisk.toLocaleString('en-IN') + '",' +
    '"potentialProfit":"₹XX",' +
    '"keyLevel":"₹XX — most important price to watch",' +
    '"entryCondition":"exact condition to enter — e.g. Nifty crosses 23200 with volume",' +
    '"exitCondition":"exact condition to exit with profit",' +
    '"slCondition":"exact condition to cut loss",' +
    '"whyThisTrade":"2-3 sentences on why CE or PE today based on technicals",' +
    '"marketBias":"BULLISH / BEARISH / SIDEWAYS",' +
    '"confidence":75,' +
    '"warnings":["warning 1","warning 2"]}';

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 1200, temperature: 0.2,
        messages: [
          { role: 'system', content: 'You are an expert NSE options trader. You ONLY respond with valid JSON. No markdown. No explanation.' },
          { role: 'user',   content: prompt }
        ]
      })
    });
    const d   = await res.json();
    const raw = d.choices?.[0]?.message?.content ?? '';
    const s   = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s === -1) throw new Error('No JSON');
    const parsed = JSON.parse(raw.slice(s, e + 1));
    // Merge with fallback
    return {
      direction:         parsed.direction         || direction,
      strike:            parsed.strike            || atmStrike,
      optionName:        parsed.optionName        || symbol + ' ' + atmStrike + ' ' + direction + ' Weekly',
      entryPremium:      parsed.entryPremium      || '₹' + estPrem + '–₹' + (estPrem + 20),
      entryTimeWindow:   parsed.entryTimeWindow   || '9:15 AM – 10:00 AM',
      target1Premium:    parsed.target1Premium    || '₹' + Math.round(estPrem * 1.3) + ' (+30%)',
      target2Premium:    parsed.target2Premium    || '₹' + Math.round(estPrem * 1.6) + ' (+60%)',
      slPremium:         parsed.slPremium         || '₹' + Math.round(estPrem * 0.7) + ' (-30%)',
      mandatoryExitTime: parsed.mandatoryExitTime || '3:15 PM',
      lots:              parsed.lots              || lots,
      lotSize:           parsed.lotSize           || lotSize,
      capitalAtRisk:     parsed.capitalAtRisk     || '₹' + maxRisk.toLocaleString('en-IN'),
      potentialProfit:   parsed.potentialProfit   || '₹' + Math.round(maxRisk * 0.5).toLocaleString('en-IN'),
      keyLevel:          parsed.keyLevel          || '₹' + atmStrike,
      entryCondition:    parsed.entryCondition    || 'Enter when ' + symbol + ' confirms direction after 9:20 AM',
      exitCondition:     parsed.exitCondition     || 'Exit at Target 1. Move SL to cost after T1 hit.',
      slCondition:       parsed.slCondition       || 'Exit immediately if premium drops below SL level',
      whyThisTrade:      parsed.whyThisTrade      || 'Trend is ' + trend + ' with RSI at ' + rsi + '.',
      marketBias:        parsed.marketBias        || (trend === 'BULLISH' ? 'BULLISH' : trend === 'BEARISH' ? 'BEARISH' : 'SIDEWAYS'),
      confidence:        parsed.confidence        || 70,
      warnings:          parsed.warnings          || ['Do not overtrade', 'Exit by 3:15 PM compulsorily'],
    };
  } catch {
    return {
      direction, strike: atmStrike,
      optionName: symbol + ' ' + atmStrike + ' ' + direction + ' Weekly',
      entryPremium: '₹' + estPrem + '–₹' + (estPrem + 20),
      entryTimeWindow: '9:15 AM – 10:00 AM',
      target1Premium: '₹' + Math.round(estPrem * 1.3) + ' (+30%)',
      target2Premium: '₹' + Math.round(estPrem * 1.6) + ' (+60%)',
      slPremium: '₹' + Math.round(estPrem * 0.7) + ' (-30%)',
      mandatoryExitTime: '3:15 PM',
      lots, lotSize, capitalAtRisk: '₹' + maxRisk.toLocaleString('en-IN'),
      potentialProfit: '₹' + Math.round(maxRisk * 0.5).toLocaleString('en-IN'),
      keyLevel: '₹' + atmStrike + ' (ATM)',
      entryCondition: 'Enter when ' + symbol + ' price holds above VWAP for 2 candles after 9:20 AM',
      exitCondition: 'Exit when premium reaches Target 1 or at 3:15 PM',
      slCondition: 'Exit immediately if premium falls 30% from entry',
      whyThisTrade: 'Trend is ' + trend + ', RSI at ' + rsi + '. Price ' + (price > vwap ? 'above' : 'below') + ' VWAP at ₹' + vwap + '.',
      marketBias: trend === 'BULLISH' ? 'BULLISH' : trend === 'BEARISH' ? 'BEARISH' : 'SIDEWAYS',
      confidence: 65,
      warnings: ['Always use stop loss', 'Exit compulsorily by 3:15 PM', 'Never average a losing option trade'],
    };
  }
}

// ── Countdown to market open ────────────────────────────────
function useCountdown(targetH, targetM) {
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    const tick = () => {
      const now  = getNow();
      const t    = new Date(now);
      t.setHours(targetH, targetM, 0, 0);
      let diff = t - now;
      if (diff < 0) { setCountdown(''); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown((h ? h + 'h ' : '') + m + 'm ' + s + 's');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return countdown;
}

// ── Pill component ──────────────────────────────────────────
function Pill({ label, value, color, bg }) {
  return (
    <div style={{ background: bg || 'var(--bg-primary)', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: 'DM Mono' }}>{value || '---'}</div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────
export default function IntradayPlanner({ indices }) {
  const [symbol,   setSymbol]   = useState('NIFTY');
  const [capital,  setCapital]  = useState(50000);
  const [loading,  setLoading]  = useState(false);
  const [plan,     setPlan]     = useState(null);
  const [techData, setTechData] = useState(null);
  const [error,    setError]    = useState('');
  const [genTime,  setGenTime]  = useState(null);

  const marketStatus = getMarketStatus();
  const countdown915 = useCountdown(9, 15);
  const countdown930 = useCountdown(9, 30);

  const SYMBOLS = {
    NIFTY:     { token: 'NSE_INDEX|Nifty 50',    label: 'NIFTY 50',    lotSize: 75,  strikeStep: 50  },
    BANKNIFTY: { token: 'NSE_INDEX|Nifty Bank',  label: 'BANK NIFTY',  lotSize: 15,  strikeStep: 100 },
    FINNIFTY:  { token: 'NSE_INDEX|Nifty Fin Service', label: 'FIN NIFTY', lotSize: 40, strikeStep: 50 },
  };

  // Live price from indices hook
  const livePrice = (() => {
    if (!indices?.length) return null;
    const map = { NIFTY: 'NIFTY 50', BANKNIFTY: 'BANK NIFTY', FINNIFTY: 'FIN NIFTY' };
    return indices.find(i => i.label === map[symbol])?.price ?? null;
  })();

  async function buildPlan() {
    setLoading(true); setPlan(null); setError(''); setTechData(null);
    try {
      const sym  = SYMBOLS[symbol];
      const candles = await fetchUpstoxCandles(sym.token, 'day');
      if (!candles.length) throw new Error('No candle data. Make sure Upstox token is refreshed.');

      const price   = livePrice ?? candles[candles.length - 1].close;
      const rsi     = calcRSI(candles);
      const trend   = calcTrend(candles);
      const vwap    = calcVWAP(candles);
      const bbWidth = calcBBWidth(candles);
      const pivot   = calcPivot(candles);
      const supRes  = calcSupRes(candles);
      const prevChg = prevDayChange(candles);
      const atmStrike = roundToStrike(price, sym.strikeStep);

      const td = { price, rsi, trend, vwap, bbWidth, pivot, supRes, candles, prevChg, atmStrike };
      setTechData(td);

      const result = await generatePlan(symbol, td, capital);
      setPlan(result);
      setGenTime(new Date().toLocaleTimeString('en-IN'));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const isCall = plan?.direction === 'CE';
  const dirColor = isCall ? 'var(--green)' : 'var(--red)';
  const biasColor = plan?.marketBias === 'BULLISH' ? 'var(--green)' : plan?.marketBias === 'BEARISH' ? 'var(--red)' : 'var(--gold)';
  const confColor = (plan?.confidence ?? 0) >= 75 ? 'var(--green)' : (plan?.confidence ?? 0) >= 65 ? 'var(--gold)' : 'var(--red)';

  return (
    <div className="fade-in">

      {/* ── Header Banner ── */}
      <div style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(10,14,26,0))',
        border: '1px solid rgba(99,102,241,0.25)', borderRadius: 14, padding: '18px 22px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 36 }}>📋</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Intraday Trade Planner</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            AI-powered plan for NIFTY / BANKNIFTY options · Intraday only · Entry 9:15–10:30 · Exit by 3:15 PM
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'center' }}>
          {/* Market status */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Market</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: marketStatus.color, animation: marketStatus.status === 'live' ? 'pulse 2s infinite' : 'none' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: marketStatus.color }}>{marketStatus.label}</span>
            </div>
          </div>
          {/* Countdown */}
          {countdown915 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Market opens in</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'DM Mono', color: 'var(--gold)' }}>{countdown915}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Setup Panel ── */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          {/* Symbol */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Index</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.keys(SYMBOLS).map(s => (
                <button key={s} onClick={() => { setSymbol(s); setPlan(null); }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid',
                    borderColor: symbol === s ? 'var(--gold)' : 'var(--border)',
                    background:  symbol === s ? 'rgba(201,168,76,0.15)' : 'var(--bg-primary)',
                    color:       symbol === s ? 'var(--gold)' : 'var(--text-muted)',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Capital */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Your Capital</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gold)', fontWeight: 700 }}>₹</span>
                <input type="number" value={capital} onChange={e => setCapital(Number(e.target.value))}
                  style={{ padding: '8px 8px 8px 28px', width: 130, background: 'var(--bg-primary)',
                    border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
                    fontSize: 14, fontFamily: 'DM Mono', outline: 'none' }} />
              </div>
              {[25000, 50000, 100000].map(p => (
                <button key={p} onClick={() => setCapital(p)}
                  style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)',
                    background: capital === p ? 'rgba(201,168,76,0.15)' : 'var(--bg-primary)',
                    color: capital === p ? 'var(--gold)' : 'var(--text-muted)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Mono' }}>
                  ₹{p >= 100000 ? '1L' : p / 1000 + 'K'}
                </button>
              ))}
            </div>
          </div>

          {/* Live price */}
          {livePrice && (
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Live {SYMBOLS[symbol].label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'DM Mono', color: 'var(--text-primary)' }}>₹{fmt(livePrice)}</div>
            </div>
          )}

          {/* Generate button */}
          <button onClick={buildPlan} disabled={loading}
            style={{ padding: '12px 28px', borderRadius: 10, border: 'none',
              background: loading ? 'var(--bg-primary)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: '#fff', fontSize: 14, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, opacity: loading ? 0.7 : 1 }}>
            {loading
              ? <><div className="loader" style={{ width: 16, height: 16, borderWidth: 2 }} /> Analyzing...</>
              : '📋 Generate Today\'s Plan'}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* ── Technical Snapshot (shown during loading too) ── */}
      {techData && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            📊 Technical Snapshot — {SYMBOLS[symbol].label}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            <Pill label="Live Price"   value={'₹' + fmt(techData.price)}
              color="var(--text-primary)" />
            <Pill label="RSI (14)"     value={techData.rsi + (techData.rsi < 30 ? ' 🟢 Oversold' : techData.rsi > 70 ? ' 🔴 Overbought' : ' Neutral')}
              color={techData.rsi < 40 ? 'var(--green)' : techData.rsi > 60 ? 'var(--red)' : 'var(--gold)'} />
            <Pill label="Trend"        value={techData.trend}
              color={techData.trend === 'BULLISH' ? 'var(--green)' : techData.trend === 'BEARISH' ? 'var(--red)' : 'var(--gold)'} />
            <Pill label="VWAP"         value={'₹' + fmt(techData.vwap) + ' (' + (techData.price > techData.vwap ? 'Above ↑' : 'Below ↓') + ')'}
              color={techData.price > techData.vwap ? 'var(--green)' : 'var(--red)'} />
            <Pill label="Prev Day"     value={(techData.prevChg >= 0 ? '+' : '') + techData.prevChg + '%'}
              color={techData.prevChg >= 0 ? 'var(--green)' : 'var(--red)'} />
            <Pill label="ATM Strike"   value={techData.atmStrike}
              color="var(--gold)" />
            <Pill label="Pivot"        value={'₹' + fmt(techData.pivot?.pivot)} />
            <Pill label="R1 / R2"      value={'₹' + fmt(techData.pivot?.r1) + ' / ₹' + fmt(techData.pivot?.r2)}
              color="var(--red)" />
            <Pill label="S1 / S2"      value={'₹' + fmt(techData.pivot?.s1) + ' / ₹' + fmt(techData.pivot?.s2)}
              color="var(--green)" />
            <Pill label="BB Squeeze"   value={techData.bbWidth?.squeeze ? '⚡ YES — Big move!' : 'No'}
              color={techData.bbWidth?.squeeze ? 'var(--gold)' : 'var(--text-muted)'} />
          </div>
        </div>
      )}

      {/* ── Trade Plan ── */}
      {plan && !loading && (
        <div className="fade-in">

          {/* Big direction card */}
          <div style={{ background: `linear-gradient(135deg, ${isCall ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}, rgba(10,14,26,0))`,
            border: `2px solid ${dirColor}44`, borderRadius: 16, padding: 24, marginBottom: 20 }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Today's Trade</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: dirColor, marginBottom: 4 }}>
                  {isCall ? '📈' : '📉'} BUY {plan.optionName}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Market Bias: <span style={{ color: biasColor, fontWeight: 700 }}>{plan.marketBias}</span>
                  &nbsp;·&nbsp;Generated at {genTime}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>AI Confidence</div>
                <div style={{ fontSize: 36, fontWeight: 900, fontFamily: 'DM Mono', color: confColor }}>{plan.confidence}%</div>
              </div>
            </div>

            {/* Confidence bar */}
            <div style={{ marginTop: 14 }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                <div style={{ width: plan.confidence + '%', height: '100%', borderRadius: 6,
                  background: `linear-gradient(90deg, ${dirColor}88, ${dirColor})`, transition: 'width 1s ease' }} />
              </div>
            </div>
          </div>

          {/* Key trade numbers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 20 }}>
            {[
              ['⏺ Entry Premium',       plan.entryPremium,     'var(--gold)',        'rgba(201,168,76,0.08)'],
              ['🕐 Entry Time Window',  plan.entryTimeWindow,  'var(--text-primary)','var(--bg-secondary)'],
              ['🎯 Target 1',            plan.target1Premium,   'var(--green)',       'rgba(34,197,94,0.08)'],
              ['🚀 Target 2',            plan.target2Premium,   'var(--green)',       'rgba(34,197,94,0.08)'],
              ['🛑 Stop Loss',           plan.slPremium,        'var(--red)',         'rgba(239,68,68,0.08)'],
              ['⏰ Must Exit By',        plan.mandatoryExitTime,'var(--red)',         'rgba(239,68,68,0.08)'],
            ].map(([l, v, c, bg]) => (
              <div key={l} style={{ background: bg, border: `1px solid ${c}22`, borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{l}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: 'DM Mono' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Capital breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              ['Lots',           plan.lots + ' lot' + (plan.lots > 1 ? 's' : '') + ' × ' + plan.lotSize + ' qty', 'var(--text-primary)'],
              ['Capital at Risk', plan.capitalAtRisk,   'var(--red)'],
              ['Potential Profit',plan.potentialProfit, 'var(--green)'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: 'DM Mono' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Conditions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              ['⏺ Enter When', plan.entryCondition, 'var(--green)', 'rgba(34,197,94,0.06)', 'rgba(34,197,94,0.2)'],
              ['⏹ Exit With Profit When', plan.exitCondition, 'var(--gold)', 'rgba(201,168,76,0.06)', 'rgba(201,168,76,0.2)'],
              ['🛑 Cut Loss When', plan.slCondition, 'var(--red)', 'rgba(239,68,68,0.06)', 'rgba(239,68,68,0.2)'],
            ].map(([l, v, c, bg, border]) => (
              <div key={l} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 10, color: c, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{l}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Key Level + Why */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 20 }}>
            <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>🔑 Key Level to Watch</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--gold)', fontFamily: 'DM Mono' }}>{plan.keyLevel}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>If price holds above/below this level, the trade is valid</div>
            </div>
            <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>✦ Why This Trade Today</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{plan.whyThisTrade}</div>
            </div>
          </div>

          {/* Warnings */}
          <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>⚠️ Important Rules</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {plan.warnings?.map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: 'var(--red)', fontSize: 12, flexShrink: 0, marginTop: 1 }}>•</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{w}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ color: 'var(--red)', fontSize: 12, flexShrink: 0, marginTop: 1 }}>•</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  This plan is based on previous day data. Regenerate after 9:15 AM for best accuracy.
                </span>
              </div>
            </div>
          </div>

          {/* Regenerate */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={buildPlan}
              style={{ padding: '12px 24px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              🔄 Regenerate Plan
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
              Best time to generate: After 9:15 AM when market opens
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!plan && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Ready to Plan Your Trade
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.8 }}>
            Select your index and capital, then click <strong>"Generate Today's Plan"</strong>.<br />
            Best used at <strong style={{ color: 'var(--gold)' }}>9:00–9:15 AM</strong> before market opens,
            or right after market opens at <strong style={{ color: 'var(--gold)' }}>9:15 AM</strong>.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            {['Pivot Levels','Support/Resistance','RSI','VWAP','BB Squeeze','EMA Trend','ATM Strike'].map(x => (
              <span key={x} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 10,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{x}</span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>
            ⚠️ Educational only. Options trading involves risk of loss. Not SEBI-registered advice.
          </div>
        </div>
      )}
    </div>
  );
}