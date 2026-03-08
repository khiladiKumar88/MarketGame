// src/components/DashboardHome.jsx
import { useState, useEffect } from 'react';
import { fetchUpstoxCandles } from '../hooks/useUpstoxData';
import { fetchAllTickers } from '../hooks/useCryptoData';

const GROQ_KEY = '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';
const JOURNAL_KEY   = 'Market KA Khiladi_journal';
const PAPER_KEY     = 'Market KA Khiladi_paper_trades';
const ALERTS_KEY    = 'Market KA Khiladi_price_alerts';
const PORT_KEY      = 'Market KA Khiladi_portfolio';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '---';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPrice(n) {
  if (!n) return '---';
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return '$' + n.toFixed(4);
  return '$' + n.toFixed(6);
}
function getNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}
function getGreeting() {
  const h = getNow().getHours();
  if (h < 12) return { text: 'Good Morning', icon: '🌅' };
  if (h < 17) return { text: 'Good Afternoon', icon: '☀️' };
  return { text: 'Good Evening', icon: '🌙' };
}
function getMarketStatus() {
  const t = getNow();
  const m = t.getHours() * 60 + t.getMinutes();
  if (m < 9 * 60)            return { label: 'Pre-Market',   color: 'var(--gold)',  open: false };
  if (m < 9 * 60 + 15)       return { label: 'Opening',      color: '#f7931a',      open: false };
  if (m <= 15 * 60 + 30)     return { label: 'Market Open',  color: 'var(--green)', open: true  };
  return                            { label: 'Market Closed', color: 'var(--red)',   open: false };
}

// ── Mini stat card ───────────────────────────────────────────
function MiniCard({ icon, label, value, sub, color, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '14px 16px', cursor: onClick ? 'pointer' : 'default',
      transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = color || 'var(--gold)')}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = 'var(--border)')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: color || 'var(--text-primary)', fontFamily: 'DM Mono' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Index Pill ───────────────────────────────────────────────
function IndexPill({ label, price, chgPct }) {
  const up = (chgPct ?? 0) >= 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 16px', flex: 1, minWidth: 180,
    }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'DM Mono', color: 'var(--text-primary)' }}>
          {price ? '₹' + fmt(price) : '---'}
        </div>
      </div>
      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: up ? 'var(--green)' : 'var(--red)', fontFamily: 'DM Mono' }}>
          {chgPct != null ? (up ? '▲ +' : '▼ ') + Math.abs(chgPct).toFixed(2) + '%' : '---'}
        </div>
      </div>
    </div>
  );
}

// ── Market Morning Brief from Groq ───────────────────────────
async function getMorningBrief(indices, cryptos) {
  const nifty    = indices?.find(i => i.label === 'NIFTY 50');
  const bankNifty= indices?.find(i => i.label === 'BANK NIFTY');
  const btc      = cryptos?.find(c => c.sym === 'BTC');
  const eth      = cryptos?.find(c => c.sym === 'ETH');

  const prompt =
    'You are Market KA Khiladi, an expert Indian market analyst. Give a brief morning market brief.\n\n' +
    'Current Data:\n' +
    'NIFTY 50: ₹' + (nifty?.price?.toFixed(2) ?? 'N/A') + ' (' + (nifty?.chgPct?.toFixed(2) ?? 'N/A') + '%)\n' +
    'BANK NIFTY: ₹' + (bankNifty?.price?.toFixed(2) ?? 'N/A') + ' (' + (bankNifty?.chgPct?.toFixed(2) ?? 'N/A') + '%)\n' +
    'BTC: $' + (btc?.price?.toFixed(2) ?? 'N/A') + ' (' + (btc?.chgPct?.toFixed(2) ?? 'N/A') + '%)\n' +
    'ETH: $' + (eth?.price?.toFixed(2) ?? 'N/A') + ' (' + (eth?.chgPct?.toFixed(2) ?? 'N/A') + '%)\n\n' +
    'Respond ONLY in JSON:\n' +
    '{"overallSentiment":"Bullish/Bearish/Neutral",' +
    '"niftyOutlook":"1 sentence on NIFTY",' +
    '"cryptoOutlook":"1 sentence on crypto",' +
    '"topOpportunity":"best trade opportunity today in 1 sentence",' +
    '"mainRisk":"biggest risk today in 1 sentence",' +
    '"tradingTip":"one actionable tip for today"}';

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 400, temperature: 0.3,
        messages: [
          { role: 'system', content: 'You are a market analyst. Only respond with valid JSON.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    const d   = await res.json();
    const raw = d.choices?.[0]?.message?.content ?? '';
    const s   = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s === -1) return null;
    return JSON.parse(raw.slice(s, e + 1));
  } catch { return null; }
}

// ── Main ─────────────────────────────────────────────────────
export default function DashboardHome({ indices, onNavigate }) {
  const [cryptos,   setCryptos]   = useState([]);
  const [brief,     setBrief]     = useState(null);
  const [briefLoad, setBriefLoad] = useState(false);
  const [time,      setTime]      = useState(new Date().toLocaleTimeString('en-IN'));

  // Load data from localStorage
  const journal   = JSON.parse(localStorage.getItem(JOURNAL_KEY)   || '[]');
  const paper     = JSON.parse(localStorage.getItem(PAPER_KEY)     || '[]');
  const alerts    = JSON.parse(localStorage.getItem(ALERTS_KEY)    || '[]');
  const portfolio = JSON.parse(localStorage.getItem(PORT_KEY)      || '[]');

  // Stats
  const journalWins   = journal.filter(t => t.result === 'WIN').length;
  const journalWinRate= journal.length ? Math.round(journalWins / journal.length * 100) : 0;
  const journalPnl    = journal.reduce((a, t) => a + parseFloat(t.pnl || 0), 0);
  const paperBalance  = parseFloat(localStorage.getItem('Market KA Khiladi_paper_balance') || 100000);
  const openPaper     = paper.filter(t => t.status === 'OPEN').length;
  const activeAlerts  = alerts.filter(a => a.active && !a.triggered).length;
  const triggeredAlerts = alerts.filter(a => a.triggered).length;
  const openPositions = portfolio.filter(p => p.status === 'OPEN').length;
  const portfolioPnl  = portfolio.reduce((a, p) => a + (p.pnl || 0), 0);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString('en-IN')), 1000);
    return () => clearInterval(id);
  }, []);

  // Load crypto
  useEffect(() => {
    fetchAllTickers().then(d => setCryptos(d.slice(0, 5)));
  }, []);

  // Load morning brief
  useEffect(() => {
    if (!indices?.length) return;
    setBriefLoad(true);
    getMorningBrief(indices, cryptos).then(d => { setBrief(d); setBriefLoad(false); });
  }, [indices?.length]);

  const greeting   = getGreeting();
  const mktStatus  = getMarketStatus();

  const nifty      = indices?.find(i => i.label === 'NIFTY 50');
  const bankNifty  = indices?.find(i => i.label === 'BANK NIFTY');
  const finNifty   = indices?.find(i => i.label === 'FIN NIFTY');

  const sentimentColor = brief?.overallSentiment === 'Bullish' ? 'var(--green)'
    : brief?.overallSentiment === 'Bearish' ? 'var(--red)' : 'var(--gold)';

  return (
    <div className="fade-in">
      {/* ── Top Bar ── */}
      <div style={{
        background: 'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(10,14,26,0))',
        border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16,
        padding: '20px 24px', marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4 }}>
            {greeting.icon} {greeting.text}, Trader
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>IST Time</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'DM Mono', color: 'var(--text-primary)' }}>{time}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>NSE Market</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: mktStatus.color, animation: mktStatus.open ? 'pulse 2s infinite' : 'none' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: mktStatus.color }}>{mktStatus.label}</span>
            </div>
          </div>
          {brief?.overallSentiment && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Sentiment</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: sentimentColor }}>{brief.overallSentiment}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Live Indices ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          ['NIFTY 50',   nifty],
          ['BANK NIFTY', bankNifty],
          ['FIN NIFTY',  finNifty],
        ].map(([label, idx]) => (
          <IndexPill key={label} label={label} price={idx?.price} chgPct={idx?.chgPct} />
        ))}
        {cryptos.slice(0, 2).map(c => (
          <div key={c.sym} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '10px 16px', flex: 1, minWidth: 160,
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{c.sym}/USDT</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'DM Mono', color: 'var(--text-primary)' }}>
                {fmtPrice(c.price)}
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: c.chgPct >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'DM Mono' }}>
                {c.chgPct != null ? (c.chgPct >= 0 ? '▲ +' : '▼ ') + Math.abs(c.chgPct).toFixed(2) + '%' : '---'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── AI Morning Brief ── */}
      <div style={{
        background: 'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.04))',
        border: '1px solid rgba(99,102,241,0.25)', borderRadius: 14, padding: 20, marginBottom: 20
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 1 }}>
            ✦ AI Morning Brief
          </div>
          {!brief && !briefLoad && (
            <button onClick={() => { setBriefLoad(true); getMorningBrief(indices, cryptos).then(d => { setBrief(d); setBriefLoad(false); }); }}
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.3)', background: 'transparent', color: '#a78bfa', fontSize: 11, cursor: 'pointer' }}>
              Generate Brief
            </button>
          )}
        </div>

        {briefLoad && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
            <div className="loader" style={{ width: 16, height: 16 }} /> Generating market brief...
          </div>
        )}

        {brief && !briefLoad && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 10 }}>
            {[
              ['📈 NIFTY Outlook',      brief.niftyOutlook,     '#a78bfa'],
              ['₿ Crypto Outlook',      brief.cryptoOutlook,    '#f7931a'],
              ['🎯 Top Opportunity',    brief.topOpportunity,   'var(--green)'],
              ['⚠️ Main Risk',          brief.mainRisk,         'var(--red)'],
              ['💡 Trading Tip',        brief.tradingTip,       'var(--gold)'],
            ].map(([label, text, color]) => (
              <div key={label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{text}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Your Dashboard Stats ── */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
        📊 Your Performance Dashboard
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10, marginBottom: 20 }}>
        <MiniCard icon="📓" label="Journal Win Rate"
          value={journal.length ? journalWinRate + '%' : '---'}
          sub={journal.length + ' trades logged'}
          color={journalWinRate >= 50 ? 'var(--green)' : 'var(--red)'}
          onClick={() => onNavigate?.('upstox', 'journal')} />
        <MiniCard icon="💰" label="Journal P&L"
          value={journal.length ? (journalPnl >= 0 ? '+' : '') + '₹' + fmt(Math.abs(journalPnl), 0) : '---'}
          sub="All time realized"
          color={journalPnl >= 0 ? 'var(--green)' : 'var(--red)'}
          onClick={() => onNavigate?.('upstox', 'journal')} />
        <MiniCard icon="📝" label="Paper Balance"
          value={'₹' + fmt(paperBalance, 0)}
          sub={openPaper + ' open trades'}
          color="var(--gold)"
          onClick={() => onNavigate?.('upstox', 'paper')} />
        <MiniCard icon="💼" label="Portfolio P&L"
          value={openPositions ? (portfolioPnl >= 0 ? '+' : '') + '₹' + fmt(Math.abs(portfolioPnl), 0) : '---'}
          sub={openPositions + ' open positions'}
          color={portfolioPnl >= 0 ? 'var(--green)' : 'var(--red)'}
          onClick={() => onNavigate?.('upstox', 'portfolio')} />
        <MiniCard icon="🔔" label="Price Alerts"
          value={activeAlerts}
          sub={triggeredAlerts + ' triggered'}
          color={triggeredAlerts > 0 ? 'var(--gold)' : 'var(--green)'}
          onClick={() => onNavigate?.('upstox', 'alerts')} />
        <MiniCard icon="🧪" label="Backtest Ready"
          value="Test Now"
          sub="4 strategies available"
          color="#a78bfa"
          onClick={() => onNavigate?.('upstox', 'backtest')} />
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
        ⚡ Quick Actions
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { icon: '📋', label: "Today's Trade Plan",  sub: 'NIFTY / BANKNIFTY',  color: '#6366f1', tab: 'planner'   },
          { icon: '📡', label: 'Track Live Option',   sub: 'Real-time premium',  color: 'var(--red)',   tab: 'tracker'   },
          { icon: '🔭', label: 'Market Scanner',      sub: 'Scan all day',       color: 'var(--green)', tab: 'scanner'   },
          { icon: '🎯', label: 'AI Signals',          sub: 'Upstox signals',     color: 'var(--gold)',  tab: 'signals'   },
          { icon: '🪙', label: 'Crypto Signals',      sub: 'Top 20 coins',       color: '#f7931a',      nav: 'crypto'    },
          { icon: '🔔', label: 'Set Price Alert',     sub: 'NSE + Crypto',       color: 'var(--gold)',  tab: 'alerts'    },
        ].map(item => (
          <div key={item.label} onClick={() => onNavigate?.(item.nav || 'upstox', item.tab)}
            style={{
              background: 'var(--bg-secondary)', border: `1px solid ${item.color}33`,
              borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${item.color}10`; e.currentTarget.style.borderColor = `${item.color}66`; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.borderColor = `${item.color}33`; }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: `${item.color}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0
            }}>{item.icon}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{item.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.sub}</div>
            </div>
            <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 14 }}>→</div>
          </div>
        ))}
      </div>

      {/* ── Recent Journal Entries ── */}
      {journal.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            📓 Recent Trades
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {journal.slice(0, 4).map((t, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--bg-secondary)', border: `1px solid ${t.result === 'WIN' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                borderRadius: 10, padding: '12px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: t.result === 'WIN' ? 'var(--green)' : 'var(--red)'
                  }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t.symbol} {t.strike} {t.type}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.date} · {t.emotion}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: parseFloat(t.pnl) >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'DM Mono' }}>
                    {parseFloat(t.pnl) >= 0 ? '+' : ''}₹{fmt(Math.abs(parseFloat(t.pnl)), 0)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.pnlPct}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Triggered Alerts ── */}
      {triggeredAlerts > 0 && (
        <div style={{
          background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)',
          borderRadius: 12, padding: 16, marginBottom: 20
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 10 }}>
            🔔 {triggeredAlerts} Alert{triggeredAlerts > 1 ? 's' : ''} Triggered
          </div>
          {alerts.filter(a => a.triggered).map(a => (
            <div key={a.id} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              • {a.sym} went {a.condition} {a.market === 'crypto' ? '$' : '₹'}{fmt(a.targetPrice)} at {a.triggeredAt}
              {a.note && <span style={{ color: 'var(--text-muted)' }}> — {a.note}</span>}
            </div>
          ))}
          <div style={{ marginTop: 10 }}>
            <span onClick={() => onNavigate?.('upstox', 'alerts')} style={{ fontSize: 12, color: 'var(--gold)', cursor: 'pointer', textDecoration: 'underline' }}>
              View all alerts →
            </span>
          </div>
        </div>
      )}

      {/* ── Daily Checklist ── */}
      <div style={{
        background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)',
        borderRadius: 12, padding: 16
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 12 }}>
          ✅ Daily Trading Checklist
        </div>
        {[
          ['Refresh Upstox token',         '→ /auth'],
          ['Check AI Trade Plan',           '→ Trade Planner tab'],
          ['Review today\'s signals',       '→ AI Signals tab'],
          ['Set price alerts for key levels','→ Price Alerts tab'],
          ['Journal yesterday\'s trades',   '→ Trade Journal tab'],
          ['Never trade without a stop loss','Rule #1'],
          ['Exit all positions by 3:15 PM', 'Intraday rule'],
        ].map(([task, hint], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 6 ? '1px solid rgba(34,197,94,0.08)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--green)', fontSize: 12 }}>☐</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{task}</span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>{hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}