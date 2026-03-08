// src/components/CryptoDashboard.jsx
import { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useCryptoTickers, fetchCryptoCandles, TOP_COINS } from '../hooks/useCryptoData';

const GROQ_KEY = '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';

// ── Helpers ────────────────────────────────────────────────
function fmtPrice(n) {
  if (n == null || isNaN(n)) return '---';
  if (n >= 10000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1000)  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)     return '$' + n.toFixed(4);
  if (n >= 0.01)  return '$' + n.toFixed(5);
  return '$' + n.toFixed(8);
}

function ChgBadge({ pct }) {
  if (pct == null || isNaN(pct)) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>---</span>;
  const up = pct >= 0;
  return (
    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'DM Mono', color: up ? 'var(--green)' : 'var(--red)' }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

// ── Technical Indicators ────────────────────────────────────
function ema(arr, p) {
  if (arr.length < p) return null;
  const k = 2 / (p + 1);
  let e = arr.slice(0, p).reduce((a, b) => a + b) / p;
  for (let i = p; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}
function calcRSI(candles, p = 14) {
  if (candles.length < p + 1) return null;
  const ch = candles.slice(-p - 1).map((c, i, a) => i === 0 ? 0 : c.close - a[i - 1].close).slice(1);
  const ag = ch.map(x => x > 0 ? x : 0).reduce((a, b) => a + b) / p;
  const al = ch.map(x => x < 0 ? -x : 0).reduce((a, b) => a + b) / p;
  return al === 0 ? 100 : +((100 - 100 / (1 + ag / al)).toFixed(1));
}
function calcMACD(candles) {
  if (candles.length < 35) return null;
  const cl = candles.map(c => c.close);
  const e12 = ema(cl, 12), e26 = ema(cl, 26);
  if (!e12 || !e26) return null;
  const line = e12 - e26;
  const arr = [];
  for (let i = 26; i <= cl.length; i++) {
    const a = ema(cl.slice(0, i), 12), b = ema(cl.slice(0, i), 26);
    if (a && b) arr.push(a - b);
  }
  const sig = ema(arr, 9) || 0;
  return { line: +line.toFixed(4), hist: +(line - sig).toFixed(4), bull: (line - sig) > 0 };
}
function calcBB(candles, p = 20) {
  if (candles.length < p) return null;
  const cl = candles.slice(-p).map(c => c.close);
  const mean = cl.reduce((a, b) => a + b) / p;
  const std = Math.sqrt(cl.reduce((a, b) => a + (b - mean) ** 2, 0) / p);
  const last = candles[candles.length - 1].close;
  const up = mean + 2 * std, lo = mean - 2 * std;
  return { pct: +((last - lo) / (up - lo) * 100).toFixed(1), pos: last > up ? 'ABOVE' : last < lo ? 'BELOW' : 'INSIDE' };
}
function calcADX(candles, p = 14) {
  if (candles.length < p + 1) return null;
  const sl = candles.slice(-(p + 1));
  const trs = [], pdm = [], ndm = [];
  for (let i = 1; i < sl.length; i++) {
    const h = sl[i].high, l = sl[i].low, pc = sl[i - 1].close, ph = sl[i - 1].high, pl = sl[i - 1].low;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    pdm.push(h - ph > pl - l ? Math.max(h - ph, 0) : 0);
    ndm.push(pl - l > h - ph ? Math.max(pl - l, 0) : 0);
  }
  const atr = trs.reduce((a, b) => a + b) / p;
  const pdi = pdm.reduce((a, b) => a + b) / p / atr * 100;
  const ndi = ndm.reduce((a, b) => a + b) / p / atr * 100;
  const dx = Math.abs(pdi - ndi) / (pdi + ndi || 1) * 100;
  return { val: +dx.toFixed(1), strong: dx > 25, bull: pdi > ndi };
}
function calcST(candles, p = 7, m = 3) {
  if (candles.length < p + 2) return null;
  const sl = candles.slice(-(p + 2));
  const atrs = [];
  for (let i = 1; i < sl.length; i++) {
    const h = sl[i].high, l = sl[i].low, pc = sl[i - 1].close;
    atrs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const atr = atrs.slice(-p).reduce((a, b) => a + b) / p;
  const last = sl[sl.length - 1];
  const hl2 = (last.high + last.low) / 2;
  return { trend: last.close > hl2 - m * atr ? 'UP' : 'DOWN', atr: +atr.toFixed(6) };
}
function calcVWAP(candles) {
  const sl = candles.slice(-20);
  let pv = 0, v = 0;
  sl.forEach(c => { const t = (c.high + c.low + c.close) / 3; pv += t * (c.volume || 1); v += (c.volume || 1); });
  return +(pv / v).toFixed(6);
}
function detectPatterns(candles) {
  if (candles.length < 3) return [];
  const res = [];
  const c = candles[candles.length - 1], p1 = candles[candles.length - 2], p2 = candles[candles.length - 3];
  const body = x => Math.abs(x.close - x.open), rng = x => x.high - x.low || 0.000001;
  const bull = x => x.close > x.open, bear = x => x.close < x.open;
  const uw = x => x.high - Math.max(x.open, x.close), lw = x => Math.min(x.open, x.close) - x.low;
  if (body(c) / rng(c) < 0.1)                                          res.push({ n: 'Doji', t: 'neutral', w: 5 });
  if (bull(c) && lw(c) > body(c) * 2 && uw(c) < body(c) * 0.5)        res.push({ n: 'Hammer', t: 'bullish', w: 15 });
  if (uw(c) > body(c) * 2 && lw(c) < body(c) * 0.5)                    res.push({ n: 'Shooting Star', t: 'bearish', w: 15 });
  if (bear(p1) && bull(c) && c.open < p1.close && c.close > p1.open)   res.push({ n: 'Bullish Engulfing', t: 'bullish', w: 20 });
  if (bull(p1) && bear(c) && c.open > p1.close && c.close < p1.open)   res.push({ n: 'Bearish Engulfing', t: 'bearish', w: 20 });
  if (bear(p2) && body(p1) < body(p2) * 0.3 && bull(c) && c.close > (p2.open + p2.close) / 2) res.push({ n: 'Morning Star', t: 'bullish', w: 25 });
  if (bull(p2) && body(p1) < body(p2) * 0.3 && bear(c) && c.close < (p2.open + p2.close) / 2) res.push({ n: 'Evening Star', t: 'bearish', w: 25 });
  if (bull(c) && body(c) / rng(c) > 0.85)                               res.push({ n: 'Bullish Marubozu', t: 'bullish', w: 18 });
  if (bear(c) && body(c) / rng(c) > 0.85)                               res.push({ n: 'Bearish Marubozu', t: 'bearish', w: 18 });
  if ([p2, p1, c].every(bull) && p1.close > p2.close && c.close > p1.close) res.push({ n: '3 White Soldiers', t: 'bullish', w: 22 });
  if ([p2, p1, c].every(bear) && p1.close < p2.close && c.close < p1.close) res.push({ n: '3 Black Crows', t: 'bearish', w: 22 });
  return res;
}
function scoreAll(ind) {
  const { r, m, b, a, st, vw, price, pats } = ind;
  let bull = 0, bear = 0;
  if (r !== null) { r <= 30 ? bull += 20 : r <= 45 ? bull += 12 : r >= 70 ? bear += 20 : r >= 55 ? bear += 12 : 0; }
  if (m) { m.bull ? bull += 20 : bear += 20; }
  if (b) { b.pos === 'BELOW' ? bull += 15 : b.pct < 30 ? bull += 10 : b.pos === 'ABOVE' ? bear += 15 : b.pct > 70 ? bear += 10 : 0; }
  if (a) { a.strong ? (a.bull ? bull += 20 : bear += 20) : (a.bull ? bull += 8 : bear += 8); }
  if (st) { st.trend === 'UP' ? bull += 25 : bear += 25; }
  if (vw && price) { price > vw ? bull += 10 : bear += 10; }
  pats.forEach(p => { p.t === 'bullish' ? bull += p.w : p.t === 'bearish' ? bear += p.w : 0; });
  const total = bull + bear || 1;
  return { dir: bull > bear ? 'LONG' : bear > bull ? 'SHORT' : 'NEUTRAL', confidence: Math.round(Math.max(bull, bear) / total * 100), bull, bear };
}

async function analyzeCoin(coin) {
  try {
    const [day, h4] = await Promise.all([
      fetchCryptoCandles(coin.pair, '1d', 80),
      fetchCryptoCandles(coin.pair, '4h', 80),
    ]);
    if (!day.length) return null;
    const price = day[day.length - 1].close;
    const prev  = day[day.length - 2]?.close ?? price;
    const chgPct = +((price - prev) / prev * 100).toFixed(2);
    const vol    = day[day.length - 1].volume;
    const avgVol = day.slice(-10).reduce((a, c) => a + (c.volume || 0), 0) / 10;
    const volSpike = +(avgVol > 0 ? vol / avgVol : 1).toFixed(1);
    const src = h4.length >= 20 ? h4 : day;
    const r = calcRSI(day), m = calcMACD(day), b = calcBB(day), a = calcADX(day), st = calcST(day), vw = calcVWAP(src), pats = detectPatterns(src);
    const sc = scoreAll({ r, m, b, a, st, vw, price, pats });
    if (sc.dir === 'NEUTRAL' || sc.confidence < 60) return null;
    let agrees = 0, tot = 0;
    if (r !== null) { tot++; if ((sc.dir === 'LONG' && r < 50) || (sc.dir === 'SHORT' && r > 50)) agrees++; }
    if (m) { tot++; if ((sc.dir === 'LONG' && m.bull) || (sc.dir === 'SHORT' && !m.bull)) agrees++; }
    if (b) { tot++; if ((sc.dir === 'LONG' && b.pct < 50) || (sc.dir === 'SHORT' && b.pct > 50)) agrees++; }
    if (a) { tot++; if ((sc.dir === 'LONG' && a.bull) || (sc.dir === 'SHORT' && !a.bull)) agrees++; }
    if (st) { tot++; if ((sc.dir === 'LONG' && st.trend === 'UP') || (sc.dir === 'SHORT' && st.trend === 'DOWN')) agrees++; }
    if (vw && price) { tot++; if ((sc.dir === 'LONG' && price > vw) || (sc.dir === 'SHORT' && price < vw)) agrees++; }
    return { ...coin, price, chgPct, volSpike, rsi: r, macd: m, bb: b, adx: a, st, vwap: vw, pats, ...sc, agrees, tot };
  } catch { return null; }
}

// ── AI — bulletproof prompt + robust parsing ───────────────
async function getCryptoAI(result, capital) {
  const p     = result.price;
  const dec   = p >= 100 ? 2 : p >= 1 ? 4 : 6;
  const pStr  = p?.toFixed(dec) ?? '0';
  const qty   = (capital / p).toFixed(p >= 100 ? 3 : p >= 1 ? 2 : 0);
  const entry1 = (p * 0.998).toFixed(dec);
  const entry2 = (p * 1.002).toFixed(dec);
  const t1     = result.dir === 'LONG' ? (p * 1.05).toFixed(dec) : (p * 0.95).toFixed(dec);
  const t2     = result.dir === 'LONG' ? (p * 1.10).toFixed(dec) : (p * 0.90).toFixed(dec);
  const sl     = result.dir === 'LONG' ? (p * 0.96).toFixed(dec) : (p * 1.04).toFixed(dec);
  const maxP   = ((Math.abs(parseFloat(t1) - p) / p) * capital).toFixed(2);
  const maxL   = ((Math.abs(p - parseFloat(sl)) / p) * capital).toFixed(2);

  // System prompt forces JSON-only output
  const systemPrompt = 'You are a crypto trading assistant. You ONLY respond with valid JSON. No markdown, no code blocks, no explanation. Just the raw JSON object.';

  const userPrompt =
    'Generate a crypto trade plan for ' + result.sym + ' (' + result.name + ').\n' +
    'Current price: $' + pStr + '\n' +
    'Signal direction: ' + result.dir + '\n' +
    'Confidence: ' + result.confidence + '% (' + result.agrees + '/' + result.tot + ' indicators agree)\n' +
    'RSI: ' + (result.rsi ?? 'N/A') + '\n' +
    'MACD: ' + (result.macd?.bull ? 'Bullish' : 'Bearish') + ' histogram=' + (result.macd?.hist ?? 'N/A') + '\n' +
    'Bollinger: ' + (result.bb?.pct ?? 'N/A') + '% (' + (result.bb?.pos ?? 'N/A') + ')\n' +
    'ADX: ' + (result.adx?.val ?? 'N/A') + ' ' + (result.adx?.strong ? 'Strong' : 'Weak') + '\n' +
    'Supertrend: ' + (result.st?.trend ?? 'N/A') + '\n' +
    'VWAP: $' + (result.vwap ?? 'N/A') + ' (price is ' + (p > result.vwap ? 'ABOVE' : 'BELOW') + ')\n' +
    'Volume: ' + result.volSpike + 'x average\n' +
    'Patterns: ' + (result.pats?.map(x => x.n).join(', ') || 'None') + '\n' +
    'Trader capital: $' + capital + ' (~' + qty + ' ' + result.sym + ')\n\n' +
    'Respond with ONLY this JSON (fill every field with real numbers based on the data above):\n' +
    '{"action":"' + (result.dir === 'LONG' ? 'BUY (LONG)' : 'SELL (SHORT)') + '",' +
    '"entryZone":"$' + entry1 + ' – $' + entry2 + '",' +
    '"target1":"$' + t1 + ' (+5%)",' +
    '"target2":"$' + t2 + ' (+10%)",' +
    '"stopLoss":"$' + sl + ' (-4%)",' +
    '"positionSize":"' + qty + ' ' + result.sym + '",' +
    '"capitalNeeded":"$' + capital + '",' +
    '"maxProfit":"$' + maxP + '",' +
    '"maxLoss":"$' + maxL + '",' +
    '"timeHorizon":"Swing (2-5 days)",' +
    '"urgency":"MEDIUM",' +
    '"entryCondition":"REPLACE WITH SPECIFIC ENTRY CONDITION",' +
    '"exitCondition":"REPLACE WITH SPECIFIC EXIT CONDITION",' +
    '"whyThisSignal":"REPLACE WITH 2-3 SENTENCES",' +
    '"keyRisk":"REPLACE WITH MAIN RISK",' +
    '"marketSentiment":"REPLACE WITH MARKET SENTIMENT"}';

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1000,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt }
        ]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Groq API error:', res.status, errText);
      // Return fallback with pre-calculated values so UI never shows ---
      return {
        action: result.dir === 'LONG' ? 'BUY (LONG)' : 'SELL (SHORT)',
        entryZone: '$' + entry1 + ' – $' + entry2,
        target1: '$' + t1 + ' (+5%)',
        target2: '$' + t2 + ' (+10%)',
        stopLoss: '$' + sl + ' (-4%)',
        positionSize: qty + ' ' + result.sym,
        capitalNeeded: '$' + capital,
        maxProfit: '$' + maxP,
        maxLoss: '$' + maxL,
        timeHorizon: 'Swing (2-5 days)',
        urgency: 'MEDIUM',
        entryCondition: 'Enter when price consolidates near entry zone with volume confirmation.',
        exitCondition: 'Exit at Target 1 or if price breaks below stop loss.',
        whyThisSignal: result.confidence + '% of indicators agree on ' + result.dir + ' direction. Supertrend is ' + (result.st?.trend ?? 'N/A') + ' and RSI at ' + (result.rsi ?? 'N/A') + '.',
        keyRisk: 'Crypto markets are highly volatile. Price can reverse quickly.',
        marketSentiment: 'Mixed signals — monitor Bitcoin dominance for overall direction.',
      };
    }

    const d   = await res.json();
    const raw = d.choices?.[0]?.message?.content ?? '';
    console.log('Groq raw:', raw.slice(0, 200));

    // Extract JSON — find first { last }
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON in response: ' + raw.slice(0, 100));

    const parsed = JSON.parse(raw.slice(start, end + 1));

    // Merge with fallback so no field is ever missing
    return {
      action:          parsed.action          || (result.dir === 'LONG' ? 'BUY (LONG)' : 'SELL (SHORT)'),
      entryZone:       parsed.entryZone       || '$' + entry1 + ' – $' + entry2,
      target1:         parsed.target1         || '$' + t1 + ' (+5%)',
      target2:         parsed.target2         || '$' + t2 + ' (+10%)',
      stopLoss:        parsed.stopLoss        || '$' + sl + ' (-4%)',
      positionSize:    parsed.positionSize    || qty + ' ' + result.sym,
      capitalNeeded:   parsed.capitalNeeded   || '$' + capital,
      maxProfit:       parsed.maxProfit       || '$' + maxP,
      maxLoss:         parsed.maxLoss         || '$' + maxL,
      timeHorizon:     parsed.timeHorizon     || 'Swing (2-5 days)',
      urgency:         parsed.urgency         || 'MEDIUM',
      entryCondition:  parsed.entryCondition  || 'Enter when price consolidates near entry zone.',
      exitCondition:   parsed.exitCondition   || 'Exit at Target 1 or below stop loss.',
      whyThisSignal:   parsed.whyThisSignal   || 'Multiple indicators align for ' + result.dir + ' signal.',
      keyRisk:         parsed.keyRisk         || 'High crypto volatility — use proper position sizing.',
      marketSentiment: parsed.marketSentiment || 'Monitor overall market conditions before entry.',
    };
  } catch (e) {
    console.error('getCryptoAI error:', e);
    // Always return fallback — never return null
    return {
      action:          result.dir === 'LONG' ? 'BUY (LONG)' : 'SELL (SHORT)',
      entryZone:       '$' + entry1 + ' – $' + entry2,
      target1:         '$' + t1 + ' (+5%)',
      target2:         '$' + t2 + ' (+10%)',
      stopLoss:        '$' + sl + ' (-4%)',
      positionSize:    qty + ' ' + result.sym,
      capitalNeeded:   '$' + capital,
      maxProfit:       '$' + maxP,
      maxLoss:         '$' + maxL,
      timeHorizon:     'Swing (2-5 days)',
      urgency:         'MEDIUM',
      entryCondition:  'Enter when price pulls back to entry zone with increasing volume.',
      exitCondition:   'Take profit at Target 1. Move stop loss to breakeven after Target 1.',
      whyThisSignal:   result.confidence + '% confidence — ' + result.agrees + '/' + result.tot + ' indicators agree on ' + result.dir + '. Supertrend ' + (result.st?.trend ?? '') + ', RSI ' + (result.rsi ?? '') + '.',
      keyRisk:         'Crypto markets are highly volatile. Always use stop loss.',
      marketSentiment: 'Check BTC trend before entering — altcoins follow Bitcoin.',
    };
  }
}

// ══════════════════════════════════════════════════════════
// ── OVERVIEW COMPONENTS ───────────────────────────────────
// ══════════════════════════════════════════════════════════
function CryptoChart({ coin }) {
  const [candles,  setCandles]  = useState([]);
  const [intv,     setIntv]     = useState('1d');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchCryptoCandles(coin.pair, intv, 80)
      .then(d => { setCandles(d); setLoading(false); });
  }, [coin.pair, intv]);

  const isUp  = candles.length >= 2 ? candles[candles.length - 1].close >= candles[0].close : true;
  const color = isUp ? '#22c55e' : '#ef4444';

  return (
    <div className="panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${coin.color}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, color: coin.color }}>{coin.sym?.[0] ?? '?'}</div>
          <div>
            <div className="panel-title">{coin.name} ({coin.sym}/USDT)</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Binance · {fmtPrice(coin.price)} · <ChgBadge pct={coin.chgPct} />
            </div>
          </div>
        </div>
        <div className="btn-group">
          {[['15m','15M'],['1h','1H'],['4h','4H'],['1d','1D'],['1w','1W']].map(([v, l]) => (
            <button key={v} className={`btn-range ${intv === v ? 'active' : ''}`}
              onClick={() => setIntv(v)}>{l}</button>
          ))}
        </div>
      </div>
      {loading ? (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loader" />
        </div>
      ) : candles.length === 0 ? (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          No chart data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={candles} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="cryptoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fill: '#4a5578', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={['auto','auto']} tick={{ fill: '#4a5578', fontSize: 10, fontFamily: 'DM Mono' }}
              tickLine={false} axisLine={false} orientation="right"
              tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${v.toFixed(2)}`} />
            <Tooltip
              contentStyle={{ background: '#131829', border: '1px solid #1e2640', borderRadius: 8, fontFamily: 'DM Mono', fontSize: 12 }}
              labelStyle={{ color: '#8892b0' }}
              formatter={v => [fmtPrice(v), 'Price']} />
            <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2}
              fill="url(#cryptoGrad)" dot={false} activeDot={{ r: 4, fill: color }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function CoinCard({ coin, active, onClick }) {
  return (
    <div className={`index-card ${active ? 'active' : ''}`} onClick={onClick}
      style={{ cursor: 'pointer', borderColor: active ? coin.color : undefined, minWidth: 140 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${coin.color}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: coin.color, flexShrink: 0 }}>{coin.sym?.[0]}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{coin.sym}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{coin.name}</div>
        </div>
      </div>
      {coin.price == null
        ? <div className="skeleton" style={{ height: 24, marginBottom: 6 }} />
        : <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'DM Mono', color: 'var(--text-primary)', marginBottom: 4 }}>
            {fmtPrice(coin.price)}
          </div>
      }
      <ChgBadge pct={coin.chgPct} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── SIGNAL DETAIL MODAL ───────────────────────────────────
// ══════════════════════════════════════════════════════════
function CryptoSignalDetail({ result, capital, onClose }) {
  const [ai,      setAi]     = useState(null);
  const [loading, setLoad]   = useState(true);
  const [attempt, setAttempt]= useState(0);
  const isLong = result.dir === 'LONG';
  const color  = isLong ? '#22c55e' : '#ef4444';

  useEffect(() => {
    setLoad(true);
    setAi(null);
    getCryptoAI(result, capital).then(d => { setAi(d); setLoad(false); });
  }, [attempt]);

  const IRow = ({ label, val, bull }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: 'DM Mono', fontWeight: 600,
        color: bull === true ? 'var(--green)' : bull === false ? 'var(--red)' : 'var(--text-primary)' }}>{val ?? '---'}</span>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-secondary)', border: `2px solid ${color}44`, borderRadius: 16,
        padding: 24, maxWidth: 700, width: '100%', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${result.color}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 900, color: result.color }}>{result.sym[0]}</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>
                {result.sym} <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>{result.name}</span>
              </div>
              <div style={{ fontSize: 13, fontFamily: 'DM Mono', color: 'var(--text-muted)' }}>
                {fmtPrice(result.price)} &nbsp;<ChgBadge pct={result.chgPct} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color, background: `${color}20`,
              padding: '6px 18px', borderRadius: 24, border: `1px solid ${color}44` }}>
              {isLong ? '🟢 LONG' : '🔴 SHORT'}
            </div>
            <button onClick={onClose} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text-muted)', width: 34, height: 34, cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        </div>

        {/* Confidence bar */}
        <div style={{ background: `${color}0d`, border: `1px solid ${color}33`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Signal Confidence</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                ✅ {result.agrees}/{result.tot} indicators agree
                {result.volSpike > 1.5 && <span style={{ color: '#f7931a', marginLeft: 8 }}>⚡ Vol {result.volSpike}x</span>}
              </div>
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color, fontFamily: 'DM Mono' }}>{result.confidence}%</div>
          </div>
          <div style={{ background: 'var(--bg-primary)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
            <div style={{ width: `${result.confidence}%`, height: '100%', borderRadius: 6,
              background: `linear-gradient(90deg,${color}66,${color})` }} />
          </div>
        </div>

        {/* Indicators + Patterns grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <div style={{ background: 'var(--bg-primary)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>📊 All Indicators</div>
            <IRow label="RSI(14)"    val={`${result.rsi ?? '---'} ${result.rsi < 30 ? '(Oversold)' : result.rsi > 70 ? '(Overbought)' : ''}`} bull={result.rsi < 50} />
            <IRow label="MACD"       val={result.macd ? `${result.macd.line} (${result.macd.bull ? 'Bull ▲' : 'Bear ▼'})` : '---'} bull={result.macd?.bull} />
            <IRow label="Bollinger"  val={result.bb ? `${result.bb.pct}% — ${result.bb.pos}` : '---'} bull={result.bb?.pct < 50} />
            <IRow label="ADX"        val={result.adx ? `${result.adx.val} (${result.adx.strong ? 'Strong' : 'Weak'})` : '---'} bull={result.adx?.bull} />
            <IRow label="Supertrend" val={result.st?.trend ?? '---'} bull={result.st?.trend === 'UP'} />
            <IRow label="VWAP"       val={result.vwap ? `$${result.vwap} — ${result.price > result.vwap ? 'Above ↑' : 'Below ↓'}` : '---'} bull={result.price > result.vwap} />
            <IRow label="Vol Spike"  val={`${result.volSpike}x avg`} bull={result.volSpike > 1.5} />
          </div>

          <div style={{ background: 'var(--bg-primary)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>🕯️ Candlestick Patterns</div>
            {result.pats?.length ? result.pats.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                background: p.t === 'bullish' ? 'rgba(34,197,94,0.08)' : p.t === 'bearish' ? 'rgba(239,68,68,0.08)' : 'rgba(201,168,76,0.08)',
                borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: p.t === 'bullish' ? 'var(--green)' : p.t === 'bearish' ? 'var(--red)' : 'var(--gold)' }} />
                <div style={{ fontSize: 12, fontWeight: 600,
                  color: p.t === 'bullish' ? 'var(--green)' : p.t === 'bearish' ? 'var(--red)' : 'var(--gold)' }}>{p.n}</div>
              </div>
            )) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>No strong patterns detected</div>
            )}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Your Capital</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#f7931a', fontFamily: 'DM Mono' }}>${capital.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* AI Trade Plan */}
        <div style={{ background: 'linear-gradient(135deg,rgba(247,147,26,0.08),rgba(230,126,0,0.04))',
          border: '1px solid rgba(247,147,26,0.3)', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f7931a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
            ₿ AI Crypto Trade Plan
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0' }}>
              <div className="loader" style={{ width: 20, height: 20 }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Calculating entry zone, targets, position size...</span>
            </div>
          ) : ai ? (
            <div>
              {/* Big action box */}
              <div style={{ background: `${color}15`, border: `2px solid ${color}44`, borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Recommended Action</div>
                <div style={{ fontSize: 22, fontWeight: 900, color, marginBottom: 4 }}>{ai.action}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{ai.timeHorizon}</div>
                <div style={{ marginTop: 8, display: 'inline-block',
                  background: ai.urgency === 'HIGH' ? 'rgba(239,68,68,0.2)' : ai.urgency === 'MEDIUM' ? 'rgba(201,168,76,0.2)' : 'rgba(34,197,94,0.2)',
                  color: ai.urgency === 'HIGH' ? 'var(--red)' : ai.urgency === 'MEDIUM' ? 'var(--gold)' : 'var(--green)',
                  padding: '4px 14px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                  {ai.urgency} URGENCY
                </div>
              </div>

              {/* 6 trade numbers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
                {[
                  ['Entry Zone',    ai.entryZone,     'var(--gold)'],
                  ['Target 1',      ai.target1,       'var(--green)'],
                  ['Target 2',      ai.target2,       'var(--green)'],
                  ['Stop Loss',     ai.stopLoss,      'var(--red)'],
                  ['Position Size', ai.positionSize,  'var(--text-primary)'],
                  ['Max Profit',    ai.maxProfit,     'var(--green)'],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{l}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: c, fontFamily: 'DM Mono' }}>{v ?? '---'}</div>
                  </div>
                ))}
              </div>

              {/* Entry / Exit conditions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>⏺ Enter When</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ai.entryCondition}</div>
                </div>
                <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>⏹ Exit When</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ai.exitCondition}</div>
                </div>
              </div>

              {/* Market sentiment */}
              {ai.marketSentiment && (
                <div style={{ background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.2)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: '#f7931a', fontWeight: 700 }}>📊 Market Sentiment: </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ai.marketSentiment}</span>
                </div>
              )}

              {/* Why */}
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>💡 Why This Signal</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{ai.whyThisSignal}</div>
              </div>

              {/* Risk */}
              <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>⚠️ Key Risk: </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ai.keyRisk}</span>
              </div>
            </div>
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                Could not load AI analysis
              </div>
              <button onClick={() => setAttempt(a => a + 1)} style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg,#f7931a,#e67e00)',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer'
              }}>Retry</button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
          ⚠️ Crypto markets are highly volatile. Educational only. Not financial advice.
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── SIGNAL CARD ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════
function CryptoSignalCard({ result, rank, onSelect }) {
  const isLong = result.dir === 'LONG';
  const color  = isLong ? '#22c55e' : '#ef4444';
  const cColor = result.confidence >= 80 ? '#22c55e' : result.confidence >= 70 ? '#f59e0b' : '#ef4444';
  const rankBg = rank === 1 ? 'linear-gradient(135deg,#ffd700,#f59e0b)' : rank === 2 ? 'linear-gradient(135deg,#c0c0c0,#9ca3af)' : 'linear-gradient(135deg,#cd7f32,#92400e)';

  return (
    <div onClick={() => onSelect(result)}
      style={{ background: 'var(--bg-secondary)', border: `1px solid ${color}33`, borderRadius: 14,
        padding: 18, cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'all 0.2s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = `0 8px 32px ${color}22`}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>

      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, borderRadius: '0 14px 0 80px', background: `${result.color}08`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 14, left: 14, width: 28, height: 28, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', background: rankBg, fontSize: 13, fontWeight: 900, color: '#000' }}>#{rank}</div>

      <div style={{ marginLeft: 40, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${result.color}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: result.color }}>{result.sym[0]}</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-primary)' }}>{result.sym}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>{fmtPrice(result.price)} <ChgBadge pct={result.chgPct} /></div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color, background: `${color}15`, padding: '5px 14px', borderRadius: 20, border: `1px solid ${color}44` }}>
          {isLong ? '🟢 LONG' : '🔴 SHORT'}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Confidence</div>
          <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'DM Mono', color: cColor }}>{result.confidence}%</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-primary)', borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ width: `${result.confidence}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg,${color}55,${color})` }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 10 }}>
        {[
          ['RSI',  result.rsi ?? '---', result.rsi != null ? (result.dir === 'LONG' ? result.rsi < 50 : result.rsi > 50) : null],
          ['ST',   result.st?.trend ?? '---', result.st ? result.st.trend === 'UP' : null],
          ['VOL',  `${result.volSpike}x`, result.volSpike > 1.5],
        ].map(([l, v, b]) => (
          <div key={l} style={{ background: 'var(--bg-primary)', borderRadius: 6, padding: '5px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{l}</div>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'DM Mono',
              color: b === true ? 'var(--green)' : b === false ? 'var(--red)' : 'var(--text-muted)' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {result.pats?.slice(0, 2).map((p, i) => (
            <span key={i} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10,
              background: p.t === 'bullish' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              color: p.t === 'bullish' ? 'var(--green)' : 'var(--red)',
              border: `1px solid ${p.t === 'bullish' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>{p.n}</span>
          ))}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Tap for trade plan →</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── SIGNALS SETUP SCREEN ──────────────────────────────────
// ══════════════════════════════════════════════════════════
function SignalsSetup({ onStart }) {
  const [capital,  setCap]     = useState('');
  const [minConf,  setMinConf] = useState(70);
  const [timeframe, setTF]     = useState('swing');
  const [error,    setError]   = useState('');
  const presets = [100, 500, 1000, 5000, 10000];

  function go() {
    const c = Number(capital);
    if (!c || c < 10) { setError('Minimum $10 required'); return; }
    onStart({ capital: c, minConf, timeframe });
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: '32px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>₿</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6 }}>Crypto AI Signal Scanner</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8 }}>
          Enter your capital → AI scans top 20 coins<br />
          using <strong style={{ color: '#f7931a' }}>7 indicators + 10 candlestick patterns</strong><br />
          Shows only <strong style={{ color: 'var(--green)' }}>highest confidence LONG/SHORT signals</strong>
        </div>
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>💵 Your Trading Capital (USD)</div>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 22, fontWeight: 700, color: '#f7931a' }}>$</span>
          <input type="number" value={capital} onChange={e => { setCap(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && go()} placeholder="Enter amount..."
            style={{ width: '100%', padding: '14px 14px 14px 42px', fontSize: 22, fontWeight: 700,
              fontFamily: 'DM Mono', background: 'var(--bg-primary)',
              border: `2px solid ${error ? 'var(--red)' : capital ? '#f7931a' : 'var(--border)'}`,
              borderRadius: 10, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {presets.map(p => (
            <button key={p} onClick={() => { setCap(String(p)); setError(''); }}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                background: Number(capital) === p ? 'rgba(247,147,26,0.2)' : 'var(--bg-primary)',
                color: Number(capital) === p ? '#f7931a' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Mono' }}>
              ${p >= 1000 ? `${p / 1000}K` : p}
            </button>
          ))}
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>⚠️ {error}</div>}
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>⚙️ Preferences</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Timeframe</div>
            <select value={timeframe} onChange={e => setTF(e.target.value)} className="ai-select" style={{ width: '100%' }}>
              <option value="scalp">Scalp (hours)</option>
              <option value="swing">Swing (days)</option>
              <option value="position">Position (weeks)</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
              Min Confidence: <strong style={{ color: '#f7931a' }}>{minConf}%</strong>
            </div>
            <input type="range" min={60} max={90} step={5} value={minConf}
              onChange={e => setMinConf(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#f7931a' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)' }}>
              <span>60% More signals</span><span>90% Best only</span>
            </div>
          </div>
        </div>
      </div>

      <button onClick={go} style={{ width: '100%', padding: '15px', borderRadius: 12, border: 'none',
        background: 'linear-gradient(135deg,#f7931a,#e67e00)', color: '#fff',
        fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        🔍 Scan Top 20 Coins →
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── MAIN DASHBOARD ────────────────────────────────────────
// ══════════════════════════════════════════════════════════
export default function CryptoDashboard() {
  const { tickers, loading: tickLoad } = useCryptoTickers();
  const [activeTab,  setActiveTab]  = useState('overview');
  const [activeCoin, setActiveCoin] = useState(0);
  const [search,     setSearch]     = useState('');

  // Signals state
  const [sigPhase,    setSigPhase]   = useState('setup');
  const [sigConfig,   setSigConfig]  = useState(null);
  const [sigProgress, setSigProg]    = useState(0);
  const [sigMsg,      setSigMsg]     = useState('');
  const [sigResults,  setSigResults] = useState([]);
  const [sigSelected, setSigSel]     = useState(null);
  const [sigFilter,   setSigFilter]  = useState('ALL');
  const cancelRef = useRef(false);

  async function startScan(cfg) {
    setSigConfig(cfg); setSigPhase('scanning'); setSigProg(0); setSigResults([]); cancelRef.current = false;
    const found = [];
    for (let i = 0; i < TOP_COINS.length; i++) {
      if (cancelRef.current) break;
      setSigMsg(`Analyzing ${TOP_COINS[i].sym}...`);
      setSigProg(Math.round((i + 1) / TOP_COINS.length * 100));
      const r = await analyzeCoin(TOP_COINS[i]);
      if (r && r.confidence >= cfg.minConf) found.push(r);
      await new Promise(res => setTimeout(res, 300));
    }
    found.sort((a, b) => b.confidence - a.confidence);
    setSigResults(found); setSigPhase('results');
  }

  const sorted  = [...tickers].sort((a, b) => b.chgPct - a.chgPct);
  const gainers = sorted.slice(0, 5);
  const losers  = [...sorted].reverse().slice(0, 5);
  const filtered = tickers.filter(t =>
    t.sym?.toLowerCase().includes(search.toLowerCase()) ||
    t.name?.toLowerCase().includes(search.toLowerCase())
  );
  const currentCoin = tickers[activeCoin] ?? TOP_COINS[activeCoin];
  const sigDisplayed = sigResults.filter(r => sigFilter === 'LONG' ? r.dir === 'LONG' : sigFilter === 'SHORT' ? r.dir === 'SHORT' : true);

  return (
    <div>
      {/* Banner */}
      <div style={{ background: 'linear-gradient(135deg,rgba(247,147,26,0.1),rgba(10,14,26,0))',
        border: '1px solid rgba(247,147,26,0.25)', borderRadius: 12, padding: '14px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 28 }}>₿</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f7931a' }}>Crypto Live Data</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Top 20 coins · Binance API · Refreshes every 30s · No login required</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: tickLoad ? 'var(--gold)' : 'var(--green)', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 12, color: tickLoad ? 'var(--gold)' : 'var(--green)', fontWeight: 600 }}>
            {tickLoad ? 'Loading...' : 'Live'}
          </span>
        </div>
      </div>

      {/* Sub nav */}
      <div className="nav-tabs" style={{ marginBottom: 20 }}>
        {[['overview','📊 Overview'],['watchlist','👀 Watchlist'],['gainers','📈 Gainers/Losers'],['signals','🎯 AI Signals']].map(([key, label]) => (
          <button key={key} className={`nav-tab ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}>{label}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="fade-in">
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, marginBottom: 20 }}>
            {(tickers.length ? tickers : TOP_COINS).slice(0, 10).map((coin, i) => (
              <div key={coin.sym} style={{ flexShrink: 0 }}>
                <CoinCard coin={coin} active={activeCoin === i} onClick={() => setActiveCoin(i)} />
              </div>
            ))}
          </div>
          <div className="dashboard-grid">
            <CryptoChart coin={currentCoin} />
            <div className="panel" style={{ overflowY: 'auto', maxHeight: 400 }}>
              <div className="panel-header">
                <div className="panel-title">Top Movers</div>
                <div className="panel-sub">24h · Click to view chart</div>
              </div>
              {tickers.length === 0
                ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}><div className="loader" style={{ margin: '0 auto' }} /></div>
                : [...tickers].sort((a, b) => Math.abs(b.chgPct) - Math.abs(a.chgPct)).slice(0, 10).map(t => (
                  <div key={t.sym} className="mover-item" style={{ cursor: 'pointer' }}
                    onClick={() => setActiveCoin(TOP_COINS.findIndex(c => c.sym === t.sym))}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${t.color}22`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800, color: t.color }}>{t.sym[0]}</div>
                      <div>
                        <div className="mover-sym">{t.sym}</div>
                        <div className="mover-name">{t.name}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mover-price">{fmtPrice(t.price)}</div>
                      <ChgBadge pct={t.chgPct} />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── WATCHLIST ── */}
      {activeTab === 'watchlist' && (
        <div className="fade-in panel">
          <div className="panel-header">
            <div className="panel-title">👀 Watchlist — Top 20 Coins</div>
            <div className="panel-sub">Binance · 30s refresh</div>
          </div>
          <div className="search-bar">
            <span>🔍</span>
            <input placeholder="Search coins..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Coin</th><th>Price</th><th>24h Change</th><th>24h High</th><th>24h Low</th><th>Volume (USD)</th></tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={t.sym} style={{ cursor: 'pointer' }}
                  onClick={() => { setActiveCoin(TOP_COINS.findIndex(c => c.sym === t.sym)); setActiveTab('overview'); }}>
                  <td style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>{i + 1}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${t.color}22`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: t.color }}>{t.sym[0]}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{t.sym}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.name}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'DM Mono', fontWeight: 600 }}>{fmtPrice(t.price)}</td>
                  <td><ChgBadge pct={t.chgPct} /></td>
                  <td style={{ fontFamily: 'DM Mono', color: 'var(--green)' }}>{fmtPrice(t.high)}</td>
                  <td style={{ fontFamily: 'DM Mono', color: 'var(--red)' }}>{fmtPrice(t.low)}</td>
                  <td style={{ fontFamily: 'DM Mono', color: 'var(--text-muted)', fontSize: 12 }}>
                    {t.quoteVol ? '$' + (t.quoteVol / 1e6).toFixed(1) + 'M' : '---'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── GAINERS / LOSERS ── */}
      {activeTab === 'gainers' && (
        <div className="fade-in bottom-grid">
          {[['🟢 Top Gainers', gainers, true], ['🔴 Top Losers', losers, false]].map(([title, list, isGain]) => (
            <div key={title} className="panel">
              <div className="panel-header">
                <div className="panel-title">{title}</div>
                <div className="panel-sub">24h · Binance</div>
              </div>
              <table className="data-table">
                <thead><tr><th>Coin</th><th>Price</th><th>Change</th><th>Volume</th></tr></thead>
                <tbody>
                  {list.map(t => (
                    <tr key={t.sym} style={{ cursor: 'pointer' }}
                      onClick={() => { setActiveCoin(TOP_COINS.findIndex(c => c.sym === t.sym)); setActiveTab('overview'); }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${t.color}22`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: t.color }}>{t.sym[0]}</div>
                          <div>
                            <div style={{ fontWeight: 700 }}>{t.sym}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.name}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'DM Mono' }}>{fmtPrice(t.price)}</td>
                      <td style={{ color: isGain ? 'var(--green)' : 'var(--red)', fontFamily: 'DM Mono', fontWeight: 700 }}>
                        {isGain ? '+' : ''}{t.chgPct?.toFixed(2)}%
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {t.quoteVol ? '$' + (t.quoteVol / 1e6).toFixed(1) + 'M' : '---'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ── AI SIGNALS ── */}
      {activeTab === 'signals' && (
        <div className="fade-in">
          {sigPhase === 'setup' && <SignalsSetup onStart={startScan} />}

          {sigPhase === 'scanning' && (
            <div style={{ maxWidth: 460, margin: '60px auto', textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 16 }}>₿</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>Scanning Crypto Markets...</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>
                7 indicators · 10 patterns · {sigConfig?.minConf}%+ confidence only
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, height: 12, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ width: `${sigProgress}%`, height: '100%', borderRadius: 10, background: 'linear-gradient(90deg,#f7931a,#e67e00)', transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 24 }}>
                <span>{sigMsg}</span><span>{sigProgress}%</span>
              </div>
              <button onClick={() => { cancelRef.current = true; setSigPhase('setup'); }}
                style={{ fontSize: 12, color: 'var(--red)', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '6px 16px', cursor: 'pointer' }}>Cancel</button>
            </div>
          )}

          {sigPhase === 'results' && (
            <div>
              <div className="panel" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                      🎯 Crypto Signals · {sigConfig?.minConf}%+ Confidence
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      Capital: <strong style={{ color: '#f7931a', fontFamily: 'DM Mono' }}>${sigConfig?.capital?.toLocaleString()}</strong>
                      &nbsp;·&nbsp;{sigConfig?.timeframe}&nbsp;·&nbsp;{sigResults.length} signals found
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
                    {[['ALL','All'],['LONG','🟢 Long'],['SHORT','🔴 Short']].map(([v, l]) => (
                      <button key={v} onClick={() => setSigFilter(v)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid',
                        borderColor: sigFilter === v ? '#f7931a' : 'var(--border)',
                        background: sigFilter === v ? 'rgba(247,147,26,0.15)' : 'var(--bg-secondary)',
                        color: sigFilter === v ? '#f7931a' : 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
                    ))}
                    <button onClick={() => { setSigPhase('setup'); setSigResults([]); }}
                      style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>🔄 Rescan</button>
                  </div>
                </div>
              </div>

              {sigResults.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
                  {[
                    ['Total',  sigResults.length,                           'var(--text-primary)'],
                    ['🟢 Long', sigResults.filter(r => r.dir==='LONG').length, 'var(--green)'],
                    ['🔴 Short',sigResults.filter(r => r.dir==='SHORT').length,'var(--red)'],
                    ['Best',   (sigResults[0]?.confidence ?? 0) + '%',      '#f7931a'],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: c, fontFamily: 'DM Mono' }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}

              {sigDisplayed.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
                  {sigDisplayed.map((r, i) => <CryptoSignalCard key={r.sym} result={r} rank={i + 1} onSelect={setSigSel} />)}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <div style={{ fontSize: 36, marginBottom: 14 }}>🔍</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                    No signals at {sigConfig?.minConf}%+ confidence
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                    Try lowering the confidence threshold or scan again.
                  </div>
                  <button onClick={() => { setSigPhase('setup'); setSigResults([]); }}
                    style={{ padding: '12px 26px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#f7931a,#e67e00)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    ← Change Settings
                  </button>
                </div>
              )}
            </div>
          )}

          {sigSelected && <CryptoSignalDetail result={sigSelected} capital={sigConfig?.capital ?? 1000} onClose={() => setSigSel(null)} />}
        </div>
      )}
    </div>
  );
}