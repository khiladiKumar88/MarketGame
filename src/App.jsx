import { useState } from 'react';
import Header from './components/Header';
import IndexCards from './components/IndexCards';
import StockChart from './components/StockChart';
import TopMovers from './components/TopMovers';
import AIAnalysis from './components/AIAnalysis';
import { useStocks, useIndices, INDICES } from './hooks/useMarketData';
import './index.css';
import FnO from './components/FnO';
import Signals from './components/Signals';
import FnOCommand from './components/FnOCommand';


const SECTORS = [
  { name: 'IT / Technology', pct: 1.42 },
  { name: 'Banking & Finance', pct: -0.38 },
  { name: 'Energy & Oil', pct: 0.91 },
  { name: 'FMCG', pct: 0.24 },
  { name: 'Auto & Ancillary', pct: 2.18 },
  { name: 'Pharma & Health', pct: -0.62 },
  { name: 'Metals & Mining', pct: -1.14 },
  { name: 'Real Estate', pct: 0.74 },
  { name: 'Telecom', pct: 0.55 },
  { name: 'Capital Goods', pct: 1.08 },
];

export default function App() {
  const [tab, setTab] = useState('overview');
  const [activeIdx, setActiveIdx] = useState(0);
  const [aiStock, setAiStock] = useState(null);
  const [search, setSearch] = useState('');
  const stocks = useStocks();
  const indices = useIndices();

  function handleAnalyze(stock) {
    setAiStock(stock);
    setTab('analysis');
  }

  const sorted = [...stocks].filter(s => s.chg !== null).sort((a, b) => b.chg - a.chg);
  const gainers = sorted.slice(0, 5);
  const losers = [...sorted].reverse().slice(0, 5);
  const filtered = stocks.filter(s =>
    s.sym.toLowerCase().includes(search.toLowerCase()) ||
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Header />

      {/* NAV */}
      <nav className="nav-tabs">
{[['overview','📊 Overview'],['analysis','🤖 AI Analysis'],['watchlist','⭐ Watchlist'],['sectors','🏭 Sectors'],['fno','📈 F&O'],['signals','🎯 Signals'],['command','🎯 F&O Command']].map(([key, label]) => (
          <button key={key} className={`nav-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      {/* TICKER */}
      <div className="ticker-strip">
        <div className="ticker-inner">
          {[...indices, ...stocks, ...indices, ...stocks].map((item, i) => (
            <div className="ticker-item" key={i}>
              <span className="ticker-name">{item.sym ?? item.label}</span>
              <span className="ticker-price">
                {item.price ? '₹' + item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '---'}
              </span>
              {item.chg != null && (
                <span className={item.chg >= 0 ? 'up' : 'down'}>
                  {item.chg >= 0 ? '▲' : '▼'} {Math.abs(item.chg).toFixed(2)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="main">

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="fade-in">
            <IndexCards activeIdx={activeIdx} onSelect={(i) => setActiveIdx(i)} />
            <div className="dashboard-grid">
              <StockChart activeIdx={activeIdx} />
              <TopMovers onAnalyze={handleAnalyze} />
            </div>
            <div className="bottom-grid">
              <div className="panel">
                <div className="panel-header"><div className="panel-title">🟢 Top Gainers</div></div>
                <table className="data-table">
                  <thead><tr><th>Stock</th><th>Price</th><th>Change</th></tr></thead>
                  <tbody>
                    {gainers.map(s => (
                      <tr key={s.sym} style={{ cursor: 'pointer' }} onClick={() => handleAnalyze(s)}>
                        <td>{s.sym}</td>
                        <td>₹{s.price?.toLocaleString('en-IN')}</td>
                        <td style={{ color: 'var(--green)' }}>+{s.chg?.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="panel">
                <div className="panel-header"><div className="panel-title">🔴 Top Losers</div></div>
                <table className="data-table">
                  <thead><tr><th>Stock</th><th>Price</th><th>Change</th></tr></thead>
                  <tbody>
                    {losers.map(s => (
                      <tr key={s.sym} style={{ cursor: 'pointer' }} onClick={() => handleAnalyze(s)}>
                        <td>{s.sym}</td>
                        <td>₹{s.price?.toLocaleString('en-IN')}</td>
                        <td style={{ color: 'var(--red)' }}>{s.chg?.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* AI ANALYSIS */}
        {tab === 'analysis' && (
          <div className="fade-in">
            <AIAnalysis preSelected={aiStock} />
          </div>
        )}

        {/* WATCHLIST */}
        {tab === 'watchlist' && (
          <div className="fade-in">
            <div className="panel">
              <div className="panel-header"><div className="panel-title">⭐ My Watchlist</div></div>
              <div className="search-bar">
                <span>🔍</span>
                <input placeholder="Search stocks..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <table className="data-table">
                <thead><tr><th>Symbol</th><th>Company</th><th>Price</th><th>Change</th><th>Action</th></tr></thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.sym}>
                      <td>{s.sym}</td>
                      <td style={{ fontFamily: 'DM Sans', color: 'var(--text-secondary)' }}>{s.name}</td>
                      <td>{s.price ? '₹' + s.price.toLocaleString('en-IN') : '---'}</td>
                      <td style={{ color: s.chg >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {s.chg != null ? (s.chg >= 0 ? '+' : '') + s.chg.toFixed(2) + '%' : '---'}
                      </td>
                      <td>
                        <button onClick={() => handleAnalyze(s)}
                          style={{ background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                          Analyze
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTORS */}
        {tab === 'sectors' && (
          <div className="fade-in">
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">🏭 Sector Performance</div>
                <div className="panel-sub">Today's change</div>
              </div>
              <div className="sector-grid">
                {SECTORS.map(s => (
                  <div key={s.name} className="sector-item">
                    <span className="sector-name">{s.name}</span>
                    <span className="sector-pct" style={{ color: s.pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {s.pct >= 0 ? '+' : ''}{s.pct.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'fno' && (
  <div className="fade-in">
    <FnO />
  </div>
)}

{tab === 'signals' && (
  <div className="fade-in">
    <Signals />
  </div>
)}

{tab === 'command' && (
  <div className="fade-in">
    <FnOCommand />
  </div>
)}


        <div className="disclaimer">
          ⚠️ <strong>Disclaimer:</strong> MarketSaathi is for educational purposes only. AI signals are not financial advice. Always consult a SEBI-registered advisor before investing. Trading involves risk of capital loss.
        </div>
      </div>
    </>
  );
}