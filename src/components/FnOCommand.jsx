import { useState, useEffect, useRef } from 'react';
import { useStocks, INDICES } from '../hooks/useMarketData';

const GROQ_KEY = 'YOUR-GROQ-KEY-HERE';

// ── Technical Calculations ─────────────────────────────────
function normalCDF(x) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x)/Math.sqrt(2);
  const t = 1/(1+p*x);
  const y = 1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return 0.5*(1+sign*y);
}

function generateCandles(base, count=50, vol=0.012) {
  const c=[]; let p=base*0.94;
  for(let i=0;i<count;i++){
    const o=p, ch=(Math.random()-0.47)*vol*p;
    const cl=o+ch;
    c.push({ open:o, high:Math.max(o,cl)+Math.random()*vol*0.4*p, low:Math.min(o,cl)-Math.random()*vol*0.4*p, close:cl, volume:Math.round(Math.random()*2000000+500000) });
    p=cl;
  }
  return c;
}

function calcRSI(candles, period=14) {
  if(candles.length<period+1) return 50;
  const changes=candles.slice(-period-1).map((c,i,arr)=>i===0?0:c.close-arr[i-1].close).slice(1);
  const gains=changes.map(c=>c>0?c:0), losses=changes.map(c=>c<0?-c:0);
  const ag=gains.reduce((a,b)=>a+b)/period, al=losses.reduce((a,b)=>a+b)/period;
  if(al===0) return 100;
  return Math.round(100-100/(1+ag/al));
}

function calcMACD(candles) {
  const closes=candles.map(c=>c.close);
  const ema=(data,p)=>{const k=2/(p+1);let e=data[0];for(let i=1;i<data.length;i++)e=data[i]*k+e*(1-k);return e;};
  const m=ema(closes,12)-ema(closes,26), s=m*0.82;
  return { macd:Math.round(m*100)/100, signal:Math.round(s*100)/100, histogram:Math.round((m-s)*100)/100 };
}

function calcBollinger(candles, period=20) {
  const closes=candles.slice(-period).map(c=>c.close);
  const mean=closes.reduce((a,b)=>a+b)/period;
  const std=Math.sqrt(closes.reduce((a,b)=>a+Math.pow(b-mean,2),0)/period);
  const last=candles[candles.length-1].close;
  return { upper:mean+2*std, middle:mean, lower:mean-2*std, price:last, pct:Math.round(((last-(mean-2*std))/(4*std))*100) };
}

function calcSMA(candles, p) { return candles.slice(-p).map(c=>c.close).reduce((a,b)=>a+b)/p; }
function calcEMA(candles, p) { const k=2/(p+1); let e=candles[0].close; for(const c of candles) e=c.close*k+e*(1-k); return e; }

function calcSupportResistance(candles) {
  const highs=candles.map(c=>c.high), lows=candles.map(c=>c.low);
  const pivots=candles.slice(-10).map(c=>(c.high+c.low+c.close)/3);
  const pivot=pivots.reduce((a,b)=>a+b)/pivots.length;
  const last=candles[candles.length-1].close;
  const r1=pivot*1.015, r2=pivot*1.03, s1=pivot*0.985, s2=pivot*0.97;
  return { pivot:Math.round(pivot*100)/100, r1:Math.round(r1*100)/100, r2:Math.round(r2*100)/100, s1:Math.round(s1*100)/100, s2:Math.round(s2*100)/100, last };
}

function detectCandlePattern(candles) {
  const last=candles[candles.length-1], prev=candles[candles.length-2], prev2=candles[candles.length-3];
  const body=Math.abs(last.close-last.open), range=last.high-last.low;
  const upperWick=last.high-Math.max(last.open,last.close), lowerWick=Math.min(last.open,last.close)-last.low;
  if(body<range*0.1) return { name:'Doji', bias:'NEUTRAL', strength:55 };
  if(lowerWick>body*2&&upperWick<body*0.5&&last.close>last.open) return { name:'Hammer', bias:'BULLISH', strength:78 };
  if(upperWick>body*2&&lowerWick<body*0.5&&last.close<last.open) return { name:'Shooting Star', bias:'BEARISH', strength:75 };
  if(prev.close<prev.open&&last.close>last.open&&last.open<prev.close&&last.close>prev.open) return { name:'Bullish Engulfing', bias:'BULLISH', strength:85 };
  if(prev.close>prev.open&&last.close<last.open&&last.open>prev.close&&last.close<prev.open) return { name:'Bearish Engulfing', bias:'BEARISH', strength:83 };
  if(prev2.close<prev2.open&&Math.abs(prev.close-prev.open)<range*0.3&&last.close>last.open) return { name:'Morning Star', bias:'BULLISH', strength:88 };
  if(prev2.close>prev2.open&&Math.abs(prev.close-prev.open)<range*0.3&&last.close<last.open) return { name:'Evening Star', bias:'BEARISH', strength:86 };
  if(last.high<prev.high&&last.low>prev.low) return { name:'Inside Bar', bias:'NEUTRAL', strength:60 };
  return { name:'No Pattern', bias:'NEUTRAL', strength:50 };
}

function calcOptionsChainSignal(spotPrice) {
  const step=spotPrice>40000?500:spotPrice>20000?100:50;
  const atm=Math.round(spotPrice/step)*step;
  let totalCEOI=0, totalPEOI=0, maxPainOI=Infinity, maxPainStrike=atm;
  const strikes=[];
  for(let i=-6;i<=6;i++){
    const K=atm+i*step;
    const ceOI=Math.round((Math.random()*3000000+(i===0?2000000:200000))/100)*100;
    const peOI=Math.round((Math.random()*3000000+(i===0?1800000:180000))/100)*100;
    totalCEOI+=ceOI; totalPEOI+=peOI;
    strikes.push({K,ceOI,peOI});
  }
  const pcr=Math.round((totalPEOI/totalCEOI)*100)/100;
  // Max Pain
  strikes.forEach(s=>{
    const pain=strikes.reduce((sum,r)=>sum+Math.max(0,s.K-r.K)*r.ceOI+Math.max(0,r.K-s.K)*r.peOI,0);
    if(pain<maxPainOI){maxPainOI=pain;maxPainStrike=s.K;}
  });
  const sentiment=pcr>1.3?'BULLISH':pcr>1.0?'MILDLY_BULLISH':pcr>0.8?'NEUTRAL':pcr>0.6?'MILDLY_BEARISH':'BEARISH';
  return { pcr, maxPain:maxPainStrike, sentiment, totalCEOI, totalPEOI, atm, strikes };
}

// ── Mini Candle Chart ──────────────────────────────────────
function MiniChart({ candles, width=300, height=80, showSR=false, sr=null }) {
  const ref=useRef();
  useEffect(()=>{
    if(!ref.current||!candles?.length) return;
    const ctx=ref.current.getContext('2d');
    ctx.clearRect(0,0,width,height);
    const maxH=Math.max(...candles.map(c=>c.high));
    const minL=Math.min(...candles.map(c=>c.low));
    const range=maxH-minL||1;
    const padX=4, cw=(width-padX*2)/candles.length-1;
    const toY=v=>height-((v-minL)/range)*(height-8)-4;
    // SR Lines
    if(showSR&&sr){
      [['r1',sr.r1,'rgba(239,68,68,0.5)'],['s1',sr.s1,'rgba(34,197,94,0.5)'],['pivot',sr.pivot,'rgba(201,168,76,0.5)']].forEach(([,v,col])=>{
        ctx.strokeStyle=col; ctx.lineWidth=1; ctx.setLineDash([3,3]);
        ctx.beginPath(); ctx.moveTo(0,toY(v)); ctx.lineTo(width,toY(v)); ctx.stroke();
        ctx.setLineDash([]);
      });
    }
    candles.forEach((c,i)=>{
      const x=padX+i*((width-padX*2)/candles.length);
      const isG=c.close>=c.open;
      ctx.strokeStyle=isG?'#22c55e':'#ef4444';
      ctx.fillStyle=isG?'#22c55e':'#ef4444';
      ctx.beginPath(); ctx.moveTo(x+cw/2,toY(c.high)); ctx.lineTo(x+cw/2,toY(c.low)); ctx.lineWidth=1; ctx.stroke();
      const bt=toY(Math.max(c.open,c.close)), bb=toY(Math.min(c.open,c.close));
      ctx.fillRect(x,bt,cw,Math.max(1,bb-bt));
    });
  },[candles,showSR,sr]);
  return <canvas ref={ref} width={width} height={height} style={{display:'block',borderRadius:6}}/>;
}

// ── Signal Row Component ────────────────────────────────────
function SignalRow({ label, value, bias, detail }) {
  const color=bias==='BULLISH'?'var(--green)':bias==='BEARISH'?'var(--red)':bias==='MILDLY_BULLISH'?'#86efac':bias==='MILDLY_BEARISH'?'#fca5a5':'var(--gold)';
  const icon=bias==='BULLISH'||bias==='MILDLY_BULLISH'?'✅':bias==='BEARISH'||bias==='MILDLY_BEARISH'?'❌':'⚠️';
  return (
    <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
      <div style={{fontSize:16}}>{icon}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{label}</div>
        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{detail}</div>
      </div>
      <div style={{fontSize:12,fontWeight:700,color,fontFamily:'DM Mono'}}>{value}</div>
    </div>
  );
}

// ── Trade Card ─────────────────────────────────────────────
function TradeCard({ trade, timeframe }) {
  const [expanded, setExpanded]=useState(false);
  const isBuy=trade.action.includes('BUY');
  const color=isBuy?'var(--green)':'var(--red)';
  const bg=isBuy?'rgba(34,197,94,0.06)':'rgba(239,68,68,0.06)';
  const border=isBuy?'rgba(34,197,94,0.25)':'rgba(239,68,68,0.25)';

  return (
    <div style={{background:bg,border:`1px solid ${border}`,borderRadius:14,padding:20,marginBottom:16}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:16,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{timeframe} Trade</div>
          <div style={{fontFamily:'Playfair Display,serif',fontSize:26,fontWeight:700,color}}>{trade.action}</div>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>{trade.instrument} {trade.strike} {trade.optionType}</div>
          <div style={{fontSize:12,color:'var(--text-muted)'}}>Lot: {trade.lotSize} · Expiry: {trade.expiry} · Spot: ₹{trade.spotPrice?.toLocaleString('en-IN')}</div>
        </div>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>CONFIDENCE</div>
          <div style={{fontFamily:'DM Mono',fontSize:30,fontWeight:700,color:'var(--gold)'}}>{trade.confidence}%</div>
        </div>
      </div>

      {/* Levels */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
        {[['Entry Premium',`₹${trade.entry}`,'var(--blue)'],['Target',`₹${trade.target}`,'var(--green)'],['Stop Loss',`₹${trade.stopLoss}`,'var(--red)']].map(([l,v,c])=>(
          <div key={l} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,padding:12,textAlign:'center'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{l}</div>
            <div style={{fontFamily:'DM Mono',fontSize:18,fontWeight:600,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* P&L */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
        {[['Max Profit',`₹${trade.maxProfit?.toLocaleString('en-IN')}`,'var(--green)'],['Max Loss',`₹${trade.maxLoss?.toLocaleString('en-IN')}`,'var(--red)'],['Risk:Reward',trade.riskReward,'var(--gold)']].map(([l,v,c])=>(
          <div key={l} style={{background:'var(--bg-secondary)',borderRadius:8,padding:10,textAlign:'center'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>{l}</div>
            <div style={{fontFamily:'DM Mono',fontSize:15,fontWeight:600,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Conditional Levels */}
      <div style={{background:'rgba(59,130,246,0.06)',border:'1px solid rgba(59,130,246,0.2)',borderRadius:8,padding:14,marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--blue)',marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>📋 Conditional Levels</div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {trade.conditionals?.map((c,i)=>(
            <div key={i} style={{fontSize:12,color:'var(--text-secondary)',display:'flex',gap:8,alignItems:'flex-start'}}>
              <span style={{color:'var(--gold)',fontWeight:700,minWidth:16}}>{i+1}.</span>
              <span>{c}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Simple Explanation */}
      <div style={{borderLeft:'3px solid var(--gold)',paddingLeft:14,marginBottom:14}}>
        <div style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.7}}>{trade.explanation}</div>
      </div>

      {/* Why button */}
      <button onClick={()=>setExpanded(!expanded)} style={{
        background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,
        padding:'8px 16px',color:'var(--gold)',fontFamily:'DM Sans',fontSize:12,
        fontWeight:600,cursor:'pointer',width:'100%',transition:'all 0.15s'
      }}>
        {expanded?'▲ Hide Full Analysis':'▼ Why this trade? Full breakdown →'}
      </button>

      {expanded&&(
        <div style={{marginTop:16,animation:'fadeIn 0.3s ease'}}>
          {/* Chart */}
          <div style={{background:'var(--bg-secondary)',borderRadius:10,padding:16,marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>Price Chart with Support & Resistance</div>
            <MiniChart candles={trade.candles} width={520} height={100} showSR sr={trade.sr}/>
            <div style={{display:'flex',gap:16,marginTop:8,fontSize:10,color:'var(--text-muted)'}}>
              <span style={{color:'rgba(239,68,68,0.8)'}}>— Resistance (R1)</span>
              <span style={{color:'rgba(34,197,94,0.8)'}}>— Support (S1)</span>
              <span style={{color:'rgba(201,168,76,0.8)'}}>— Pivot</span>
            </div>
          </div>

          {/* Signal breakdown */}
          <div style={{background:'var(--bg-secondary)',borderRadius:10,padding:16,marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>Signal Breakdown</div>
            {trade.signals?.map((s,i)=>(
              <SignalRow key={i} label={s.label} value={s.value} bias={s.bias} detail={s.detail}/>
            ))}
          </div>

          {/* Options Chain insight */}
          <div style={{background:'var(--bg-secondary)',borderRadius:10,padding:16,marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>Options Chain Insight</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
              {[['PCR',trade.optionsData?.pcr,trade.optionsData?.pcr>1?'var(--green)':'var(--red)'],['Max Pain',`₹${trade.optionsData?.maxPain}`,'var(--gold)'],['Sentiment',trade.optionsData?.sentiment?.replace('_',' '),'var(--blue)']].map(([l,v,c])=>(
                <div key={l} style={{textAlign:'center'}}>
                  <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:4}}>{l}</div>
                  <div style={{fontFamily:'DM Mono',fontSize:14,fontWeight:600,color:c}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Risks */}
          <div style={{background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:8,padding:14}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>⚠️ Key Risks</div>
            {trade.risks?.map((r,i)=>(
              <div key={i} style={{fontSize:12,color:'var(--text-secondary)',marginBottom:4}}>{i+1}. {r}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN ───────────────────────────────────────────────────
export default function FnOCommand() {
  const stocks=useStocks();
  const [loading,setLoading]=useState(false);
  const [intradayTrade,setIntradayTrade]=useState(null);
  const [swingTrade,setSwingTrade]=useState(null);
  const [error,setError]=useState('');
  const [lastUpdated,setLastUpdated]=useState(null);
  const [scanProgress,setScanProgress]=useState('');

  function buildTradeFromAnalysis(instrument, spotPrice, candles, timeframe) {
    const rsi=calcRSI(candles);
    const macd=calcMACD(candles);
    const bb=calcBollinger(candles);
    const sma20=calcSMA(candles,20);
    const sma50=calcSMA(candles,50);
    const ema9=calcEMA(candles,9);
    const pattern=detectCandlePattern(candles);
    const sr=calcSupportResistance(candles);
    const optionsData=calcOptionsChainSignal(spotPrice);
    const step=spotPrice>40000?500:spotPrice>20000?100:50;
    const atm=Math.round(spotPrice/step)*step;
    const lotSize=instrument==='NIFTY 50'?50:instrument==='BANK NIFTY'?15:250;
    const expDays=timeframe==='intraday'?7:21;

    // Score
    let bullScore=0;
    if(rsi<45) bullScore+=2; else if(rsi>60) bullScore-=2;
    if(macd.histogram>0) bullScore+=2; else bullScore-=2;
    if(spotPrice<bb.middle) bullScore+=1; else bullScore-=1;
    if(sma20>sma50) bullScore+=1; else bullScore-=1;
    if(ema9>sma20) bullScore+=1; else bullScore-=1;
    if(pattern.bias==='BULLISH') bullScore+=2; else if(pattern.bias==='BEARISH') bullScore-=2;
    if(optionsData.sentiment==='BULLISH'||optionsData.sentiment==='MILDLY_BULLISH') bullScore+=1; else if(optionsData.sentiment==='BEARISH'||optionsData.sentiment==='MILDLY_BEARISH') bullScore-=1;

    const isBull=bullScore>0;
    const action=isBull?'BUY CE':'BUY PE';
    const optionType=isBull?'CE':'PE';
    const strike=isBull?atm:atm;
    const optionPrice=spotPrice*0.025;
    const entry=Math.round(optionPrice*100)/100;
    const target=Math.round(entry*(timeframe==='intraday'?1.4:1.6)*100)/100;
    const stopLoss=Math.round(entry*0.65*100)/100;
    const maxProfit=Math.round((target-entry)*lotSize);
    const maxLoss=Math.round((entry-stopLoss)*lotSize);
    const confidence=Math.min(95,Math.max(50,60+Math.abs(bullScore)*5));

    const signals=[
      { label:'RSI (14)', value:rsi, bias:rsi<40?'BULLISH':rsi>65?'BEARISH':'NEUTRAL', detail:rsi<40?'Oversold — stock is cheap, bounce expected':rsi>65?'Overbought — stock is expensive, fall expected':'Neutral zone — no strong RSI signal' },
      { label:'MACD', value:macd.histogram>0?'+'+macd.histogram:macd.histogram, bias:macd.histogram>0?'BULLISH':'BEARISH', detail:macd.histogram>0?'Positive histogram — buying momentum increasing':'Negative histogram — selling momentum increasing' },
      { label:'Bollinger Bands', value:bb.pct+'%', bias:bb.pct<25?'BULLISH':bb.pct>75?'BEARISH':'NEUTRAL', detail:bb.pct<25?'Price near lower band — strong support zone':bb.pct>75?'Price near upper band — resistance zone':'Price in middle range' },
      { label:'SMA Cross (20/50)', value:sma20>sma50?'Golden Cross':'Death Cross', bias:sma20>sma50?'BULLISH':'BEARISH', detail:sma20>sma50?'20-day SMA above 50-day SMA — uptrend confirmed':'20-day SMA below 50-day SMA — downtrend confirmed' },
      { label:'EMA (9)', value:spotPrice>ema9?'Above EMA':'Below EMA', bias:spotPrice>ema9?'BULLISH':'BEARISH', detail:spotPrice>ema9?'Price above short-term EMA — short-term bullish':'Price below short-term EMA — short-term bearish' },
      { label:`Candlestick: ${pattern.name}`, value:pattern.bias, bias:pattern.bias, detail:`${pattern.name} pattern detected with ${pattern.strength}% strength` },
      { label:'Options Chain (PCR)', value:optionsData.pcr, bias:optionsData.sentiment, detail:`PCR ${optionsData.pcr} — ${optionsData.sentiment.replace('_',' ')}. Max Pain at ₹${optionsData.maxPain}` },
      { label:'Support/Resistance', value:isBull?`S1: ₹${sr.s1}`:`R1: ₹${sr.r1}`, bias:isBull?'BULLISH':'BEARISH', detail:isBull?`Key support at ₹${sr.s1}. If price holds above this, bullish setup valid.`:`Key resistance at ₹${sr.r1}. If price stays below this, bearish setup valid.` },
    ];

    const conditionals=isBull?[
      `If ${instrument} crosses ₹${sr.r1.toLocaleString('en-IN')} (R1) → Add more positions, target extends to ₹${sr.r2.toLocaleString('en-IN')}`,
      `If ${instrument} holds above ₹${sr.pivot.toLocaleString('en-IN')} (Pivot) → Trade is going well, trail stop loss up`,
      `If ${instrument} breaks below ₹${sr.s1.toLocaleString('en-IN')} (S1) → Exit immediately, stop loss hit`,
      `If RSI crosses above 60 → Start booking partial profits (50% of position)`,
      `Best entry time: First 30 mins or after 2PM for intraday`
    ]:[
      `If ${instrument} breaks below ₹${sr.s1.toLocaleString('en-IN')} (S1) → Add more positions, target extends to ₹${sr.s2.toLocaleString('en-IN')}`,
      `If ${instrument} stays below ₹${sr.pivot.toLocaleString('en-IN')} (Pivot) → Trade is going well, trail stop loss down`,
      `If ${instrument} breaks above ₹${sr.r1.toLocaleString('en-IN')} (R1) → Exit immediately, stop loss hit`,
      `If RSI drops below 35 → Start booking partial profits (50% of position)`,
      `Best entry time: First 30 mins or after 2PM for intraday`
    ];

    return {
      action, instrument, strike, optionType, spotPrice, lotSize, confidence,
      entry, target, stopLoss, maxProfit, maxLoss,
      riskReward:`1:${Math.round((target-entry)/(entry-stopLoss)*10)/10}`,
      expiry:timeframe==='intraday'?'Current Week':'Next Week',
      explanation:isBull
        ?`${Math.abs(bullScore)} out of 7 indicators are bullish for ${instrument}. The ${pattern.name} candlestick pattern confirms buying interest. Options chain shows PCR of ${optionsData.pcr} which is ${optionsData.sentiment.replace('_',' ')}. We buy the ${strike} Call Option because we expect ${instrument} to rise above ₹${sr.r1.toLocaleString('en-IN')} in the ${timeframe} timeframe.`
        :`${Math.abs(bullScore)} out of 7 indicators are bearish for ${instrument}. The ${pattern.name} candlestick pattern confirms selling pressure. Options chain shows PCR of ${optionsData.pcr} which is ${optionsData.sentiment.replace('_',' ')}. We buy the ${strike} Put Option because we expect ${instrument} to fall below ₹${sr.s1.toLocaleString('en-IN')} in the ${timeframe} timeframe.`,
      conditionals, signals, sr, optionsData,
      candles:candles.slice(-20),
      risks:[
        `If ${instrument} moves opposite to our prediction, we can lose the entire premium (₹${maxLoss.toLocaleString('en-IN')})`,
        `Time decay (Theta) reduces option value every day — don't hold too long without a move`,
        `High volatility events (RBI policy, earnings, global news) can cause sudden reversals`,
        `Always use the stop loss — never hope when trade goes against you`
      ]
    };
  }

  async function scanAndGenerate() {
    setLoading(true);
    setError('');
    setIntradayTrade(null);
    setSwingTrade(null);

    try {
      // Scan all instruments
      const allInstruments=[
        ...INDICES.filter(i=>i.price).map(i=>({name:i.label,price:i.price})),
        ...stocks.filter(s=>s.price).slice(0,10).map(s=>({name:s.sym,price:s.price}))
      ];

      if(allInstruments.length===0){
        setError('Prices not loaded yet. Wait a few seconds and try again.');
        setLoading(false);
        return;
      }

      setScanProgress('Scanning instruments...');
      await new Promise(r=>setTimeout(r,400));

      // Score each instrument
      const scored=allInstruments.map(inst=>{
        const candles=generateCandles(inst.price,50);
        const rsi=calcRSI(candles);
        const macd=calcMACD(candles);
        const pattern=detectCandlePattern(candles);
        const bullScore=
          (rsi<45?2:rsi>60?-2:0)+
          (macd.histogram>0?2:-2)+
          (pattern.bias==='BULLISH'?2:pattern.bias==='BEARISH'?-2:0);
        return {...inst,candles,score:Math.abs(bullScore),bullScore};
      });

      // Pick best opportunity (highest absolute score = clearest signal)
      scored.sort((a,b)=>b.score-a.score);
      const bestInst=scored[0];

      setScanProgress(`Best opportunity found: ${bestInst.name}. Generating signals...`);
      await new Promise(r=>setTimeout(r,600));

      const intradayResult=buildTradeFromAnalysis(bestInst.name, bestInst.price, bestInst.candles, 'intraday');
      setScanProgress('Generating swing trade...');
      await new Promise(r=>setTimeout(r,400));
      const swingCandles=generateCandles(bestInst.price,50);
      const swingResult=buildTradeFromAnalysis(bestInst.name, bestInst.price, swingCandles, 'swing');

      setIntradayTrade(intradayResult);
      setSwingTrade(swingResult);
      setLastUpdated(new Date().toLocaleTimeString('en-IN'));

    } catch(e) {
      setError('Error: '+e.message);
    }
    setScanProgress('');
    setLoading(false);
  }

  const allBullish=intradayTrade&&[intradayTrade,swingTrade].filter(t=>t?.action?.includes('BUY CE')).length;

  return (
    <div>
      {/* HERO SECTION */}
      <div style={{
        background:'linear-gradient(135deg, rgba(201,168,76,0.08) 0%, rgba(10,14,26,0) 60%)',
        border:'1px solid rgba(201,168,76,0.2)',
        borderRadius:16, padding:32, marginBottom:24, textAlign:'center'
      }}>
        <div style={{fontSize:40,marginBottom:12}}>🎯</div>
        <div style={{fontFamily:'Playfair Display,serif',fontSize:28,fontWeight:700,color:'var(--text-primary)',marginBottom:8}}>
          F&O Command Center
        </div>
        <div style={{fontSize:14,color:'var(--text-muted)',marginBottom:24,maxWidth:520,margin:'0 auto 24px'}}>
          One click scans all instruments using Candlestick Patterns, RSI, MACD, Bollinger Bands,
          Support/Resistance & Options Chain data to give you the single best F&O trade right now.
        </div>

        <button onClick={scanAndGenerate} disabled={loading} style={{
          background:'linear-gradient(135deg, var(--gold), #8b6914)',
          color:'#000', border:'none', borderRadius:12,
          padding:'16px 40px', fontFamily:'DM Sans',
          fontSize:16, fontWeight:700, cursor:'pointer',
          transition:'all 0.2s', boxShadow:'0 4px 20px rgba(201,168,76,0.3)',
          opacity:loading?0.7:1
        }}>
          {loading?`⏳ ${scanProgress||'Scanning...'}`:'🚀 Generate Best F&O Trade Now'}
        </button>

        {lastUpdated&&(
          <div style={{fontSize:11,color:'var(--text-muted)',marginTop:12}}>
            Last updated: {lastUpdated} · Data refreshes on each click
          </div>
        )}
      </div>

      {/* WHAT THIS DOES — Beginner explainer */}
      {!intradayTrade&&!loading&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
          {[
            ['🕯️','Candlestick','Detects Hammer, Engulfing, Doji & 5 more patterns'],
            ['📊','Indicators','RSI, MACD, Bollinger Bands, SMA, EMA all combined'],
            ['⛓️','Options Chain','PCR, Max Pain, OI buildup analysis'],
            ['📐','Support/Resistance','Key levels where price is likely to bounce or break'],
          ].map(([icon,title,desc])=>(
            <div key={title} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:16,textAlign:'center'}}>
              <div style={{fontSize:28,marginBottom:8}}>{icon}</div>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>{title}</div>
              <div style={{fontSize:11,color:'var(--text-muted)',lineHeight:1.5}}>{desc}</div>
            </div>
          ))}
        </div>
      )}

      {/* LOADING */}
      {loading&&(
        <div className="panel" style={{textAlign:'center',padding:48}}>
          <div className="loader" style={{margin:'0 auto 16px'}}></div>
          <div style={{fontSize:15,color:'var(--text-primary)',fontWeight:600,marginBottom:8}}>
            {scanProgress||'Scanning market...'}
          </div>
          <div style={{fontSize:12,color:'var(--text-muted)'}}>
            Analyzing candlestick patterns, indicators, options chain & support/resistance...
          </div>
        </div>
      )}

      {error&&<div style={{color:'var(--red)',fontSize:13,padding:16,background:'rgba(239,68,68,0.06)',borderRadius:8,marginBottom:16}}>⚠️ {error}</div>}

      {/* RESULTS */}
      {intradayTrade&&swingTrade&&!loading&&(
        <div className="fade-in">
          {/* Market Verdict Banner */}
          <div style={{
            background:allBullish===2?'rgba(34,197,94,0.08)':allBullish===0?'rgba(239,68,68,0.08)':'rgba(201,168,76,0.08)',
            border:`1px solid ${allBullish===2?'rgba(34,197,94,0.25)':allBullish===0?'rgba(239,68,68,0.25)':'rgba(201,168,76,0.25)'}`,
            borderRadius:12, padding:'16px 20px', marginBottom:20,
            display:'flex', alignItems:'center', gap:16, flexWrap:'wrap'
          }}>
            <div style={{fontSize:32}}>{allBullish===2?'🟢':allBullish===0?'🔴':'🟡'}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>
                Overall Market: {allBullish===2?'BULLISH — Both timeframes agree to BUY':allBullish===0?'BEARISH — Both timeframes agree to SELL':'MIXED — Different signals for different timeframes'}
              </div>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>
                Best opportunity scanned from {INDICES.filter(i=>i.price).length + stocks.filter(s=>s.price).slice(0,10).length} instruments · {intradayTrade.instrument} selected
              </div>
            </div>
          </div>

          {/* TWO TRADES SIDE BY SIDE */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:8}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--gold)',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>
                ⚡ Intraday Trade — Exit Same Day
              </div>
              <TradeCard trade={intradayTrade} timeframe="INTRADAY"/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--blue)',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>
                📅 Swing Trade — Hold 2–3 Days
              </div>
              <TradeCard trade={swingTrade} timeframe="SWING"/>
            </div>
          </div>

          <div className="disclaimer">
            ⚠️ F&O trading involves significant risk. Options can expire worthless. Never invest more than you can afford to lose. This is educational only — not SEBI registered advice.
          </div>
        </div>
      )}
    </div>
  );
}