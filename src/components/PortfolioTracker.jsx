// src/components/PortfolioTracker.jsx
import { useState, useEffect, useRef } from 'react';

const PORT_KEY = 'Market KA Khiladi_portfolio';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '---';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function today() {
  return new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}

async function fetchLTP(instrumentKey) {
  try {
    const res  = await fetch(`http://localhost:5000/api/upstox/quotes?keys=${encodeURIComponent(instrumentKey)}`);
    const data = await res.json();
    if (data.status==='success'&&data.data) {
      const q = Object.values(data.data)[0];
      return q?.last_price??null;
    }
    return null;
  } catch { return null; }
}

export default function PortfolioTracker() {
  const [positions, setPositions] = useState(()=>JSON.parse(localStorage.getItem(PORT_KEY)||'[]'));
  const [showAdd,   setShowAdd]   = useState(false);
  const [refreshing,setRefreshing]= useState(false);
  const [tab,       setTab]       = useState('positions');
  const [form,      setForm]      = useState({
    symbol:'NIFTY',strike:'',type:'CE',expiry:'',lots:1,lotSize:75,
    entryPremium:'',instrumentKey:'',notes:''
  });
  const LOT_SIZES = {NIFTY:75,BANKNIFTY:15,FINNIFTY:40};

  useEffect(()=>{ localStorage.setItem(PORT_KEY,JSON.stringify(positions)); },[positions]);

  function fc(k,v){setForm(f=>({...f,[k]:v,...(k==='symbol'?{lotSize:LOT_SIZES[v]||75}:{})}));}

  function addPosition() {
    if (!form.strike||!form.entryPremium) return;
    const pos = {
      id: Date.now(),
      symbol:form.symbol, strike:form.strike, type:form.type,
      expiry:form.expiry, lots:parseInt(form.lots), lotSize:parseInt(form.lotSize),
      entryPremium:parseFloat(form.entryPremium),
      instrumentKey:form.instrumentKey,
      notes:form.notes,
      entryDate:today(),
      currentLTP:null, pnl:null, pnlPct:null, status:'OPEN'
    };
    setPositions(p=>[pos,...p]);
    setForm({symbol:'NIFTY',strike:'',type:'CE',expiry:'',lots:1,lotSize:75,entryPremium:'',instrumentKey:'',notes:''});
    setShowAdd(false);
  }

  async function refreshPrices() {
    setRefreshing(true);
    const updated = await Promise.all(positions.filter(p=>p.status==='OPEN').map(async pos => {
      if (!pos.instrumentKey) return pos;
      const ltp = await fetchLTP(pos.instrumentKey);
      if (ltp==null) return pos;
      const pnl    = (ltp - pos.entryPremium)*pos.lots*pos.lotSize;
      const pnlPct = ((ltp - pos.entryPremium)/pos.entryPremium*100);
      return {...pos, currentLTP:ltp, pnl, pnlPct};
    }));
    setPositions(p => p.map(pos => {
      const u = updated.find(x=>x.id===pos.id);
      return u||pos;
    }));
    setRefreshing(false);
  }

  function closePosition(id, exitPremium) {
    const ep = parseFloat(exitPremium);
    if (!ep) return;
    setPositions(p => p.map(pos => {
      if (pos.id!==id) return pos;
      const pnl    = (ep - pos.entryPremium)*pos.lots*pos.lotSize;
      const pnlPct = ((ep - pos.entryPremium)/pos.entryPremium*100);
      return {...pos,exitPremium:ep,exitDate:today(),pnl,pnlPct,status:'CLOSED',currentLTP:ep};
    }));
  }

  function removePosition(id) { setPositions(p=>p.filter(x=>x.id!==id)); }

  const open   = positions.filter(p=>p.status==='OPEN');
  const closed = positions.filter(p=>p.status==='CLOSED');
  const totalPnl    = positions.reduce((a,p)=>a+(p.pnl||0),0);
  const openPnl     = open.reduce((a,p)=>a+(p.pnl||0),0);
  const realizedPnl = closed.reduce((a,p)=>a+(p.pnl||0),0);
  const totalCapital= positions.reduce((a,p)=>a+(p.entryPremium*p.lots*p.lotSize),0);

  const [exitInputs, setExitInputs] = useState({});

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{background:'linear-gradient(135deg,rgba(59,130,246,0.1),rgba(10,14,26,0))',
        border:'1px solid rgba(59,130,246,0.25)',borderRadius:14,padding:'16px 22px',marginBottom:20,
        display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
        <span style={{fontSize:28}}>💼</span>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:'var(--text-primary)'}}>Portfolio Tracker</div>
          <div style={{fontSize:12,color:'var(--text-muted)'}}>Track all open option positions · Real-time P&L · Overall performance</div>
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:16,alignItems:'center'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>Open P&L</div>
            <div style={{fontSize:18,fontWeight:900,color:openPnl>=0?'var(--green)':'var(--red)',fontFamily:'DM Mono'}}>
              {openPnl>=0?'+':''}₹{fmt(Math.abs(openPnl),0)}
            </div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>Realized</div>
            <div style={{fontSize:18,fontWeight:900,color:realizedPnl>=0?'var(--green)':'var(--red)',fontFamily:'DM Mono'}}>
              {realizedPnl>=0?'+':''}₹{fmt(Math.abs(realizedPnl),0)}
            </div>
          </div>
          <button onClick={refreshPrices} disabled={refreshing||!open.some(p=>p.instrumentKey)}
            style={{padding:'9px 18px',borderRadius:8,border:'none',
              background:'rgba(59,130,246,0.2)',color:'var(--blue)',fontSize:12,fontWeight:700,cursor:'pointer',
              display:'flex',alignItems:'center',gap:6}}>
            {refreshing?<><div className="loader" style={{width:12,height:12,borderWidth:2}}/> Refreshing...</>:'🔄 Refresh LTP'}
          </button>
          <button onClick={()=>setShowAdd(s=>!s)}
            style={{padding:'9px 18px',borderRadius:8,border:'none',
              background:'linear-gradient(135deg,#3b82f6,#1d4ed8)',
              color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Add Position</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16}}>
        {[
          ['Open Positions',  open.length,                      'var(--blue)'],
          ['Total P&L',       (totalPnl>=0?'+':'')+'₹'+fmt(Math.abs(totalPnl),0), totalPnl>=0?'var(--green)':'var(--red)'],
          ['Capital Deployed','₹'+fmt(totalCapital,0),          'var(--gold)'],
          ['Closed Today',    closed.filter(p=>p.exitDate===today()).length,'var(--text-primary)'],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:12,padding:14,textAlign:'center'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:4}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:'DM Mono'}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd&&(
        <div className="panel" style={{marginBottom:16,border:'1px solid rgba(59,130,246,0.3)'}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:16}}>➕ Add Open Position</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10,marginBottom:12}}>
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Index</div>
              <select value={form.symbol} onChange={e=>fc('symbol',e.target.value)} className="ai-select" style={{width:'100%'}}>
                <option>NIFTY</option><option>BANKNIFTY</option><option>FINNIFTY</option>
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Strike</div>
              <input type="number" value={form.strike} onChange={e=>fc('strike',e.target.value)} placeholder="23200"
                style={{width:'100%',padding:'8px',background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-primary)',fontSize:13,fontFamily:'DM Mono',outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Type</div>
              <div style={{display:'flex',borderRadius:8,overflow:'hidden',border:'1px solid var(--border)'}}>
                {['CE','PE'].map(t=>(
                  <button key={t} onClick={()=>fc('type',t)} style={{flex:1,padding:'8px',border:'none',
                    background:form.type===t?(t==='CE'?'var(--green)':'var(--red)'):'var(--bg-primary)',
                    color:form.type===t?'#fff':'var(--text-muted)',fontSize:12,fontWeight:700,cursor:'pointer'}}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Expiry</div>
              <input type="text" value={form.expiry} onChange={e=>fc('expiry',e.target.value)} placeholder="2025-03-27"
                style={{width:'100%',padding:'8px',background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-primary)',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--gold)',marginBottom:5,fontWeight:600}}>Entry ₹</div>
              <input type="number" step="0.5" value={form.entryPremium} onChange={e=>fc('entryPremium',e.target.value)} placeholder="₹0"
                style={{width:'100%',padding:'8px',background:'var(--bg-primary)',border:'1px solid rgba(201,168,76,0.4)',borderRadius:8,color:'var(--text-primary)',fontSize:14,fontFamily:'DM Mono',outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Lots</div>
              <input type="number" min={1} value={form.lots} onChange={e=>fc('lots',e.target.value)}
                style={{width:'100%',padding:'8px',background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-primary)',fontSize:14,fontFamily:'DM Mono',outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div style={{gridColumn:'1/-1'}}>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Instrument Key (optional, for live LTP)</div>
              <input type="text" value={form.instrumentKey} onChange={e=>fc('instrumentKey',e.target.value)}
                placeholder="e.g. NSE_FO|NIFTY25MAR23200CE (from Upstox)"
                style={{width:'100%',padding:'8px',background:'var(--bg-primary)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-primary)',fontSize:11,fontFamily:'DM Mono',outline:'none',boxSizing:'border-box'}}/>
            </div>
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={addPosition}
              style={{padding:'10px 22px',borderRadius:8,border:'none',background:'var(--blue)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
              ✅ Add Position
            </button>
            <button onClick={()=>setShowAdd(false)}
              style={{padding:'10px 16px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-secondary)',color:'var(--text-muted)',fontSize:12,cursor:'pointer'}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="nav-tabs" style={{marginBottom:16}}>
        {[['positions','📂 Open ('+open.length+')'],['closed','✅ Closed ('+closed.length+')']].map(([k,l])=>(
          <button key={k} className={`nav-tab ${tab===k?'active':''}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      {/* Open positions */}
      {tab==='positions'&&(
        open.length===0?(
          <div style={{textAlign:'center',padding:'50px 20px'}}>
            <div style={{fontSize:40,marginBottom:12}}>💼</div>
            <div style={{fontSize:15,fontWeight:700,color:'var(--text-primary)',marginBottom:6}}>No Open Positions</div>
            <div style={{fontSize:13,color:'var(--text-muted)'}}>Add your current positions to track them here</div>
          </div>
        ):(
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {open.map(pos=>{
              const exitVal = exitInputs[pos.id]||'';
              const hasLTP  = pos.currentLTP!=null;
              const pnlColor= !hasLTP?'var(--text-muted)':pos.pnl>=0?'var(--green)':'var(--red)';
              return(
                <div key={pos.id} style={{background:'var(--bg-secondary)',
                  border:`1px solid ${!hasLTP?'var(--border)':pos.pnl>=0?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}`,
                  borderRadius:14,padding:18}}>
                  <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
                    <div>
                      <div style={{fontSize:16,fontWeight:800,color:'var(--text-primary)',marginBottom:4}}>
                        {pos.symbol} {pos.strike} {pos.type}
                        <span style={{fontSize:12,color:'var(--text-muted)',fontWeight:400,marginLeft:8}}>{pos.expiry}</span>
                      </div>
                      <div style={{fontSize:12,color:'var(--text-muted)'}}>
                        Entry ₹{fmt(pos.entryPremium)} · {pos.lots} lot × {pos.lotSize} qty · Added {pos.entryDate}
                      </div>
                      {pos.notes&&<div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{pos.notes}</div>}
                    </div>

                    <div style={{display:'flex',gap:16,alignItems:'center'}}>
                      {/* LTP */}
                      <div style={{textAlign:'center'}}>
                        <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>Current LTP</div>
                        <div style={{fontSize:20,fontWeight:800,fontFamily:'DM Mono',color:pnlColor}}>
                          {hasLTP?'₹'+fmt(pos.currentLTP):'---'}
                        </div>
                      </div>
                      {/* P&L */}
                      <div style={{textAlign:'center'}}>
                        <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>P&L</div>
                        <div style={{fontSize:20,fontWeight:800,fontFamily:'DM Mono',color:pnlColor}}>
                          {hasLTP?(pos.pnl>=0?'+':'')+'₹'+fmt(Math.abs(pos.pnl),0):'---'}
                        </div>
                        {hasLTP&&<div style={{fontSize:11,color:pnlColor}}>{pos.pnlPct?.toFixed(1)}%</div>}
                      </div>
                    </div>
                  </div>

                  {/* Exit row */}
                  <div style={{marginTop:12,display:'flex',gap:8,alignItems:'center'}}>
                    <input type="number" step="0.5" value={exitVal}
                      onChange={e=>setExitInputs(x=>({...x,[pos.id]:e.target.value}))}
                      placeholder="Exit premium ₹"
                      style={{width:150,padding:'7px 10px',background:'var(--bg-primary)',border:'1px solid var(--border)',
                        borderRadius:7,color:'var(--text-primary)',fontSize:13,fontFamily:'DM Mono',outline:'none'}}/>
                    <button onClick={()=>{closePosition(pos.id,exitVal);setExitInputs(x=>({...x,[pos.id]:''}));}}
                      disabled={!exitVal}
                      style={{padding:'7px 16px',borderRadius:7,border:'none',
                        background:exitVal?'var(--green)':'var(--bg-primary)',
                        color:exitVal?'#fff':'var(--text-muted)',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                      Close Position
                    </button>
                    <button onClick={()=>removePosition(pos.id)}
                      style={{padding:'7px 12px',borderRadius:7,border:'1px solid var(--border)',
                        background:'transparent',color:'var(--text-muted)',fontSize:12,cursor:'pointer'}}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Closed positions */}
      {tab==='closed'&&(
        closed.length===0?(
          <div style={{textAlign:'center',padding:'50px 20px',color:'var(--text-muted)'}}>No closed positions</div>
        ):(
          <table className="data-table">
            <thead>
              <tr><th>Position</th><th>Entry</th><th>Exit</th><th>Lots</th><th>P&L</th><th>%</th><th>Date</th></tr>
            </thead>
            <tbody>
              {closed.map(pos=>(
                <tr key={pos.id}>
                  <td style={{fontWeight:700}}>{pos.symbol} {pos.strike} {pos.type}</td>
                  <td style={{fontFamily:'DM Mono',color:'var(--gold)'}}>₹{fmt(pos.entryPremium)}</td>
                  <td style={{fontFamily:'DM Mono',color:pos.pnl>=0?'var(--green)':'var(--red)'}}>₹{fmt(pos.exitPremium)}</td>
                  <td style={{fontFamily:'DM Mono'}}>{pos.lots}</td>
                  <td style={{fontFamily:'DM Mono',fontWeight:700,color:pos.pnl>=0?'var(--green)':'var(--red)'}}>
                    {pos.pnl>=0?'+':''}₹{fmt(Math.abs(pos.pnl),0)}
                  </td>
                  <td style={{color:pos.pnlPct>=0?'var(--green)':'var(--red)'}}>
                    {pos.pnlPct?.toFixed(1)}%
                  </td>
                  <td style={{fontSize:11,color:'var(--text-muted)'}}>{pos.exitDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}