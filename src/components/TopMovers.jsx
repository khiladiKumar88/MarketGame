import { useStocks } from '../hooks/useMarketData';

function fmt(n) {
  if (!n) return '---';
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function TopMovers({ onAnalyze }) {
  const stocks = useStocks();
  const sorted = [...stocks]
    .filter(s => s.chg !== null)
    .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))
    .slice(0, 8);

  return (
    <div className="panel" style={{ overflowY: 'auto', maxHeight: 420 }}>
      <div className="panel-header">
        <div className="panel-title">Top Movers</div>
        <div className="panel-sub">By % change</div>
      </div>
      {sorted.map(s => (
        <div key={s.sym} className="mover-item" onClick={() => onAnalyze(s)}>
          <div>
            <div className="mover-sym">{s.sym}</div>
            <div className="mover-name">{s.name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mover-price">{fmt(s.price)}</div>
            {s.chg !== null && (
              <span className={`chg-badge ${s.chg >= 0 ? 'up' : 'down'}`}>
                {s.chg >= 0 ? '+' : ''}{s.chg.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}