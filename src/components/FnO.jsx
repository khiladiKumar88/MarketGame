import { useState, useEffect } from 'react';

// ── Black-Scholes Greeks Calculator ──────────────────────────
function normalCDF(x) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return 0.5 * (1.0 + sign * y);
}

function blackScholes(S, K, T, r, sigma, type) {
  if (T <= 0) return { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0 };
  const d1 = (Math.log(S/K) + (r + 0.5*sigma*sigma)*T) / (sigma*Math.sqrt(T));
  const d2 = d1 - sigma*Math.sqrt(T);
  const nd1 = normalCDF(d1), nd2 = normalCDF(d2);
  const nd1n = normalCDF(-d1), nd2n = normalCDF(-d2);
  const npd1 = Math.exp(-0.5*d1*d1) / Math.sqrt(2*Math.PI);

  let price, delta;
  if (type === 'CE') {
    price = S*nd1 - K*Math.exp(-r*T)*nd2;
    delta = nd1;
  } else {
    price = K*Math.exp(-r*T)*nd2n - S*nd1n;
    delta = nd1 - 1;
  }
  const gamma = npd1 / (S * sigma * Math.sqrt(T));
  const theta = (-(S*npd1*sigma)/(2*Math.sqrt(T)) - r*K*Math.exp(-r*T)*(type==='CE'?nd2:nd2n)) / 365;
  const vega = S * npd1 * Math.sqrt(T) / 100;

  return {
    price: Math.max(0, price),
    delta: Math.round(delta*1000)/1000,
    gamma: Math.round(gamma*10000)/10000,
    theta: Math.round(theta*100)/100,
    vega: Math.round(vega*100)/100
  };
}

// ── Generate mock options chain ───────────────────────────────
function generateOptionsChain(spotPrice, expDays) {
  const T = expDays / 365;
  const r = 0.065;
  const sigma = 0.18;
  const strikes = [];
  const step = spotPrice > 40000 ? 500 : spotPrice > 20000 ? 100 : 50;
  const atm = Math.round(spotPrice / step) * step;
  for (let i = -8; i <= 8; i++) strikes.push(atm + i * step);

  return strikes.map(K => {
    const ce = blackScholes(spotPrice, K, T, r, sigma, 'CE');
    const pe = blackScholes(spotPrice, K, T, r, sigma, 'PE');
    const isATM = K === atm;
    const ceOI = Math.round((Math.random() * 5000000 + (isATM ? 3000000 : 500000)) / 100) * 100;
    const peOI = Math.round((Math.random() * 5000000 + (isATM ? 2500000 : 400000)) / 100) * 100;
    return {
      strike: K, isATM,
      ce: { ...ce, oi: ceOI, volume: Math.round(ceOI * 0.3), iv: Math.round(sigma * 100 + (Math.random()-0.5)*5) },
      pe: { ...pe, oi: peOI, volume: Math.round(peOI * 0.3), iv: Math.round(sigma * 100 + (Math.random()-0.5)*5) },
    };
  });
}

// ── Expiry dates ──────────────────────────────────────────────
function getExpiries() {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < 4; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + (i === 0 ? (4 - d.getDay() + 7) % 7 || 7 : i * 7 + (4 - d.getDay() + 7) % 7));
    dates.push(d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));
  }
  return dates;
}

const INSTRUMENTS = [
  { label: 'NIFTY 50', spot: null, symbol: '^NSEI', lot: 50 },
  { label: 'BANK NIFTY', spot: null, symbol: '^NSEBANK', lot: 15 },
  { label: 'RELIANCE', spot: null, symbol: 'RELIANCE.NS', lot: 250 },
  { label: 'TCS', spot: null, symbol: 'TCS.NS', lot: 150 },
  { label: 'HDFCBANK', spot: null, symbol: 'HDFCBANK.NS', lot: 550 },
  { label: 'ICICIBANK', spot: null, symbol: 'ICICIBANK.NS', lot: 700 },
  { label: 'INFY', spot: null, symbol: 'INFY.NS', lot: 300 },
  { label: 'TATAMOTORS', spot: null, symbol: 'TATAMOTORS.NS', lot: 1400 },
];

const GREEKS_INFO = {
  delta: { name: 'Delta', color: '#3b82f6', desc: 'How much the option price moves when stock moves ₹1. Delta of 0.5 means if stock goes up ₹1, option goes up ₹0.50.' },
  gamma: { name: 'Gamma', color: '#c9a84c', desc: 'How fast Delta changes. High Gamma means the option is very sensitive — good for buyers, risky for sellers.' },
  theta: { name: 'Theta', color: '#ef4444', desc: 'Time decay — how much value the option loses every day. Negative Theta means you lose money just by waiting.' },
  vega: { name: 'Vega', color: '#22c55e', desc: 'Sensitivity to volatility. High Vega means option price changes a lot when market becomes volatile.' },
};

export default function FnO() {
  const [activeTab, setActiveTab] = useState('chain');
  const [instrument, setInstrument] = useState(INSTRUMENTS[0]);
  const [spotPrice, setSpotPrice] = useState(null);
  const [expiry, setExpiry] = useState(0);
  const [chain, setChain] = useState([]);
  const [pcr, setPcr] = useState(null);
  const [aiSignal, setAiSignal] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [selectedStrike, setSelectedStrike] = useState(null);
  const [optionType, setOptionType] = useState('CE');
  const expiries = getExpiries();
  const expDays = [7, 14, 21, 30][expiry];

  // Fetch spot price
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`http://localhost:5000/api/quote/${instrument.symbol}`);
        const data = await res.json();
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) {
          setSpotPrice(price);
          instrument.spot = price;
        }
      } catch { setSpotPrice(instrument.label.includes('NIFTY 50') ? 24450 : instrument.label.includes('BANK') ? 57800 : 1000); }
    }
    load();
  }, [instrument]);

  // Generate chain when spot/expiry changes
  useEffect(() => {
    if (!spotPrice) return;
    const c = generateOptionsChain(spotPrice, expDays);
    setChain(c);
    const totalCEOI = c.reduce((s, r) => s + r.ce.oi, 0);
    const totalPEOI = c.reduce((s, r) => s + r.pe.oi, 0);
    setPcr(Math.round((totalPEOI / totalCEOI) * 100) / 100);
    const atm = c.find(r => r.isATM);
    if (atm) setSelectedStrike(atm.strike);
  }, [spotPrice, expDays]);

  const selectedRow = chain.find(r => r.strike === selectedStrike);
  const greeksData = selectedRow ? (optionType === 'CE' ? selectedRow.ce : selectedRow.pe) : null;

  async function getAISignal() {
    if (!spotPrice) return;
    setAiLoading(true);
    setAiSignal(null);
    setAiError('');

    const atmStrike = chain.find(r => r.isATM);
    const prompt = `You are an expert F&O (Futures & Options) trader in India. Help a COMPLETE BEGINNER understand options trading.

Instrument: ${instrument.label}
Spot Price: ₹${spotPrice?.toLocaleString('en-IN')}
Expiry: ${expiries[expiry]} (${expDays} days away)
ATM Strike: ${atmStrike?.strike}
ATM CE Price: ₹${atmStrike?.ce?.price?.toFixed(2)}
ATM PE Price: ₹${atmStrike?.ce?.price?.toFixed(2)}
Put-Call Ratio: ${pcr}
Lot Size: ${instrument.lot}

Based on this data, give a specific options trade recommendation.
Explain everything in very simple language like explaining to someone who has never traded options.

Respond ONLY in this JSON (no markdown):
{
  "action": "BUY CE" or "BUY PE" or "SELL CE" or "SELL PE",
  "strike": ${atmStrike?.strike},
  "optionType": "CE" or "PE",
  "entryPrice": 0.00,
  "target": 0.00,
  "stopLoss": 0.00,
  "lotSize": ${instrument.lot},
  "marginRequired": 0,
  "maxProfit": 0,
  "maxLoss": 0,
  "confidence": 70,
  "simpleExplanation": "Explain this trade in 2-3 sentences like I am 10 years old. What are we buying? Why? What happens if we are right?",
  "whatIsCE": "Explain in 1 sentence what a Call option (CE) is",
  "whatIsPE": "Explain in 1 sentence what a Put option (PE) is",
  "marketView": "BUY CE means we think market will go UP. BUY PE means we think market will go DOWN. Explain which and why.",
  "risks": ["Risk 1 in simple words", "Risk 2 in simple words", "Risk 3 in simple words"]
}`;

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        //   'Authorization': 'Bearer YOUR-GROQ-KEY-HERE'
        'Authorization': 'Bearer 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'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      if (data.error) { setAiError(data.error.message); setAiLoading(false); return; }
      const raw = data.choices[0].message.content;
      const clean = raw.replace(/```json|```/g, '').trim();
      setAiSignal(JSON.parse(clean));
    } catch(e) {
      setAiError('Failed: ' + e.message);
    }
    setAiLoading(false);
  }

  const pcrSentiment = pcr > 1.3 ? { label: 'Very Bullish', color: '#22c55e' } :
    pcr > 1.0 ? { label: 'Bullish', color: '#86efac' } :
    pcr > 0.8 ? { label: 'Neutral', color: '#c9a84c' } :
    pcr > 0.6 ? { label: 'Bearish', color: '#fca5a5' } :
    { label: 'Very Bearish', color: '#ef4444' };

  return (
    <div>
      {/* HEADER CONTROLS */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Instrument</div>
            <select className="ai-select" value={instrument.label} onChange={e => {
              setInstrument(INSTRUMENTS.find(i => i.label === e.target.value));
              setAiSignal(null);
            }}>
              {INSTRUMENTS.map(i => <option key={i.label}>{i.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Expiry</div>
            <select className="ai-select" value={expiry} onChange={e => setExpiry(Number(e.target.value))}>
              {expiries.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>SPOT PRICE</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 28, fontWeight: 600, color: 'var(--text-primary)' }}>
              {spotPrice ? '₹' + spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '...'}
            </div>
          </div>
          {pcr && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>PCR</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 28, fontWeight: 600, color: pcrSentiment.color }}>{pcr}</div>
              <div style={{ fontSize: 11, color: pcrSentiment.color }}>{pcrSentiment.label}</div>
            </div>
          )}
        </div>
      </div>

      {/* SUB TABS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[['chain','📊 Options Chain'],['signal','🤖 AI Signal'],['greeks','🔢 Greeks'],['pcr','📈 PCR & OI'],['futures','⚡ Futures']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
              background: activeTab === key ? 'var(--gold)' : 'var(--bg-card)',
              color: activeTab === key ? '#000' : 'var(--text-muted)',
              borderBottom: activeTab === key ? 'none' : '1px solid var(--border)',
              transition: 'all 0.15s'
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── OPTIONS CHAIN ── */}
      {activeTab === 'chain' && (
        <div className="panel fade-in">
          <div className="panel-header">
            <div className="panel-title">Options Chain — {instrument.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click any strike to see Greeks</div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            <span>📗 <strong style={{color:'var(--green)'}}>CE</strong> = Call Option (profits if market goes UP)</span>
            <span>📕 <strong style={{color:'var(--red)'}}>PE</strong> = Put Option (profits if market goes DOWN)</span>
            <span>🟡 = ATM (At The Money — current price)</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th colSpan={4} style={{ textAlign: 'center', color: 'var(--green)', background: 'rgba(34,197,94,0.05)' }}>CALL (CE) — Market goes UP</th>
                  <th style={{ textAlign: 'center', background: 'var(--bg-secondary)' }}>STRIKE</th>
                  <th colSpan={4} style={{ textAlign: 'center', color: 'var(--red)', background: 'rgba(239,68,68,0.05)' }}>PUT (PE) — Market goes DOWN</th>
                </tr>
                <tr>
                  <th style={{color:'var(--green)'}}>OI</th>
                  <th style={{color:'var(--green)'}}>Volume</th>
                  <th style={{color:'var(--green)'}}>IV%</th>
                  <th style={{color:'var(--green)'}}>Price</th>
                  <th style={{ textAlign: 'center' }}>Strike</th>
                  <th style={{color:'var(--red)'}}>Price</th>
                  <th style={{color:'var(--red)'}}>IV%</th>
                  <th style={{color:'var(--red)'}}>Volume</th>
                  <th style={{color:'var(--red)'}}>OI</th>
                </tr>
              </thead>
              <tbody>
                {chain.map(row => (
                  <tr key={row.strike}
                    onClick={() => { setSelectedStrike(row.strike); setActiveTab('greeks'); }}
                    style={{
                      cursor: 'pointer',
                      background: row.isATM ? 'rgba(201,168,76,0.08)' : '',
                      outline: row.isATM ? '1px solid rgba(201,168,76,0.3)' : '',
                    }}>
                    <td style={{color:'var(--green)'}}>{(row.ce.oi/100000).toFixed(1)}L</td>
                    <td style={{color:'var(--green)'}}>{(row.ce.volume/1000).toFixed(0)}K</td>
                    <td style={{color:'var(--green)'}}>{row.ce.iv}%</td>
                    <td style={{color:'var(--green)', fontWeight:600}}>₹{row.ce.price.toFixed(2)}</td>
                    <td style={{ textAlign:'center', fontWeight:700, color: row.isATM ? 'var(--gold)' : 'var(--text-primary)', fontSize: row.isATM ? 14 : 12 }}>
                      {row.isATM ? '⭐ ' : ''}{row.strike}
                    </td>
                    <td style={{color:'var(--red)', fontWeight:600}}>₹{row.pe.price.toFixed(2)}</td>
                    <td style={{color:'var(--red)'}}>{row.pe.iv}%</td>
                    <td style={{color:'var(--red)'}}>{(row.pe.volume/1000).toFixed(0)}K</td>
                    <td style={{color:'var(--red)'}}>{(row.pe.oi/100000).toFixed(1)}L</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── AI SIGNAL ── */}
      {activeTab === 'signal' && (
        <div className="panel fade-in">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="ai-badge">✦ AI Powered</span>
              <span className="panel-title">F&O Trade Signal</span>
            </div>
          </div>

          <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            💡 <strong style={{color:'var(--gold)'}}>What is Options Trading?</strong><br/>
            Options give you the RIGHT to buy or sell a stock/index at a fixed price on a future date.
            You pay a small amount (called <strong>Premium</strong>) to get this right.
            If the market moves in your favour, your premium can multiply 2x, 3x or more!
            But if you're wrong, you can lose the entire premium. That's why we use Stop Loss.
          </div>

          <button className="btn-analyze" onClick={getAISignal} disabled={aiLoading} style={{ marginBottom: 20 }}>
            {aiLoading ? '⏳ Analyzing F&O data...' : `🔍 Get AI Signal for ${instrument.label}`}
          </button>

          {aiError && <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠️ {aiError}</p>}

          {aiLoading && (
            <div className="ai-result">
              <div className="loader-wrap">
                <div className="loader"></div>
                <div className="loader-text">Analyzing options data, PCR, OI & generating signal...</div>
              </div>
            </div>
          )}

          {aiSignal && !aiLoading && (
            <div className="ai-result fade-in">
              {/* ACTION BANNER */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '20px', borderRadius: 12, marginBottom: 20,
                background: aiSignal.action?.includes('BUY') ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${aiSignal.action?.includes('BUY') ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Action</div>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, fontWeight: 700, color: aiSignal.action?.includes('BUY') ? 'var(--green)' : 'var(--red)' }}>
                    {aiSignal.action?.includes('BUY') ? '🟢' : '🔴'} {aiSignal.action}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                    {instrument.label} {aiSignal.strike} {aiSignal.optionType}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Lot Size: {aiSignal.lotSize} shares · Expiry: {expiries[expiry]}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Confidence</div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 28, fontWeight: 700, color: 'var(--gold)' }}>{aiSignal.confidence}%</div>
                </div>
              </div>

              {/* LEVELS */}
              <div className="trade-levels" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
                <div className="level-card">
                  <div className="level-label">Entry Premium</div>
                  <div className="level-value entry">₹{aiSignal.entryPrice}</div>
                </div>
                <div className="level-card">
                  <div className="level-label">Target Premium</div>
                  <div className="level-value target">₹{aiSignal.target}</div>
                </div>
                <div className="level-card">
                  <div className="level-label">Stop Loss</div>
                  <div className="level-value stoploss">₹{aiSignal.stopLoss}</div>
                </div>
              </div>

              {/* P&L */}
              <div className="trade-levels" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
                <div className="level-card">
                  <div className="level-label">Margin Required</div>
                  <div className="level-value rr">₹{aiSignal.marginRequired?.toLocaleString('en-IN')}</div>
                </div>
                <div className="level-card">
                  <div className="level-label">Max Profit</div>
                  <div className="level-value target">₹{aiSignal.maxProfit?.toLocaleString('en-IN')}</div>
                </div>
                <div className="level-card">
                  <div className="level-label">Max Loss</div>
                  <div className="level-value stoploss">₹{aiSignal.maxLoss?.toLocaleString('en-IN')}</div>
                </div>
              </div>

              {/* SIMPLE EXPLANATION */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>📚 Simple Explanation</div>
                <div className="analysis-text">{aiSignal.simpleExplanation}</div>
              </div>

              {/* WHAT IS CE/PE */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, marginBottom: 6 }}>📗 What is CE (Call)?</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{aiSignal.whatIsCE}</div>
                </div>
                <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700, marginBottom: 6 }}>📕 What is PE (Put)?</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{aiSignal.whatIsPE}</div>
                </div>
              </div>

              {/* MARKET VIEW */}
              <div className="analysis-text" style={{ borderColor: 'var(--blue)' }}>
                📊 <strong>Market View:</strong> {aiSignal.marketView}
              </div>

              {/* RISKS */}
              <div className="risk-box">
                <div className="risk-title">⚠️ Key Risks</div>
                <div className="risk-points">
                  {aiSignal.risks?.map((r, i) => <div key={i}>{i+1}. {r}</div>)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── GREEKS ── */}
      {activeTab === 'greeks' && (
        <div className="fade-in">
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-header">
              <div className="panel-title">🔢 Options Greeks</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select strike & type to see Greeks</div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <select className="ai-select" value={selectedStrike} onChange={e => setSelectedStrike(Number(e.target.value))}>
                {chain.map(r => (
                  <option key={r.strike} value={r.strike}>
                    {r.isATM ? '⭐ ATM — ' : ''}{r.strike}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
                <button className={`btn-range ${optionType === 'CE' ? 'active' : ''}`} onClick={() => setOptionType('CE')} style={{ color: optionType === 'CE' ? '#000' : 'var(--green)' }}>CE (Call)</button>
                <button className={`btn-range ${optionType === 'PE' ? 'active' : ''}`} onClick={() => setOptionType('PE')} style={{ color: optionType === 'PE' ? '#000' : 'var(--red)' }}>PE (Put)</button>
              </div>
            </div>

            {greeksData && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
                  {Object.entries(GREEKS_INFO).map(([key, info]) => (
                    <div key={key} style={{ background: 'var(--bg-secondary)', border: `1px solid ${info.color}30`, borderRadius: 12, padding: 20, borderTop: `3px solid ${info.color}` }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{info.name}</div>
                      <div style={{ fontFamily: 'DM Mono', fontSize: 28, fontWeight: 600, color: info.color, marginBottom: 8 }}>
                        {greeksData[key]}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{info.desc}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>
                    📊 {instrument.label} {selectedStrike} {optionType} Summary
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Option Price</span><br/><strong style={{ fontFamily: 'DM Mono' }}>₹{greeksData.price?.toFixed(2)}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>IV</span><br/><strong style={{ fontFamily: 'DM Mono' }}>{greeksData.iv}%</strong></div>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>OI</span><br/><strong style={{ fontFamily: 'DM Mono' }}>{(greeksData.oi/100000).toFixed(2)}L</strong></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PCR & OI ── */}
      {activeTab === 'pcr' && (
        <div className="fade-in">
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-header">
              <div className="panel-title">📈 Put-Call Ratio & Open Interest</div>
            </div>

            {/* PCR Explanation */}
            <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', marginBottom: 8 }}>💡 What is PCR?</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                PCR = Total PUT OI ÷ Total CALL OI.<br/>
                • PCR &gt; 1 → More PEs bought → Traders expect market to fall → But contrarians say this is <strong style={{color:'var(--green)'}}>Bullish</strong><br/>
                • PCR &lt; 1 → More CEs bought → Traders expect market to rise → But contrarians say this is <strong style={{color:'var(--red)'}}>Bearish</strong><br/>
                • PCR between 0.8–1.2 → Market is <strong style={{color:'var(--gold)'}}>Neutral</strong>
              </div>
            </div>

            {/* PCR Gauge */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Current PCR for {instrument.label}</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 56, fontWeight: 700, color: pcrSentiment.color }}>{pcr}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: pcrSentiment.color }}>{pcrSentiment.label}</div>
            </div>

            {/* OI Table */}
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Strike-wise Open Interest</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{color:'var(--green)'}}>CE OI</th>
                  <th style={{color:'var(--green)'}}>CE Change</th>
                  <th style={{ textAlign: 'center' }}>Strike</th>
                  <th style={{color:'var(--red)'}}>PE OI</th>
                  <th style={{color:'var(--red)'}}>PE Change</th>
                  <th>PCR</th>
                </tr>
              </thead>
              <tbody>
                {chain.map(row => {
                  const rowPcr = (row.pe.oi / row.ce.oi).toFixed(2);
                  return (
                    <tr key={row.strike} style={{ background: row.isATM ? 'rgba(201,168,76,0.06)' : '' }}>
                      <td style={{color:'var(--green)'}}>{(row.ce.oi/100000).toFixed(2)}L</td>
                      <td style={{color:'var(--green)'}}>+{(row.ce.oi*0.05/100000).toFixed(2)}L</td>
                      <td style={{ textAlign:'center', fontWeight: row.isATM ? 700 : 400, color: row.isATM ? 'var(--gold)' : 'var(--text-primary)' }}>
                        {row.isATM ? '⭐ ' : ''}{row.strike}
                      </td>
                      <td style={{color:'var(--red)'}}>{(row.pe.oi/100000).toFixed(2)}L</td>
                      <td style={{color:'var(--red)'}}>+{(row.pe.oi*0.04/100000).toFixed(2)}L</td>
                      <td style={{ color: rowPcr > 1 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{rowPcr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── FUTURES ── */}
      {activeTab === 'futures' && (
        <div className="fade-in">
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">⚡ Futures Trading Signal</div>
            </div>

            <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>💡 What is Futures?</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                A Futures contract lets you BUY or SELL a stock/index at today's price, but pay later (on expiry).
                You only pay a small <strong>margin</strong> (10-15% of total value) to control the full contract.
                This is called <strong>Leverage</strong> — it multiplies both profits AND losses.
              </div>
            </div>

            {spotPrice && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
                  <div className="level-card">
                    <div className="level-label">Futures Price</div>
                    <div className="level-value entry">₹{(spotPrice * 1.002).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="level-card">
                    <div className="level-label">Lot Size</div>
                    <div className="level-value rr">{instrument.lot} shares</div>
                  </div>
                  <div className="level-card">
                    <div className="level-label">Margin Required (~12%)</div>
                    <div className="level-value target">₹{Math.round(spotPrice * instrument.lot * 0.12).toLocaleString('en-IN')}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 12 }}>🟢 BUY (LONG) Futures</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                      Use when you think market will go <strong>UP</strong><br/>
                      Entry: ₹{(spotPrice * 1.002).toLocaleString('en-IN')}<br/>
                      Target: ₹{(spotPrice * 1.012).toLocaleString('en-IN')} (+1%)<br/>
                      Stop Loss: ₹{(spotPrice * 0.994).toLocaleString('en-IN')} (-0.6%)<br/>
                      Profit if right: ₹{Math.round(spotPrice * 0.01 * instrument.lot).toLocaleString('en-IN')}<br/>
                      Loss if wrong: ₹{Math.round(spotPrice * 0.006 * instrument.lot).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 12 }}>🔴 SELL (SHORT) Futures</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                      Use when you think market will go <strong>DOWN</strong><br/>
                      Entry: ₹{(spotPrice * 0.998).toLocaleString('en-IN')}<br/>
                      Target: ₹{(spotPrice * 0.988).toLocaleString('en-IN')} (-1%)<br/>
                      Stop Loss: ₹{(spotPrice * 1.006).toLocaleString('en-IN')} (+0.6%)<br/>
                      Profit if right: ₹{Math.round(spotPrice * 0.01 * instrument.lot).toLocaleString('en-IN')}<br/>
                      Loss if wrong: ₹{Math.round(spotPrice * 0.006 * instrument.lot).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                <div className="risk-box">
                  <div className="risk-title">⚠️ Futures Warning for Beginners</div>
                  <div className="risk-points">
                    <div>1. Futures have UNLIMITED loss potential — always use Stop Loss</div>
                    <div>2. Leverage is dangerous — a 1% move can mean 8-10% gain or loss on your margin</div>
                    <div>3. Never trade futures with money you cannot afford to lose</div>
                    <div>4. Practice on paper trading first before using real money</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}