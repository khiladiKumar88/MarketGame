// src/components/SmartSignals.jsx
import { useState, useRef } from 'react';
import { fetchUpstoxCandles, UPSTOX_INDICES } from '../hooks/useUpstoxData';

const GROQ_KEY = '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';

const SCAN_TARGETS = [
  { sym: 'NIFTY 50',   token: 'NSE_INDEX|Nifty 50',           isIndex: true  },
  { sym: 'BANK NIFTY', token: 'NSE_INDEX|Nifty Bank',          isIndex: true  },
  { sym: 'FIN NIFTY',  token: 'NSE_INDEX|Nifty Fin Service',   isIndex: true  },
  { sym: 'RELIANCE',   token: 'NSE_EQ|INE002A01018',           isIndex: false },
  { sym: 'TCS',        token: 'NSE_EQ|INE467B01029',           isIndex: false },
  { sym: 'HDFCBANK',   token: 'NSE_EQ|INE040A01034',           isIndex: false },
  { sym: 'INFY',       token: 'NSE_EQ|INE009A01021',           isIndex: false },
  { sym: 'ICICIBANK',  token: 'NSE_EQ|INE090A01021',           isIndex: false },
  { sym: 'SBIN',       token: 'NSE_EQ|INE062A01020',           isIndex: false },
  { sym: 'BAJFINANCE', token: 'NSE_EQ|INE296A01024',           isIndex: false },
  { sym: 'TATAMOTORS', token: 'NSE_EQ|INE155A01022',           isIndex: false },
  { sym: 'AXISBANK',   token: 'NSE_EQ|INE238A01034',           isIndex: false },
  { sym: 'WIPRO',      token: 'NSE_EQ|INE075A01022',           isIndex: false },
  { sym: 'MARUTI',     token: 'NSE_EQ|INE585B01010',           isIndex: false },
  { sym: 'SUNPHARMA',  token: 'NSE_EQ|INE044A01036',           isIndex: false },
];

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '---';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Indicators ───────────────────────────────────────────────
function ema(arr, p) {
  if (arr.length < p) return null;
  const k = 2 / (p + 1);
  let e = arr.slice(0, p).reduce((a, b) => a + b) / p;
  for (let i = p; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}
function calcRSI(candles, p = 14) {
  if (candles.length < p + 1) return null;
  const ch = candles.slice(-p-1).map((c,i,a) => i===0?0:c.close-a[i-1].close).slice(1);
  const ag = ch.map(x=>x>0?x:0).reduce((a,b)=>a+b)/p;
  const al = ch.map(x=>x<0?-x:0).reduce((a,b)=>a+b)/p;
  return al===0?100:+((100-100/(1+ag/al)).toFixed(1));
}
function calcMACD(candles) {
  if (candles.length < 35) return null;
  const cl = candles.map(c=>c.close);
  const e12=ema(cl,12), e26=ema(cl,26);
  if (!e12||!e26) return null;
  const line=e12-e26;
  const arr=[];
  for(let i=26;i<=cl.length;i++){const a=ema(cl.slice(0,i),12),b=ema(cl.slice(0,i),26);if(a&&b)arr.push(a-b);}
  const sig=ema(arr,9)||0;
  return { line:+line.toFixed(2), hist:+(line-sig).toFixed(2), bull:(line-sig)>0 };
}
function calcBB(candles, p=20) {
  if (candles.length<p) return null;
  const cl=candles.slice(-p).map(c=>c.close);
  const mean=cl.reduce((a,b)=>a+b)/p;
  const std=Math.sqrt(cl.reduce((a,b)=>a+(b-mean)**2,0)/p);
  const last=candles[candles.length-1].close;
  const up=mean+2*std, lo=mean-2*std;
  return { pct:+((last-lo)/(up-lo)*100).toFixed(1), pos:last>up?'ABOVE':last<lo?'BELOW':'INSIDE' };
}
function calcADX(candles, p=14) {
  if (candles.length<p+1) return null;
  const sl=candles.slice(-(p+1));
  const trs=[],pdm=[],ndm=[];
  for(let i=1;i<sl.length;i++){
    const h=sl[i].high,l=sl[i].low,pc=sl[i-1].close,ph=sl[i-1].high,pl=sl[i-1].low;
    trs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));
    pdm.push(h-ph>pl-l?Math.max(h-ph,0):0);
    ndm.push(pl-l>h-ph?Math.max(pl-l,0):0);
  }
  const atr=trs.reduce((a,b)=>a+b)/p;
  const pdi=pdm.reduce((a,b)=>a+b)/p/atr*100;
  const ndi=ndm.reduce((a,b)=>a+b)/p/atr*100;
  const dx=Math.abs(pdi-ndi)/(pdi+ndi||1)*100;
  return { val:+dx.toFixed(1), strong:dx>25, bull:pdi>ndi };
}
function calcST(candles, p=7, m=3) {
  if (candles.length<p+2) return null;
  const sl=candles.slice(-(p+2));
  const atrs=[];
  for(let i=1;i<sl.length;i++){
    const h=sl[i].high,l=sl[i].low,pc=sl[i-1].close;
    atrs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));
  }
  const atr=atrs.slice(-p).reduce((a,b)=>a+b)/p;
  const last=sl[sl.length-1];
  const hl2=(last.high+last.low)/2;
  return { trend:last.close>hl2-m*atr?'UP':'DOWN', atr:+atr.toFixed(2) };
}
function calcVWAP(candles) {
  const sl=candles.slice(-20);
  let pv=0,v=0;
  sl.forEach(c=>{const t=(c.high+c.low+c.close)/3;pv+=t*(c.volume||1);v+=(c.volume||1);});
  return +(pv/v).toFixed(2);
}

// ── 16 Candlestick Patterns ───────────────────────────────────
function detectPatterns(candles) {
  if (candles.length < 3) return [];
  const res=[];
  const c=candles[candles.length-1], p1=candles[candles.length-2], p2=candles[candles.length-3];
  const body=x=>Math.abs(x.close-x.open), rng=x=>(x.high-x.low)||0.0001;
  const bull=x=>x.close>x.open, bear=x=>x.close<x.open;
  const uw=x=>x.high-Math.max(x.open,x.close), lw=x=>Math.min(x.open,x.close)-x.low;

  // ── 1. Doji ─────────────────────────────────────────────────
  if (body(c)/rng(c)<0.1)
    res.push({n:'Doji',t:'neutral',strength:1,desc:'Market indecision — potential reversal incoming'});

  // ── 2. Hammer (bullish) ─────────────────────────────────────
  if (bull(c)&&lw(c)>body(c)*2&&uw(c)<body(c)*0.5)
    res.push({n:'Hammer',t:'bullish',strength:3,desc:'Strong bullish reversal — buyers rejected lower prices'});

  // ── 3. Shooting Star (bearish) ──────────────────────────────
  if (uw(c)>body(c)*2&&lw(c)<body(c)*0.5)
    res.push({n:'Shooting Star',t:'bearish',strength:3,desc:'Strong bearish reversal — sellers rejected higher prices'});

  // ── 4. Inverted Hammer (bullish at bottom) ──────────────────
  if (bear(c)&&uw(c)>body(c)*2&&lw(c)<body(c)*0.5)
    res.push({n:'Inverted Hammer',t:'bullish',strength:2,desc:'Potential bullish reversal — look for confirmation next candle'});

  // ── 5. Bullish Engulfing ────────────────────────────────────
  if (bear(p1)&&bull(c)&&c.open<p1.close&&c.close>p1.open)
    res.push({n:'Bullish Engulfing',t:'bullish',strength:4,desc:'Bulls completely overwhelmed bears — high conviction buy'});

  // ── 6. Bearish Engulfing ────────────────────────────────────
  if (bull(p1)&&bear(c)&&c.open>p1.close&&c.close<p1.open)
    res.push({n:'Bearish Engulfing',t:'bearish',strength:4,desc:'Bears completely overwhelmed bulls — high conviction sell'});

  // ── 7. Morning Star (3-candle bullish) ──────────────────────
  if (bear(p2)&&body(p1)<body(p2)*0.3&&bull(c)&&c.close>(p2.open+p2.close)/2)
    res.push({n:'Morning Star',t:'bullish',strength:5,desc:'Powerful 3-candle reversal — very strong buy signal'});

  // ── 8. Evening Star (3-candle bearish) ──────────────────────
  if (bull(p2)&&body(p1)<body(p2)*0.3&&bear(c)&&c.close<(p2.open+p2.close)/2)
    res.push({n:'Evening Star',t:'bearish',strength:5,desc:'Powerful 3-candle reversal — very strong sell signal'});

  // ── 9. Bullish Marubozu ─────────────────────────────────────
  if (bull(c)&&body(c)/rng(c)>0.85)
    res.push({n:'Bullish Marubozu',t:'bullish',strength:3,desc:'Strong buying all session — momentum play'});

  // ── 10. Bearish Marubozu ────────────────────────────────────
  if (bear(c)&&body(c)/rng(c)>0.85)
    res.push({n:'Bearish Marubozu',t:'bearish',strength:3,desc:'Strong selling all session — momentum short'});

  // ── 11. Three White Soldiers ────────────────────────────────
  if ([p2,p1,c].every(bull)&&p1.close>p2.close&&c.close>p1.close)
    res.push({n:'3 White Soldiers',t:'bullish',strength:5,desc:'Very strong sustained buying — trend continuation'});

  // ── 12. Three Black Crows ───────────────────────────────────
  if ([p2,p1,c].every(bear)&&p1.close<p2.close&&c.close<p1.close)
    res.push({n:'3 Black Crows',t:'bearish',strength:5,desc:'Very strong sustained selling — trend continuation'});

  // ── 13. Dragonfly Doji (bullish) ────────────────────────────
  if (body(c)/rng(c)<0.1&&lw(c)>rng(c)*0.3)
    res.push({n:'Dragonfly Doji',t:'bullish',strength:3,desc:'Bullish doji — buyers held strong at the lows'});

  // ── 14. Gravestone Doji (bearish) ───────────────────────────
  if (body(c)/rng(c)<0.1&&uw(c)>rng(c)*0.3)
    res.push({n:'Gravestone Doji',t:'bearish',strength:3,desc:'Bearish doji — sellers held strong at the highs'});

  // ── 15. Bullish Kicker (rare, very strong) ──────────────────
  if (bull(c)&&c.open>=p1.high&&c.close>p1.open)
    res.push({n:'Bullish Kicker',t:'bullish',strength:5,desc:'Very rare — extremely strong bullish reversal signal'});

  // ── 16. Bearish Kicker (rare, very strong) ──────────────────
  if (bear(c)&&c.open<=p1.low&&c.close<p1.open)
    res.push({n:'Bearish Kicker',t:'bearish',strength:5,desc:'Very rare — extremely strong bearish reversal signal'});

  return res;
}

// ── Score Engine — 7 indicators + patterns ───────────────────
function scoreSignal(ind) {
  const { r, m, b, a, st, vw, price, pats, volSpike } = ind;
  let bull=0, bear=0;

  // 1. RSI (weight: 20)
  if (r!==null) { r<=30?bull+=20:r<=45?bull+=12:r>=70?bear+=20:r>=55?bear+=12:0; }

  // 2. MACD (weight: 20)
  if (m) { m.bull?bull+=20:bear+=20; }

  // 3. Bollinger Bands (weight: 15)
  if (b) { b.pos==='BELOW'?bull+=15:b.pct<30?bull+=10:b.pos==='ABOVE'?bear+=15:b.pct>70?bear+=10:0; }

  // 4. ADX (weight: 20)
  if (a) { a.strong?(a.bull?bull+=20:bear+=20):(a.bull?bull+=8:bear+=8); }

  // 5. Supertrend (weight: 25 — highest weight)
  if (st) { st.trend==='UP'?bull+=25:bear+=25; }

  // 6. VWAP (weight: 10)
  if (vw&&price) { price>vw?bull+=10:bear+=10; }

  // 7. Volume Spike (weight: 10) — high volume confirms direction
  if (volSpike&&volSpike>1.5) { bull+=8; bear+=8; } // volume amplifies whichever side is winning

  // Candlestick patterns (bonus weighted by strength)
  pats.forEach(p=>{ p.t==='bullish'?bull+=p.strength*3:p.t==='bearish'?bear+=p.strength*3:0; });

  const total=bull+bear||1;
  const dir=bull>bear?'CALL':bear>bull?'PUT':'NEUTRAL';
  return { dir, confidence:Math.round(Math.max(bull,bear)/total*100), bull, bear };
}

// ── Backtest Engine ──────────────────────────────────────────
function runBacktest(candles, dir) {
  const trades=[];
  const minWindow=40;

  for (let i=minWindow; i<candles.length-1; i++) {
    const slice = candles.slice(0, i+1);
    const r     = calcRSI(slice);
    const m     = calcMACD(slice);
    const b     = calcBB(slice);
    const a     = calcADX(slice);
    const st    = calcST(slice);
    const vw    = calcVWAP(slice);
    const price = slice[slice.length-1].close;
    const vol   = slice[slice.length-1].volume||0;
    const avgV  = slice.slice(-10).reduce((s,c)=>s+(c.volume||0),0)/10;
    const volSpike = +(avgV>0?vol/avgV:1).toFixed(1);
    const pats  = detectPatterns(slice.slice(-3));
    const sc    = scoreSignal({ r,m,b,a,st,vw,price,pats,volSpike });

    if (sc.dir!==dir||sc.confidence<65) continue;

    const nextCandles=candles.slice(i+1, i+6);
    if (!nextCandles.length) continue;

    const entryPrice = price;
    const exitPrice  = nextCandles[nextCandles.length-1].close;
    const highInHold = Math.max(...nextCandles.map(c=>c.high));
    const lowInHold  = Math.min(...nextCandles.map(c=>c.low));
    const pnlPct     = dir==='CALL'?(exitPrice-entryPrice)/entryPrice*100:(entryPrice-exitPrice)/entryPrice*100;
    const maxGain    = dir==='CALL'?(highInHold-entryPrice)/entryPrice*100:(entryPrice-lowInHold)/entryPrice*100;

    trades.push({
      date:       slice[slice.length-1].time,
      entryPrice, exitPrice,
      pnlPct:     +pnlPct.toFixed(2),
      maxGain:    +maxGain.toFixed(2),
      confidence: sc.confidence,
      win:        pnlPct>0,
      patterns:   pats.map(p=>p.n),
    });
    i+=4;
  }

  if (!trades.length) return null;

  const wins    = trades.filter(t=>t.win);
  const losses  = trades.filter(t=>!t.win);
  const winRate = Math.round(wins.length/trades.length*100);
  const avgWin  = wins.length   ? +(wins.reduce((a,t)=>a+t.pnlPct,0)/wins.length).toFixed(2)   : 0;
  const avgLoss = losses.length ? +(losses.reduce((a,t)=>a+t.pnlPct,0)/losses.length).toFixed(2): 0;
  const avgMaxGain = +(trades.reduce((a,t)=>a+t.maxGain,0)/trades.length).toFixed(2);
  const profitFactor = avgLoss ? +(Math.abs(avgWin*wins.length)/Math.abs(avgLoss*losses.length)).toFixed(2) : 9.99;

  return {
    trades, last10: trades.slice(-10), winRate,
    avgWin, avgLoss, avgMaxGain, profitFactor,
    totalTrades: trades.length, wins: wins.length, losses: losses.length,
  };
}

// ── AI Recommendation ────────────────────────────────────────
async function getAIRec(result, capital, btResult) {
  const lotSize = result.isIndex?65:1;
  const estPrem = result.isIndex?150:Math.round(result.price*0.03);
  const lots    = Math.max(1, Math.floor(capital/(estPrem*lotSize)));

  const prompt =
    'You are an expert NSE options trader. Give a precise trade recommendation.\n\n'+
    'Instrument: '+result.sym+(result.isIndex?' (Index)':' (Stock)')+'\n'+
    'Price: ₹'+result.price?.toFixed(2)+'\n'+
    'Signal: '+result.dir+' | AI Confidence: '+result.confidence+'%\n'+
    'Backtest Win Rate: '+(btResult?.winRate??'N/A')+'%\n'+
    'Backtest Trades: '+(btResult?.totalTrades??0)+' historical signals\n'+
    'Avg Win: +'+(btResult?.avgWin??0)+'% | Avg Loss: '+(btResult?.avgLoss??0)+'%\n'+
    'Profit Factor: '+(btResult?.profitFactor??0)+'\n'+
    'RSI: '+(result.rsi??'N/A')+' | MACD: '+(result.macd?.bull?'Bullish':'Bearish')+'\n'+
    'Supertrend: '+(result.st?.trend??'N/A')+' | BB: '+(result.bb?.pct??'N/A')+'% ('+(result.bb?.pos??'N/A')+')\n'+
    'VWAP: ₹'+(result.vwap??'N/A')+' (price '+(result.price>result.vwap?'ABOVE':'BELOW')+')\n'+
    'Volume Spike: '+result.volSpike+'x average\n'+
    'Candlestick Patterns: '+(result.pats?.map(p=>p.n).join(', ')||'None')+'\n'+
    'Capital: ₹'+capital.toLocaleString('en-IN')+' | Est. lots: '+lots+'\n\n'+
    'Respond ONLY in JSON:\n'+
    '{"action":"BUY CALL or BUY PUT","exactOption":"e.g. NIFTY 23200 CE Weekly",'+
    '"entryPremium":"₹XX–₹YY","target1":"₹XX (+XX%)","target2":"₹XX (+XX%)",'+
    '"stopLoss":"₹XX (-XX%)","lots":'+lots+',"timeHorizon":"Intraday/1-2 Days/This Week",'+
    '"urgency":"HIGH or MEDIUM or LOW","entryCondition":"specific entry condition",'+
    '"exitCondition":"specific exit condition","whyThisSignal":"2-3 sentences combining AI signal + backtest validation",'+
    '"backtestVerdict":"1 sentence on what backtest says about this signal",'+
    '"keyRisk":"main risk"}';

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${GROQ_KEY}`},
      body:JSON.stringify({
        model:'llama-3.3-70b-versatile', max_tokens:900, temperature:0.2,
        messages:[
          {role:'system',content:'You are an NSE options expert. Respond ONLY with valid JSON.'},
          {role:'user',content:prompt}
        ]
      })
    });
    const d=await res.json();
    const raw=d.choices?.[0]?.message?.content??'';
    const s=raw.indexOf('{'), e=raw.lastIndexOf('}');
    if(s===-1) return null;
    return JSON.parse(raw.slice(s,e+1));
  } catch { return null; }
}

// ── Timeframe config ──────────────────────────────────────────
const TIMEFRAMES = {
  scalping: {
    label:      '🕐 Scalping',
    interval:   '5minute',
    holdTime:   '5–30 min',
    desc:       '5 min candles — fast signals for quick in/out trades',
    color:      '#f59e0b',
    minCandles: 20,
  },
  intraday: {
    label:      '⏱ Intraday',
    interval:   '30minute',
    holdTime:   '2–4 hours',
    desc:       '30 min candles — full intraday trades',
    color:      '#6366f1',
    minCandles: 20,
  },
  swing: {
    label:      '📅 Swing',
    interval:   'day',
    holdTime:   '2–10 days',
    desc:       'Daily candles — multi-day swing trades',
    color:      '#22c55e',
    minCandles: 30,
  },
};

// ── analyzeOne — accepts timeframe ───────────────────────────
async function analyzeOne(target, tfKey = 'intraday') {
  try {
    const tf = TIMEFRAMES[tfKey] || TIMEFRAMES.intraday;
    const [day, tfCandles] = await Promise.all([
      fetchUpstoxCandles(target.token, 'day'),
      tf.interval === 'day'
        ? fetchUpstoxCandles(target.token, 'day')
        : fetchUpstoxCandles(target.token, tf.interval),
    ]);
    if (!day.length) return null;
    const src    = tfCandles.length >= tf.minCandles ? tfCandles : day;
    const price  = src[src.length-1].close;
    const prev   = src[src.length-2]?.close ?? price;
    const chgPct = +((price-prev)/prev*100).toFixed(2);
    const vol    = day[day.length-1].volume || 0;
    const avgVol = day.slice(-10).reduce((a,c)=>a+(c.volume||0),0)/10;
    const volSpike = +(avgVol>0 ? vol/avgVol : 1).toFixed(1);
    const r=calcRSI(src), m=calcMACD(src), b=calcBB(src),
          a=calcADX(src), st=calcST(src), vw=calcVWAP(src),
          pats=detectPatterns(src);
    const sc = scoreSignal({ r,m,b,a,st,vw,price,pats,volSpike });
    if (sc.dir==='NEUTRAL'||sc.confidence<60) return null;
    return { ...target, price, chgPct, volSpike, rsi:r, macd:m, bb:b, adx:a, st, vwap:vw, pats, ...sc,
      candles:src, tfKey, tfLabel:tf.label, holdTime:tf.holdTime };
  } catch { return null; }
}

// ── Mini Sparkline ───────────────────────────────────────────
function MiniSparkline({ trades }) {
  if (!trades?.length) return null;
  const W=160, H=40;
  let cum=0;
  const pts=[0,...trades.map(t=>{cum+=t.pnlPct;return cum;})];
  const min=Math.min(...pts), max=Math.max(...pts), range=max-min||1;
  const toX=i=>(i/(pts.length-1))*W;
  const toY=v=>H-((v-min)/range)*(H-4)-2;
  const isUp=pts[pts.length-1]>=0;
  return (
    <svg width={W} height={H} style={{display:'block'}}>
      <polyline points={pts.map((v,i)=>`${toX(i)},${toY(v)}`).join(' ')} fill="none" stroke={isUp?'#22c55e':'#ef4444'} strokeWidth={1.5} strokeLinejoin="round"/>
      <circle cx={toX(pts.length-1)} cy={toY(pts[pts.length-1])} r={3} fill={isUp?'#22c55e':'#ef4444'}/>
    </svg>
  );
}

// ── Backtest Validation Panel ─────────────────────────────────
function BacktestPanel({ result, capital, onClose }) {
  const [phase,  setPhase]  = useState('idle');
  const [btData, setBtData] = useState(null);
  const [aiRec,  setAiRec]  = useState(null);
  const [aiLoad, setAiLoad] = useState(false);

  async function runValidation() {
    setPhase('running'); setBtData(null); setAiRec(null);
    await new Promise(r=>setTimeout(r,300));
    const bt = runBacktest(result.candles, result.dir);
    setBtData(bt);
    setPhase('done');
    setAiLoad(true);
    const rec = await getAIRec(result, capital, bt);
    setAiRec(rec);
    setAiLoad(false);
  }

  const isCall    = result.dir==='CALL';
  const sigColor  = isCall?'var(--green)':'var(--red)';
  const combinedScore = btData
    ? Math.round((result.confidence*0.5)+(btData.winRate*0.5))
    : result.confidence;
  const scoreColor = combinedScore>=75?'var(--green)':combinedScore>=60?'var(--gold)':'var(--red)';
  const verdict    = combinedScore>=75?'✅ Strong Signal — Backtest Validates'
    :combinedScore>=60?'⚠️ Moderate Signal — Trade with Caution'
    :'❌ Weak Signal — Better to Skip';

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',
      justifyContent:'center',zIndex:1000,padding:16}} onClick={onClose}>
      <div style={{background:'var(--bg-secondary)',border:`2px solid ${sigColor}44`,borderRadius:16,
        padding:24,maxWidth:760,width:'100%',maxHeight:'94vh',overflowY:'auto'}}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <div style={{fontSize:20,fontWeight:900,color:'var(--text-primary)'}}>
              {result.sym} <span style={{fontSize:13,color:'var(--text-muted)',fontWeight:400}}>Smart Signal Validation</span>
            </div>
            <div style={{fontSize:12,color:'var(--text-muted)',fontFamily:'DM Mono',marginTop:2}}>
              ₹{fmt(result.price)} · {result.chgPct>=0?'+':''}{result.chgPct}% · Vol {result.volSpike}x
            </div>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div style={{fontSize:16,fontWeight:800,color:sigColor,background:`${sigColor}15`,
              padding:'6px 16px',borderRadius:20,border:`1px solid ${sigColor}44`}}>
              {isCall?'📈 CALL':'📉 PUT'}
            </div>
            <button onClick={onClose} style={{background:'var(--bg-primary)',border:'1px solid var(--border)',
              borderRadius:8,color:'var(--text-muted)',width:34,height:34,cursor:'pointer',fontSize:16}}>✕</button>
          </div>
        </div>

        {/* Combined Score */}
        <div style={{background:`${scoreColor}0d`,border:`1px solid ${scoreColor}33`,borderRadius:12,padding:18,marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:4}}>Combined Score (AI + Backtest)</div>
              <div style={{fontSize:13,fontWeight:700,color:scoreColor}}>{verdict}</div>
            </div>
            <div style={{fontSize:42,fontWeight:900,fontFamily:'DM Mono',color:scoreColor}}>{combinedScore}%</div>
          </div>
          <div style={{background:'var(--bg-primary)',borderRadius:6,height:12,overflow:'hidden',marginBottom:8}}>
            <div style={{width:`${combinedScore}%`,height:'100%',borderRadius:6,
              background:`linear-gradient(90deg,${scoreColor}66,${scoreColor})`,transition:'width 1s ease'}}/>
          </div>
          <div style={{display:'flex',gap:20,fontSize:11,color:'var(--text-muted)'}}>
            <span>🤖 AI Confidence: <strong style={{color:sigColor}}>{result.confidence}%</strong></span>
            {btData&&<span>🧪 Backtest Win Rate: <strong style={{color:btData.winRate>=55?'var(--green)':btData.winRate>=45?'var(--gold)':'var(--red)'}}>{btData.winRate}%</strong></span>}
            {!btData&&phase==='idle'&&<span style={{color:'var(--gold)'}}>⬇ Click "Validate" to add backtest score</span>}
          </div>
        </div>

        {/* Indicators + Patterns grid */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
          <div style={{background:'var(--bg-primary)',borderRadius:12,padding:14}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>
              📊 All 7 Indicators
            </div>
            {[
              ['RSI(14)',    result.rsi!=null?`${result.rsi} ${result.rsi<30?'(Oversold 🟢)':result.rsi>70?'(Overbought 🔴)':'(Neutral)'}` :'---', result.rsi<50],
              ['MACD',      result.macd?`${result.macd.line} (${result.macd.bull?'Bullish ▲':'Bearish ▼'})`:'---', result.macd?.bull],
              ['Bollinger', result.bb?`${result.bb.pct}% — ${result.bb.pos}`:'---', result.bb?.pct<50],
              ['ADX',       result.adx?`${result.adx.val} (${result.adx.strong?'Strong':'Weak'})`:'---', result.adx?.bull],
              ['Supertrend',result.st?.trend??'---', result.st?.trend==='UP'],
              ['VWAP',      result.vwap?`₹${fmt(result.vwap)} ${result.price>result.vwap?'↑ Above':'↓ Below'}`:'---', result.price>result.vwap],
              ['Vol Spike', `${result.volSpike}x avg ${result.volSpike>1.5?'⚡ High':'Normal'}`, result.volSpike>1.5],
            ].map(([l,v,b])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
                <span style={{fontSize:12,color:'var(--text-muted)'}}>{l}</span>
                <span style={{fontSize:12,fontFamily:'DM Mono',fontWeight:600,
                  color:b===true?'var(--green)':b===false?'var(--red)':'var(--text-primary)'}}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{background:'var(--bg-primary)',borderRadius:12,padding:14}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>
              🕯️ Candlestick Patterns (up to 16)
            </div>
            {result.pats?.length ? result.pats.map((p,i)=>(
              <div key={i} style={{marginBottom:8,padding:'8px 10px',borderRadius:8,
                background:p.t==='bullish'?'rgba(34,197,94,0.08)':p.t==='bearish'?'rgba(239,68,68,0.08)':'rgba(201,168,76,0.08)',
                border:`1px solid ${p.t==='bullish'?'rgba(34,197,94,0.25)':p.t==='bearish'?'rgba(239,68,68,0.25)':'rgba(201,168,76,0.25)'}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                  <span style={{fontSize:12,fontWeight:700,color:p.t==='bullish'?'var(--green)':p.t==='bearish'?'var(--red)':'var(--gold)'}}>{p.n}</span>
                  <div style={{display:'flex',gap:2}}>
                    {Array.from({length:5},(_,idx)=>(
                      <div key={idx} style={{width:7,height:7,borderRadius:'50%',
                        background:idx<p.strength?(p.t==='bullish'?'var(--green)':p.t==='bearish'?'var(--red)':'var(--gold)'):'var(--border)'}}/>
                    ))}
                  </div>
                </div>
                <div style={{fontSize:10,color:'var(--text-muted)',lineHeight:1.4}}>{p.desc}</div>
              </div>
            )) : (
              <div style={{textAlign:'center',padding:'30px 0',color:'var(--text-muted)',fontSize:13}}>No patterns on latest candles</div>
            )}
          </div>
        </div>

        {/* Validate Button */}
        {phase==='idle'&&(
          <button onClick={runValidation} style={{width:'100%',padding:'14px',borderRadius:10,border:'none',
            background:'linear-gradient(135deg,#fbbf24,#d97706)',
            color:'#000',fontSize:15,fontWeight:800,cursor:'pointer',marginBottom:20}}>
            🧪 Validate Signal with Backtest
          </button>
        )}

        {phase==='running'&&(
          <div style={{textAlign:'center',padding:'30px',marginBottom:20,background:'rgba(251,191,36,0.06)',
            border:'1px solid rgba(251,191,36,0.2)',borderRadius:12}}>
            <div className="loader" style={{margin:'0 auto 12px',width:30,height:30}}/>
            <div style={{fontSize:14,fontWeight:700,color:'var(--gold)'}}>Running Historical Backtest...</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>
              Testing signal on {result.candles?.length??0} historical candles
            </div>
          </div>
        )}

        {btData&&phase==='done'&&(
          <div style={{marginBottom:20}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:16}}>
              {[
                ['Win Rate',      btData.winRate+'%',     btData.winRate>=55?'var(--green)':btData.winRate>=45?'var(--gold)':'var(--red)'],
                ['Total Signals', btData.totalTrades,     'var(--text-primary)'],
                ['Avg Win',       '+'+btData.avgWin+'%',  'var(--green)'],
                ['Avg Loss',      btData.avgLoss+'%',     'var(--red)'],
                ['Profit Factor', btData.profitFactor,    btData.profitFactor>=1.5?'var(--green)':btData.profitFactor>=1?'var(--gold)':'var(--red)'],
              ].map(([l,v,c])=>(
                <div key={l} style={{background:'var(--bg-primary)',borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
                  <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{l}</div>
                  <div style={{fontSize:18,fontWeight:800,color:c,fontFamily:'DM Mono'}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{background:'var(--bg-primary)',borderRadius:10,padding:14,marginBottom:14,display:'flex',alignItems:'center',gap:20}}>
              <div>
                <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Historical P&L Curve</div>
                <MiniSparkline trades={btData.trades}/>
              </div>
              <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.8}}>
                Signal fired <strong style={{color:'var(--text-primary)'}}>{btData.totalTrades}</strong> times historically.<br/>
                Won <strong style={{color:'var(--green)'}}>{btData.wins}</strong> · Lost <strong style={{color:'var(--red)'}}>{btData.losses}</strong><br/>
                Avg max gain when right: <strong style={{color:'var(--green)'}}>+{btData.avgMaxGain}%</strong>
              </div>
            </div>
            <div style={{background:'var(--bg-primary)',borderRadius:10,padding:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>
                📋 Last {btData.last10.length} Times This Signal Fired
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {btData.last10.map((t,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 10px',
                    background:t.win?'rgba(34,197,94,0.06)':'rgba(239,68,68,0.06)',
                    border:`1px solid ${t.win?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)'}`,borderRadius:8}}>
                    <div style={{width:24,height:24,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',
                      justifyContent:'center',background:t.win?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)',fontSize:12}}>
                      {t.win?'✅':'❌'}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,color:'var(--text-muted)'}}>{t.date}</div>
                      {t.patterns.length>0&&<div style={{fontSize:10,color:'var(--gold)'}}>🕯 {t.patterns[0]}</div>}
                    </div>
                    <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'DM Mono'}}>
                      ₹{fmt(t.entryPrice)} → ₹{fmt(t.exitPrice)}
                    </div>
                    <div style={{fontSize:13,fontWeight:700,fontFamily:'DM Mono',
                      color:t.win?'var(--green)':'var(--red)',minWidth:60,textAlign:'right'}}>
                      {t.pnlPct>=0?'+':''}{t.pnlPct}%
                    </div>
                    <div style={{fontSize:10,color:'var(--text-muted)',minWidth:50,textAlign:'right'}}>
                      AI:{t.confidence}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AI Recommendation */}
        <div style={{background:'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.06))',
          border:'1px solid rgba(99,102,241,0.3)',borderRadius:14,padding:20}}>
          <div style={{fontSize:12,fontWeight:700,color:'#a78bfa',textTransform:'uppercase',letterSpacing:1,marginBottom:14}}>
            ✦ AI Options Trade Recommendation
          </div>
          {aiLoad&&(
            <div style={{display:'flex',alignItems:'center',gap:10,color:'var(--text-muted)',fontSize:13}}>
              <div className="loader" style={{width:16,height:16}}/> Generating trade plan...
            </div>
          )}
          {aiRec&&!aiLoad&&(
            <div>
              <div style={{background:`${sigColor}15`,border:`2px solid ${sigColor}44`,borderRadius:12,
                padding:16,marginBottom:14,textAlign:'center'}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>Recommended Option</div>
                <div style={{fontSize:22,fontWeight:900,color:sigColor,marginBottom:4}}>{aiRec.exactOption}</div>
                <div style={{fontSize:13,color:'var(--text-muted)'}}>{aiRec.timeHorizon}</div>
                <div style={{marginTop:8,display:'inline-block',
                  background:aiRec.urgency==='HIGH'?'rgba(239,68,68,0.2)':aiRec.urgency==='MEDIUM'?'rgba(201,168,76,0.2)':'rgba(34,197,94,0.2)',
                  color:aiRec.urgency==='HIGH'?'var(--red)':aiRec.urgency==='MEDIUM'?'var(--gold)':'var(--green)',
                  padding:'3px 14px',borderRadius:12,fontSize:12,fontWeight:700}}>
                  {aiRec.urgency} URGENCY
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
                {[['Entry Premium',aiRec.entryPremium,'var(--gold)'],['Target 1',aiRec.target1,'var(--green)'],
                  ['Target 2',aiRec.target2,'var(--green)'],['Stop Loss',aiRec.stopLoss,'var(--red)'],
                  ['Lots',aiRec.lots+' lot(s)','var(--text-primary)'],['Urgency',aiRec.urgency,sigColor]
                ].map(([l,v,c])=>(
                  <div key={l} style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:10}}>
                    <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:3}}>{l}</div>
                    <div style={{fontSize:12,fontWeight:700,color:c,fontFamily:'DM Mono'}}>{v??'---'}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                <div style={{background:'rgba(34,197,94,0.06)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:8,padding:12}}>
                  <div style={{fontSize:10,color:'var(--green)',fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:5}}>⏺ Enter When</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>{aiRec.entryCondition}</div>
                </div>
                <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:12}}>
                  <div style={{fontSize:10,color:'var(--red)',fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:5}}>⏹ Exit When</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>{aiRec.exitCondition}</div>
                </div>
              </div>
              <div style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:12,marginBottom:10}}>
                <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:5}}>💡 Why This Signal</div>
                <div style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.7}}>{aiRec.whyThisSignal}</div>
              </div>
              {aiRec.backtestVerdict&&(
                <div style={{background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.2)',borderRadius:8,padding:10,marginBottom:10}}>
                  <span style={{fontSize:11,color:'var(--gold)',fontWeight:700}}>🧪 Backtest Says: </span>
                  <span style={{fontSize:12,color:'var(--text-muted)'}}>{aiRec.backtestVerdict}</span>
                </div>
              )}
              <div style={{background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:8,padding:10}}>
                <span style={{fontSize:11,color:'var(--red)',fontWeight:700}}>⚠️ Key Risk: </span>
                <span style={{fontSize:12,color:'var(--text-muted)'}}>{aiRec.keyRisk}</span>
              </div>
            </div>
          )}
          {!aiRec&&!aiLoad&&phase==='idle'&&(
            <div style={{color:'var(--text-muted)',fontSize:13,textAlign:'center',padding:'20px 0'}}>
              Run the backtest first to get AI trade recommendation
            </div>
          )}
        </div>
        <div style={{marginTop:12,fontSize:10,color:'var(--text-muted)',textAlign:'center',lineHeight:1.5}}>
          ⚠️ Educational only. Past backtest performance does not guarantee future results. Not SEBI-registered advice.
        </div>
      </div>
    </div>
  );
}

// ── Signal Card ───────────────────────────────────────────────
function SmartCard({ result, rank, capital, onValidate }) {
  const isCall = result.dir==='CALL';
  const color  = isCall?'#22c55e':'#ef4444';
  const cColor = result.confidence>=80?'#22c55e':result.confidence>=70?'#f59e0b':'#ef4444';
  const rankBg = rank===1?'linear-gradient(135deg,#ffd700,#f59e0b)':rank===2?'linear-gradient(135deg,#c0c0c0,#9ca3af)':'linear-gradient(135deg,#cd7f32,#92400e)';

  return (
    <div style={{background:'var(--bg-secondary)',border:`1px solid ${color}33`,borderRadius:14,
      padding:18,position:'relative',overflow:'hidden',transition:'all 0.2s'}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 8px 32px ${color}22`}
      onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
      <div style={{position:'absolute',top:0,right:0,width:80,height:80,borderRadius:'0 14px 0 80px',background:`${color}06`,pointerEvents:'none'}}/>
      <div style={{position:'absolute',top:14,left:14,width:28,height:28,borderRadius:'50%',
        display:'flex',alignItems:'center',justifyContent:'center',background:rankBg,fontSize:13,fontWeight:900,color:'#000'}}>#{rank}</div>
      <div style={{marginLeft:40,marginBottom:10}}>
        <div style={{fontSize:17,fontWeight:900,color:'var(--text-primary)'}}>{result.sym}</div>
        <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'DM Mono'}}>
          ₹{fmt(result.price)}
          <span style={{color:result.chgPct>=0?'var(--green)':'var(--red)',marginLeft:6}}>
            {result.chgPct>=0?'▲':'▼'} {Math.abs(result.chgPct)}%
          </span>
          {result.volSpike>1.5&&<span style={{color:'var(--gold)',marginLeft:6}}>⚡{result.volSpike}x</span>}
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div>
          <div style={{fontSize:15,fontWeight:800,color,background:`${color}15`,padding:'5px 14px',borderRadius:20,border:`1px solid ${color}44`,marginBottom:5}}>
            {isCall?'📈 BUY CALL':'📉 BUY PUT'}
          </div>
          {result.tfLabel&&(
            <div style={{fontSize:10,fontWeight:700,
              color: TIMEFRAMES[result.tfKey]?.color??'var(--gold)',
              background:(TIMEFRAMES[result.tfKey]?.color??'#f59e0b')+'15',
              padding:'2px 8px',borderRadius:6,display:'inline-block',
              border:`1px solid ${(TIMEFRAMES[result.tfKey]?.color??'#f59e0b')}33`}}>
              {result.tfLabel} · Hold {result.holdTime}
            </div>
          )}
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:10,color:'var(--text-muted)'}}>AI Confidence</div>
          <div style={{fontSize:22,fontWeight:900,fontFamily:'DM Mono',color:cColor}}>{result.confidence}%</div>
        </div>
      </div>
      <div style={{background:'var(--bg-primary)',borderRadius:4,height:7,overflow:'hidden',marginBottom:10}}>
        <div style={{width:`${result.confidence}%`,height:'100%',borderRadius:4,background:`linear-gradient(90deg,${color}55,${color})`}}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:5,marginBottom:10}}>
        {[
          ['RSI',  result.rsi??'---',  result.rsi!=null?(result.dir==='CALL'?result.rsi<50:result.rsi>50):null],
          ['MACD', result.macd?(result.macd.bull?'Bull':'Bear'):'---', result.macd?result.macd.bull:null],
          ['ST',   result.st?.trend??'---', result.st?result.st.trend==='UP':null],
          ['VOL',  `${result.volSpike}x`, result.volSpike>1.5],
        ].map(([l,v,b])=>(
          <div key={l} style={{background:'var(--bg-primary)',borderRadius:6,padding:'4px 0',textAlign:'center'}}>
            <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1}}>{l}</div>
            <div style={{fontSize:11,fontWeight:700,fontFamily:'DM Mono',
              color:b===true?'var(--green)':b===false?'var(--red)':'var(--text-muted)'}}>{v}</div>
          </div>
        ))}
      </div>
      {result.pats?.length>0&&(
        <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}>
          {result.pats.slice(0,2).map((p,i)=>(
            <span key={i} style={{fontSize:9,padding:'2px 7px',borderRadius:10,
              background:p.t==='bullish'?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.12)',
              color:p.t==='bullish'?'var(--green)':'var(--red)',
              border:`1px solid ${p.t==='bullish'?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}`}}>
              🕯 {p.n}
            </span>
          ))}
        </div>
      )}
      <button onClick={()=>onValidate(result)} style={{width:'100%',padding:'10px',borderRadius:9,border:'none',
        background:'linear-gradient(135deg,#fbbf24,#d97706)',
        color:'#000',fontSize:13,fontWeight:800,cursor:'pointer',
        display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
        🧪 Validate Signal + Backtest
      </button>
    </div>
  );
}

// ── Setup Screen ──────────────────────────────────────────────
// ── Scan target groups ────────────────────────────────────────
const TARGET_GROUPS = {
  'All': SCAN_TARGETS,
  'Indices Only': SCAN_TARGETS.filter(t => t.isIndex),
  'Stocks Only':  SCAN_TARGETS.filter(t => !t.isIndex),
  'NIFTY 50':     SCAN_TARGETS.filter(t => t.sym === 'NIFTY 50'),
  'BANK NIFTY':   SCAN_TARGETS.filter(t => t.sym === 'BANK NIFTY'),
  'FIN NIFTY':    SCAN_TARGETS.filter(t => t.sym === 'FIN NIFTY'),
  'IT Stocks':    SCAN_TARGETS.filter(t => ['TCS','INFY','WIPRO'].includes(t.sym)),
  'Banking':      SCAN_TARGETS.filter(t => ['HDFCBANK','ICICIBANK','SBIN','AXISBANK'].includes(t.sym)),
};

function SetupScreen({ onStart }) {
  const [capital,     setCap]       = useState('');
  const [minConf,     setMinConf]   = useState(65);
  const [scanMode,    setScanMode]  = useState('All');
  const [customPicks, setCustom]    = useState([]);
  const [showCustom,  setShowCustom]= useState(false);
  const [tfKey,       setTfKey]     = useState('scalping');
  const [error,       setError]     = useState('');
  const presets = [25000, 50000, 100000, 200000];

  function toggleCustom(sym) {
    setCustom(prev => prev.includes(sym) ? prev.filter(s=>s!==sym) : [...prev, sym]);
  }

  function go() {
    const c = Number(capital);
    if (!c||c<1000) { setError('Minimum ₹1,000 required'); return; }
    const targets = scanMode === 'Custom'
      ? SCAN_TARGETS.filter(t => customPicks.includes(t.sym))
      : TARGET_GROUPS[scanMode] || SCAN_TARGETS;
    if (!targets.length) { setError('Select at least one stock to scan'); return; }
    onStart({ capital:c, minConf, targets, tfKey });
  }

  const activeTargets = scanMode === 'Custom'
    ? SCAN_TARGETS.filter(t => customPicks.includes(t.sym))
    : TARGET_GROUPS[scanMode] || SCAN_TARGETS;

  return (
    <div style={{maxWidth:560,margin:'0 auto',padding:'40px 0'}}>
      <div style={{textAlign:'center',marginBottom:28}}>
        <div style={{fontSize:48,marginBottom:10}}>🎯</div>
        <div style={{fontSize:24,fontWeight:900,color:'var(--text-primary)',marginBottom:8}}>Smart Signal Scanner</div>
        <div style={{fontSize:13,color:'var(--text-muted)',lineHeight:1.8}}>
          7 indicators · 16 candlestick patterns · Backtest validation<br/>
          <strong style={{color:'var(--gold)'}}>Click any signal → Validate with historical backtest</strong>
        </div>
      </div>

      {/* Timeframe selector */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>
          ⏱ Trading Timeframe
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {Object.entries(TIMEFRAMES).map(([key, tf])=>{
            const active = tfKey===key;
            return (
              <button key={key} onClick={()=>setTfKey(key)} style={{
                padding:'14px 10px', borderRadius:12, border:'2px solid',
                borderColor: active ? tf.color : 'var(--border)',
                background: active ? tf.color+'18' : 'var(--bg-secondary)',
                cursor:'pointer', textAlign:'center', transition:'all 0.15s',
              }}>
                <div style={{fontSize:18,marginBottom:4}}>{tf.label.split(' ')[0]}</div>
                <div style={{fontSize:13,fontWeight:800,color: active ? tf.color : 'var(--text-primary)',marginBottom:3}}>
                  {tf.label.split(' ').slice(1).join(' ')}
                </div>
                <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:4}}>{tf.holdTime}</div>
                <div style={{fontSize:9,color: active ? tf.color : 'var(--text-muted)',lineHeight:1.4}}>{tf.desc}</div>
                {active && (
                  <div style={{marginTop:6,fontSize:9,fontWeight:700,
                    background:tf.color+'22',color:tf.color,
                    padding:'2px 8px',borderRadius:8,display:'inline-block'}}>
                    ✓ Selected
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {tfKey==='scalping'&&(
          <div style={{marginTop:8,padding:'8px 12px',background:'rgba(245,158,11,0.08)',
            border:'1px solid rgba(245,158,11,0.25)',borderRadius:8,fontSize:11,color:'#f59e0b'}}>
            ⚡ Scalping mode uses 5 min candles. Upstox gives ~30 days of 5min data so backtest will be shorter but signals are fast.
          </div>
        )}
      </div>

      {/* Capital + Scan Target side by side */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>

        {/* Capital */}
        <div style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:14,padding:18}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>
            💰 Capital
          </div>
          <div style={{position:'relative',marginBottom:10}}>
            <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:18,fontWeight:700,color:'var(--gold)'}}>₹</span>
            <input type="number" value={capital} onChange={e=>{setCap(e.target.value);setError('');}}
              onKeyDown={e=>e.key==='Enter'&&go()} placeholder="Amount..."
              style={{width:'100%',padding:'11px 11px 11px 36px',fontSize:18,fontWeight:700,
                fontFamily:'DM Mono',background:'var(--bg-primary)',
                border:`2px solid ${error?'var(--red)':capital?'var(--gold)':'var(--border)'}`,
                borderRadius:9,color:'var(--text-primary)',outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {presets.map(p=>(
              <button key={p} onClick={()=>{setCap(String(p));setError('');}}
                style={{padding:'4px 10px',borderRadius:7,border:'1px solid var(--border)',
                  background:Number(capital)===p?'rgba(201,168,76,0.2)':'var(--bg-primary)',
                  color:Number(capital)===p?'var(--gold)':'var(--text-muted)',
                  fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'DM Mono'}}>
                ₹{p>=100000?`${p/1000}K`:p>=1000?`${p/1000}K`:p}
              </button>
            ))}
          </div>
          {error&&<div style={{color:'var(--red)',fontSize:11,marginTop:6}}>⚠️ {error}</div>}
        </div>

        {/* Scan Target Selector */}
        <div style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:14,padding:18}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>
            🎯 What to Scan
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            {[...Object.keys(TARGET_GROUPS),'Custom'].map(mode=>(
              <button key={mode} onClick={()=>{setScanMode(mode);if(mode!=='Custom')setShowCustom(false);else setShowCustom(true);}}
                style={{
                  padding:'7px 12px',borderRadius:8,border:'1px solid',textAlign:'left',
                  borderColor:scanMode===mode?'var(--gold)':'var(--border)',
                  background:scanMode===mode?'rgba(201,168,76,0.15)':'var(--bg-primary)',
                  color:scanMode===mode?'var(--gold)':'var(--text-muted)',
                  fontSize:12,fontWeight:scanMode===mode?700:500,cursor:'pointer',
                  display:'flex',justifyContent:'space-between',alignItems:'center',
                }}>
                <span>{mode}</span>
                <span style={{fontSize:10,color:scanMode===mode?'var(--gold)':'var(--text-muted)',fontFamily:'DM Mono'}}>
                  {mode==='Custom'
                    ? customPicks.length+'✓'
                    : (TARGET_GROUPS[mode]?.length??0)+' stocks'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom picker — shows when Custom is selected */}
      {scanMode==='Custom'&&(
        <div style={{background:'var(--bg-secondary)',border:'1px solid rgba(201,168,76,0.3)',borderRadius:14,padding:18,marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--gold)',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>
            ✏️ Pick Stocks to Scan ({customPicks.length} selected)
          </div>
          <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
            {SCAN_TARGETS.map(t=>{
              const sel = customPicks.includes(t.sym);
              return (
                <button key={t.sym} onClick={()=>toggleCustom(t.sym)} style={{
                  padding:'6px 13px',borderRadius:8,border:'1px solid',
                  borderColor:sel?'var(--gold)':'var(--border)',
                  background:sel?'rgba(201,168,76,0.2)':'var(--bg-primary)',
                  color:sel?'var(--gold)':'var(--text-muted)',
                  fontSize:12,fontWeight:sel?700:400,cursor:'pointer',
                  display:'flex',alignItems:'center',gap:5,
                }}>
                  {t.isIndex&&<span style={{fontSize:9,color:'var(--blue)'}}>IDX</span>}
                  {t.sym}
                  {sel&&<span style={{fontSize:10}}>✓</span>}
                </button>
              );
            })}
          </div>
          <div style={{marginTop:10,display:'flex',gap:8}}>
            <button onClick={()=>setCustom(SCAN_TARGETS.map(t=>t.sym))}
              style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',
                background:'var(--bg-primary)',color:'var(--text-muted)',cursor:'pointer'}}>Select All</button>
            <button onClick={()=>setCustom([])}
              style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',
                background:'var(--bg-primary)',color:'var(--text-muted)',cursor:'pointer'}}>Clear All</button>
          </div>
        </div>
      )}

      {/* Active targets preview */}
      {activeTargets.length>0&&(
        <div style={{background:'rgba(99,102,241,0.05)',border:'1px solid rgba(99,102,241,0.15)',
          borderRadius:10,padding:'10px 14px',marginBottom:12,
          display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:'#a78bfa',fontWeight:700}}>Will scan:</span>
          {activeTargets.map(t=>(
            <span key={t.sym} style={{fontSize:11,color:'var(--text-muted)',
              background:'var(--bg-primary)',padding:'2px 8px',borderRadius:6,
              border:`1px solid ${t.isIndex?'rgba(59,130,246,0.3)':'var(--border)'}`,
              color:t.isIndex?'var(--blue)':'var(--text-muted)'}}>
              {t.sym}
            </span>
          ))}
        </div>
      )}

      {/* Confidence slider */}
      <div style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:14,padding:18,marginBottom:16}}>
        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>
          Min Signal Confidence: <strong style={{color:'var(--gold)'}}>{minConf}%</strong>
        </div>
        <input type="range" min={60} max={85} step={5} value={minConf}
          onChange={e=>setMinConf(Number(e.target.value))}
          style={{width:'100%',accentColor:'var(--gold)'}}/>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--text-muted)'}}>
          <span>60% — More signals</span><span>85% — Fewer, best only</span>
        </div>
      </div>

      <button onClick={go} style={{width:'100%',padding:'15px',borderRadius:12,border:'none',
        background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
        color:'#fff',fontSize:15,fontWeight:800,cursor:'pointer',
        display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
        🔍 Scan {activeTargets.length} Stock{activeTargets.length!==1?'s':''} →
      </button>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────
export default function SmartSignals({ indices }) {
  const [phase,    setPhase]   = useState('setup');
  const [config,   setConfig]  = useState(null);
  const [progress, setProg]    = useState(0);
  const [scanMsg,  setScanMsg] = useState('');
  const [results,  setResults] = useState([]);
  const [selected, setSelected]= useState(null);
  const [filter,   setFilter]  = useState('ALL');
  const cancelRef = useRef(false);

  async function startScan(cfg) {
    setConfig(cfg); setPhase('scanning'); setProg(0); setResults([]); cancelRef.current=false;
    const targets = cfg.targets || SCAN_TARGETS;
    const tfKey   = cfg.tfKey || 'intraday';
    const found=[];
    for(let i=0;i<targets.length;i++){
      if(cancelRef.current) break;
      setScanMsg(`Analyzing ${targets[i].sym}...`);
      setProg(Math.round((i+1)/targets.length*100));
      const r = await analyzeOne(targets[i], tfKey);
      if(r&&r.confidence>=cfg.minConf) found.push(r);
      await new Promise(res=>setTimeout(res,300));
    }
    found.sort((a,b)=>b.confidence-a.confidence);
    setResults(found); setPhase('results');
  }

  function reset() { setPhase('setup'); setResults([]); setConfig(null); cancelRef.current=true; }

  const displayed = results.filter(r=>
    filter==='CALL'?r.dir==='CALL':filter==='PUT'?r.dir==='PUT':true
  );

  if (phase==='setup') return <SetupScreen onStart={startScan}/>;

  if (phase==='scanning') return (
    <div style={{maxWidth:460,margin:'60px auto',textAlign:'center'}}>
      <div style={{fontSize:44,marginBottom:16}}>🎯</div>
      <div style={{fontSize:18,fontWeight:800,color:'var(--text-primary)',marginBottom:6}}>Smart Scanning...</div>
      <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:28}}>
        {TIMEFRAMES[config?.tfKey]?.label ?? '⏱ Intraday'} · {TIMEFRAMES[config?.tfKey]?.holdTime} hold · 7 indicators · 16 patterns · {config?.targets?.length??15} stocks
      </div>
      <div style={{background:'var(--bg-secondary)',borderRadius:10,height:12,overflow:'hidden',marginBottom:10}}>
        <div style={{width:`${progress}%`,height:'100%',borderRadius:10,
          background:'linear-gradient(90deg,#6366f1,#8b5cf6)',transition:'width 0.3s'}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-muted)',marginBottom:24}}>
        <span>{scanMsg}</span><span>{progress}%</span>
      </div>
      <button onClick={reset} style={{fontSize:12,color:'var(--red)',background:'transparent',
        border:'1px solid rgba(239,68,68,0.3)',borderRadius:8,padding:'6px 16px',cursor:'pointer'}}>Cancel</button>
    </div>
  );

  return (
    <div className="fade-in">
      <div className="panel" style={{marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:'var(--text-primary)'}}>
              🎯 Smart Signals · {config?.minConf}%+ Confidence
            </div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>
              Capital: <strong style={{color:'var(--gold)',fontFamily:'DM Mono'}}>₹{config?.capital?.toLocaleString('en-IN')}</strong>
              &nbsp;·&nbsp;{results.length} signals
              &nbsp;·&nbsp;<span style={{color:TIMEFRAMES[config?.tfKey]?.color??'var(--gold)',fontWeight:700}}>
                {TIMEFRAMES[config?.tfKey]?.label} · {TIMEFRAMES[config?.tfKey]?.holdTime} hold
              </span>
              &nbsp;·&nbsp;<span style={{color:'var(--gold)'}}>Click any card → Validate with Backtest</span>
            </div>
          </div>
          <div style={{marginLeft:'auto',display:'flex',gap:7}}>
            {[['ALL','All'],['CALL','📈 Calls'],['PUT','📉 Puts']].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)} style={{padding:'5px 12px',borderRadius:6,border:'1px solid',
                borderColor:filter===v?'var(--gold)':'var(--border)',
                background:filter===v?'rgba(201,168,76,0.15)':'var(--bg-secondary)',
                color:filter===v?'var(--gold)':'var(--text-muted)',fontSize:11,fontWeight:600,cursor:'pointer'}}>{l}</button>
            ))}
            <button onClick={reset} style={{padding:'5px 12px',borderRadius:6,
              border:'1px solid var(--border)',background:'var(--bg-secondary)',
              color:'var(--text-muted)',fontSize:11,cursor:'pointer'}}>🔄 Rescan</button>
          </div>
        </div>
      </div>
      {results.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
          {[
            ['Total',      results.length,                           'var(--text-primary)'],
            ['📈 CALL',    results.filter(r=>r.dir==='CALL').length, 'var(--green)'],
            ['📉 PUT',     results.filter(r=>r.dir==='PUT').length,  'var(--red)'],
            ['Best Score', (results[0]?.confidence??0)+'%',          'var(--gold)'],
          ].map(([l,v,c])=>(
            <div key={l} style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px',textAlign:'center'}}>
              <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:3}}>{l}</div>
              <div style={{fontSize:22,fontWeight:900,color:c,fontFamily:'DM Mono'}}>{v}</div>
            </div>
          ))}
        </div>
      )}
      {displayed.length>0 ? (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(310px,1fr))',gap:12}}>
          {displayed.map((r,i)=>(
            <SmartCard key={r.sym} result={r} rank={i+1} capital={config?.capital??50000} onValidate={setSelected}/>
          ))}
        </div>
      ) : (
        <div style={{textAlign:'center',padding:60}}>
          <div style={{fontSize:36,marginBottom:14}}>🔍</div>
          <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',marginBottom:8}}>
            No signals at {config?.minConf}%+ confidence
          </div>
          <button onClick={reset} style={{padding:'12px 26px',borderRadius:10,border:'none',
            background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>
            ← Change Settings
          </button>
        </div>
      )}
      {selected&&(
        <BacktestPanel result={selected} capital={config?.capital??50000} onClose={()=>setSelected(null)}/>
      )}
    </div>
  );
}