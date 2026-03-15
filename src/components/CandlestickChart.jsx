// src/components/CandlestickChart.jsx
// Drop-in replacement for ChartPanel in UpstoxDashboard.jsx
// Usage: <CandlestickChart activeIdx={activeIdx} />

import { useState, useEffect, useRef } from 'react';
import { fetchUpstoxCandles, UPSTOX_INDICES } from '../hooks/useUpstoxData';

function fmtPrice(n) {
  if (n == null) return '---';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Pure SVG Candlestick Chart ────────────────────────────────
function SVGCandleChart({ candles, width = 800, height = 320 }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  if (!candles.length) return null;

  const PADDING = { top: 20, right: 70, bottom: 30, left: 10 };
  const chartW  = width  - PADDING.left - PADDING.right;
  const chartH  = height - PADDING.top  - PADDING.bottom;

  // Price range
  const allHighs = candles.map(c => c.high);
  const allLows  = candles.map(c => c.low);
  const priceMax = Math.max(...allHighs) * 1.001;
  const priceMin = Math.min(...allLows)  * 0.999;
  const priceRange = priceMax - priceMin || 1;

  // Candle width
  const count     = candles.length;
  const candleW   = Math.max(2, Math.floor((chartW / count) * 0.7));
  const candleGap = chartW / count;

  // Price to Y
  const toY = (price) =>
    PADDING.top + chartH - ((price - priceMin) / priceRange) * chartH;

  // X position of candle center
  const toX = (i) =>
    PADDING.left + i * candleGap + candleGap / 2;

  // Y axis ticks
  const tickCount = 6;
  const yTicks = Array.from({ length: tickCount }, (_, i) =>
    priceMin + (priceRange / (tickCount - 1)) * i
  );

  // X axis labels — show ~8 evenly spaced
  const xStep  = Math.max(1, Math.floor(count / 8));
  const xLabels = candles.map((c, i) => ({ i, label: c.time })).filter((_, i) => i % xStep === 0);

  // Handle mouse over candle
  function handleMouseMove(e) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx   = e.clientX - rect.left - PADDING.left;
    const idx  = Math.round(mx / candleGap);
    if (idx >= 0 && idx < candles.length) {
      setTooltip({ idx, x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setTooltip(null);
    }
  }

  const ttCandle = tooltip != null ? candles[tooltip.idx] : null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%" height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <line key={i}
            x1={PADDING.left} x2={width - PADDING.right}
            y1={toY(tick)} y2={toY(tick)}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
        ))}

        {/* Y axis labels */}
        {yTicks.map((tick, i) => (
          <text key={i}
            x={width - PADDING.right + 6}
            y={toY(tick) + 4}
            fill="#4a5578" fontSize={10} fontFamily="DM Mono">
            {tick.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </text>
        ))}

        {/* X axis labels */}
        {xLabels.map(({ i, label }) => (
          <text key={i}
            x={toX(i)} y={height - 6}
            fill="#4a5578" fontSize={9} fontFamily="DM Mono"
            textAnchor="middle">
            {label}
          </text>
        ))}

        {/* Candles */}
        {candles.map((c, i) => {
          const isBull  = c.close >= c.open;
          const color   = isBull ? '#22c55e' : '#ef4444';
          const cx      = toX(i);
          const highY   = toY(c.high);
          const lowY    = toY(c.low);
          const openY   = toY(c.open);
          const closeY  = toY(c.close);
          const bodyTop = Math.min(openY, closeY);
          const bodyH   = Math.max(1, Math.abs(closeY - openY));
          const isHovered = tooltip?.idx === i;

          return (
            <g key={i} opacity={isHovered ? 1 : 0.85}>
              {/* Highlight band on hover */}
              {isHovered && (
                <rect
                  x={cx - candleGap / 2} y={PADDING.top}
                  width={candleGap} height={chartH}
                  fill="rgba(255,255,255,0.03)"
                />
              )}
              {/* Wick */}
              <line
                x1={cx} x2={cx} y1={highY} y2={lowY}
                stroke={color} strokeWidth={1} />
              {/* Body */}
              <rect
                x={cx - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyH}
                fill={isBull ? color : color}
                fillOpacity={isBull ? 0.85 : 1}
                stroke={color}
                strokeWidth={0.5}
              />
            </g>
          );
        })}

        {/* Crosshair vertical line */}
        {tooltip && (
          <line
            x1={toX(tooltip.idx)} x2={toX(tooltip.idx)}
            y1={PADDING.top} y2={PADDING.top + chartH}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4 3" />
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && ttCandle && (
        <div style={{
          position: 'absolute',
          left: Math.min(tooltip.x + 14, (svgRef.current?.clientWidth ?? 600) - 180),
          top:  Math.max(0, tooltip.y - 60),
          background: '#131829',
          border: '1px solid #1e2640',
          borderRadius: 10,
          padding: '10px 14px',
          fontFamily: 'DM Mono',
          fontSize: 12,
          pointerEvents: 'none',
          zIndex: 10,
          minWidth: 160,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ color: '#8892b0', marginBottom: 6, fontSize: 11 }}>{ttCandle.time}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px' }}>
            <span style={{ color: '#8892b0' }}>O</span>
            <span style={{ color: 'var(--text-primary)' }}>₹{fmtPrice(ttCandle.open)}</span>
            <span style={{ color: '#22c55e' }}>H</span>
            <span style={{ color: '#22c55e' }}>₹{fmtPrice(ttCandle.high)}</span>
            <span style={{ color: '#ef4444' }}>L</span>
            <span style={{ color: '#ef4444' }}>₹{fmtPrice(ttCandle.low)}</span>
            <span style={{ color: '#8892b0' }}>C</span>
            <span style={{ color: ttCandle.close >= ttCandle.open ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
              ₹{fmtPrice(ttCandle.close)}
            </span>
          </div>
          {ttCandle.volume != null && (
            <div style={{ marginTop: 6, color: '#8892b0', fontSize: 11 }}>
              Vol: <span style={{ color: 'var(--text-primary)' }}>{(ttCandle.volume / 1e6).toFixed(2)}M</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Line Chart (keep original for comparison) ─────────────────
function SVGLineChart({ candles, width = 800, height = 320 }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);
  if (!candles.length) return null;

  const PADDING = { top: 20, right: 70, bottom: 30, left: 10 };
  const chartW  = width  - PADDING.left - PADDING.right;
  const chartH  = height - PADDING.top  - PADDING.bottom;

  const closes  = candles.map(c => c.close);
  const priceMax = Math.max(...closes) * 1.002;
  const priceMin = Math.min(...closes) * 0.998;
  const priceRange = priceMax - priceMin || 1;

  const toY = (p) => PADDING.top + chartH - ((p - priceMin) / priceRange) * chartH;
  const toX = (i) => PADDING.left + (i / (candles.length - 1)) * chartW;

  const isUp    = closes[closes.length - 1] >= closes[0];
  const color   = isUp ? '#22c55e' : '#ef4444';

  const points  = candles.map((c, i) => `${toX(i)},${toY(c.close)}`).join(' ');
  const areaPath = `M ${toX(0)},${toY(closes[0])} ` +
    candles.map((c, i) => `L ${toX(i)},${toY(c.close)}`).join(' ') +
    ` L ${toX(candles.length - 1)},${PADDING.top + chartH} L ${toX(0)},${PADDING.top + chartH} Z`;

  const tickCount = 6;
  const yTicks    = Array.from({ length: tickCount }, (_, i) => priceMin + (priceRange / (tickCount - 1)) * i);
  const xStep     = Math.max(1, Math.floor(candles.length / 8));
  const xLabels   = candles.map((c, i) => ({ i, label: c.time })).filter((_, i) => i % xStep === 0);

  function handleMouseMove(e) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx   = e.clientX - rect.left - PADDING.left;
    const idx  = Math.round((mx / chartW) * (candles.length - 1));
    const clamped = Math.max(0, Math.min(candles.length - 1, idx));
    setTooltip({ idx: clamped, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  const ttC = tooltip != null ? candles[tooltip.idx] : null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width="100%" height={height}
        onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}
        style={{ display: 'block', cursor: 'crosshair' }}>

        {yTicks.map((t, i) => (
          <line key={i} x1={PADDING.left} x2={width - PADDING.right} y1={toY(t)} y2={toY(t)}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
        ))}
        {yTicks.map((t, i) => (
          <text key={i} x={width - PADDING.right + 6} y={toY(t) + 4}
            fill="#4a5578" fontSize={10} fontFamily="DM Mono">
            {t.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </text>
        ))}
        {xLabels.map(({ i, label }) => (
          <text key={i} x={toX(i)} y={height - 6} fill="#4a5578" fontSize={9}
            fontFamily="DM Mono" textAnchor="middle">{label}</text>
        ))}

        <defs>
          <linearGradient id="lgLine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0}    />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#lgLine)" />
        <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

        {tooltip && <line x1={toX(tooltip.idx)} x2={toX(tooltip.idx)} y1={PADDING.top} y2={PADDING.top + chartH}
          stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4 3" />}
        {ttC && <circle cx={toX(tooltip.idx)} cy={toY(ttC.close)} r={4} fill={color} />}
      </svg>

      {tooltip && ttC && (
        <div style={{ position: 'absolute', left: Math.min(tooltip.x + 14, (svgRef.current?.clientWidth ?? 600) - 160), top: Math.max(0, tooltip.y - 40),
          background: '#131829', border: '1px solid #1e2640', borderRadius: 8,
          padding: '8px 12px', fontFamily: 'DM Mono', fontSize: 12, pointerEvents: 'none',
          zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          <div style={{ color: '#8892b0', marginBottom: 4, fontSize: 11 }}>{ttC.time}</div>
          <div style={{ color, fontWeight: 700 }}>₹{fmtPrice(ttC.close)}</div>
        </div>
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────
export default function CandlestickChart({ activeIdx }) {
  const idx = UPSTOX_INDICES[activeIdx];
  const [candles,   setCandles]   = useState([]);
  const [interval,  setIntervalV] = useState('day');
  const [chartType, setChartType] = useState('candle');
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchUpstoxCandles(idx.token, interval)
      .then(d => { setCandles(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [idx.token, interval]);

  const last   = candles[candles.length - 1];
  const first  = candles[0];
  const isUp   = (last?.close ?? 0) >= (first?.close ?? 0);
  const chgPct = first?.close ? (((last?.close - first?.close) / first?.close) * 100).toFixed(2) : null;

  return (
    <div className="panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {idx.label}
          <span style={{ fontSize: 10, background: 'rgba(201,168,76,0.15)', color: 'var(--gold)', padding: '2px 8px', borderRadius: 4, fontFamily: 'DM Mono' }}>
            UPSTOX LIVE
          </span>
          {last?.close && (
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'DM Mono', color: 'var(--text-primary)' }}>
              ₹{fmtPrice(last.close)}
            </span>
          )}
          {chgPct && (
            <span style={{ fontSize: 12, fontWeight: 700, color: isUp ? '#22c55e' : '#ef4444' }}>
              {isUp ? '▲ +' : '▼ '}{Math.abs(chgPct)}%
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Chart type toggle */}
          <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {[['candle','🕯 Candles'],['line','📈 Line']].map(([t, l]) => (
              <button key={t} onClick={() => setChartType(t)} style={{
                padding: '5px 12px', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: chartType === t ? 'rgba(201,168,76,0.2)' : 'var(--bg-primary)',
                color:      chartType === t ? 'var(--gold)'           : 'var(--text-muted)',
              }}>{l}</button>
            ))}
          </div>

          {/* Interval */}
          <div className="btn-group">
            {[['30minute','30M'],['day','1D'],['week','1W'],['month','1M']].map(([val, label]) => (
              <button key={val}
                className={`btn-range ${interval === val ? 'active' : ''}`}
                onClick={() => setIntervalV(val)}>{label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loader" />
        </div>
      ) : candles.length === 0 ? (
        <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          No chart data available
        </div>
      ) : chartType === 'candle' ? (
        <SVGCandleChart candles={candles} height={340} />
      ) : (
        <SVGLineChart candles={candles} height={340} />
      )}

      {/* OHLC footer */}
      {last && !loading && (
        <div style={{ display: 'flex', gap: 20, padding: '8px 4px 0', borderTop: '1px solid var(--border)', fontSize: 12, fontFamily: 'DM Mono', flexWrap: 'wrap' }}>
          {[
            ['O', last.open,  'var(--text-muted)'],
            ['H', last.high,  '#22c55e'],
            ['L', last.low,   '#ef4444'],
            ['C', last.close, isUp ? '#22c55e' : '#ef4444'],
          ].map(([label, val, color]) => (
            <span key={label}>
              <span style={{ color: 'var(--text-muted)' }}>{label}: </span>
              <span style={{ color, fontWeight: 700 }}>₹{fmtPrice(val)}</span>
            </span>
          ))}
          {last.volume && (
            <span style={{ color: 'var(--text-muted)' }}>
              Vol: <span style={{ color: 'var(--text-primary)' }}>{(last.volume / 1e6).toFixed(2)}M</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}