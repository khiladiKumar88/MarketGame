import { useState, useRef } from 'react';
import { fetchUpstoxCandles } from '../hooks/useUpstoxData';

const GROQ_KEY = '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';

const SCAN_TARGETS = [
  { sym: 'NIFTY 50',    token: 'NSE_INDEX|Nifty 50',     isIndex: true  },
  { sym: 'BANK NIFTY',  token: 'NSE_INDEX|Nifty Bank',   isIndex: true  },
  { sym: 'RELIANCE',    token: 'NSE_EQ|INE002A01018',     isIndex: false },
  { sym: 'TCS',         token: 'NSE_EQ|INE467B01029',     isIndex: false },
  { sym: 'HDFCBANK',    token: 'NSE_EQ|INE040A01034',     isIndex: false },
  { sym: 'INFY',        token: 'NSE_EQ|INE009A01021',     isIndex: false },
  { sym: 'ICICIBANK',   token: 'NSE_EQ|INE090A01021',     isIndex: false },
  { sym: 'SBIN',        token: 'NSE_EQ|INE062A01020',     isIndex: false },
  { sym: 'AXISBANK',    token: 'NSE_EQ|INE238A01034',     isIndex: false },
  { sym: 'BAJFINANCE',  token: 'NSE_EQ|INE296A01024',     isIndex: false },
  { sym: 'MARUTI',      token: 'NSE_EQ|INE585B01010',     isIndex: false },
  { sym: 'TATAMOTORS',  token: 'NSE_EQ|INE155A01022',     isIndex: false },
  { sym: 'WIPRO',       token: 'NSE_EQ|INE075A01022',     isIndex: false },
  { sym: 'LT',          token: 'NSE_EQ|INE018A01030',     isIndex: false },
  { sym: 'SUNPHARMA',   token: 'NSE_EQ|INE044A01036',     isIndex: false },
  { sym: 'TITAN',       token: 'NSE_EQ|INE280A01028',     isIndex: false },
  { sym: 'ADANIENT',    token: 'NSE_EQ|INE423A01024',     isIndex: false },
  { sym: 'KOTAKBANK',   token: 'NSE_EQ|INE237A01028',     isIndex: false },
  { sym: 'POWERGRID',   token: 'NSE_EQ|INE752E01010',     isIndex: false },
  { sym: 'NTPC',        token: 'NSE_EQ|INE733E01010',     isIndex: false },
];

// ─── Indicators ────────────────────────────────────────────
function ema(arr, p) {
  if (arr.length < p) return null;
  const k = 2 / (p + 1);
  let e = arr.slice(0, p).reduce((a, b) => a + b) / p;
  for (let i = p; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}
function calcRSI(candles, p = 14) {
  if (candles.length < p + 1) return null;
  const ch = candles.slice(-p - 1).map((c, i, a) => i === 0 ? 0 : c.close - a[i-1].close).slice(1);
  const ag = ch.map(x => x > 0 ? x : 0).reduce((a,b) => a+b) / p;
  const al = ch.map(x => x < 0 ? -x : 0).reduce((a,b) => a+b) / p;
  return al === 0 ? 100 : +((100 - 100/(1 + ag/al)).toFixed(1));
}
function calcMACD(candles) {
  if (candles.length < 35) return null;
  const cl = candles.map(c => c.close);
  const e12 = ema(cl, 12), e26 = ema(cl, 26);
  if (!e12 || !e26) return null;
  const line = e12 - e26;
  const macdArr = [];
  for (let i = 26; i <= cl.length; i++) {
    const a = ema(cl.slice(0, i), 12), b = ema(cl.slice(0, i), 26);
    if (a && b) macdArr.push(a - b);
  }
  const sig = ema(macdArr, 9) || 0;
  const hist = line - sig;
  return { line: +line.toFixed(2), signal: +sig.toFixed(2), hist: +hist.toFixed(2), bull: hist > 0 };
}
function calcBB(candles, p = 20) {
  if (candles.length < p) return null;
  const cl = candles.slice(-p).map(c => c.close);
  const mean = cl.reduce((a,b) => a+b) / p;
  const std = Math.sqrt(cl.reduce((a,b) => a + (b-mean)**2, 0) / p);
  const last = candles[candles.length-1].close;
  const up = mean + 2*std, lo = mean - 2*std;
  return { upper: +up.toFixed(2), lower: +lo.toFixed(2), middle: +mean.toFixed(2),
    pct: +((last-lo)/(up-lo)*100).toFixed(1), pos: last > up ? 'ABOVE' : last < lo ? 'BELOW' : 'INSIDE' };
}
function calcADX(candles, p = 14) {
  if (candles.length < p+1) return null;
  const sl = candles.slice(-(p+1));
  const trs=[], pdm=[], ndm=[];
  for (let i=1;i<sl.length;i++) {
    const h=sl[i].high, l=sl[i].low, pc=sl[i-1].close, ph=sl[i-1].high, pl=sl[i-1].low;
    trs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));
    pdm.push(h-ph > pl-l ? Math.max(h-ph,0) : 0);
    ndm.push(pl-l > h-ph ? Math.max(pl-l,0) : 0);
  }
  const atr = trs.reduce((a,b)=>a+b)/p;
  const pdi = pdm.reduce((a,b)=>a+b)/p/atr*100;
  const ndi = ndm.reduce((a,b)=>a+b)/p/atr*100;
  const dx  = Math.abs(pdi-ndi)/(pdi+ndi||1)*100;
  return { val: +dx.toFixed(1), pdi: +pdi.toFixed(1), ndi: +ndi.toFixed(1), strong: dx>25, bull: pdi>ndi };
}
function calcST(candles, p=7, m=3) {
  if (candles.length < p+2) return null;
  const sl = candles.slice(-(p+2));
  const atrs = [];
  for (let i=1;i<sl.length;i++) {
    const h=sl[i].high, l=sl[i].low, pc=sl[i-1].close;
    atrs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));
  }
  const atr  = atrs.slice(-p).reduce((a,b)=>a+b)/p;
  const last = sl[sl.length-1];
  const hl2  = (last.high+last.low)/2;
  return { trend: last.close > hl2 - m*atr ? 'UP' : 'DOWN', atr: +atr.toFixed(2), support: +(hl2-m*atr).toFixed(2) };
}
function calcVWAP(candles) {
  const sl = candles.slice(-20);
  let pv=0, v=0;
  sl.forEach(c => { const t=(c.high+c.low+c.close)/3; pv+=t*(c.volume||1); v+=(c.volume||1); });
  return +(pv/v).toFixed(2);
}
function detectPatterns(candles) {
  if (candles.length < 3) return [];
  const res = [];
  const c=candles[candles.length-1], p1=candles[candles.length-2], p2=candles[candles.length-3];
  const body=x=>Math.abs(x.close-x.open), rng=x=>x.high-x.low;
  const bull=x=>x.close>x.open, bear=x=>x.close<x.open;
  const uw=x=>x.high-Math.max(x.open,x.close), lw=x=>Math.min(x.open,x.close)-x.low;
  if (body(c)/rng(c)<0.1)                                          res.push({n:'Doji',t:'neutral',w:5});
  if (bull(c)&&lw(c)>body(c)*2&&uw(c)<body(c)*0.5)                res.push({n:'Hammer',t:'bullish',w:15});
  if (uw(c)>body(c)*2&&lw(c)<body(c)*0.5)                          res.push({n:'Shooting Star',t:'bearish',w:15});
  if (bear(p1)&&bull(c)&&c.open<p1.close&&c.close>p1.open)         res.push({n:'Bullish Engulfing',t:'bullish',w:20});
  if (bull(p1)&&bear(c)&&c.open>p1.close&&c.close<p1.open)         res.push({n:'Bearish Engulfing',t:'bearish',w:20});
  if (bear(p2)&&body(p1)<body(p2)*0.3&&bull(c)&&c.close>(p2.open+p2.close)/2) res.push({n:'Morning Star',t:'bullish',w:25});
  if (bull(p2)&&body(p1)<body(p2)*0.3&&bear(c)&&c.close<(p2.open+p2.close)/2) res.push({n:'Evening Star',t:'bearish',w:25});
  if (bull(c)&&body(c)/rng(c)>0.85)                                res.push({n:'Bullish Marubozu',t:'bullish',w:18});
  if (bear(c)&&body(c)/rng(c)>0.85)                                res.push({n:'Bearish Marubozu',t:'bearish',w:18});
  if ([p2,p1,c].every(bull)&&p1.close>p2.close&&c.close>p1.close)  res.push({n:'3 White Soldiers',t:'bullish',w:22});
  if ([p2,p1,c].every(bear)&&p1.close<p2.close&&c.close<p1.close)  res.push({n:'3 Black Crows',t:'bearish',w:22});
  return res;
}

// ─── Score Engine ───────────────────────────────────────────
function scoreAll(ind) {
  const { r, m, b, a, st, vw, price, pats } = ind;
  let bull=0, bear=0;
  if (r!==null) { r<=30?bull+=20:r<=45?bull+=12:r>=70?bear+=20:r>=55?bear+=12:0; }
  if (m) { m.bull ? bull+=20 : bear+=20; }
  if (b) { b.pos==='BELOW'?bull+=15:b.pct<30?bull+=10:b.pos==='ABOVE'?bear+=15:b.pct>70?bear+=10:0; }
  if (a) { a.strong?(a.bull?bull+=20:bear+=20):(a.bull?bull+=8:bear+=8); }
  if (st) { st.trend==='UP'?bull+=25:bear+=25; }
  if (vw&&price) { price>vw?bull+=10:bear+=10; }
  pats.forEach(p => { p.t==='bullish'?bull+=p.w:p.t==='bearish'?bear+=p.w:0; });
  const total = bull+bear||1;
  const dir   = bull>bear?'CALL':bear>bull?'PUT':'NEUTRAL';
  const conf  = Math.round((Math.max(bull,bear)/total)*100);
  return { dir, confidence: conf, bull, bear };
}

// ─── Analyze one instrument ─────────────────────────────────
async function analyzeOne(target) {
  try {
    const [day, m30] = await Promise.all([
      fetchUpstoxCandles(target.token, 'day'),
      fetchUpstoxCandles(target.token, '30minute'),
    ]);
    if (!day.length) return null;
    const price  = day[day.length-1].close;
    const prev   = day[day.length-2]?.close ?? price;
    const chgPct = +((price-prev)/prev*100).toFixed(2);
    const vol    = day[day.length-1].volume||0;
    const avgVol = day.slice(-10).reduce((a,c)=>a+(c.volume||0),0)/10;
    const volSpike = +(avgVol>0?vol/avgVol:1).toFixed(1);
    const src = m30.length>=20?m30:day;
    const r=calcRSI(day), m=calcMACD(day), b=calcBB(day), a=calcADX(day), st=calcST(day), vw=calcVWAP(src), pats=detectPatterns(src);
    const sc = scoreAll({ r,m,b,a,st,vw,price,pats });
    if (sc.dir==='NEUTRAL'||sc.confidence<60) return null;
    // count agreeing indicators
    let agrees=0, tot=0;
    if(r!==null){tot++;if((sc.dir==='CALL'&&r<50)||(sc.dir==='PUT'&&r>50))agrees++;}
    if(m){tot++;if((sc.dir==='CALL'&&m.bull)||(sc.dir==='PUT'&&!m.bull))agrees++;}
    if(b){tot++;if((sc.dir==='CALL'&&b.pct<50)||(sc.dir==='PUT'&&b.pct>50))agrees++;}
    if(a){tot++;if((sc.dir==='CALL'&&a.bull)||(sc.dir==='PUT'&&!a.bull))agrees++;}
    if(st){tot++;if((sc.dir==='CALL'&&st.trend==='UP')||(sc.dir==='PUT'&&st.trend==='DOWN'))agrees++;}
    if(vw&&price){tot++;if((sc.dir==='CALL'&&price>vw)||(sc.dir==='PUT'&&price<vw))agrees++;}
    return { ...target, price, chgPct, volSpike, rsi:r, macd:m, bb:b, adx:a, st, vwap:vw, pats, ...sc, agrees, tot };
  } catch { return null; }
}

// ─── AI Recommendation ─────────────────────────────────────
async function getAI(result, capital) {
  const lotSize = result.isIndex?65:1;
  const estPrem = result.isIndex?150:Math.round(result.price*0.03);
  const lots    = Math.max(1, Math.floor(capital/(estPrem*lotSize)));

  const prompt = `You are an expert NSE options trader. Give a precise, actionable recommendation.

Instrument: ${result.sym} ${result.isIndex?'(Index)':'(Stock)'}
Price: ₹${result.price?.toFixed(2)} | Change: ${result.chgPct}%
Signal: ${result.dir} | Confidence: ${result.confidence}% | ${result.agrees}/${result.tot} indicators agree

RSI: ${result.rsi??'N/A'} | MACD: ${result.macd?`${result.macd.line} hist:${result.macd.hist}`:'N/A'}
Bollinger %B: ${result.bb?.pct}% (${result.bb?.pos}) | ADX: ${result.adx?.val} (${result.adx?.strong?'Strong':'Weak'})
Supertrend: ${result.st?.trend} support:₹${result.st?.support} | VWAP: ₹${result.vwap} (price ${result.price>result.vwap?'ABOVE':'BELOW'})
Volume: ${result.volSpike}x | Patterns: ${result.pats?.map(p=>p.n).join(', ')||'None'}

Capital: ₹${capital.toLocaleString('en-IN')} | Est. lots: ${lots} × ${lotSize} qty

Respond ONLY in JSON (no markdown):
{
  "action": "BUY CALL" or "BUY PUT",
  "exactOption": "e.g. NIFTY 23200 CE Weekly",
  "strikeType": "ATM or OTM+1",
  "expiryType": "Weekly or Monthly",
  "entryPremium": "₹XX–₹YY",
  "targetPremium": "₹XX (+XX%)",
  "slPremium": "₹XX (-XX%)",
  "lots": ${lots},
  "capitalNeeded": "₹XX",
  "maxProfit": "₹XX",
  "maxLoss": "₹XX",
  "timeHorizon": "Intraday / 1-2 Days / This Week",
  "urgency": "HIGH or MEDIUM or LOW",
  "entryTiming": "specific condition to enter",
  "exitCondition": "specific condition to exit",
  "whyThisSignal": "2-3 sentences why indicators align",
  "biggestRisk": "main risk"
}`;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${GROQ_KEY}`},
      body: JSON.stringify({ model:'llama-3.3-70b-versatile', max_tokens:900, messages:[{role:'user',content:prompt}] })
    });
    const d = await res.json();
    return JSON.parse((d.choices?.[0]?.message?.content??'{}').replace(/```json|```/g,'').trim());
  } catch { return null; }
}

// ─── Detail Modal ────────────────────────────────────────────
function DetailModal({ result, capital, onClose }) {
  const [ai, setAi]         = useState(null);
  const [loading, setLoad]  = useState(true);
  const isCall = result.dir==='CALL';
  const color  = isCall?'#22c55e':'#ef4444';

  useState(()=>{ getAI(result,capital).then(d=>{setAi(d);setLoad(false);}); },[]);

  const IRow = ({label,val,bull})=>(
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
      padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
      <span style={{fontSize:12,color:'var(--text-muted)'}}>{label}</span>
      <span style={{fontSize:12,fontFamily:'DM Mono',fontWeight:600,
        color:bull===true?'var(--green)':bull===false?'var(--red)':'var(--text-primary)'}}>{val}</span>
    </div>
  );

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',display:'flex',
      alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}} onClick={onClose}>
      <div style={{background:'var(--bg-secondary)',border:`2px solid ${color}44`,borderRadius:16,
        padding:24,maxWidth:700,width:'100%',maxHeight:'92vh',overflowY:'auto'}}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <div style={{fontSize:22,fontWeight:900,color:'var(--text-primary)'}}>{result.sym}</div>
            <div style={{fontSize:12,color:'var(--text-muted)',fontFamily:'DM Mono'}}>
              ₹{result.price?.toFixed(2)}
              <span style={{color:result.chgPct>=0?'var(--green)':'var(--red)',marginLeft:8}}>
                {result.chgPct>=0?'▲':'▼'} {Math.abs(result.chgPct)}%
              </span>
            </div>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div style={{fontSize:18,fontWeight:900,color,background:`${color}20`,
              padding:'6px 18px',borderRadius:24,border:`1px solid ${color}44`}}>
              {isCall?'📈 BUY CALL':'📉 BUY PUT'}
            </div>
            <button onClick={onClose} style={{background:'var(--bg-primary)',border:'1px solid var(--border)',
              borderRadius:8,color:'var(--text-muted)',width:34,height:34,cursor:'pointer',fontSize:16}}>✕</button>
          </div>
        </div>

        {/* Confidence */}
        <div style={{background:`${color}0d`,border:`1px solid ${color}33`,borderRadius:12,padding:16,marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
            <div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:2}}>Signal Confidence</div>
              <div style={{fontSize:11,color:'var(--text-muted)'}}>
                ✅ {result.agrees}/{result.tot} indicators agree
                {result.volSpike>1.5&&<span style={{color:'var(--gold)',marginLeft:8}}>⚡ Vol {result.volSpike}x</span>}
              </div>
            </div>
            <div style={{fontSize:36,fontWeight:900,color,fontFamily:'DM Mono'}}>{result.confidence}%</div>
          </div>
          <div style={{background:'var(--bg-primary)',borderRadius:6,height:10,overflow:'hidden'}}>
            <div style={{width:`${result.confidence}%`,height:'100%',borderRadius:6,
              background:`linear-gradient(90deg,${color}66,${color})`}}/>
          </div>
        </div>

        {/* Indicators + Patterns */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
          <div style={{background:'var(--bg-primary)',borderRadius:12,padding:14}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',
              letterSpacing:1,marginBottom:10}}>📊 All Indicators</div>
            <IRow label="RSI(14)" val={`${result.rsi??'---'} ${result.rsi<30?'Oversold':result.rsi>70?'Overbought':''}`} bull={result.rsi<50}/>
            <IRow label="MACD" val={result.macd?`${result.macd.line} (${result.macd.bull?'Bull':'Bear'})`:'---'} bull={result.macd?.bull}/>
            <IRow label="Bollinger" val={result.bb?`${result.bb.pct}% ${result.bb.pos}`:'---'} bull={result.bb?.pct<50}/>
            <IRow label="ADX" val={result.adx?`${result.adx.val} ${result.adx.strong?'Strong':'Weak'}`:'---'} bull={result.adx?.bull}/>
            <IRow label="Supertrend" val={result.st?.trend??'---'} bull={result.st?.trend==='UP'}/>
            <IRow label="VWAP" val={result.vwap?`₹${result.vwap} ${result.price>result.vwap?'↑Above':'↓Below'}`:'---'} bull={result.price>result.vwap}/>
          </div>
          <div style={{background:'var(--bg-primary)',borderRadius:12,padding:14}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',
              letterSpacing:1,marginBottom:10}}>🕯️ Candlestick Patterns</div>
            {result.pats?.length ? result.pats.map((p,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,
                background:p.t==='bullish'?'rgba(34,197,94,0.08)':p.t==='bearish'?'rgba(239,68,68,0.08)':'rgba(201,168,76,0.08)',
                borderRadius:8,padding:'8px 10px'}}>
                <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,
                  background:p.t==='bullish'?'var(--green)':p.t==='bearish'?'var(--red)':'var(--gold)'}}/>
                <div style={{fontSize:12,fontWeight:600,
                  color:p.t==='bullish'?'var(--green)':p.t==='bearish'?'var(--red)':'var(--gold)'}}>{p.n}</div>
              </div>
            )) : <div style={{fontSize:12,color:'var(--text-muted)',padding:'20px 0',textAlign:'center'}}>No strong patterns detected</div>}
            <div style={{marginTop:'auto',paddingTop:10,borderTop:'1px solid var(--border)'}}>
              <div style={{fontSize:10,color:'var(--text-muted)'}}>Your Capital</div>
              <div style={{fontSize:18,fontWeight:800,color:'var(--gold)',fontFamily:'DM Mono'}}>
                ₹{capital.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>

        {/* AI Section */}
        <div style={{background:'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.06))',
          border:'1px solid rgba(99,102,241,0.3)',borderRadius:14,padding:20}}>
          <div style={{fontSize:12,fontWeight:700,color:'#a78bfa',textTransform:'uppercase',
            letterSpacing:1,marginBottom:16}}>✦ AI Options Trade Plan</div>

          {loading?(
            <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 0'}}>
              <div className="loader" style={{width:20,height:20}}/>
              <span style={{color:'var(--text-muted)',fontSize:13}}>
                Calculating exact option, lots, premium targets...
              </span>
            </div>
          ):ai?(
            <div>
              {/* Big call-to-action */}
              <div style={{background:`${color}15`,border:`2px solid ${color}44`,borderRadius:12,
                padding:18,marginBottom:16,textAlign:'center'}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>Exact Option to Buy</div>
                <div style={{fontSize:24,fontWeight:900,color,marginBottom:4}}>{ai.exactOption}</div>
                <div style={{fontSize:13,color:'var(--text-muted)'}}>
                  {ai.strikeType} · {ai.expiryType} · {ai.timeHorizon}
                </div>
                <div style={{marginTop:10,display:'inline-block',
                  background:ai.urgency==='HIGH'?'rgba(239,68,68,0.2)':ai.urgency==='MEDIUM'?'rgba(201,168,76,0.2)':'rgba(34,197,94,0.2)',
                  color:ai.urgency==='HIGH'?'var(--red)':ai.urgency==='MEDIUM'?'var(--gold)':'var(--green)',
                  padding:'4px 14px',borderRadius:12,fontSize:12,fontWeight:700}}>
                  {ai.urgency} URGENCY
                </div>
              </div>

              {/* Numbers grid */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
                {[
                  ['Entry Premium', ai.entryPremium,  'var(--gold)'],
                  ['Target',        ai.targetPremium, 'var(--green)'],
                  ['Stop Loss',     ai.slPremium,     'var(--red)'],
                  ['Lots',          `${ai.lots} lot(s)`,'var(--text-primary)'],
                  ['Capital Needed',ai.capitalNeeded, 'var(--text-primary)'],
                  ['Max Profit',    ai.maxProfit,     'var(--green)'],
                ].map(([l,v,c])=>(
                  <div key={l} style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:10}}>
                    <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:3}}>{l}</div>
                    <div style={{fontSize:13,fontWeight:700,color:c,fontFamily:'DM Mono'}}>{v??'---'}</div>
                  </div>
                ))}
              </div>

              {/* Entry / Exit */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                <div style={{background:'rgba(34,197,94,0.06)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:8,padding:12}}>
                  <div style={{fontSize:10,color:'var(--green)',fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>⏺ Enter When</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>{ai.entryTiming}</div>
                </div>
                <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:12}}>
                  <div style={{fontSize:10,color:'var(--red)',fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>⏹ Exit When</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>{ai.exitCondition}</div>
                </div>
              </div>

              <div style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:12,marginBottom:10}}>
                <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>💡 Why This Signal</div>
                <div style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.7}}>{ai.whyThisSignal}</div>
              </div>
              <div style={{background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:8,padding:10}}>
                <span style={{fontSize:11,color:'var(--red)',fontWeight:700}}>⚠️ Key Risk: </span>
                <span style={{fontSize:12,color:'var(--text-muted)'}}>{ai.biggestRisk}</span>
              </div>
            </div>
          ):(
            <div style={{color:'var(--text-muted)',fontSize:13}}>Could not generate AI analysis.</div>
          )}
        </div>
        <div style={{marginTop:12,fontSize:10,color:'var(--text-muted)',lineHeight:1.5,textAlign:'center'}}>
          ⚠️ Educational only. Options trading involves risk of total loss. Not SEBI-registered advice.
        </div>
      </div>
    </div>
  );
}

// ─── Signal Card ────────────────────────────────────────────
function SignalCard({ result, rank, onSelect }) {
  const isCall = result.dir==='CALL';
  const color  = isCall?'#22c55e':'#ef4444';
  const cColor = result.confidence>=80?'#22c55e':result.confidence>=70?'#f59e0b':'#ef4444';
  const rankBg = rank===1?'linear-gradient(135deg,#ffd700,#f59e0b)':rank===2?'linear-gradient(135deg,#c0c0c0,#9ca3af)':'linear-gradient(135deg,#cd7f32,#92400e)';

  return (
    <div onClick={()=>onSelect(result)}
      style={{background:'var(--bg-secondary)',border:`1px solid ${color}33`,borderRadius:14,
        padding:18,cursor:'pointer',position:'relative',overflow:'hidden',transition:'all 0.2s'}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 8px 32px ${color}22`}
      onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>

      <div style={{position:'absolute',top:0,right:0,width:80,height:80,borderRadius:'0 14px 0 80px',
        background:`${color}08`,pointerEvents:'none'}}/>

      {/* Rank */}
      <div style={{position:'absolute',top:14,left:14,width:28,height:28,borderRadius:'50%',
        display:'flex',alignItems:'center',justifyContent:'center',
        background:rankBg,fontSize:13,fontWeight:900,color:'#000'}}>#{rank}</div>

      <div style={{marginLeft:40,marginBottom:12}}>
        <div style={{fontSize:18,fontWeight:900,color:'var(--text-primary)'}}>{result.sym}</div>
        <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'DM Mono'}}>
          ₹{result.price?.toFixed(2)}
          <span style={{color:result.chgPct>=0?'var(--green)':'var(--red)',marginLeft:6}}>
            {result.chgPct>=0?'▲':'▼'} {Math.abs(result.chgPct)}%
          </span>
        </div>
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:16,fontWeight:800,color,background:`${color}15`,
          padding:'5px 14px',borderRadius:20,border:`1px solid ${color}44`}}>
          {isCall?'📈 BUY CALL':'📉 BUY PUT'}
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:10,color:'var(--text-muted)'}}>Confidence</div>
          <div style={{fontSize:24,fontWeight:900,fontFamily:'DM Mono',color:cColor}}>{result.confidence}%</div>
        </div>
      </div>

      <div style={{background:'var(--bg-primary)',borderRadius:4,height:8,overflow:'hidden',marginBottom:12}}>
        <div style={{width:`${result.confidence}%`,height:'100%',borderRadius:4,
          background:`linear-gradient(90deg,${color}55,${color})`}}/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:10}}>
        {[
          ['RSI', result.rsi??'---', result.rsi!=null?(result.dir==='CALL'?result.rsi<50:result.rsi>50):null],
          ['ST',  result.st?.trend??'---', result.st?result.st.trend==='UP':null],
          ['VOL', `${result.volSpike}x`, result.volSpike>1.5],
        ].map(([l,v,b])=>(
          <div key={l} style={{background:'var(--bg-primary)',borderRadius:6,padding:'5px 0',textAlign:'center'}}>
            <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1}}>{l}</div>
            <div style={{fontSize:11,fontWeight:700,fontFamily:'DM Mono',
              color:b===true?'var(--green)':b===false?'var(--red)':'var(--text-muted)'}}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          {result.pats?.slice(0,2).map((p,i)=>(
            <span key={i} style={{fontSize:9,padding:'2px 7px',borderRadius:10,
              background:p.t==='bullish'?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.12)',
              color:p.t==='bullish'?'var(--green)':'var(--red)',
              border:`1px solid ${p.t==='bullish'?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}`}}>
              {p.n}
            </span>
          ))}
        </div>
        <span style={{fontSize:10,color:'var(--text-muted)'}}>Tap for trade plan →</span>
      </div>
    </div>
  );
}

// ─── Capital Setup Screen ────────────────────────────────────
function SetupScreen({ onStart }) {
  const [capital,   setCap]     = useState('');
  const [timeframe, setTF]      = useState('intraday');
  const [minConf,   setMinConf] = useState(70);
  const [error,     setError]   = useState('');
  const presets = [5000,10000,25000,50000,100000];

  function go() {
    const c = Number(capital);
    if (!c||c<1000) { setError('Minimum ₹1,000 required'); return; }
    onStart({ capital:c, timeframe, minConf });
  }

  return (
    <div style={{maxWidth:500,margin:'0 auto',padding:'32px 0'}}>
      <div style={{textAlign:'center',marginBottom:32}}>
        <div style={{fontSize:44,marginBottom:10}}>🎯</div>
        <div style={{fontSize:22,fontWeight:900,color:'var(--text-primary)',marginBottom:6}}>
          AI Options Signal Scanner
        </div>
        <div style={{fontSize:13,color:'var(--text-muted)',lineHeight:1.8}}>
          Enter your capital → AI scans 20 stocks + indices<br/>
          using <strong style={{color:'var(--gold)'}}>7 indicators + 10 candlestick patterns</strong><br/>
          and shows only the <strong style={{color:'var(--green)'}}>highest confidence signals</strong>
        </div>
      </div>

      {/* Capital */}
      <div style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',
        borderRadius:14,padding:22,marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',
          letterSpacing:1,marginBottom:14}}>💰 Your Trading Capital</div>
        <div style={{position:'relative',marginBottom:12}}>
          <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',
            fontSize:22,fontWeight:700,color:'var(--gold)'}}>₹</span>
          <input type="number" value={capital}
            onChange={e=>{setCap(e.target.value);setError('');}}
            onKeyDown={e=>e.key==='Enter'&&go()}
            placeholder="Enter amount..."
            style={{width:'100%',padding:'14px 14px 14px 42px',fontSize:22,fontWeight:700,
              fontFamily:'DM Mono',background:'var(--bg-primary)',
              border:`2px solid ${error?'var(--red)':capital?'var(--gold)':'var(--border)'}`,
              borderRadius:10,color:'var(--text-primary)',outline:'none',boxSizing:'border-box'}}/>
        </div>
        <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
          {presets.map(p=>(
            <button key={p} onClick={()=>{setCap(String(p));setError('');}}
              style={{padding:'6px 14px',borderRadius:8,border:'1px solid var(--border)',
                background:Number(capital)===p?'rgba(201,168,76,0.2)':'var(--bg-primary)',
                color:Number(capital)===p?'var(--gold)':'var(--text-muted)',
                fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'DM Mono'}}>
              ₹{p>=100000?'1L':`${p/1000}K`}
            </button>
          ))}
        </div>
        {error&&<div style={{color:'var(--red)',fontSize:12,marginTop:8}}>⚠️ {error}</div>}
      </div>

      {/* Preferences */}
      <div style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',
        borderRadius:14,padding:22,marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',
          letterSpacing:1,marginBottom:14}}>⚙️ Scan Preferences</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>Timeframe</div>
            <select value={timeframe} onChange={e=>setTF(e.target.value)}
              className="ai-select" style={{width:'100%'}}>
              <option value="intraday">Intraday (today)</option>
              <option value="swing">Swing (2–5 days)</option>
              <option value="weekly">This Week</option>
            </select>
          </div>
          <div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>
              Min Confidence: <strong style={{color:'var(--gold)'}}>{minConf}%</strong>
            </div>
            <input type="range" min={60} max={90} step={5} value={minConf}
              onChange={e=>setMinConf(Number(e.target.value))}
              style={{width:'100%',accentColor:'var(--gold)'}}/>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'var(--text-muted)'}}>
              <span>60% More signals</span><span>90% Fewer, best</span>
            </div>
          </div>
        </div>
      </div>

      {/* What gets scanned */}
      <div style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.2)',
        borderRadius:12,padding:14,marginBottom:22}}>
        <div style={{fontSize:10,fontWeight:700,color:'#a78bfa',textTransform:'uppercase',
          letterSpacing:1,marginBottom:8}}>Scanning with</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {['RSI(14)','MACD','Bollinger','ADX','Supertrend','VWAP','Volume','Hammer','Engulfing',
            'Morning Star','Marubozu','3 White Soldiers','3 Black Crows'].map(x=>(
            <span key={x} style={{fontSize:10,padding:'2px 8px',borderRadius:8,
              background:'rgba(99,102,241,0.15)',color:'#a78bfa',
              border:'1px solid rgba(99,102,241,0.25)'}}>{x}</span>
          ))}
        </div>
      </div>

      <button onClick={go} style={{width:'100%',padding:'15px',borderRadius:12,border:'none',
        background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
        color:'#fff',fontSize:15,fontWeight:800,cursor:'pointer',
        display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
        🔍 Start Scanning for Best Signals →
      </button>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────
export default function UpstoxSignals({ indices, stocks }) {
  const [phase,    setPhase]    = useState('setup');
  const [config,   setConfig]   = useState(null);
  const [progress, setProg]     = useState(0);
  const [scanMsg,  setScanMsg]  = useState('');
  const [results,  setResults]  = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter,   setFilter]   = useState('ALL');
  const cancelRef = useRef(false);

  async function startScan(cfg) {
    setConfig(cfg); setPhase('scanning'); setProg(0); setResults([]); cancelRef.current=false;
    const found=[];
    for (let i=0;i<SCAN_TARGETS.length;i++) {
      if (cancelRef.current) break;
      setScanMsg(`Analyzing ${SCAN_TARGETS[i].sym}...`);
      setProg(Math.round(((i+1)/SCAN_TARGETS.length)*100));
      const r = await analyzeOne(SCAN_TARGETS[i]);
      if (r&&r.confidence>=cfg.minConf) found.push(r);
      await new Promise(res=>setTimeout(res,260));
    }
    found.sort((a,b)=>b.confidence-a.confidence);
    setResults(found); setPhase('results');
  }

  function reset() { setPhase('setup'); setResults([]); setConfig(null); cancelRef.current=true; }

  const displayed = results.filter(r=>filter==='CALL'?r.dir==='CALL':filter==='PUT'?r.dir==='PUT':true);

  if (phase==='setup') return <SetupScreen onStart={startScan}/>;

  if (phase==='scanning') return (
    <div style={{maxWidth:460,margin:'60px auto',textAlign:'center'}}>
      <div style={{fontSize:44,marginBottom:16}}>🔍</div>
      <div style={{fontSize:18,fontWeight:800,color:'var(--text-primary)',marginBottom:6}}>Scanning Markets...</div>
      <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:28}}>
        7 indicators · 10 candlestick patterns · Looking for {config?.minConf}%+ confidence only
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
      {/* Results bar */}
      <div className="panel" style={{marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:'var(--text-primary)'}}>
              🎯 Top Signals · {config?.minConf}%+ Confidence
            </div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>
              Capital: <strong style={{color:'var(--gold)',fontFamily:'DM Mono'}}>₹{config?.capital?.toLocaleString('en-IN')}</strong>
              &nbsp;·&nbsp;{config?.timeframe}&nbsp;·&nbsp;{results.length} signals found
            </div>
          </div>
          <div style={{marginLeft:'auto',display:'flex',gap:7}}>
            {[['ALL','All'],['CALL','📈 Calls'],['PUT','📉 Puts']].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)} style={{padding:'5px 12px',borderRadius:6,border:'1px solid',
                borderColor:filter===v?'var(--gold)':'var(--border)',
                background:filter===v?'rgba(201,168,76,0.15)':'var(--bg-secondary)',
                color:filter===v?'var(--gold)':'var(--text-muted)',
                fontSize:11,fontWeight:600,cursor:'pointer'}}>{l}</button>
            ))}
            <button onClick={reset} style={{padding:'5px 12px',borderRadius:6,
              border:'1px solid var(--border)',background:'var(--bg-secondary)',
              color:'var(--text-muted)',fontSize:11,cursor:'pointer'}}>🔄 Rescan</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {results.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
          {[
            ['Total',       results.length,                         'var(--text-primary)'],
            ['📈 CALL',     results.filter(r=>r.dir==='CALL').length,'var(--green)'],
            ['📉 PUT',      results.filter(r=>r.dir==='PUT').length, 'var(--red)'],
            ['Best Signal', (results[0]?.confidence??0)+'%',        'var(--gold)'],
          ].map(([l,v,c])=>(
            <div key={l} style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',
              borderRadius:10,padding:'10px 14px',textAlign:'center'}}>
              <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:3}}>{l}</div>
              <div style={{fontSize:22,fontWeight:900,color:c,fontFamily:'DM Mono'}}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {displayed.length>0?(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12}}>
          {displayed.map((r,i)=><SignalCard key={r.sym} result={r} rank={i+1} onSelect={setSelected}/>)}
        </div>
      ):(
        <div style={{textAlign:'center',padding:60}}>
          <div style={{fontSize:36,marginBottom:14}}>🔍</div>
          <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',marginBottom:8}}>
            No signals at {config?.minConf}%+ confidence
          </div>
          <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:20}}>
            Try lowering confidence threshold or scan again when market is more active.
          </div>
          <button onClick={reset} style={{padding:'12px 26px',borderRadius:10,border:'none',
            background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
            color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>
            ← Change Settings
          </button>
        </div>
      )}

      {selected&&<DetailModal result={selected} capital={config?.capital??50000} onClose={()=>setSelected(null)}/>}
    </div>
  );
}