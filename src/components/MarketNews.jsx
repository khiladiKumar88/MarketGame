// src/components/MarketNews.jsx
import { useState, useEffect } from 'react';

const GROQ_KEY = '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';

// ── Fetch news from GNews API (free tier) ────────────────────
// We use multiple free RSS/JSON endpoints — no API key needed
const NEWS_SOURCES = [
  {
    label: 'NSE / Indian Markets',
    url:   'https://query1.finance.yahoo.com/v1/finance/search?q=NIFTY+NSE+India+stock+market&newsCount=10&enableFuzzyQuery=false&enableCb=false',
    icon:  '📈',
    color: 'var(--blue)',
    parser: (data) => (data?.news ?? []).map(n => ({
      title:   n.title,
      source:  n.publisher,
      time:    new Date(n.providerPublishTime * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      date:    new Date(n.providerPublishTime * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      url:     n.link,
      type:    'nse',
    })),
  },
  {
    label: 'Crypto Markets',
    url:   'https://query1.finance.yahoo.com/v1/finance/search?q=Bitcoin+Ethereum+crypto+cryptocurrency&newsCount=10&enableFuzzyQuery=false&enableCb=false',
    icon:  '₿',
    color: '#f7931a',
    parser: (data) => (data?.news ?? []).map(n => ({
      title:   n.title,
      source:  n.publisher,
      time:    new Date(n.providerPublishTime * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      date:    new Date(n.providerPublishTime * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      url:     n.link,
      type:    'crypto',
    })),
  },
  {
    label: 'Global Markets',
    url:   'https://query1.finance.yahoo.com/v1/finance/search?q=Federal+Reserve+global+economy+markets&newsCount=10&enableFuzzyQuery=false&enableCb=false',
    icon:  '🌍',
    color: 'var(--green)',
    parser: (data) => (data?.news ?? []).map(n => ({
      title:   n.title,
      source:  n.publisher,
      time:    new Date(n.providerPublishTime * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      date:    new Date(n.providerPublishTime * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      url:     n.link,
      type:    'global',
    })),
  },
];

// ── AI News Impact Analyzer ──────────────────────────────────
async function analyzeNewsImpact(headlines) {
  const prompt =
    'You are an expert Indian stock market analyst. Analyze these recent market headlines and give a brief impact assessment.\n\n' +
    'Headlines:\n' +
    headlines.slice(0, 8).map((h, i) => `${i + 1}. ${h.title}`).join('\n') +
    '\n\nRespond ONLY in JSON:\n' +
    '{"overallImpact":"Positive/Negative/Neutral",' +
    '"niftyImpact":"likely impact on NIFTY in 1 sentence",' +
    '"cryptoImpact":"likely impact on crypto in 1 sentence",' +
    '"keyHeadline":"most important headline number (1-8)",' +
    '"keyHeadlineReason":"why this headline matters most",' +
    '"tradingImplication":"what traders should watch or do"}';

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 500, temperature: 0.2,
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

// ── News Card ────────────────────────────────────────────────
function NewsCard({ item, isKey }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
      <div style={{
        background: isKey ? 'rgba(201,168,76,0.08)' : 'var(--bg-secondary)',
        border: `1px solid ${isKey ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`,
        borderRadius: 12, padding: '14px 16px', marginBottom: 8,
        cursor: 'pointer', transition: 'all 0.15s',
        borderLeft: isKey ? '3px solid var(--gold)' : undefined,
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = isKey ? 'rgba(201,168,76,0.6)' : 'rgba(255,255,255,0.15)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = isKey ? 'rgba(201,168,76,0.4)' : 'var(--border)'; }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            {isKey && (
              <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                ⭐ Key Headline
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: isKey ? 700 : 500, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 6 }}>
              {item.title}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.source}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>{item.date} {item.time}</span>
            </div>
          </div>
          <span style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }}>↗</span>
        </div>
      </div>
    </a>
  );
}

// ── Main ─────────────────────────────────────────────────────
export default function MarketNews() {
  const [news,       setNews]       = useState({ nse: [], crypto: [], global: [] });
  const [loading,    setLoading]    = useState(false);
  const [analysis,   setAnalysis]   = useState(null);
  const [analyzing,  setAnalyzing]  = useState(false);
  const [activeTab,  setActiveTab]  = useState('all');
  const [lastFetch,  setLastFetch]  = useState('');
  const [error,      setError]      = useState('');

  async function fetchNews() {
    setLoading(true); setError(''); setAnalysis(null);
    const results = { nse: [], crypto: [], global: [] };

    for (const src of NEWS_SOURCES) {
      try {
        const res  = await fetch(src.url);
        const data = await res.json();
        const parsed = src.parser(data);
        const key = src.label.toLowerCase().includes('nse') ? 'nse'
          : src.label.toLowerCase().includes('crypto') ? 'crypto' : 'global';
        results[key] = parsed.filter(n => n.title);
      } catch { /* silently skip failed sources */ }
    }

    setNews(results);
    setLastFetch(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    setLoading(false);

    // Run AI analysis on all headlines
    const allHeadlines = [...results.nse, ...results.crypto, ...results.global];
    if (allHeadlines.length) {
      setAnalyzing(true);
      const impact = await analyzeNewsImpact(allHeadlines);
      setAnalysis(impact);
      setAnalyzing(false);
    }
  }

  useEffect(() => { fetchNews(); }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const allNews = [...news.nse, ...news.crypto, ...news.global]
    .sort((a, b) => 0); // keep insertion order

  const displayed = activeTab === 'all'    ? allNews
    : activeTab === 'nse'    ? news.nse
    : activeTab === 'crypto' ? news.crypto
    : news.global;

  const keyHeadlineIdx = analysis?.keyHeadline ? parseInt(analysis.keyHeadline) - 1 : -1;

  const impactColor = analysis?.overallImpact === 'Positive' ? 'var(--green)'
    : analysis?.overallImpact === 'Negative' ? 'var(--red)' : 'var(--gold)';

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,rgba(34,197,94,0.1),rgba(10,14,26,0))',
        border: '1px solid rgba(34,197,94,0.25)', borderRadius: 14,
        padding: '16px 22px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: 28 }}>📰</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Market News Feed</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            NSE · Crypto · Global · AI-analyzed impact · Auto-refreshes every 5 minutes
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {lastFetch && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Last Updated</div>
              <div style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--green)' }}>{lastFetch}</div>
            </div>
          )}
          <button onClick={fetchNews} disabled={loading} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: 'rgba(34,197,94,0.15)', color: 'var(--green)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            {loading ? <><div className="loader" style={{ width: 14, height: 14, borderWidth: 2 }} /> Fetching...</> : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* AI Impact Analysis */}
      {(analysis || analyzing) && (
        <div style={{
          background: 'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.04))',
          border: '1px solid rgba(99,102,241,0.25)', borderRadius: 14, padding: 18, marginBottom: 20
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            ✦ AI News Impact Analysis
          </div>

          {analyzing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
              <div className="loader" style={{ width: 16, height: 16 }} /> Analyzing headlines...
            </div>
          )}

          {analysis && !analyzing && (
            <div>
              {/* Overall impact badge */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                <div style={{
                  fontSize: 15, fontWeight: 800, color: impactColor,
                  background: `${impactColor}15`, padding: '6px 18px',
                  borderRadius: 20, border: `1px solid ${impactColor}44`
                }}>
                  {analysis.overallImpact === 'Positive' ? '📈' : analysis.overallImpact === 'Negative' ? '📉' : '➡️'} {analysis.overallImpact} Overall Impact
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
                {[
                  ['📈 NIFTY Impact',          analysis.niftyImpact,          'var(--blue)'],
                  ['₿ Crypto Impact',           analysis.cryptoImpact,         '#f7931a'],
                  ['⭐ Key Headline',            analysis.keyHeadlineReason,    'var(--gold)'],
                  ['💡 Trading Implication',    analysis.tradingImplication,   'var(--green)'],
                ].map(([label, text, color]) => (
                  <div key={label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="nav-tabs" style={{ marginBottom: 16 }}>
        {[
          ['all',    '📰 All (' + allNews.length + ')'],
          ['nse',    '📈 NSE (' + news.nse.length + ')'],
          ['crypto', '₿ Crypto (' + news.crypto.length + ')'],
          ['global', '🌍 Global (' + news.global.length + ')'],
        ].map(([key, label]) => (
          <button key={key} className={`nav-tab ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}>{label}</button>
        ))}
      </div>

      {/* News List */}
      {loading && displayed.length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div className="loader" style={{ margin: '0 auto 16px', width: 36, height: 36 }} />
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Fetching latest market news...</div>
        </div>
      )}

      {!loading && displayed.length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📰</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No news loaded</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Click "Refresh" to fetch the latest market headlines
          </div>
          <button onClick={fetchNews} style={{
            padding: '12px 24px', borderRadius: 9, border: 'none',
            background: 'linear-gradient(135deg,#22c55e,#16a34a)',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer'
          }}>📰 Load News</button>
        </div>
      )}

      {displayed.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: activeTab === 'all' ? '1fr 1fr' : '1fr', gap: 0 }}>
          <div>
            {displayed.slice(0, Math.ceil(displayed.length / 2)).map((item, i) => (
              <NewsCard key={i} item={item} isKey={activeTab === 'all' && i === keyHeadlineIdx} />
            ))}
          </div>
          {activeTab === 'all' && (
            <div style={{ paddingLeft: 8 }}>
              {displayed.slice(Math.ceil(displayed.length / 2)).map((item, i) => (
                <NewsCard key={i} item={item} isKey={Math.ceil(displayed.length / 2) + i === keyHeadlineIdx} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        📰 News sourced from Yahoo Finance. AI analysis is for informational purposes only. Always verify news before making trading decisions.
      </div>
    </div>
  );
} 