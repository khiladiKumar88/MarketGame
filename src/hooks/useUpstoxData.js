import { useState, useEffect } from 'react';

const BASE = 'http://localhost:5000/api/upstox';

export const UPSTOX_INDICES = [
  { label: 'NIFTY 50',   key: 'NSE_INDEX:Nifty 50',   token: 'NSE_INDEX|Nifty 50' },
  { label: 'BANK NIFTY', key: 'NSE_INDEX:Nifty Bank',  token: 'NSE_INDEX|Nifty Bank' },
  { label: 'SENSEX',     key: 'BSE_INDEX:SENSEX',      token: 'BSE_INDEX|SENSEX' },
  { label: 'NIFTY IT',   key: 'NSE_INDEX:Nifty IT',    token: 'NSE_INDEX|Nifty IT' },
];

export const UPSTOX_STOCKS = [
  { sym: 'RELIANCE',   key: 'NSE_EQ:RELIANCE',   token: 'NSE_EQ|INE002A01018', name: 'Reliance Industries', lot: 250 },
  { sym: 'TCS',        key: 'NSE_EQ:TCS',        token: 'NSE_EQ|INE467B01029', name: 'Tata Consultancy',    lot: 150 },
  { sym: 'HDFCBANK',   key: 'NSE_EQ:HDFCBANK',   token: 'NSE_EQ|INE040A01034', name: 'HDFC Bank',           lot: 550 },
  { sym: 'INFY',       key: 'NSE_EQ:INFY',       token: 'NSE_EQ|INE009A01021', name: 'Infosys',             lot: 300 },
  { sym: 'ICICIBANK',  key: 'NSE_EQ:ICICIBANK',  token: 'NSE_EQ|INE090A01021', name: 'ICICI Bank',          lot: 700 },
  { sym: 'WIPRO',      key: 'NSE_EQ:WIPRO',      token: 'NSE_EQ|INE075A01022', name: 'Wipro',               lot: 1500 },
  { sym: 'AXISBANK',   key: 'NSE_EQ:AXISBANK',   token: 'NSE_EQ|INE238A01034', name: 'Axis Bank',           lot: 625 },
  { sym: 'SBIN',       key: 'NSE_EQ:SBIN',       token: 'NSE_EQ|INE062A01020', name: 'SBI',                 lot: 1500 },
  { sym: 'HCLTECH',    key: 'NSE_EQ:HCLTECH',    token: 'NSE_EQ|INE860A01027', name: 'HCL Technologies',    lot: 350 },
  { sym: 'TATASTEEL',  key: 'NSE_EQ:TATASTEEL',  token: 'NSE_EQ|INE081A01020', name: 'Tata Steel',          lot: 5500 },
  { sym: 'SUNPHARMA',  key: 'NSE_EQ:SUNPHARMA',  token: 'NSE_EQ|INE044A01036', name: 'Sun Pharma',          lot: 350 },
  { sym: 'MARUTI',     key: 'NSE_EQ:MARUTI',     token: 'NSE_EQ|INE585B01010', name: 'Maruti Suzuki',       lot: 100 },
  { sym: 'NTPC',       key: 'NSE_EQ:NTPC',       token: 'NSE_EQ|INE733E01010', name: 'NTPC',                lot: 3000 },
  { sym: 'POWERGRID',  key: 'NSE_EQ:POWERGRID',  token: 'NSE_EQ|INE752E01010', name: 'Power Grid',          lot: 2900 },
  { sym: 'ONGC',       key: 'NSE_EQ:ONGC',       token: 'NSE_EQ|INE213A01029', name: 'ONGC',                lot: 1975 },
  { sym: 'COALINDIA',  key: 'NSE_EQ:COALINDIA',  token: 'NSE_EQ|INE522F01014', name: 'Coal India',          lot: 1400 },
  { sym: 'HINDALCO',   key: 'NSE_EQ:HINDALCO',   token: 'NSE_EQ|INE038A01020', name: 'Hindalco',            lot: 1075 },
  { sym: 'ADANIPORTS', key: 'NSE_EQ:ADANIPORTS', token: 'NSE_EQ|INE742F01042', name: 'Adani Ports',         lot: 375 },
  { sym: 'ITC',        key: 'NSE_EQ:ITC',        token: 'NSE_EQ|INE154A01025', name: 'ITC Ltd',             lot: 3200 },
  { sym: 'BAJFINANCE', key: 'NSE_EQ:BAJFINANCE', token: 'NSE_EQ|INE296A01024', name: 'Bajaj Finance',       lot: 125 },
];

// ── Parse Upstox quote response ────────────────────────────
function parseQuote(raw, key) {
  const d = raw?.data?.[key];
  if (!d) return null;

  const price     = d.last_price;
  const prevClose = d.ohlc?.close;
  const change    = d.net_change ?? 0;

  // % = point change / (current price - point change) * 100
  const base   = price - change;
  const chgPct = base !== 0 ? (change / base) * 100 : 0;

  return {
    price,
    open:      d.ohlc?.open,
    high:      d.ohlc?.high,
    low:       d.ohlc?.low,
    close:     prevClose,
    change,
    chgPct:    Math.round(chgPct * 100) / 100,
    volume:    d.volume,
    timestamp: d.timestamp,
  };
}

// ── Indices hook ───────────────────────────────────────────
export function useUpstoxIndices() {
  const [indices, setIndices] = useState(
    UPSTOX_INDICES.map(i => ({ ...i, price: null, change: null, chgPct: null }))
  );

  useEffect(() => {
    const load = async () => {
      try {
        const res  = await fetch(`${BASE}/indices`);
        const raw  = await res.json();
        setIndices(UPSTOX_INDICES.map(i => ({
          ...i,
          ...parseQuote(raw, i.key),
        })));
      } catch (e) { console.error('Upstox indices error:', e); }
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  return indices;
}

// ── Stocks hook ────────────────────────────────────────────
export function useUpstoxStocks() {
  const [stocks, setStocks] = useState(
    UPSTOX_STOCKS.map(s => ({ ...s, price: null, change: null, chgPct: null }))
  );

  useEffect(() => {
    const load = async () => {
      try {
        const res  = await fetch(`${BASE}/stocks`);
        const raw  = await res.json();
        setStocks(UPSTOX_STOCKS.map(s => ({
          ...s,
          ...parseQuote(raw, s.key),
        })));
      } catch (e) { console.error('Upstox stocks error:', e); }
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  return stocks;
}

// ── Fetch candles ──────────────────────────────────────────
export async function fetchUpstoxCandles(token, interval = 'day') {
  try {
    const encoded = encodeURIComponent(token);
    const res     = await fetch(`${BASE}/candles/${encoded}?interval=${interval}`);
    const raw     = await res.json();
    const candles = raw?.data?.candles ?? [];
    return candles.map(c => ({
      time:   new Date(c[0]).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      open:   c[1],
      high:   c[2],
      low:    c[3],
      close:  c[4],
      volume: c[5],
    })).reverse();
  } catch (e) {
    console.error('Candles error:', e);
    return [];
  }
}

// ── Fetch options expiry ───────────────────────────────────
export async function fetchUpstoxExpiry(token) {
  try {
    const res = await fetch(`${BASE}/expiry/${encodeURIComponent(token)}`);
    return await res.json();
  } catch (e) { return null; }
}

// ── Fetch options chain ────────────────────────────────────
export async function fetchUpstoxOptions(token, expiry) {
  try {
    const res = await fetch(`${BASE}/options/${encodeURIComponent(token)}/${expiry}`);
    return await res.json();
  } catch (e) { return null; }
}







// import { useState, useEffect } from 'react';

// const BASE = 'http://localhost:5000/api/upstox';

// export const UPSTOX_INDICES = [
//   { label: 'NIFTY 50',   key: 'NSE_INDEX:Nifty 50',   token: 'NSE_INDEX|Nifty 50' },
//   { label: 'BANK NIFTY', key: 'NSE_INDEX:Nifty Bank',  token: 'NSE_INDEX|Nifty Bank' },
//   { label: 'SENSEX',     key: 'BSE_INDEX:SENSEX',      token: 'BSE_INDEX|SENSEX' },
//   { label: 'NIFTY IT',   key: 'NSE_INDEX:Nifty IT',    token: 'NSE_INDEX|Nifty IT' },
// ];

// export const UPSTOX_STOCKS = [
//   { sym: 'RELIANCE',  key: 'NSE_EQ:RELIANCE',  token: 'NSE_EQ|INE002A01018', name: 'Reliance Industries', lot: 250 },
//   { sym: 'TCS',       key: 'NSE_EQ:TCS',       token: 'NSE_EQ|INE467B01029', name: 'Tata Consultancy',    lot: 150 },
//   { sym: 'HDFCBANK',  key: 'NSE_EQ:HDFCBANK',  token: 'NSE_EQ|INE040A01034', name: 'HDFC Bank',           lot: 550 },
//   { sym: 'INFY',      key: 'NSE_EQ:INFY',      token: 'NSE_EQ|INE009A01021', name: 'Infosys',             lot: 300 },
//   { sym: 'ICICIBANK', key: 'NSE_EQ:ICICIBANK', token: 'NSE_EQ|INE090A01021', name: 'ICICI Bank',          lot: 700 },
//   { sym: 'WIPRO',     key: 'NSE_EQ:WIPRO',     token: 'NSE_EQ|INE075A01022', name: 'Wipro',               lot: 1500 },
//   { sym: 'AXISBANK',  key: 'NSE_EQ:AXISBANK',  token: 'NSE_EQ|INE238A01034', name: 'Axis Bank',           lot: 625 },
//   { sym: 'SBIN',      key: 'NSE_EQ:SBIN',      token: 'NSE_EQ|INE062A01020', name: 'SBI',                 lot: 1500 },
//   { sym: 'HCLTECH',   key: 'NSE_EQ:HCLTECH',   token: 'NSE_EQ|INE860A01027', name: 'HCL Technologies',   lot: 350 },
//   { sym: 'TATASTEEL', key: 'NSE_EQ:TATASTEEL', token: 'NSE_EQ|INE081A01020', name: 'Tata Steel',          lot: 5500 },
//   { sym: 'SUNPHARMA', key: 'NSE_EQ:SUNPHARMA', token: 'NSE_EQ|INE044A01036', name: 'Sun Pharma',          lot: 350 },
//   { sym: 'MARUTI',    key: 'NSE_EQ:MARUTI',    token: 'NSE_EQ|INE585B01010', name: 'Maruti Suzuki',       lot: 100 },
//   { sym: 'NTPC',      key: 'NSE_EQ:NTPC',      token: 'NSE_EQ|INE733E01010', name: 'NTPC',                lot: 3000 },
//   { sym: 'POWERGRID', key: 'NSE_EQ:POWERGRID', token: 'NSE_EQ|INE752E01010', name: 'Power Grid',          lot: 2900 },
//   { sym: 'ONGC',      key: 'NSE_EQ:ONGC',      token: 'NSE_EQ|INE213A01029', name: 'ONGC',                lot: 1975 },
//   { sym: 'COALINDIA', key: 'NSE_EQ:COALINDIA', token: 'NSE_EQ|INE522F01014', name: 'Coal India',          lot: 1400 },
//   { sym: 'HINDALCO',  key: 'NSE_EQ:HINDALCO',  token: 'NSE_EQ|INE038A01020', name: 'Hindalco',            lot: 1075 },
//   { sym: 'ADANIPORTS',key: 'NSE_EQ:ADANIPORTS',token: 'NSE_EQ|INE742F01042', name: 'Adani Ports',         lot: 375 },
// ];

// function parseQuote(raw, key) {
//   const d = raw?.data?.[key];
//   if (!d) return null;
//   return {
//     price:     d.last_price,
//     open:      d.ohlc?.open,
//     high:      d.ohlc?.high,
//     low:       d.ohlc?.low,
//     close:     d.ohlc?.close,
//     change:    d.net_change,
//     chgPct:    d.last_price && d.ohlc?.close ? ((d.last_price - d.ohlc.close) / d.ohlc.close) * 100 : 0,
//     volume:    d.volume,
//     timestamp: d.timestamp,
//   };
// }

// export function useUpstoxIndices() {
//   const [indices, setIndices] = useState(UPSTOX_INDICES.map(i => ({ ...i, price: null, chgPct: null, change: null })));

//   useEffect(() => {
//     const load = async () => {
//       try {
//         const res  = await fetch(`${BASE}/indices`);
//         const raw  = await res.json();
//         const updated = UPSTOX_INDICES.map(i => {
//           const q = parseQuote(raw, i.key);
//           return { ...i, ...q };
//         });
//         setIndices(updated);
//       } catch (e) { console.error('Upstox indices error:', e); }
//     };
//     load();
//     const id = setInterval(load, 30000); // refresh every 30s
//     return () => clearInterval(id);
//   }, []);

//   return indices;
// }

// export function useUpstoxStocks() {
//   const [stocks, setStocks] = useState(UPSTOX_STOCKS.map(s => ({ ...s, price: null, chgPct: null, change: null })));

//   useEffect(() => {
//     const load = async () => {
//       try {
//         const res  = await fetch(`${BASE}/stocks`);
//         const raw  = await res.json();
//         const updated = UPSTOX_STOCKS.map(s => {
//           const q = parseQuote(raw, s.key);
//           return { ...s, ...q };
//         });
//         setStocks(updated);
//       } catch (e) { console.error('Upstox stocks error:', e); }
//     };
//     load();
//     const id = setInterval(load, 30000);
//     return () => clearInterval(id);
//   }, []);

//   return stocks;
// }

// export async function fetchUpstoxCandles(token, interval = 'day') {
//   try {
//     const encoded = encodeURIComponent(token);
//     const res  = await fetch(`${BASE}/candles/${encoded}?interval=${interval}`);
//     const raw  = await res.json();
//     const candles = raw?.data?.candles ?? [];
//     return candles.map(c => ({
//       time:   new Date(c[0]).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
//       open:   c[1], high: c[2], low: c[3], close: c[4], volume: c[5],
//       price:  c[4],
//     })).reverse();
//   } catch (e) { console.error('Candles error:', e); return []; }
// }

// export async function fetchUpstoxOptions(token, expiry) {
//   try {
//     const res = await fetch(`${BASE}/options/${encodeURIComponent(token)}/${expiry}`);
//     return await res.json();
//   } catch (e) { return null; }
// }

// export async function fetchUpstoxExpiry(token) {
//   try {
//     const res = await fetch(`${BASE}/expiry/${encodeURIComponent(token)}`);
//     return await res.json();
//   } catch (e) { return null; }
// }