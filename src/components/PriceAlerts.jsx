// src/components/PriceAlerts.jsx
import { useState, useEffect, useRef } from 'react';
import { fetchAllTickers } from '../hooks/useCryptoData';

const ALERTS_KEY = 'Market KA Khiladi_price_alerts';

// ── Helpers ─────────────────────────────────────────────────
function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '---';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function getNow() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function playBeep(freq = 880, dur = 400, type = 'sine') {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq; osc.type = type;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur / 1000);
  } catch {}
}

// ── NSE stocks/indices we can fetch via Upstox ──────────────
const NSE_INSTRUMENTS = [
  { sym: 'NIFTY 50',   token: 'NSE_INDEX|Nifty 50',          type: 'index' },
  { sym: 'BANK NIFTY', token: 'NSE_INDEX|Nifty Bank',         type: 'index' },
  { sym: 'FIN NIFTY',  token: 'NSE_INDEX|Nifty Fin Service',  type: 'index' },
  { sym: 'RELIANCE',   token: 'NSE_EQ|INE002A01018',          type: 'stock' },
  { sym: 'TCS',        token: 'NSE_EQ|INE467B01029',          type: 'stock' },
  { sym: 'HDFCBANK',   token: 'NSE_EQ|INE040A01034',          type: 'stock' },
  { sym: 'INFY',       token: 'NSE_EQ|INE009A01021',          type: 'stock' },
  { sym: 'ICICIBANK',  token: 'NSE_EQ|INE090A01021',          type: 'stock' },
  { sym: 'SBIN',       token: 'NSE_EQ|INE062A01020',          type: 'stock' },
  { sym: 'BAJFINANCE', token: 'NSE_EQ|INE296A01024',          type: 'stock' },
  { sym: 'TATAMOTORS', token: 'NSE_EQ|INE155A01022',          type: 'stock' },
  { sym: 'WIPRO',      token: 'NSE_EQ|INE075A01022',          type: 'stock' },
  { sym: 'AXISBANK',   token: 'NSE_EQ|INE238A01034',          type: 'stock' },
  { sym: 'MARUTI',     token: 'NSE_EQ|INE585B01010',          type: 'stock' },
  { sym: 'SUNPHARMA',  token: 'NSE_EQ|INE044A01036',          type: 'stock' },
];

const CRYPTO_INSTRUMENTS = [
  { sym: 'BTC',  pair: 'BTCUSDT',  type: 'crypto' },
  { sym: 'ETH',  pair: 'ETHUSDT',  type: 'crypto' },
  { sym: 'BNB',  pair: 'BNBUSDT',  type: 'crypto' },
  { sym: 'SOL',  pair: 'SOLUSDT',  type: 'crypto' },
  { sym: 'XRP',  pair: 'XRPUSDT',  type: 'crypto' },
  { sym: 'DOGE', pair: 'DOGEUSDT', type: 'crypto' },
  { sym: 'ADA',  pair: 'ADAUSDT',  type: 'crypto' },
];

// ── Fetch NSE price via Upstox quotes ────────────────────────
async function fetchNSEPrice(token) {
  try {
    const res  = await fetch(`http://localhost:5000/api/upstox/quotes?keys=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (data.status === 'success' && data.data) {
      const q = Object.values(data.data)[0];
      return q?.last_price ?? null;
    }
    return null;
  } catch { return null; }
}

// ── Alert Card ───────────────────────────────────────────────
function AlertCard({ alert, currentPrice, onDelete, onToggle }) {
  const triggered = alert.triggered;
  const isAbove   = alert.condition === 'above';
  const color     = triggered ? 'var(--gold)' : isAbove ? 'var(--green)' : 'var(--red)';
  const progress  = currentPrice != null && alert.targetPrice
    ? Math.min(100, Math.max(0,
        isAbove
          ? (currentPrice / alert.targetPrice) * 100
          : (alert.targetPrice / currentPrice) * 100
      ))
    : 0;

  const diff = currentPrice != null
    ? ((alert.targetPrice - currentPrice) / currentPrice * 100)
    : null;

  return (
    <div style={{
      background: triggered ? 'rgba(201,168,76,0.08)' : 'var(--bg-secondary)',
      border: `1px solid ${triggered ? 'rgba(201,168,76,0.5)' : color + '33'}`,
      borderRadius: 14, padding: 16, position: 'relative',
      animation: triggered ? 'pulse 2s infinite' : 'none',
    }}>
      {triggered && (
        <div style={{
          position: 'absolute', top: -1, left: -1, right: -1,
          background: 'linear-gradient(90deg,var(--gold),transparent)',
          height: 3, borderRadius: '14px 14px 0 0'
        }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{alert.sym}</span>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
              background: alert.market === 'crypto' ? 'rgba(247,147,26,0.15)' : 'rgba(59,130,246,0.15)',
              color: alert.market === 'crypto' ? '#f7931a' : 'var(--blue)'
            }}>{alert.market === 'crypto' ? '₿ CRYPTO' : '📈 NSE'}</span>
            {triggered && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: 'rgba(201,168,76,0.2)', color: 'var(--gold)' }}>
                🔔 TRIGGERED
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{alert.note || 'No note'}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onToggle(alert.id)} style={{
            padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
            background: alert.active ? 'rgba(34,197,94,0.1)' : 'var(--bg-primary)',
            color: alert.active ? 'var(--green)' : 'var(--text-muted)', fontSize: 10, cursor: 'pointer'
          }}>{alert.active ? '● On' : '○ Off'}</button>
          <button onClick={() => onDelete(alert.id)} style={{
            padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer'
          }}>🗑</button>
        </div>
      </div>

      {/* Condition */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text-muted)',
          background: 'var(--bg-primary)', padding: '4px 12px', borderRadius: 8
        }}>
          Alert when price goes
        </div>
        <div style={{
          fontSize: 14, fontWeight: 800, color,
          background: `${color}15`, padding: '4px 14px', borderRadius: 8, border: `1px solid ${color}44`
        }}>
          {isAbove ? '▲ ABOVE' : '▼ BELOW'} {alert.market === 'crypto' ? '$' : '₹'}{fmt(alert.targetPrice)}
        </div>
      </div>

      {/* Progress toward target */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          <span>Current: <strong style={{ color: 'var(--text-primary)', fontFamily: 'DM Mono' }}>
            {currentPrice != null ? (alert.market === 'crypto' ? '$' : '₹') + fmt(currentPrice) : 'Fetching...'}
          </strong></span>
          {diff != null && (
            <span style={{ color }}>
              {isAbove
                ? diff > 0 ? `₹${fmt(Math.abs(diff * currentPrice / 100))} away (+${Math.abs(diff).toFixed(2)}%)` : '✅ Target passed'
                : diff < 0 ? `₹${fmt(Math.abs(diff * currentPrice / 100))} away (-${Math.abs(diff).toFixed(2)}%)` : '✅ Target passed'
              }
            </span>
          )}
        </div>
        <div style={{ background: 'var(--bg-primary)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div style={{
            width: progress + '%', height: '100%', borderRadius: 4,
            background: triggered ? 'var(--gold)' : `linear-gradient(90deg,${color}66,${color})`,
            transition: 'width 0.5s ease'
          }} />
        </div>
      </div>

      {triggered && alert.triggeredAt && (
        <div style={{ fontSize: 11, color: 'var(--gold)' }}>
          🔔 Triggered at {alert.triggeredAt}
        </div>
      )}
    </div>
  );
}

// ── Triggered Alert Toast ────────────────────────────────────
function Toast({ alerts, onDismiss }) {
  if (!alerts.length) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380
    }}>
      {alerts.map(a => (
        <div key={a.id} style={{
          background: 'linear-gradient(135deg,rgba(201,168,76,0.95),rgba(180,140,30,0.95))',
          borderRadius: 12, padding: '14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 12, animation: 'slideIn 0.3s ease'
        }}>
          <span style={{ fontSize: 24 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#000' }}>Alert Triggered!</div>
            <div style={{ fontSize: 12, color: '#333' }}>
              {a.sym} {a.condition === 'above' ? 'crossed above' : 'dropped below'} {a.market === 'crypto' ? '$' : '₹'}{fmt(a.targetPrice)}
            </div>
          </div>
          <button onClick={() => onDismiss(a.id)} style={{
            background: 'rgba(0,0,0,0.2)', border: 'none', borderRadius: 6,
            color: '#000', width: 28, height: 28, cursor: 'pointer', fontSize: 14
          }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────
export default function PriceAlerts({ indices, tickers }) {
  const [alerts,    setAlerts]    = useState(() => JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]'));
  const [prices,    setPrices]    = useState({});
  const [toasts,    setToasts]    = useState([]);
  const [showForm,  setShowForm]  = useState(false);
  const [lastCheck, setLastCheck] = useState('');
  const [muted,     setMuted]     = useState(false);
  const triggeredRef = useRef(new Set());
  const [filter,    setFilter]    = useState('all'); // all | active | triggered

  // Form state
  const [market,    setMarket]    = useState('nse');
  const [sym,       setSym]       = useState('NIFTY 50');
  const [condition, setCondition] = useState('above');
  const [target,    setTarget]    = useState('');
  const [note,      setNote]      = useState('');
  const [repeat,    setRepeat]    = useState(false);

  // Persist alerts
  useEffect(() => { localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts)); }, [alerts]);

  // ── Price polling every 10 seconds ──────────────────────────
  useEffect(() => {
    async function checkPrices() {
      const newPrices = { ...prices };

      // NSE prices from Upstox quotes
      const nseAlerts = alerts.filter(a => a.active && a.market === 'nse');
      for (const alert of nseAlerts) {
        const instr = NSE_INSTRUMENTS.find(i => i.sym === alert.sym);
        if (instr && !newPrices[alert.sym]) {
          const p = await fetchNSEPrice(instr.token);
          if (p) newPrices[alert.sym] = p;
        }
      }

      // Crypto prices from Binance
      const cryptoAlerts = alerts.filter(a => a.active && a.market === 'crypto');
      if (cryptoAlerts.length) {
        const cryptoPrices = await fetchAllTickers();
        cryptoPrices.forEach(t => { newPrices[t.sym] = t.price; });
      }

      // Also use live prices from props if available
      indices?.forEach(idx => {
        const map = { 'NIFTY 50': 'NIFTY 50', 'BANK NIFTY': 'BANK NIFTY' };
        if (idx.price) newPrices[map[idx.label] || idx.label] = idx.price;
      });

      setPrices(newPrices);
      setLastCheck(getNow());

      // Check triggers
      const newlyTriggered = [];
      setAlerts(prev => prev.map(alert => {
        if (!alert.active || alert.triggered) return alert;
        const price = newPrices[alert.sym];
        if (price == null) return alert;
        const hit = alert.condition === 'above' ? price >= alert.targetPrice : price <= alert.targetPrice;
        if (hit && !triggeredRef.current.has(alert.id)) {
          triggeredRef.current.add(alert.id);
          newlyTriggered.push(alert);
          return { ...alert, triggered: true, triggeredAt: getNow(), active: alert.repeat };
        }
        return alert;
      }));

      if (newlyTriggered.length) {
        setToasts(t => [...t, ...newlyTriggered]);
        if (!muted) {
          newlyTriggered.forEach(() => playBeep(1000, 500));
          setTimeout(() => newlyTriggered.forEach(() => playBeep(800, 300)), 600);
        }
      }
    }

    checkPrices();
    const id = setInterval(checkPrices, 10000);
    return () => clearInterval(id);
  }, [alerts, muted]);

  function addAlert() {
    if (!target || !sym) return;
    const newAlert = {
      id: Date.now(), sym, market,
      condition, targetPrice: parseFloat(target),
      note, repeat, active: true, triggered: false,
      createdAt: getNow(),
    };
    setAlerts(a => [newAlert, ...a]);
    setTarget(''); setNote('');
    setShowForm(false);
  }

  function deleteAlert(id) {
    triggeredRef.current.delete(id);
    setAlerts(a => a.filter(x => x.id !== id));
  }
  function toggleAlert(id) {
    setAlerts(a => a.map(x => x.id === id ? { ...x, active: !x.active, triggered: x.triggered && x.active ? false : x.triggered } : x));
  }
  function clearTriggered() {
    triggeredRef.current.clear();
    setAlerts(a => a.map(x => ({ ...x, triggered: false })));
  }
  function dismissToast(id) { setToasts(t => t.filter(x => x.id !== id)); }

  const filtered = alerts.filter(a =>
    filter === 'active'    ? a.active && !a.triggered :
    filter === 'triggered' ? a.triggered :
    true
  );

  const currentSymOptions = market === 'nse'
    ? NSE_INSTRUMENTS.map(i => i.sym)
    : CRYPTO_INSTRUMENTS.map(i => i.sym);

  const activeCount    = alerts.filter(a => a.active && !a.triggered).length;
  const triggeredCount = alerts.filter(a => a.triggered).length;

  return (
    <div className="fade-in">
      {/* Toast notifications */}
      <Toast alerts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,rgba(251,191,36,0.1),rgba(10,14,26,0))',
        border: '1px solid rgba(251,191,36,0.25)', borderRadius: 14,
        padding: '16px 22px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: 28 }}>🔔</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Price Alerts</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Set alerts for NSE stocks, indices and crypto · Checks every 10 seconds · Audio notification
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {lastCheck && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Last Check</div>
              <div style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--green)' }}>{lastCheck}</div>
            </div>
          )}
          <button onClick={() => setMuted(m => !m)} style={{
            padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)',
            background: muted ? 'rgba(239,68,68,0.1)' : 'var(--bg-secondary)',
            color: muted ? 'var(--red)' : 'var(--text-muted)', fontSize: 12, cursor: 'pointer'
          }}>{muted ? '🔇 Muted' : '🔔 Sound On'}</button>
          <button onClick={() => setShowForm(s => !s)} style={{
            padding: '9px 20px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg,#fbbf24,#d97706)',
            color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer'
          }}>+ New Alert</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          ['Total Alerts',  alerts.length,    'var(--text-primary)'],
          ['Active',        activeCount,       'var(--green)'],
          ['Triggered',     triggeredCount,    'var(--gold)'],
          ['Checking Every','10 seconds',      'var(--blue)'],
        ].map(([l, v, c]) => (
          <div key={l} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: 'DM Mono' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* New alert form */}
      {showForm && (
        <div className="panel" style={{ marginBottom: 16, border: '1px solid rgba(251,191,36,0.3)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>🔔 Create New Price Alert</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 14 }}>
            {/* Market */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Market</div>
              <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {[['nse', '📈 NSE'], ['crypto', '₿ Crypto']].map(([m, l]) => (
                  <button key={m} onClick={() => { setMarket(m); setSym(m === 'nse' ? 'NIFTY 50' : 'BTC'); }} style={{
                    flex: 1, padding: '8px 4px', border: 'none',
                    background: market === m ? (m === 'nse' ? 'rgba(59,130,246,0.3)' : 'rgba(247,147,26,0.3)') : 'var(--bg-primary)',
                    color: market === m ? (m === 'nse' ? 'var(--blue)' : '#f7931a') : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Symbol */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Symbol</div>
              <select value={sym} onChange={e => setSym(e.target.value)} className="ai-select" style={{ width: '100%' }}>
                {currentSymOptions.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {/* Condition */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Condition</div>
              <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {[['above', '▲ Above'], ['below', '▼ Below']].map(([c, l]) => (
                  <button key={c} onClick={() => setCondition(c)} style={{
                    flex: 1, padding: '8px 4px', border: 'none',
                    background: condition === c ? (c === 'above' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)') : 'var(--bg-primary)',
                    color: condition === c ? (c === 'above' ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Target price */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 6, fontWeight: 600 }}>
                Target Price {market === 'crypto' ? '($)' : '(₹)'}
              </div>
              <input type="number" step="0.01" value={target} onChange={e => setTarget(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAlert()}
                placeholder={market === 'crypto' ? '$0.00' : '₹0'}
                style={{
                  width: '100%', padding: '9px 10px', background: 'var(--bg-primary)',
                  border: '1px solid rgba(201,168,76,0.4)', borderRadius: 8,
                  color: 'var(--text-primary)', fontSize: 15, fontFamily: 'DM Mono',
                  outline: 'none', boxSizing: 'border-box'
                }} />
            </div>

            {/* Note */}
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Note (optional)</div>
              <input type="text" value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. Buy NIFTY CE when it crosses this level"
                style={{
                  width: '100%', padding: '9px 12px', background: 'var(--bg-primary)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box'
                }} />
            </div>
          </div>

          {/* Repeat toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            <input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)}
              style={{ accentColor: 'var(--gold)', width: 16, height: 16 }} />
            Repeat alert (re-activate after trigger)
          </label>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={addAlert} disabled={!target || !sym} style={{
              padding: '11px 24px', borderRadius: 9, border: 'none',
              background: target && sym ? 'linear-gradient(135deg,#fbbf24,#d97706)' : 'var(--bg-primary)',
              color: target && sym ? '#000' : 'var(--text-muted)',
              fontSize: 13, fontWeight: 800, cursor: target && sym ? 'pointer' : 'not-allowed'
            }}>🔔 Set Alert</button>
            <button onClick={() => setShowForm(false)} style={{
              padding: '11px 18px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer'
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          {[['all', 'All (' + alerts.length + ')'], ['active', '🟢 Active (' + activeCount + ')'], ['triggered', '🔔 Triggered (' + triggeredCount + ')']].map(([f, l]) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', borderRadius: 7, border: '1px solid',
              borderColor: filter === f ? 'var(--gold)' : 'var(--border)',
              background: filter === f ? 'rgba(201,168,76,0.15)' : 'var(--bg-secondary)',
              color: filter === f ? 'var(--gold)' : 'var(--text-muted)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}>{l}</button>
          ))}
          {triggeredCount > 0 && (
            <button onClick={clearTriggered} style={{
              marginLeft: 'auto', padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.08)', color: 'var(--red)', fontSize: 11, cursor: 'pointer'
            }}>Clear All Triggered</button>
          )}
        </div>
      )}

      {/* Alert cards */}
      {filtered.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 12 }}>
          {filtered.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              currentPrice={prices[alert.sym] ?? null}
              onDelete={deleteAlert}
              onToggle={toggleAlert}
            />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔔</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            {alerts.length === 0 ? 'No Alerts Set' : 'No alerts in this filter'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 380, margin: '0 auto 24px', lineHeight: 1.8 }}>
            {alerts.length === 0
              ? 'Click "+ New Alert" to set a price alert for any NSE stock, index or crypto coin. You\'ll get an audio notification when the price is hit.'
              : 'Try switching the filter above.'}
          </div>
          {alerts.length === 0 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['NIFTY 50 above 24000', 'BTC above $100K', 'RELIANCE below ₹1200', 'ETH above $4000'].map(ex => (
                <div key={ex} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  e.g. {ex}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}