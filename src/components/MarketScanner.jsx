// src/components/MarketScanner.jsx
import { useState, useEffect, useRef } from 'react';
import { fetchUpstoxCandles } from '../hooks/useUpstoxData';

const GROQ_KEY = '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';

function getNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}
function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '---';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function getMarketMins() {
  const t = getNow();
  return t.getHours() * 60 + t.getMinutes();
}
function isMarketOpen() {
  const m = getMarketMins();
  return m >= 9 * 60 + 15 && m <= 15 * 60 + 30;
}
function getSessionLabel(mins) {
  if (mins < 9 * 60 + 15)  return { label: 'Pre-Market',          color: 'var(--gold)'  };
  if (mins < 10 * 60)      return { label: 'Opening Bell',         color: '#f7931a'      };
  if (mins < 11 * 60)      return { label: 'Morning Session',      color: 'var(--green)' };
  if (mins < 12 * 60)      return { label: 'Mid-Morning',          color: 'var(--green)' };
  if (mins < 13 * 60)      return { label: 'Lunch Hour',           color: 'var(--gold)'  };
  if (mins < 14 * 60)      return { label: 'Post-Lunch Session',   color: 'var(--green)' };
  if (mins < 15 * 60)      return { label: 'Power Hour',           color: '#f7931a'      };
  if (mins <= 15 * 60 + 30)return { label: 'Closing Session',      color: 'var(--red)'   };
  return                          { label: 'Market Closed',        color: 'var(--red)'   };
}

// ── Indicators ──────────────────────────────────────────────
function ema(arr, p) {
  if (arr.length < p) return null;
  const k = 2 / (p + 1);
  let e = arr.slice(0, p).reduce((a, b) => a + b) / p;
  for (let i = p; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}
function calcRSI(candles, p = 14) {
  if (candles.length < p + 1) return null;
  const ch = candles.slice(-p-1).map((c,i,a)=>i===0?0:c.close-a[i-1].close).slice(1);
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
  return {line:+line.toFixed(2),hist:+(line-sig).toFixed(2),bull:(line-sig)>0};
}
function calcST(candles,p=7,m=3) {
  if (candles.length<p+2) return null;
  const sl=candles.slice(-(p+2));
  const atrs=[];
  for(let i=1;i<sl.length;i++){const h=sl[i].high,l=sl[i].low,pc=sl[i-1].close;atrs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));}
  const atr=atrs.slice(-p).reduce((a,b)=>a+b)/p;
  const last=sl[sl.length-1];
  const hl2=(last.high+last.low)/2;
  return {trend:last.close>hl2-m*atr?'UP':'DOWN',support:+(hl2-m*atr).toFixed(2),resist:+(hl2+m*atr).toFixed(2)};
}
function calcVWAP(candles) {
  const sl=candles.slice(-20);
  let pv=0,v=0;
  sl.forEach(c=>{const t=(c.high+c.low+c.close)/3;pv+=t*(c.volume||1);v+=(c.volume||1);});
  return +(pv/v).toFixed(2);
}
function calcPivot(candles) {
  if (candles.length<2) return null;
  const p=candles[candles.length-2];
  const pivot=(p.high+p.low+p.close)/3;
  return {pivot:+pivot.toFixed(2),r1:+(2*pivot-p.low).toFixed(2),r2:+(pivot+(p.high-p.low)).toFixed(2),s1:+(2*pivot-p.high).toFixed(2),s2:+(pivot-(p.high-p.low)).toFixed(2)};
}
function roundStrike(price, step) { return Math.round(price/step)*step; }

// ── AI Signal ───────────────────────────────────────────────
async function getSignal(symbol, data) {
  const {price,rsi,macd,st,vwap,pivot,prevChg,sessionLabel,candles} = data;
  const step     = symbol==='BANKNIFTY'?100:50;
  const atm      = roundStrike(price,step);
  const lotSize  = symbol==='BANKNIFTY'?15:75;
  const dir      = (st?.trend==='UP'&&macd?.bull&&price>vwap)?'CE':(st?.trend==='DOWN'&&!macd?.bull&&price<vwap)?'PE':'CE';
  const estPrem  = symbol==='BANKNIFTY'?200:100;

  const prompt =
    'You are an expert NSE intraday options trader. Analyze and give the BEST trade signal right now.\n\n'+
    'Index: '+symbol+'\n'+
    'Current Price: ₹'+price.toFixed(2)+'\n'+
    'Session: '+sessionLabel+'\n'+
    'Previous Day Change: '+prevChg+'%\n'+
    'RSI(14): '+rsi+'\n'+
    'MACD: '+(macd?.bull?'Bullish':'Bearish')+' histogram='+macd?.hist+'\n'+
    'Supertrend: '+st?.trend+' support=₹'+st?.support+' resist=₹'+st?.resist+'\n'+
    'VWAP: ₹'+vwap+' (price '+(price>vwap?'ABOVE':'BELOW')+')\n'+
    'Pivot: ₹'+pivot?.pivot+' R1=₹'+pivot?.r1+' R2=₹'+pivot?.r2+' S1=₹'+pivot?.s1+'\n'+
    'ATM Strike: '+atm+'\n\n'+
    'Rules: Entry only if confident. Mandatory exit at 3:15 PM. Intraday only.\n\n'+
    'Respond ONLY with this JSON:\n'+
    '{"signal":"CE or PE or WAIT",'+
    '"strike":'+atm+','+
    '"optionName":"'+symbol+' '+atm+' '+dir+' Weekly",'+
    '"entryPremium":"₹XX–₹YY",'+
    '"target1":"₹XX (+X%)",'+
    '"target2":"₹XX (+X%)",'+
    '"stopLoss":"₹XX (-X%)",'+
    '"entryCondition":"specific condition",'+
    '"exitCondition":"specific condition",'+
    '"slCondition":"specific condition",'+
    '"keyLevel":"₹XX",'+
    '"confidence":75,'+
    '"bias":"BULLISH or BEARISH or SIDEWAYS",'+
    '"sessionAdvice":"advice specific to this time of day",'+
    '"reason":"2 sentences why this signal now"}';

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${GROQ_KEY}`},
      body:JSON.stringify({model:'llama-3.3-70b-versatile',max_tokens:800,temperature:0.2,
        messages:[
          {role:'system',content:'You are an NSE options expert. Only respond with valid JSON.'},
          {role:'user',content:prompt}
        ]})
    });
    const d=await res.json();
    const raw=d.choices?.[0]?.message?.content??'';
    const s=raw.indexOf('{'),e=raw.lastIndexOf('}');
    if(s===-1) throw new Error('no json');
    return JSON.parse(raw.slice(s,e+1));
  } catch {
    return {signal:dir,strike:atm,optionName:symbol+' '+atm+' '+dir+' Weekly',
      entryPremium:'₹'+estPrem+'–₹'+(estPrem+20),
      target1:'₹'+(estPrem*1.3).toFixed(0)+' (+30%)',target2:'₹'+(estPrem*1.6).toFixed(0)+' (+60%)',
      stopLoss:'₹'+(estPrem*0.7).toFixed(0)+' (-30%)',
      entryCondition:'Enter when price holds above VWAP for 2 candles',
      exitCondition:'Exit at Target 1 or 3:15 PM',
      slCondition:'Exit if premium drops 30% from entry',
      keyLevel:'₹'+atm,confidence:65,bias:st?.trend==='UP'?'BULLISH':'BEARISH',
      sessionAdvice:'Follow the trend for this session',
      reason:'Supertrend is '+st?.trend+' and MACD is '+(macd?.bull?'bullish':'bearish')+'.'};
  }
}

// ── Signal Card ──────────────────────────────────────────────
function SignalCard({sig, sym, techData, scanTime}) {
  if (!sig) return null;
  const isWait = sig.signal==='WAIT';
  const isCE   = sig.signal==='CE';
  const color  = isWait?'var(--gold)':isCE?'var(--green)':'var(--red)';
  const cColor = sig.confidence>=75?'var(--green)':sig.confidence>=65?'var(--gold)':'var(--red)';

  return (
    <div style={{background:'var(--bg-secondary)',border:`2px solid ${color}44`,borderRadius:16,padding:22,marginBottom:16}}>
      {/* Top */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,flexWrap:'wrap',gap:12}}>
        <div>
          <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:1}}>
            {sym} · {scanTime}
          </div>
          <div style={{fontSize:26,fontWeight:900,color}}>
            {isWait?'⏸ WAIT — No Trade':''}
            {isCE?'📈 BUY CALL':''}
            {!isWait&&!isCE?'📉 BUY PUT':''}
          </div>
          {!isWait&&<div style={{fontSize:16,fontWeight:700,color:'var(--gold)',marginTop:4,fontFamily:'DM Mono'}}>{sig.optionName}</div>}
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:3}}>Confidence</div>
          <div style={{fontSize:32,fontWeight:900,color:cColor,fontFamily:'DM Mono'}}>{sig.confidence}%</div>
          <div style={{fontSize:11,color:sig.bias==='BULLISH'?'var(--green)':sig.bias==='BEARISH'?'var(--red)':'var(--gold)',fontWeight:700}}>{sig.bias}</div>
        </div>
      </div>

      {/* Confidence bar */}
      <div style={{background:'var(--bg-primary)',borderRadius:6,height:8,overflow:'hidden',marginBottom:16}}>
        <div style={{width:sig.confidence+'%',height:'100%',borderRadius:6,background:`linear-gradient(90deg,${color}88,${color})`,transition:'width 1s'}}/>
      </div>

      {!isWait&&(
        <>
          {/* Trade numbers */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
            {[
              ['Entry Premium', sig.entryPremium, 'var(--gold)',  'rgba(201,168,76,0.08)'],
              ['Target 1',      sig.target1,      'var(--green)', 'rgba(34,197,94,0.08)'],
              ['Target 2',      sig.target2,      'var(--green)', 'rgba(34,197,94,0.06)'],
              ['Stop Loss',     sig.stopLoss,     'var(--red)',   'rgba(239,68,68,0.08)'],
            ].map(([l,v,c,bg])=>(
              <div key={l} style={{background:bg,border:`1px solid ${c}22`,borderRadius:10,padding:12}}>
                <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{l}</div>
                <div style={{fontSize:14,fontWeight:800,color:c,fontFamily:'DM Mono'}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Conditions */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
            {[
              ['⏺ Enter When',    sig.entryCondition, 'var(--green)','rgba(34,197,94,0.06)','rgba(34,197,94,0.2)'],
              ['⏹ Exit With Profit',sig.exitCondition,'var(--gold)', 'rgba(201,168,76,0.06)','rgba(201,168,76,0.2)'],
              ['🛑 Cut Loss When', sig.slCondition,   'var(--red)',  'rgba(239,68,68,0.06)', 'rgba(239,68,68,0.2)'],
            ].map(([l,v,c,bg,border])=>(
              <div key={l} style={{background:bg,border:`1px solid ${border}`,borderRadius:10,padding:12}}>
                <div style={{fontSize:9,color:c,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{l}</div>
                <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Key level + reason */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:10,marginBottom:14}}>
            <div style={{background:'rgba(201,168,76,0.08)',border:'1px solid rgba(201,168,76,0.25)',borderRadius:10,padding:14,textAlign:'center'}}>
              <div style={{fontSize:9,color:'var(--gold)',fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>🔑 Key Level</div>
              <div style={{fontSize:20,fontWeight:900,color:'var(--gold)',fontFamily:'DM Mono'}}>{sig.keyLevel}</div>
            </div>
            <div style={{background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.25)',borderRadius:10,padding:14}}>
              <div style={{fontSize:9,color:'#a78bfa',fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>✦ Why This Signal</div>
              <div style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.7}}>{sig.reason}</div>
            </div>
          </div>
        </>
      )}

      {/* Session advice */}
      <div style={{background:'rgba(247,147,26,0.06)',border:'1px solid rgba(247,147,26,0.2)',borderRadius:10,padding:12}}>
        <span style={{fontSize:11,color:'#f7931a',fontWeight:700}}>🕐 Session Advice: </span>
        <span style={{fontSize:12,color:'var(--text-muted)'}}>{sig.sessionAdvice}</span>
      </div>
    </div>
  );
}

// ── Tech Snapshot ────────────────────────────────────────────
function TechRow({label,value,color}) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
      <span style={{fontSize:12,color:'var(--text-muted)'}}>{label}</span>
      <span style={{fontSize:12,fontFamily:'DM Mono',fontWeight:600,color:color||'var(--text-primary)'}}>{value}</span>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────
export default function MarketScanner({ indices }) {
  const [symbols,    setSymbols]    = useState(['NIFTY','BANKNIFTY']);
  const [signals,    setSignals]    = useState({});
  const [techDatas,  setTechDatas]  = useState({});
  const [loading,    setLoading]    = useState({});
  const [scanTimes,  setScanTimes]  = useState({});
  const [autoScan,   setAutoScan]   = useState(false);
  const [interval,   setIntervalV]  = useState(5); // minutes
  const [nextScan,   setNextScan]   = useState('');
  const [scanCount,  setScanCount]  = useState(0);
  const [activeTab,  setActiveTab]  = useState('NIFTY');
  const autoRef    = useRef(null);
  const nextScanTs = useRef(null);

  const TOKENS = {
    NIFTY:     'NSE_INDEX|Nifty 50',
    BANKNIFTY: 'NSE_INDEX|Nifty Bank',
    FINNIFTY:  'NSE_INDEX|Nifty Fin Service',
  };
  const LOT_SIZES = { NIFTY:75, BANKNIFTY:15, FINNIFTY:40 };

  // Live prices
  const livePrice = (sym) => {
    const map = {NIFTY:'NIFTY 50',BANKNIFTY:'BANK NIFTY',FINNIFTY:'FIN NIFTY'};
    return indices?.find(i=>i.label===map[sym])?.price??null;
  };

  // Countdown to next scan
  useEffect(()=>{
    if (!autoScan||!nextScanTs.current) return;
    const id = setInterval(()=>{
      const diff = nextScanTs.current - Date.now();
      if (diff<=0){setNextScan('Scanning...');return;}
      const m=Math.floor(diff/60000), s=Math.floor((diff%60000)/1000);
      setNextScan(m+'m '+s+'s');
    },1000);
    return ()=>clearInterval(id);
  },[autoScan,scanCount]);

  async function scanOne(sym) {
    setLoading(l=>({...l,[sym]:true}));
    try {
      const candles = await fetchUpstoxCandles(TOKENS[sym],'day');
      if (!candles.length) throw new Error('No data');
      const price   = livePrice(sym)??candles[candles.length-1].close;
      const rsi     = calcRSI(candles);
      const macd    = calcMACD(candles);
      const st      = calcST(candles);
      const vwap    = calcVWAP(candles);
      const pivot   = calcPivot(candles);
      const prevChg = candles.length>=2?+((candles[candles.length-1].close-candles[candles.length-2].close)/candles[candles.length-2].close*100).toFixed(2):0;
      const mins    = getMarketMins();
      const {label:sessionLabel} = getSessionLabel(mins);

      const td = {price,rsi,macd,st,vwap,pivot,prevChg,sessionLabel,candles};
      setTechDatas(t=>({...t,[sym]:td}));

      const sig = await getSignal(sym,td);
      setSignals(s=>({...s,[sym]:sig}));
      setScanTimes(t=>({...t,[sym]:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}));
    } catch(e) {
      console.error(sym,e);
    }
    setLoading(l=>({...l,[sym]:false}));
  }

  async function scanAll() {
    setScanCount(c=>c+1);
    await Promise.all(symbols.map(scanOne));
  }

  // Auto scan
  useEffect(()=>{
    if (!autoScan){if(autoRef.current)clearInterval(autoRef.current);return;}
    scanAll();
    const ms = interval*60*1000;
    nextScanTs.current = Date.now()+ms;
    autoRef.current = setInterval(()=>{
      if(!isMarketOpen()){setAutoScan(false);return;}
      scanAll();
      nextScanTs.current = Date.now()+ms;
    },ms);
    return ()=>clearInterval(autoRef.current);
  },[autoScan,interval]);

  const mins = getMarketMins();
  const session = getSessionLabel(mins);
  const td  = techDatas[activeTab];
  const sig = signals[activeTab];

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{background:'linear-gradient(135deg,rgba(34,197,94,0.1),rgba(10,14,26,0))',
        border:'1px solid rgba(34,197,94,0.25)',borderRadius:14,padding:'16px 22px',marginBottom:20,
        display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
        <span style={{fontSize:28}}>🔭</span>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:'var(--text-primary)'}}>Live Market Scanner</div>
          <div style={{fontSize:12,color:'var(--text-muted)'}}>
            Scans NIFTY & BANKNIFTY all day · 9:15 AM to 3:30 PM · Updates every {interval} min
          </div>
        </div>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:16}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>Session</div>
            <div style={{fontSize:13,fontWeight:700,color:session.color}}>{session.label}</div>
          </div>
          {autoScan&&nextScan&&(
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>Next Scan</div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--gold)',fontFamily:'DM Mono'}}>{nextScan}</div>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="panel" style={{marginBottom:16}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
          {/* Symbol toggles */}
          <div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Scan</div>
            <div style={{display:'flex',gap:6}}>
              {['NIFTY','BANKNIFTY','FINNIFTY'].map(s=>(
                <button key={s} onClick={()=>setSymbols(prev=>prev.includes(s)?prev.filter(x=>x!==s):[...prev,s])}
                  style={{padding:'6px 14px',borderRadius:7,border:'1px solid',
                    borderColor:symbols.includes(s)?'var(--gold)':'var(--border)',
                    background:symbols.includes(s)?'rgba(201,168,76,0.15)':'var(--bg-primary)',
                    color:symbols.includes(s)?'var(--gold)':'var(--text-muted)',
                    fontSize:12,fontWeight:700,cursor:'pointer'}}>{s}</button>
              ))}
            </div>
          </div>

          {/* Interval */}
          <div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Auto Scan Every</div>
            <div style={{display:'flex',gap:6}}>
              {[5,10,15,30].map(m=>(
                <button key={m} onClick={()=>setIntervalV(m)}
                  style={{padding:'6px 12px',borderRadius:7,border:'1px solid',
                    borderColor:interval===m?'var(--blue)':'var(--border)',
                    background:interval===m?'rgba(59,130,246,0.15)':'var(--bg-primary)',
                    color:interval===m?'var(--blue)':'var(--text-muted)',
                    fontSize:12,cursor:'pointer'}}>{m}m</button>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div style={{marginLeft:'auto',display:'flex',gap:8}}>
            <button onClick={scanAll}
              disabled={Object.values(loading).some(Boolean)}
              style={{padding:'10px 22px',borderRadius:9,border:'none',
                background:'linear-gradient(135deg,#22c55e,#16a34a)',
                color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',
                display:'flex',alignItems:'center',gap:8,
                opacity:Object.values(loading).some(Boolean)?0.7:1}}>
              {Object.values(loading).some(Boolean)
                ?<><div className="loader" style={{width:14,height:14,borderWidth:2}}/> Scanning...</>
                :'🔍 Scan Now'}
            </button>
            <button onClick={()=>setAutoScan(a=>!a)}
              style={{padding:'10px 22px',borderRadius:9,border:'1px solid',
                borderColor:autoScan?'var(--red)':'var(--green)',
                background:autoScan?'rgba(239,68,68,0.1)':'rgba(34,197,94,0.1)',
                color:autoScan?'var(--red)':'var(--green)',
                fontSize:13,fontWeight:700,cursor:'pointer'}}>
              {autoScan?'⏹ Stop Auto':'▶ Auto Scan'}
            </button>
          </div>
        </div>
      </div>

      {/* Symbol tabs */}
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        {symbols.map(s=>{
          const sg=signals[s];
          const isActive=activeTab===s;
          const c=sg?.signal==='CE'?'var(--green)':sg?.signal==='PE'?'var(--red)':sg?.signal==='WAIT'?'var(--gold)':'var(--text-muted)';
          return(
            <button key={s} onClick={()=>setActiveTab(s)} style={{
              padding:'10px 22px',borderRadius:9,border:'2px solid',
              borderColor:isActive?c:'var(--border)',
              background:isActive?`${c}15`:'var(--bg-secondary)',
              color:isActive?c:'var(--text-muted)',
              fontSize:13,fontWeight:700,cursor:'pointer',
              display:'flex',alignItems:'center',gap:8}}>
              {loading[s]?<div className="loader" style={{width:12,height:12,borderWidth:2}}/>:null}
              {s}
              {sg&&<span style={{fontSize:11,background:`${c}22`,padding:'2px 8px',borderRadius:10,color:c}}>{sg.signal}</span>}
              {sg&&<span style={{fontSize:11,color:c,fontFamily:'DM Mono'}}>{sg.confidence}%</span>}
            </button>
          );
        })}
      </div>

      {/* Main content */}
      {!signals[activeTab]&&!loading[activeTab]&&(
        <div style={{textAlign:'center',padding:'60px 20px'}}>
          <div style={{fontSize:48,marginBottom:16}}>🔭</div>
          <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',marginBottom:8}}>Ready to Scan</div>
          <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:24,maxWidth:400,margin:'0 auto 24px',lineHeight:1.8}}>
            Click <strong>"Scan Now"</strong> to get the current signal, or enable <strong>"Auto Scan"</strong> to get updated signals every {interval} minutes throughout the trading day.
          </div>
        </div>
      )}

      {loading[activeTab]&&(
        <div style={{textAlign:'center',padding:'40px 20px'}}>
          <div className="loader" style={{margin:'0 auto 16px',width:40,height:40}}/>
          <div style={{fontSize:14,color:'var(--text-muted)'}}>Analyzing {activeTab}...</div>
        </div>
      )}

      {signals[activeTab]&&!loading[activeTab]&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:16}}>
          {/* Signal */}
          <div>
            <SignalCard sig={sig} sym={activeTab} techData={td} scanTime={scanTimes[activeTab]??''}/>
          </div>

          {/* Tech snapshot */}
          {td&&(
            <div className="panel">
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>
                📊 Technicals — {activeTab}
              </div>
              <TechRow label="Live Price" value={'₹'+fmt(td.price)} color="var(--text-primary)"/>
              <TechRow label="RSI(14)"    value={td.rsi+(td.rsi<30?' 🟢 Oversold':td.rsi>70?' 🔴 Overbought':' Neutral')}
                color={td.rsi<40?'var(--green)':td.rsi>60?'var(--red)':'var(--gold)'}/>
              <TechRow label="MACD"       value={(td.macd?.bull?'Bullish ▲':'Bearish ▼')+' hist='+td.macd?.hist}
                color={td.macd?.bull?'var(--green)':'var(--red)'}/>
              <TechRow label="Supertrend" value={td.st?.trend} color={td.st?.trend==='UP'?'var(--green)':'var(--red)'}/>
              <TechRow label="VWAP"       value={'₹'+fmt(td.vwap)+' '+(td.price>td.vwap?'↑ Above':'↓ Below')}
                color={td.price>td.vwap?'var(--green)':'var(--red)'}/>
              <TechRow label="Pivot"      value={'₹'+fmt(td.pivot?.pivot)}/>
              <TechRow label="R1 / R2"    value={'₹'+fmt(td.pivot?.r1)+' / ₹'+fmt(td.pivot?.r2)} color="var(--red)"/>
              <TechRow label="S1 / S2"    value={'₹'+fmt(td.pivot?.s1)+' / ₹'+fmt(td.pivot?.s2)} color="var(--green)"/>
              <TechRow label="Prev Day"   value={(td.prevChg>=0?'+':'')+td.prevChg+'%'}
                color={td.prevChg>=0?'var(--green)':'var(--red)'}/>
              <TechRow label="ATM Strike" value={roundStrike(td.price,activeTab==='BANKNIFTY'?100:50)} color="var(--gold)"/>

              {/* Scan history note */}
              <div style={{marginTop:14,padding:10,background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:8}}>
                <div style={{fontSize:10,color:'#a78bfa',fontWeight:700,marginBottom:4}}>Last Scan</div>
                <div style={{fontSize:12,color:'var(--text-muted)'}}>{scanTimes[activeTab]??'Never'}</div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                  {autoScan?'Auto scanning every '+interval+' min':'Manual mode'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}