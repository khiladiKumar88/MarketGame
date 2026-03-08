import { useState } from 'react';
import { useStocks, INDICES } from '../hooks/useMarketData';

export default function AIAnalysis({ preSelected }) {
  const stocks = useStocks();
  const [selected, setSelected] = useState(preSelected?.sym ?? '');
  const [customSymbol, setCustomSymbol] = useState('');
  const [timeframe, setTimeframe] = useState('swing');
  const [capital, setCapital] = useState(50000);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function fetchCustomPrice(symbol) {
    try {
      const res = await fetch(`http://localhost:5000/api/quote/${symbol.toUpperCase()}.NS`);
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) return null;
      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose || meta.previousClose;
      const chg = prev ? ((price - prev) / prev) * 100 : 0;
      return { price, chg };
    } catch { return null; }
  }

  async function analyze() {
    const finalSymbol = customSymbol.trim().toUpperCase() || selected;
    if (!finalSymbol) { setError('Please select a stock or type an NSE symbol.'); return; }

    setError('');
    setLoading(true);
    setResult(null);

    let price = null;
    let chg = 0;
    let displayName = finalSymbol;

    // Check indices first
    const idxData = INDICES.find(i => i.label === finalSymbol);
    if (idxData) {
      price = idxData.price;
      chg = idxData.chg ?? 0;
      displayName = idxData.label;
    } else {
      // Check watchlist stocks
      const stockData = stocks.find(s => s.sym === finalSymbol);
      if (stockData && stockData.price) {
        price = stockData.price;
        chg = stockData.chg ?? 0;
        displayName = stockData.name || finalSymbol;
      } else {
        // Fetch custom symbol live
        const q = await fetchCustomPrice(finalSymbol);
        if (q) {
          price = q.price;
          chg = q.chg;
        }
      }
    }

    if (!price) {
      setError(`Could not load price for "${finalSymbol}". Check the NSE symbol and try again.`);
      setLoading(false);
      return;
    }

    const shares = Math.floor(capital / price);

    const prompt = `You are Market KA Khiladi, an expert Indian stock market analyst. Help a BEGINNER investor.

Stock: ${finalSymbol}
Current Price: ₹${price.toLocaleString('en-IN')}
Today's Change: ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%
Timeframe: ${timeframe}
Capital: ₹${capital.toLocaleString('en-IN')}
Max Shares affordable: ${shares}

Give a trade analysis based on the EXACT current price of ₹${price.toFixed(2)}.

IMPORTANT RULES:
- Entry price MUST be very close to ₹${price.toFixed(2)} (within 0.5%)
- Target and StopLoss MUST be realistic based on the timeframe
- For intraday: target 0.5-1%, stoploss 0.3-0.5%
- For swing: target 3-5%, stoploss 2-3%
- For positional: target 8-15%, stoploss 5-7%
- For investment: target 20-40%, stoploss 10-15%
- Never use round numbers like 1000 — use the actual price

Respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "signal": "BUY",
  "confidence": 75,
  "entry": ${price.toFixed(2)},
  "target": 0.00,
  "stopLoss": 0.00,
  "riskReward": "1:2.0",
  "shares": ${shares},
  "capitalUsed": ${(shares * price).toFixed(2)},
  "analysis": "2-3 sentences in simple English for a beginner. Explain why this signal, what market is showing, and what to watch.",
  "risks": ["Risk 1", "Risk 2", "Risk 3"]
}`;

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
'Authorization': 'Bearer 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'        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await res.json();
      console.log('Groq response:', data);

      if (data.error) {
        setError('API Error: ' + data.error.message);
        setLoading(false);
        return;
      }

      const raw = data.choices[0].message.content;
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      parsed._symbol = finalSymbol;
      parsed._name = displayName;
      setResult(parsed);

    } catch (e) {
      console.log('Error:', e);
      setError('Analysis failed: ' + e.message);
    }
    setLoading(false);
  }

  const sigClass = result?.signal?.toLowerCase() ?? 'hold';

  return (
    <div className="panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="ai-badge">✦ AI Powered</span>
          <span className="panel-title">Trade Signal Generator</span>
        </div>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        Select from the list or type any NSE symbol to get a Buy/Sell signal with entry, target & stop-loss.
      </p>

      {/* ROW 1 — Stock selection */}
      <div className="ai-controls" style={{ marginBottom: 12 }}>
        <select
          className="ai-select"
          value={selected}
          onChange={e => {
            setSelected(e.target.value);
            setCustomSymbol('');
            setResult(null);
            setError('');
          }}
        >
          <option value="">Select Stock / Index</option>
          <optgroup label="── Indices ──">
            {INDICES.map(i => (
              <option key={i.label} value={i.label}>
                {i.label} {i.price ? `— ₹${i.price.toLocaleString('en-IN')}` : '(loading...)'}
              </option>
            ))}
          </optgroup>
          <optgroup label="── Popular Stocks ──">
            {stocks.map(s => (
              <option key={s.sym} value={s.sym}>
                {s.sym} — {s.name} {s.price ? `₹${s.price.toLocaleString('en-IN')}` : '(loading...)'}
              </option>
            ))}
          </optgroup>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
          OR
        </div>

        <input
          className="ai-input"
          type="text"
          placeholder="Type NSE symbol e.g. TATAPOWER"
          style={{ width: 220 }}
          value={customSymbol}
          onChange={e => {
            setCustomSymbol(e.target.value.toUpperCase());
            setSelected('');
            setResult(null);
            setError('');
          }}
          onKeyDown={e => { if (e.key === 'Enter') analyze(); }}
        />
      </div>

      {/* ROW 2 — Timeframe, Capital, Analyze */}
      <div className="ai-controls">
        <select
          className="ai-select"
          value={timeframe}
          onChange={e => setTimeframe(e.target.value)}
        >
          <option value="intraday">Intraday (Today)</option>
          <option value="swing">Swing (2–5 days)</option>
          <option value="positional">Positional (2–4 weeks)</option>
          <option value="investment">Investment (3–6 months)</option>
        </select>

        <input
          className="ai-input"
          type="number"
          placeholder="Capital (₹)"
          value={capital}
          onChange={e => setCapital(Number(e.target.value))}
        />

        <button className="btn-analyze" onClick={analyze} disabled={loading}>
          {loading ? '⏳ Analyzing...' : '🔍 Analyze'}
        </button>
      </div>

      {/* SELECTED INDICATOR */}
      {(selected || customSymbol) && (
        <div style={{
          fontSize: 12, color: 'var(--text-muted)',
          marginBottom: 12, marginTop: 4
        }}>
          Analyzing: <strong style={{ color: 'var(--gold)' }}>
            {customSymbol || selected}
          </strong>
        </div>
      )}

      {/* ERROR */}
      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
          ⚠️ {error}
        </p>
      )}

      {/* LOADING */}
      {loading && (
        <div className="ai-result">
          <div className="loader-wrap">
            <div className="loader"></div>
            <div className="loader-text">Fetching live price & generating AI signal...</div>
          </div>
        </div>
      )}

      {/* RESULT */}
      {result && !loading && (
        <div className="ai-result fade-in">

          {/* SIGNAL BANNER */}
          <div className={`signal-banner ${sigClass}`}>
            <div>
              <div style={{
                fontSize: 11, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4
              }}>
                Signal
              </div>
              <div className="signal-word">
                {result.signal === 'BUY' ? '🟢' : result.signal === 'SELL' ? '🔴' : '🟡'} {result.signal}
              </div>
            </div>
            <div className="signal-meta">
              <div className="signal-stock">{result._symbol}</div>
              <div className="signal-info">
                {result.shares} shares · ₹{Number(result.capitalUsed).toLocaleString('en-IN')} used
              </div>
            </div>
            <div className="confidence">
              <div className="confidence-label">Confidence</div>
              <div className="confidence-value">{result.confidence}%</div>
            </div>
          </div>

          {/* TRADE LEVELS */}
          <div className="trade-levels">
            <div className="level-card">
              <div className="level-label">Entry</div>
              <div className="level-value entry">
                ₹{Number(result.entry).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="level-card">
              <div className="level-label">Target</div>
              <div className="level-value target">
                ₹{Number(result.target).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="level-card">
              <div className="level-label">Stop Loss</div>
              <div className="level-value stoploss">
                ₹{Number(result.stopLoss).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="level-card">
              <div className="level-label">Risk : Reward</div>
              <div className="level-value rr">{result.riskReward}</div>
            </div>
          </div>

          {/* ANALYSIS TEXT */}
          <div className="analysis-text">{result.analysis}</div>

          {/* RISKS */}
          <div className="risk-box">
            <div className="risk-title">⚠️ Key Risks</div>
            <div className="risk-points">
              {result.risks?.map((r, i) => (
                <div key={i}>{i + 1}. {r}</div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}