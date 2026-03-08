import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── CONFIG ─────────────────────────────────────────────────
const UPSTOX_API_KEY    = 'b059b87f-a992-4925-8840-2649683e41ed';
const UPSTOX_API_SECRET = 'zu0z8aexxn';
const UPSTOX_REDIRECT   = 'http://localhost:5173';
let   UPSTOX_TOKEN      = 'eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiI1QUNQQkgiLCJqdGkiOiI2OWI1MDZlYmE4OGMzYTVkNmRiOGM1OWMiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6ZmFsc2UsImlhdCI6MTc3MzQ3MTQ2NywiaXNzIjoidWRhcGktZ2F0ZXdheS1zZXJ2aWNlIiwiZXhwIjoxNzczNTI1NjAwfQ.beXthzE7G_8obGuzNnBvyrGgA3ny4yHXhXHB9LpPh-A'; 

const UPSTOX_HEADERS = () => ({
  'Authorization': `Bearer ${UPSTOX_TOKEN}`,
  'Accept': 'application/json'
});

 
const SYMBOL_TO_KEY = {
  'NIFTY':     'NSE_INDEX|Nifty 50',
  'BANKNIFTY': 'NSE_INDEX|Nifty Bank',
  'FINNIFTY':  'NSE_INDEX|Nifty Fin Service',
};
 

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com',
  'Origin': 'https://finance.yahoo.com',
};

// ══════════════════════════════════════════════════════════
// YAHOO FINANCE ROUTES
// ══════════════════════════════════════════════════════════
app.get('/api/quote/:symbol', async (req, res) => {
  try {
    let response;
    try {
      response = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${req.params.symbol}?interval=1d&range=1d`,
        { headers: YAHOO_HEADERS, timeout: 8000 }
      );
    } catch {
      // fallback to query2
      response = await axios.get(
        `https://query2.finance.yahoo.com/v8/finance/chart/${req.params.symbol}?interval=1d&range=1d`,
        { headers: YAHOO_HEADERS, timeout: 8000 }
      );
    }
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/:symbol', async (req, res) => {
  try {
    const { range = '1mo', interval = '1d' } = req.query;
    let response;
    try {
      response = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${req.params.symbol}?interval=${interval}&range=${range}`,
        { headers: YAHOO_HEADERS, timeout: 8000 }
      );
    } catch {
      response = await axios.get(
        `https://query2.finance.yahoo.com/v8/finance/chart/${req.params.symbol}?interval=${interval}&range=${range}`,
        { headers: YAHOO_HEADERS, timeout: 8000 }
      );
    }
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════
// UPSTOX AUTH ROUTES
// ══════════════════════════════════════════════════════════
app.get('/api/upstox/login-url', (req, res) => {
  const url = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${UPSTOX_API_KEY}&redirect_uri=${UPSTOX_REDIRECT}`;
  res.json({ url });
});

app.get('/api/upstox/token', async (req, res) => {
  try {
    const params = new URLSearchParams({
      code:          req.query.code,
      client_id:     UPSTOX_API_KEY,
      client_secret: UPSTOX_API_SECRET,
      redirect_uri:  UPSTOX_REDIRECT,
      grant_type:    'authorization_code'
    });
    const response = await axios.post(
      'https://api.upstox.com/v2/login/authorization/token',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    UPSTOX_TOKEN = response.data.access_token;
    console.log('✅ Upstox token refreshed!');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/upstox/status', (req, res) => {
  res.json({
    hasToken: !!UPSTOX_TOKEN && UPSTOX_TOKEN !== 'YOUR-ACCESS-TOKEN-HERE',
    tokenPreview: UPSTOX_TOKEN ? UPSTOX_TOKEN.slice(0, 20) + '...' : 'Not set'
  });
});

// ══════════════════════════════════════════════════════════
// UPSTOX MARKET DATA ROUTES
// ══════════════════════════════════════════════════════════
app.get('/api/upstox/profile', async (req, res) => {
  try {
    const response = await axios.get('https://api.upstox.com/v2/user/profile', { headers: UPSTOX_HEADERS() });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/upstox/indices', async (req, res) => {
  try {
    const symbols = 'NSE_INDEX|Nifty 50,NSE_INDEX|Nifty Bank,BSE_INDEX|SENSEX,NSE_INDEX|Nifty IT';
    const response = await axios.get(
      `https://api.upstox.com/v2/market-quote/quotes?symbol=${encodeURIComponent(symbols)}`,
      { headers: UPSTOX_HEADERS() }
    );
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/upstox/stocks', async (req, res) => {
  try {
    const symbols = [
      'NSE_EQ|INE002A01018', // RELIANCE
      'NSE_EQ|INE467B01029', // TCS
      'NSE_EQ|INE040A01034', // HDFCBANK
      'NSE_EQ|INE009A01021', // INFY
      'NSE_EQ|INE090A01021', // ICICIBANK
      'NSE_EQ|INE075A01022', // WIPRO
      'NSE_EQ|INE296A01024', // BAJFINANCE
      'NSE_EQ|INE154A01025', // ITC (mapped to TATAMOTORS key — fix below)
      'NSE_EQ|INE062A01020', // SBIN
      'NSE_EQ|INE238A01034', // AXISBANK
      'NSE_EQ|INE860A01027', // HCLTECH
      'NSE_EQ|INE742F01042', // ADANIPORTS
      'NSE_EQ|INE081A01020', // TATASTEEL
      'NSE_EQ|INE044A01036', // SUNPHARMA
      'NSE_EQ|INE585B01010', // MARUTI
      'NSE_EQ|INE733E01010', // NTPC
      'NSE_EQ|INE752E01010', // POWERGRID
      'NSE_EQ|INE213A01029', // ONGC
      'NSE_EQ|INE522F01014', // COALINDIA
      'NSE_EQ|INE038A01020', // HINDALCO
    ].join(',');
    const response = await axios.get(
      `https://api.upstox.com/v2/market-quote/quotes?symbol=${encodeURIComponent(symbols)}`,
      { headers: UPSTOX_HEADERS() }
    );
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/upstox/candles/:symbol', async (req, res) => {
  try {
    const { interval = 'day' } = req.query;
    const to   = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const encoded = encodeURIComponent(req.params.symbol);
    const response = await axios.get(
      `https://api.upstox.com/v2/historical-candle/${encoded}/${interval}/${to}/${from}`,
      { headers: UPSTOX_HEADERS() }
    );
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});



// app.get('/api/upstox/expiry/:symbol', async (req, res) => {
//   try {
//     const response = await axios.get(
//       `https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(req.params.symbol)}`,
//       { headers: UPSTOX_HEADERS() }
//     );
//     res.json(response.data);
//   } catch (err) { res.status(500).json({ error: err.message }); }
// });

// app.get('/api/upstox/options/:symbol/:expiry', async (req, res) => {
//   try {
//     const response = await axios.get(
//       `https://api.upstox.com/v2/option/chain?instrument_key=${encodeURIComponent(req.params.symbol)}&expiry_date=${req.params.expiry}`,
//       { headers: UPSTOX_HEADERS() }
//     );
//     res.json(response.data);
//   } catch (err) { res.status(500).json({ error: err.message }); }
// });




app.get('/api/upstox/expiry/:symbol', async (req, res) => {
  try {
    const instrumentKey = SYMBOL_TO_KEY[req.params.symbol.toUpperCase()];
    if (!instrumentKey) {
      return res.status(400).json({ error: `Unknown symbol: ${req.params.symbol}` });
    }
    const response = await axios.get(
      `https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(instrumentKey)}`,
      { headers: UPSTOX_HEADERS() }
    );
    res.json(response.data);
  } catch (err) {
    console.error('Expiry error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});
 
// Also fix the options chain route the same way:
app.get('/api/upstox/options/:symbol/:expiry', async (req, res) => {
  try {
    const instrumentKey = SYMBOL_TO_KEY[req.params.symbol.toUpperCase()];
    if (!instrumentKey) {
      return res.status(400).json({ error: `Unknown symbol: ${req.params.symbol}` });
    }
    const response = await axios.get(
      `https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(instrumentKey)}&expiry_date=${req.params.expiry}`,
      { headers: UPSTOX_HEADERS() }
    );
    res.json(response.data);
  } catch (err) {
    console.error('Options error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});
 















app.get('/api/upstox/gainers-losers', async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.upstox.com/v2/market-quote/gainers-losers?data_type=securities&exch_seg=NSE&indices_internal_code=13',
      { headers: UPSTOX_HEADERS() }
    );
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});



app.get('/api/upstox/test-expiry', async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.upstox.com/v2/option/contract?instrument_key=NSE_INDEX%7CNifty%2050',
      { headers: UPSTOX_HEADERS() }
    );
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Market quotes for options LTP / OI / volume
app.get('/api/upstox/quotes', async (req, res) => {
  const { keys } = req.query;
  if (!keys) return res.json({ status: 'error', message: 'No keys provided' });
  try {
    const r = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${keys}`,
      { headers: { Authorization: `Bearer ${UPSTOX_TOKEN}`, Accept: 'application/json' } }
    );
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.json({ status: 'error', message: e.message });
  }
});


// ══════════════════════════════════════════════════════════
// START — must be LAST
// ══════════════════════════════════════════════════════════
app.listen(5000, () => {
  console.log('✅ Server running on http://localhost:5000');
  console.log('');
  console.log('── Yahoo Finance ──────────────────────');
  console.log('  /api/quote/:symbol');
  console.log('  /api/history/:symbol');
  console.log('');
  console.log('── Upstox ─────────────────────────────');
  console.log('  /api/upstox/status');
  console.log('  /api/upstox/indices');
  console.log('  /api/upstox/stocks');
  console.log('  /api/upstox/candles/:symbol');
  console.log('  /api/upstox/options/:symbol/:expiry');
  console.log('  /api/upstox/expiry/:symbol');
});
