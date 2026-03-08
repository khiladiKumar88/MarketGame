import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { fetchHistory, INDICES } from '../hooks/useMarketData';

const RANGES = [
  { label: '1D', range: '1d' },
  { label: '1W', range: '5d' },
  { label: '1M', range: '1mo' },
  { label: '3M', range: '3mo' },
];

export default function StockChart({ activeIdx }) {
  const [data, setData] = useState([]);
  const [range, setRange] = useState('1mo');
  const [loading, setLoading] = useState(true);

  const symbol = INDICES[activeIdx]?.symbol ?? '^NSEI';
  const idx = INDICES[activeIdx];
  const isUp = data.length >= 2 ? data[data.length - 1].price >= data[0].price : true;
  const color = isUp ? '#22c55e' : '#ef4444';

  useEffect(() => {
    setLoading(true);
    fetchHistory(symbol, range)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [symbol, range]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          {idx?.label} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 13 }}>— Price Chart</span>
        </div>
        <div className="btn-group">
          {RANGES.map(r => (
            <button
              key={r.range}
              className={`btn-range ${range === r.range ? 'active' : ''}`}
              onClick={() => setRange(r.range)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loader"></div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="colorGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fill: '#4a5578', fontSize: 10, fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={['auto', 'auto']} tick={{ fill: '#4a5578', fontSize: 10, fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} orientation="right" tickFormatter={v => v.toLocaleString('en-IN')} />
            <Tooltip
              contentStyle={{ background: '#131829', border: '1px solid #1e2640', borderRadius: 8, fontFamily: 'DM Mono', fontSize: 12 }}
              labelStyle={{ color: '#8892b0' }}
              itemStyle={{ color: '#e8eaf2' }}
              formatter={v => ['₹' + v?.toLocaleString('en-IN', { minimumFractionDigits: 2 }), '']}
            />
            <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill="url(#colorGrad)" dot={false} activeDot={{ r: 4, fill: color }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}