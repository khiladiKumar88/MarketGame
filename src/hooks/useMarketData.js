import { useState, useEffect } from 'react';
import axios from 'axios';

const BASE = 'http://localhost:5000/api';

// NSE symbols need .NS suffix for Yahoo Finance
export let INDICES = [
  { label: 'NIFTY 50',    symbol: '^NSEI',    price: null, chg: null },
  { label: 'BANK NIFTY',  symbol: '^NSEBANK', price: null, chg: null },
  { label: 'SENSEX',      symbol: '^BSESN',   price: null, chg: null },
  { label: 'NIFTY IT',    symbol: '^CNXIT',   price: null, chg: null },
];

// export const WATCHLIST = [
//   { sym: 'RELIANCE',   yahoo: 'RELIANCE.NS',  name: 'Reliance Industries' },
//   { sym: 'TCS',        yahoo: 'TCS.NS',       name: 'Tata Consultancy' },
//   { sym: 'HDFCBANK',   yahoo: 'HDFCBANK.NS',  name: 'HDFC Bank' },
//   { sym: 'INFY',       yahoo: 'INFY.NS',      name: 'Infosys' },
//   { sym: 'ICICIBANK',  yahoo: 'ICICIBANK.NS', name: 'ICICI Bank' },
//   { sym: 'WIPRO',      yahoo: 'WIPRO.NS',     name: 'Wipro' },
//   { sym: 'BAJFINANCE', yahoo: 'BAJFINANCE.NS',name: 'Bajaj Finance' },
//   { sym: 'TATAMOTORS', yahoo: 'TATAMOTORS.NS',name: 'Tata Motors' },
//   { sym: 'SBIN',       yahoo: 'SBIN.NS',      name: 'SBI' },
//   { sym: 'AXISBANK',   yahoo: 'AXISBANK.NS',  name: 'Axis Bank' },
//   { sym: 'HCLTECH',    yahoo: 'HCLTECH.NS',   name: 'HCL Technologies' },
//   { sym: 'ADANIPORTS', yahoo: 'ADANIPORTS.NS',name: 'Adani Ports' },
// ];



export const WATCHLIST = [
  // Large Cap
  { sym: 'RELIANCE',     yahoo: 'RELIANCE.NS',     name: 'Reliance Industries' },
  { sym: 'TCS',          yahoo: 'TCS.NS',           name: 'Tata Consultancy' },
  { sym: 'HDFCBANK',     yahoo: 'HDFCBANK.NS',      name: 'HDFC Bank' },
  { sym: 'INFY',         yahoo: 'INFY.NS',          name: 'Infosys' },
  { sym: 'ICICIBANK',    yahoo: 'ICICIBANK.NS',      name: 'ICICI Bank' },
  { sym: 'WIPRO',        yahoo: 'WIPRO.NS',         name: 'Wipro' },
  { sym: 'BAJFINANCE',   yahoo: 'BAJFINANCE.NS',    name: 'Bajaj Finance' },
  { sym: 'TATAMOTORS',   yahoo: 'TATAMOTORS.NS',    name: 'Tata Motors' },
  { sym: 'SBIN',         yahoo: 'SBIN.NS',          name: 'SBI' },
  { sym: 'AXISBANK',     yahoo: 'AXISBANK.NS',      name: 'Axis Bank' },
  { sym: 'HCLTECH',      yahoo: 'HCLTECH.NS',       name: 'HCL Technologies' },
  { sym: 'ADANIPORTS',   yahoo: 'ADANIPORTS.NS',    name: 'Adani Ports' },
  // Mid Cap
  { sym: 'TATASTEEL',    yahoo: 'TATASTEEL.NS',     name: 'Tata Steel' },
  { sym: 'SUNPHARMA',    yahoo: 'SUNPHARMA.NS',     name: 'Sun Pharma' },
  { sym: 'MARUTI',       yahoo: 'MARUTI.NS',        name: 'Maruti Suzuki' },
  { sym: 'NTPC',         yahoo: 'NTPC.NS',          name: 'NTPC Ltd' },
  { sym: 'POWERGRID',    yahoo: 'POWERGRID.NS',     name: 'Power Grid' },
  { sym: 'ONGC',         yahoo: 'ONGC.NS',          name: 'ONGC' },
  { sym: 'COALINDIA',    yahoo: 'COALINDIA.NS',     name: 'Coal India' },
  { sym: 'HINDALCO',     yahoo: 'HINDALCO.NS',      name: 'Hindalco' },
  { sym: 'JSWSTEEL',     yahoo: 'JSWSTEEL.NS',      name: 'JSW Steel' },
  { sym: 'ULTRACEMCO',   yahoo: 'ULTRACEMCO.NS',    name: 'UltraTech Cement' },
  { sym: 'TITAN',        yahoo: 'TITAN.NS',         name: 'Titan Company' },
  { sym: 'NESTLEIND',    yahoo: 'NESTLEIND.NS',     name: 'Nestle India' },
  { sym: 'ASIANPAINT',   yahoo: 'ASIANPAINT.NS',    name: 'Asian Paints' },
  { sym: 'BAJAJFINSV',   yahoo: 'BAJAJFINSV.NS',    name: 'Bajaj Finserv' },
  { sym: 'TECHM',        yahoo: 'TECHM.NS',         name: 'Tech Mahindra' },
  { sym: 'DRREDDY',      yahoo: 'DRREDDY.NS',       name: 'Dr Reddys Labs' },
  { sym: 'CIPLA',        yahoo: 'CIPLA.NS',         name: 'Cipla' },
  { sym: 'EICHERMOT',    yahoo: 'EICHERMOT.NS',     name: 'Eicher Motors' },
  { sym: 'DIVISLAB',     yahoo: 'DIVISLAB.NS',      name: 'Divi\'s Labs' },
  { sym: 'APOLLOHOSP',   yahoo: 'APOLLOHOSP.NS',    name: 'Apollo Hospitals' },
  { sym: 'LTIM',         yahoo: 'LTIM.NS',          name: 'LTIMindtree' },
  { sym: 'LT',           yahoo: 'LT.NS',            name: 'Larsen & Toubro' },
  { sym: 'M&M',          yahoo: 'M%26M.NS',         name: 'Mahindra & Mahindra' },
  { sym: 'INDUSINDBK',   yahoo: 'INDUSINDBK.NS',    name: 'IndusInd Bank' },
  { sym: 'GRASIM',       yahoo: 'GRASIM.NS',        name: 'Grasim Industries' },
  { sym: 'BPCL',         yahoo: 'BPCL.NS',          name: 'BPCL' },
  { sym: 'HEROMOTOCO',   yahoo: 'HEROMOTOCO.NS',    name: 'Hero MotoCorp' },
  { sym: 'BRITANNIA',    yahoo: 'BRITANNIA.NS',     name: 'Britannia' },
  { sym: 'SHREECEM',     yahoo: 'SHREECEM.NS',      name: 'Shree Cement' },
  { sym: 'PIDILITIND',   yahoo: 'PIDILITIND.NS',    name: 'Pidilite Industries' },
  { sym: 'HAVELLS',      yahoo: 'HAVELLS.NS',       name: 'Havells India' },
  { sym: 'BERGEPAINT',   yahoo: 'BERGEPAINT.NS',    name: 'Berger Paints' },
  { sym: 'DABUR',        yahoo: 'DABUR.NS',         name: 'Dabur India' },
  { sym: 'MARICO',       yahoo: 'MARICO.NS',        name: 'Marico' },
  { sym: 'GODREJCP',     yahoo: 'GODREJCP.NS',      name: 'Godrej Consumer' },
  { sym: 'TATACONSUM',   yahoo: 'TATACONSUM.NS',    name: 'Tata Consumer' },
  { sym: 'VEDL',         yahoo: 'VEDL.NS',          name: 'Vedanta' },
  { sym: 'ZOMATO',       yahoo: 'ZOMATO.NS',        name: 'Zomato' },
  { sym: 'NYKAA',        yahoo: 'NYKAA.NS',         name: 'Nykaa' },
  { sym: 'PAYTM',        yahoo: 'PAYTM.NS',         name: 'Paytm' },
  { sym: 'IRCTC',        yahoo: 'IRCTC.NS',         name: 'IRCTC' },
  { sym: 'DMART',        yahoo: 'DMART.NS',         name: 'DMart' },
  { sym: 'SIEMENS',      yahoo: 'SIEMENS.NS',       name: 'Siemens India' },
  { sym: 'ABB',          yahoo: 'ABB.NS',           name: 'ABB India' },
  { sym: 'POLYCAB',      yahoo: 'POLYCAB.NS',       name: 'Polycab India' },
  { sym: 'DIXON',        yahoo: 'DIXON.NS',         name: 'Dixon Technologies' },
  { sym: 'PERSISTENT',   yahoo: 'PERSISTENT.NS',    name: 'Persistent Systems' },
  { sym: 'COFORGE',      yahoo: 'COFORGE.NS',       name: 'Coforge' },
  { sym: 'MPHASIS',      yahoo: 'MPHASIS.NS',       name: 'Mphasis' },
];



async function fetchQuote(symbol) {
  try {
    const { data } = await axios.get(`${BASE}/quote/${symbol}`);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    const prev  = meta.chartPreviousClose || meta.previousClose;
    const chg   = prev ? ((price - prev) / prev) * 100 : 0;
    return { price, chg, prev };
  } catch { return null; }
}

export function useIndices() {
  const [indices, setIndices] = useState(INDICES.map(i => ({ ...i })));

  useEffect(() => {
    const load = async () => {
      const updated = await Promise.all(
        INDICES.map(async (idx) => {
          const q = await fetchQuote(idx.symbol);
          return { ...idx, price: q?.price ?? null, chg: q?.chg ?? null };
        })
      );
      // ✅ sync back to exported INDICES so AIAnalysis can read prices
      updated.forEach((u, i) => {
        INDICES[i].price = u.price;
        INDICES[i].chg = u.chg;
      });
      setIndices(updated);
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  return indices;
}

export function useStocks() {
  const [stocks, setStocks] = useState(WATCHLIST.map(s => ({ ...s, price: null, chg: null })));

  useEffect(() => {
    const load = async () => {
      const updated = await Promise.all(
        WATCHLIST.map(async (s) => {
          const q = await fetchQuote(s.yahoo);
          return { ...s, price: q?.price ?? null, chg: q?.chg ?? null };
        })
      );
      setStocks(updated);
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  return stocks;
}

export async function fetchHistory(symbol, range = '1mo') {
  const interval = range === '1d' ? '5m' : range === '5d' ? '15m' : '1d';
  const { data } = await axios.get(`${BASE}/history/${symbol}?range=${range}&interval=${interval}`);
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const timestamps = result.timestamp;
  const closes = result.indicators?.quote?.[0]?.close;
  return timestamps.map((t, i) => ({
    time: new Date(t * 1000).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    price: closes?.[i] ? Math.round(closes[i] * 100) / 100 : null,
  })).filter(d => d.price !== null);
}


export async function searchStock(symbol) {
  const yahoo = symbol.toUpperCase() + '.NS';
  const q = await fetchQuote(yahoo);
  if (!q) return null;
  return {
    sym: symbol.toUpperCase(),
    yahoo,
    name: symbol.toUpperCase(),
    price: q.price,
    chg: q.chg
  };
}