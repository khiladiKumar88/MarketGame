import { useIndices } from '../hooks/useMarketData';

function fmt(n) {
  if (!n) return '---';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function IndexCards({ activeIdx, onSelect }) {
  const indices = useIndices();

  return (
    <div className="index-grid">
      {indices.map((idx, i) => (
        <div
          key={idx.label}
          className={`index-card ${activeIdx === i ? 'active' : ''}`}
          onClick={() => onSelect(i, idx)}
        >
          <div className="index-label">{idx.label}</div>
          {idx.price === null ? (
            <div className="skeleton" style={{ marginBottom: 8 }}></div>
          ) : (
            <div className="index-value">{fmt(idx.price)}</div>
          )}
          {idx.chg !== null && (
            <div className="index-change" style={{ color: idx.chg >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {idx.chg >= 0 ? '▲' : '▼'} {Math.abs(idx.chg).toFixed(2)}%
            </div>
          )}
        </div>
      ))}
    </div>
  );
}