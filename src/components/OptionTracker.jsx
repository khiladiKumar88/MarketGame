// src/components/OptionTracker.jsx
import { useState, useEffect, useRef, useCallback } from 'react';

// ── Helpers ─────────────────────────────────────────────────
function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '---';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function getNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}
function getTimeStr() {
  const t = getNow();
  return t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function isMarketOpen() {
  const t = getNow();
  const m = t.getHours() * 60 + t.getMinutes();
  return m >= 9 * 60 + 15 && m <= 15 * 60 + 30;
}
function pnl(entry, current, lots, lotSize) {
  if (!entry || !current || !lots || !lotSize) return null;
  return (current - entry) * lots * lotSize;
}
function pct(entry, current) {
  if (!entry || !current) return null;
  return ((current - entry) / entry * 100);
}

// ── Fetch live option quote via Upstox proxy ─────────────────
async function fetchOptionQuote(instrumentKey) {
  try {
    const res  = await fetch(`http://localhost:5000/api/upstox/quotes?keys=${encodeURIComponent(instrumentKey)}`);
    const data = await res.json();
    if (data.status === 'success' && data.data) {
      const q = Object.values(data.data)[0];
      return {
        ltp:    q?.last_price    ?? null,
        oi:     q?.oi            ?? null,
        volume: q?.volume        ?? null,
        bid:    q?.depth?.buy?.[0]?.price  ?? null,
        ask:    q?.depth?.sell?.[0]?.price ?? null,
        high:   q?.ohlc?.high    ?? null,
        low:    q?.ohlc?.low     ?? null,
        open:   q?.ohlc?.open    ?? null,
        close:  q?.ohlc?.close   ?? null,
      };
    }
    return null;
  } catch { return null; }
}

// ── Fetch expiry list ────────────────────────────────────────
async function fetchExpiries(symbol) {
  try {
    const res  = await fetch(`http://localhost:5000/api/upstox/expiry/${symbol}`);
    const data = await res.json();
    if (data.status === 'success' && data.data?.length) {
      return [...new Set(data.data.map(d => d.expiry))].sort();
    }
    return [];
  } catch { return []; }
}

// ── Fetch options for a strike ────────────────────────────────
async function fetchOptionsForStrike(symbol, expiry) {
  try {
    const res  = await fetch(`http://localhost:5000/api/upstox/options/${symbol}/${expiry}`);
    const data = await res.json();
    if (data.status === 'success' && data.data?.length) return data.data;
    return [];
  } catch { return []; }
}

// ── Alert sound (beep using Web Audio API) ────────────────────
function playBeep(frequency = 800, duration = 300, type = 'sine') {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = type;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration / 1000);
  } catch {}
}

// ── Mini sparkline chart ──────────────────────────────────────
function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const w = 200, h = 50;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return x + ',' + y;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={(data.length - 1) / (data.length - 1) * w} cy={h - ((data[data.length - 1] - min) / range) * (h - 4) - 2} r={3} fill={color} />
    </svg>
  );
}

// ── Alert Item ────────────────────────────────────────────────
function AlertItem({ alert }) {
  const typeConfig = {
    TARGET1:   { icon: '🎯', label: 'Target 1 Hit!',     color: 'var(--green)', bg: 'rgba(34,197,94,0.1)'  },
    TARGET2:   { icon: '🚀', label: 'Target 2 Hit!',     color: 'var(--green)', bg: 'rgba(34,197,94,0.15)' },
    STOPLOSS:  { icon: '🛑', label: 'Stop Loss Hit!',    color: 'var(--red)',   bg: 'rgba(239,68,68,0.1)'  },
    TIME315:   { icon: '⏰', label: '3:15 PM — Exit Now!',color: 'var(--red)',   bg: 'rgba(239,68,68,0.15)' },
    TIME330:   { icon: '⚠️', label: '3:30 PM Warning',   color: 'var(--gold)',  bg: 'rgba(201,168,76,0.1)' },
    PROFIT30:  { icon: '💰', label: '+30% Profit',        color: 'var(--green)', bg: 'rgba(34,197,94,0.08)' },
    LOSS20:    { icon: '⚠️', label: '-20% Loss Warning',  color: 'var(--gold)',  bg: 'rgba(201,168,76,0.08)'},
    SURGE:     { icon: '⚡', label: 'Premium Surge!',     color: 'var(--gold)',  bg: 'rgba(201,168,76,0.08)'},
  };
  const cfg = typeConfig[alert.type] || { icon: '📢', label: alert.type, color: 'var(--text-primary)', bg: 'var(--bg-secondary)' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      background: cfg.bg, border: `1px solid ${cfg.color}33`, borderRadius: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 18 }}>{cfg.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{alert.message} · {alert.time}</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
export default function OptionTracker() {
  // ── Setup state ──
  const [symbol,   setSymbol]   = useState('NIFTY');
  const [expiries, setExpiries] = useState([]);
  const [expiry,   setExpiry]   = useState('');
  const [options,  setOptions]  = useState([]);
  const [strike,   setStrike]   = useState('');
  const [optType,  setOptType]  = useState('CE');
  const [instrKey, setInstrKey] = useState('');

  // ── Trade config ──
  const [entryPrice, setEntryPrice] = useState('');
  const [target1,    setTarget1]    = useState('');
  const [target2,    setTarget2]    = useState('');
  const [stopLoss,   setStopLoss]   = useState('');
  const [lots,       setLots]       = useState(1);
  const [lotSize,    setLotSize]    = useState(75);
  const [tracking,   setTracking]   = useState(false);

  // ── Live data ──
  const [quote,      setQuote]      = useState(null);
  const [priceHist,  setPriceHist]  = useState([]);
  const [alerts,     setAlerts]     = useState([]);
  const [lastUpdate, setLastUpdate] = useState('');
  const [elapsed,    setElapsed]    = useState(0); // seconds since entry
  const [alertMuted, setAlertMuted] = useState(false);

  // ── Refs ──
  const intervalRef   = useRef(null);
  const alertsRef     = useRef(new Set());
  const entryTimeRef  = useRef(null);
  const elapsedRef    = useRef(null);

  const LOT_SIZES = { NIFTY: 75, BANKNIFTY: 15, FINNIFTY: 40 };

  // ── Load expiries when symbol changes ──
  useEffect(() => {
    setExpiries([]); setExpiry(''); setOptions([]); setStrike(''); setInstrKey('');
    fetchExpiries(symbol).then(e => {
      setExpiries(e);
      if (e.length) setExpiry(e[0]);
    });
    setLotSize(LOT_SIZES[symbol] || 75);
  }, [symbol]);

  // ── Load options when expiry changes ──
  useEffect(() => {
    if (!expiry) return;
    setOptions([]); setStrike(''); setInstrKey('');
    fetchOptionsForStrike(symbol, expiry).then(opts => {
      setOptions(opts);
      // Default to ATM — will be set by user
    });
  }, [expiry, symbol]);

  // ── Update instrument key when strike/type changes ──
  useEffect(() => {
    if (!strike || !options.length) return;
    const opt = options.find(o => o.strike_price == strike && o.instrument_type === optType);
    if (opt) setInstrKey(opt.instrument_key);
    else setInstrKey('');
  }, [strike, optType, options]);

  // ── Auto-fill targets/SL when entry price changes ──
  useEffect(() => {
    const e = parseFloat(entryPrice);
    if (!e || isNaN(e)) return;
    if (!target1) setTarget1((e * 1.30).toFixed(1));
    if (!target2) setTarget2((e * 1.60).toFixed(1));
    if (!stopLoss) setStopLoss((e * 0.70).toFixed(1));
  }, [entryPrice]);

  // ── Start/stop tracking ──
  function startTracking() {
    if (!instrKey) { alert('Please select a valid option first'); return; }
    if (!entryPrice) { alert('Please enter your entry price'); return; }
    alertsRef.current = new Set();
    setAlerts([]);
    setPriceHist([]);
    entryTimeRef.current = new Date();
    setTracking(true);
    setElapsed(0);
  }

  function stopTracking() {
    setTracking(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
  }

  // ── Poll live price every 3 seconds when tracking ──
  useEffect(() => {
    if (!tracking || !instrKey) return;

    async function poll() {
      const q = await fetchOptionQuote(instrKey);
      if (!q || q.ltp == null) return;
      setQuote(q);
      setLastUpdate(getTimeStr());
      setPriceHist(h => [...h.slice(-59), q.ltp]); // keep last 60 points
      checkAlerts(q.ltp);
    }

    poll(); // immediate first fetch
    intervalRef.current = setInterval(poll, 3000);

    // Elapsed timer
    elapsedRef.current = setInterval(() => {
      setElapsed(s => s + 1);
    }, 1000);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(elapsedRef.current);
    };
  }, [tracking, instrKey]);

  // ── Check alerts ──
  function checkAlerts(currentLtp) {
    const entry = parseFloat(entryPrice);
    const t1    = parseFloat(target1);
    const t2    = parseFloat(target2);
    const sl    = parseFloat(stopLoss);
    const now   = getTimeStr();
    const ist   = getNow();
    const mins  = ist.getHours() * 60 + ist.getMinutes();

    function addAlert(type, message) {
      if (alertsRef.current.has(type)) return;
      alertsRef.current.add(type);
      setAlerts(a => [{ type, message, time: now }, ...a].slice(0, 20));
      if (!alertMuted) {
        if (type === 'STOPLOSS' || type === 'TIME315') playBeep(400, 600, 'square');
        else if (type === 'TARGET1' || type === 'TARGET2') playBeep(1000, 400);
        else playBeep(600, 200);
      }
    }

    if (t1 && currentLtp >= t1) addAlert('TARGET1', 'Premium ₹' + currentLtp.toFixed(1) + ' reached Target 1 ₹' + t1);
    if (t2 && currentLtp >= t2) addAlert('TARGET2', 'Premium ₹' + currentLtp.toFixed(1) + ' reached Target 2 ₹' + t2);
    if (sl && currentLtp <= sl) addAlert('STOPLOSS', 'Premium ₹' + currentLtp.toFixed(1) + ' hit Stop Loss ₹' + sl + ' — EXIT NOW');
    if (mins >= 15 * 60 + 15)   addAlert('TIME315',  'It is 3:15 PM — Exit all positions NOW');
    if (mins >= 14 * 60 + 45 && mins < 15 * 60 + 15) addAlert('TIME330', '30 minutes to close — prepare to exit');

    // Profit milestone
    if (entry && currentLtp >= entry * 1.30) addAlert('PROFIT30', 'You are up 30%+ on this trade');

    // Loss warning
    if (entry && currentLtp <= entry * 0.80) addAlert('LOSS20', 'Down 20% — consider exiting');

    // Surge detection (5% move in last few ticks)
    setPriceHist(h => {
      if (h.length >= 5) {
        const recent = h.slice(-5);
        const move = Math.abs(currentLtp - recent[0]) / recent[0] * 100;
        if (move > 5) addAlert('SURGE', 'Premium moved ' + move.toFixed(1) + '% in last 15 seconds');
      }
      return h;
    });
  }

  // ── Derived values ──
  const currentLtp  = quote?.ltp ?? null;
  const entryNum    = parseFloat(entryPrice) || null;
  const currentPnl  = pnl(entryNum, currentLtp, lots, lotSize);
  const currentPct  = pct(entryNum, currentLtp);
  const pnlColor    = currentPnl == null ? 'var(--text-muted)' : currentPnl >= 0 ? 'var(--green)' : 'var(--red)';
  const hasAlert    = alerts.length > 0 && ['TARGET1','TARGET2','STOPLOSS','TIME315'].some(t => alertsRef.current.has(t));

  // Progress toward targets/SL
  const t1Pct = entryNum && target1 ? Math.min(100, Math.max(0, (currentLtp - entryNum) / (parseFloat(target1) - entryNum) * 100)) : 0;
  const slPct = entryNum && stopLoss ? Math.min(100, Math.max(0, (entryNum - currentLtp) / (entryNum - parseFloat(stopLoss)) * 100)) : 0;

  const elapsedStr = elapsed > 0
    ? Math.floor(elapsed / 3600) + 'h ' + Math.floor((elapsed % 3600) / 60) + 'm ' + (elapsed % 60) + 's'
    : '0s';

  // Unique strikes list
  const strikes = [...new Set(options.map(o => o.strike_price))].sort((a, b) => a - b);

  return (
    <div className="fade-in">
      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg,rgba(239,68,68,0.1),rgba(10,14,26,0))',
        border: `1px solid ${hasAlert ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.25)'}`,
        borderRadius: 14, padding: '16px 22px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        animation: hasAlert ? 'pulse 1s infinite' : 'none' }}>
        <span style={{ fontSize: 28 }}>📡</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Live Option Premium Tracker</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Tracks your option in real-time · Auto-alerts for Target, Stop Loss & 3:15 PM exit
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {tracking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 1s infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>LIVE · {lastUpdate}</span>
            </div>
          )}
          <button onClick={() => setAlertMuted(m => !m)} style={{
            padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
            background: alertMuted ? 'rgba(239,68,68,0.1)' : 'var(--bg-secondary)',
            color: alertMuted ? 'var(--red)' : 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
            {alertMuted ? '🔇 Muted' : '🔔 Sound On'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: tracking ? '1fr 380px' : '1fr', gap: 16 }}>
        {/* ── LEFT: Setup + Live data ── */}
        <div>
          {/* Option Selector */}
          {!tracking && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
                🎯 Select Option to Track
              </div>

              {/* Symbol + Expiry */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Index</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['NIFTY','BANKNIFTY','FINNIFTY'].map(s => (
                      <button key={s} onClick={() => setSymbol(s)} style={{
                        padding: '7px 14px', borderRadius: 7, border: '1px solid',
                        borderColor: symbol === s ? 'var(--gold)' : 'var(--border)',
                        background:  symbol === s ? 'rgba(201,168,76,0.15)' : 'var(--bg-primary)',
                        color:       symbol === s ? 'var(--gold)' : 'var(--text-muted)',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Expiry</div>
                  <select value={expiry} onChange={e => setExpiry(e.target.value)} className="ai-select" style={{ minWidth: 160 }}>
                    {expiries.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>

              {/* Strike + Type */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Strike Price</div>
                  <select value={strike} onChange={e => setStrike(e.target.value)} className="ai-select" style={{ width: '100%' }}>
                    <option value="">Select strike...</option>
                    {strikes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Option Type</div>
                  <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    {['CE','PE'].map(t => (
                      <button key={t} onClick={() => setOptType(t)} style={{
                        padding: '8px 24px', border: 'none',
                        background: optType === t ? (t === 'CE' ? 'var(--green)' : 'var(--red)') : 'var(--bg-primary)',
                        color: optType === t ? '#fff' : 'var(--text-muted)',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Lots</div>
                  <input type="number" min={1} max={50} value={lots} onChange={e => setLots(Number(e.target.value))}
                    style={{ width: 70, padding: '8px 10px', background: 'var(--bg-primary)',
                      border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
                      fontSize: 14, fontFamily: 'DM Mono', outline: 'none', textAlign: 'center' }} />
                </div>
              </div>

              {/* Option name display */}
              {strike && instrKey && (
                <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(201,168,76,0.08)',
                  border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tracking: </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', fontFamily: 'DM Mono' }}>
                    {symbol} {strike} {optType} · {expiry} · {lots} lot{lots > 1 ? 's' : ''} × {lotSize} qty
                  </span>
                </div>
              )}

              {/* Entry + Targets */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  ['Entry Price ₹', entryPrice, setEntryPrice, 'var(--gold)'],
                  ['Target 1 ₹',   target1,    setTarget1,    'var(--green)'],
                  ['Target 2 ₹',   target2,    setTarget2,    'var(--green)'],
                  ['Stop Loss ₹',  stopLoss,   setStopLoss,   'var(--red)'],
                ].map(([label, val, setter, color]) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color, marginBottom: 6, fontWeight: 600 }}>{label}</div>
                    <input type="number" step="0.5" value={val} onChange={e => setter(e.target.value)}
                      placeholder="₹0"
                      style={{ width: '100%', padding: '9px 10px', background: 'var(--bg-primary)',
                        border: `1px solid ${color}44`, borderRadius: 8, color: 'var(--text-primary)',
                        fontSize: 14, fontFamily: 'DM Mono', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>

              <button onClick={startTracking} disabled={!instrKey || !entryPrice}
                style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none',
                  background: instrKey && entryPrice ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'var(--bg-primary)',
                  color: '#fff', fontSize: 15, fontWeight: 800, cursor: instrKey && entryPrice ? 'pointer' : 'not-allowed',
                  opacity: instrKey && entryPrice ? 1 : 0.5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                📡 Start Live Tracking
              </button>
            </div>
          )}

          {/* Live Tracking View */}
          {tracking && (
            <div>
              {/* Big LTP card */}
              <div style={{ background: 'var(--bg-secondary)', border: `2px solid ${pnlColor}44`,
                borderRadius: 16, padding: 24, marginBottom: 16, textAlign: 'center', position: 'relative' }}>

                <div style={{ position: 'absolute', top: 14, left: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 1s infinite' }} />
                  <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>LIVE</span>
                </div>

                <div style={{ position: 'absolute', top: 14, right: 16 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>In trade: {elapsedStr}</span>
                </div>

                <div style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700, marginBottom: 4 }}>
                  {symbol} {strike} {optType} · {expiry}
                </div>
                <div style={{ fontSize: 48, fontWeight: 900, fontFamily: 'DM Mono', color: 'var(--text-primary)', lineHeight: 1 }}>
                  ₹{currentLtp != null ? fmt(currentLtp) : '---'}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: pnlColor, marginTop: 6, fontFamily: 'DM Mono' }}>
                  {currentPct != null ? (currentPct >= 0 ? '▲ +' : '▼ ') + Math.abs(currentPct).toFixed(2) + '%' : '---'}
                  <span style={{ fontSize: 13, marginLeft: 8 }}>
                    ({currentPnl != null ? (currentPnl >= 0 ? '+' : '') + '₹' + fmt(Math.abs(currentPnl)) : '---'} P&L)
                  </span>
                </div>

                {/* Sparkline */}
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                  <Sparkline data={priceHist} color={pnlColor} />
                </div>
              </div>

              {/* Target + SL progress */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {/* Target progress */}
                <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>🎯 Target 1</span>
                    <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--green)' }}>₹{target1 || '---'}</span>
                  </div>
                  <div style={{ background: 'var(--bg-primary)', borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ width: t1Pct + '%', height: '100%', borderRadius: 4, background: 'var(--green)', transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t1Pct.toFixed(0)}% of the way there</div>
                </div>

                {/* SL progress */}
                <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>🛑 Stop Loss</span>
                    <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--red)' }}>₹{stopLoss || '---'}</span>
                  </div>
                  <div style={{ background: 'var(--bg-primary)', borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ width: slPct + '%', height: '100%', borderRadius: 4, background: 'var(--red)', transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{slPct.toFixed(0)}% toward stop loss</div>
                </div>
              </div>

              {/* Live quote details */}
              {quote && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
                  {[
                    ['Entry', '₹' + fmt(entryNum),       'var(--gold)'],
                    ['High',  '₹' + fmt(quote.high),      'var(--green)'],
                    ['Low',   '₹' + fmt(quote.low),       'var(--red)'],
                    ['OI',    quote.oi ? (quote.oi/1000).toFixed(0)+'K' : '---', 'var(--text-muted)'],
                    ['Bid',   '₹' + fmt(quote.bid),       'var(--green)'],
                    ['Ask',   '₹' + fmt(quote.ask),       'var(--red)'],
                    ['Volume',quote.volume ? (quote.volume/1000).toFixed(1)+'K' : '---', 'var(--text-muted)'],
                    ['T2',    '₹' + fmt(parseFloat(target2)), 'var(--green)'],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: c, fontFamily: 'DM Mono' }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Stop button */}
              <button onClick={stopTracking}
                style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)', color: 'var(--text-muted)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                ⏹ Stop Tracking
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT: Alerts panel (only when tracking) ── */}
        {tracking && (
          <div>
            <div className="panel" style={{ height: '100%', minHeight: 400 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  🔔 Live Alerts
                </div>
                {alerts.length > 0 && (
                  <button onClick={() => { setAlerts([]); alertsRef.current = new Set(); }}
                    style={{ fontSize: 11, color: 'var(--text-muted)', background: 'transparent',
                      border: '1px solid var(--border)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                    Clear
                  </button>
                )}
              </div>

              {alerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🔕</div>
                  <div style={{ fontSize: 13 }}>No alerts yet</div>
                  <div style={{ fontSize: 11, marginTop: 6 }}>Alerts will appear here when price hits your target, stop loss or time limits</div>
                </div>
              ) : (
                <div>
                  {alerts.map((a, i) => <AlertItem key={i} alert={a} />)}
                </div>
              )}

              {/* Rules reminder */}
              <div style={{ marginTop: 20, padding: 14, background: 'rgba(201,168,76,0.06)',
                border: '1px solid rgba(201,168,76,0.2)', borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>📌 Exit Rules</div>
                {[
                  '✅ Exit at Target 1 — bank at least partial profit',
                  '🚀 Move SL to cost after Target 1 hit',
                  '🛑 Exit IMMEDIATELY when SL is hit — no averaging',
                  '⏰ Exit compulsorily by 3:15 PM — no exceptions',
                  '❌ Never hold options overnight',
                ].map((r, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5, lineHeight: 1.5 }}>{r}</div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}