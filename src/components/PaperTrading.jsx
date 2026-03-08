// src/components/PaperTrading.jsx
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'Market KA Khiladi_paper_trades';
const BALANCE_KEY = 'Market KA Khiladi_paper_balance';
const DEFAULT_BALANCE = 100000;

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '---';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function today() {
  return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function getNow() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function PaperTrading() {
  const [balance,   setBalance]   = useState(() => parseFloat(localStorage.getItem(BALANCE_KEY) || DEFAULT_BALANCE));
  const [trades,    setTrades]    = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  const [form,      setForm]      = useState({ symbol:'NIFTY', strike:'', type:'CE', expiry:'', lots:1, lotSize:75, entryPremium:'', notes:'' });
  const [tab,       setTab]       = useState('open'); // open | closed | stats
  const [showForm,  setShowForm]  = useState(false);
  const [editId,    setEditId]    = useState(null); // trade being exited

  // Persist
  useEffect(()=>{ localStorage.setItem(STORAGE_KEY, JSON.stringify(trades)); }, [trades]);
  useEffect(()=>{ localStorage.setItem(BALANCE_KEY, String(balance)); }, [balance]);

  const LOT_SIZES = { NIFTY:75, BANKNIFTY:15, FINNIFTY:40 };

  function handleFormChange(k,v) {
    setForm(f => {
      const next = {...f,[k]:v};
      if (k==='symbol') next.lotSize = LOT_SIZES[v]||75;
      return next;
    });
  }

  function enterTrade() {
    const entry = parseFloat(form.entryPremium);
    if (!entry||!form.strike||!form.lots) return;
    const cost = entry * form.lots * form.lotSize;
    if (cost > balance) { alert('Insufficient balance! Need ₹'+fmt(cost)+', have ₹'+fmt(balance)); return; }
    const trade = {
      id: Date.now(),
      symbol: form.symbol, strike: form.strike, type: form.type,
      expiry: form.expiry, lots: form.lots, lotSize: form.lotSize,
      entryPremium: entry, entryTime: getNow(), entryDate: today(),
      notes: form.notes, status: 'OPEN',
      optionName: form.symbol+' '+form.strike+' '+form.type,
      cost,
    };
    setTrades(t => [trade, ...t]);
    setBalance(b => b - cost);
    setForm({ symbol:'NIFTY', strike:'', type:'CE', expiry:'', lots:1, lotSize:75, entryPremium:'', notes:'' });
    setShowForm(false);
  }

  function exitTrade(id, exitPremium) {
    const ep = parseFloat(exitPremium);
    if (!ep) return;
    setTrades(t => t.map(tr => {
      if (tr.id !== id) return tr;
      const pnl    = (ep - tr.entryPremium) * tr.lots * tr.lotSize;
      const pnlPct = ((ep - tr.entryPremium) / tr.entryPremium * 100);
      return {...tr, exitPremium: ep, exitTime: getNow(), exitDate: today(), pnl, pnlPct, status:'CLOSED'};
    }));
    const tr = trades.find(t=>t.id===id);
    if (tr) {
      const proceeds = parseFloat(exitPremium) * tr.lots * tr.lotSize;
      setBalance(b => b + proceeds);
    }
    setEditId(null);
  }

  function deleteTrade(id) {
    const tr = trades.find(t=>t.id===id);
    if (tr?.status==='OPEN') setBalance(b=>b+tr.cost); // refund
    setTrades(t=>t.filter(t=>t.id!==id));
  }

  function resetAll() {
    if (!window.confirm('Reset all paper trades and balance?')) return;
    setTrades([]);
    setBalance(DEFAULT_BALANCE);
  }

  const open   = trades.filter(t=>t.status==='OPEN');
  const closed = trades.filter(t=>t.status==='CLOSED');
  const totalPnl   = closed.reduce((a,t)=>a+(t.pnl||0),0);
  const winTrades  = closed.filter(t=>t.pnl>0);
  const loseTrades = closed.filter(t=>t.pnl<=0);
  const winRate    = closed.length ? Math.round(winTrades.length/closed.length*100) : 0;
  const avgWin     = winTrades.length  ? winTrades.reduce((a,t)=>a+t.pnl,0)/winTrades.length   : 0;
  const avgLoss    = loseTrades.length ? loseTrades.reduce((a,t)=>a+t.pnl,0)/loseTrades.length  : 0;
  const bestTrade  = closed.length ? closed.reduce((a,b)=>a.pnl>b.pnl?a:b) : null;
  const worstTrade = closed.length ? closed.reduce((a,b)=>a.pnl<b.pnl?a:b) : null;
  const totalInvested = DEFAULT_BALANCE;
  const currentValue  = balance + open.reduce((a,t)=>a+t.cost,0);

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{background:'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(10,14,26,0))',
        border:'1px solid rgba(99,102,241,0.25)',borderRadius:14,padding:'16px 22px',marginBottom:20,
        display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
        <span style={{fontSize:28}}>📝</span>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:'var(--text-primary)'}}>Paper Trading</div>
          <div style={{fontSize:12,color:'var(--text-muted)'}}>Practice with virtual ₹1,00,000 · No real money · Track your performance</div>
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:20,alignItems:'center'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>Virtual Balance</div>
            <div style={{fontSize:20,fontWeight:900,color:'var(--gold)',fontFamily:'DM Mono'}}>₹{fmt(balance)}</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>Total P&L</div>
            <div style={{fontSize:20,fontWeight:900,color:totalPnl>=0?'var(--green)':'var(--red)',fontFamily:'DM Mono'}}>
              {totalPnl>=0?'+':''}₹{fmt(Math.abs(totalPnl))}
            </div>
          </div>
          <button onClick={()=>setShowForm(s=>!s)}
            style={{padding:'10px 20px',borderRadius:9,border:'none',
              background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
            + New Trade
          </button>
          <button onClick={resetAll}
            style={{padding:'10px 16px',borderRadius:9,border:'1px solid var(--border)',
              background:'var(--bg-secondary)',color:'var(--text-muted)',fontSize:12,cursor:'pointer'}}>
            Reset
          </button>
        </div>
      </div>

      {/* New trade form */}
      {showForm && (
        <div className="panel" style={{marginBottom:16,border:'1px solid rgba(99,102,241,0.3)'}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:16}}>📋 Enter New Paper Trade</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:14}}>
            {/* Symbol */}
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>Index</div>
              <select value={form.symbol} onChange={e=>handleFormChange('symbol',e.target.value)} className="ai-select" style={{width:'100%'}}>
                <option>NIFTY</option><option>BANKNIFTY</option><option>FINNIFTY</option>
              </select>
            </div>
            {/* Strike */}
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>Strike</div>
              <input type="number" value={form.strike} onChange={e=>handleFormChange('strike',e.target.value)}
                placeholder="e.g. 23200"
                style={{width:'100%',padding:'8px 10px',background:'var(--bg-primary)',border:'1px solid var(--border)',
                  borderRadius:8,color:'var(--text-primary)',fontSize:13,fontFamily:'DM Mono',outline:'none',boxSizing:'border-box'}}/>
            </div>
            {/* Type */}
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>Type</div>
              <div style={{display:'flex',borderRadius:8,overflow:'hidden',border:'1px solid var(--border)'}}>
                {['CE','PE'].map(t=>(
                  <button key={t} onClick={()=>handleFormChange('type',t)} style={{
                    flex:1,padding:'8px',border:'none',
                    background:form.type===t?(t==='CE'?'var(--green)':'var(--red)'):'var(--bg-primary)',
                    color:form.type===t?'#fff':'var(--text-muted)',fontSize:13,fontWeight:700,cursor:'pointer'}}>{t}</button>
                ))}
              </div>
            </div>
            {/* Expiry */}
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>Expiry</div>
              <input type="text" value={form.expiry} onChange={e=>handleFormChange('expiry',e.target.value)}
                placeholder="e.g. 2025-03-27"
                style={{width:'100%',padding:'8px 10px',background:'var(--bg-primary)',border:'1px solid var(--border)',
                  borderRadius:8,color:'var(--text-primary)',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
            </div>
            {/* Entry premium */}
            <div>
              <div style={{fontSize:11,color:'var(--gold)',marginBottom:6,fontWeight:600}}>Entry Premium ₹</div>
              <input type="number" step="0.5" value={form.entryPremium} onChange={e=>handleFormChange('entryPremium',e.target.value)}
                placeholder="₹0"
                style={{width:'100%',padding:'8px 10px',background:'var(--bg-primary)',border:'1px solid rgba(201,168,76,0.4)',
                  borderRadius:8,color:'var(--text-primary)',fontSize:14,fontFamily:'DM Mono',outline:'none',boxSizing:'border-box'}}/>
            </div>
            {/* Lots */}
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>Lots</div>
              <input type="number" min={1} value={form.lots} onChange={e=>handleFormChange('lots',parseInt(e.target.value)||1)}
                style={{width:'100%',padding:'8px 10px',background:'var(--bg-primary)',border:'1px solid var(--border)',
                  borderRadius:8,color:'var(--text-primary)',fontSize:14,fontFamily:'DM Mono',outline:'none',boxSizing:'border-box'}}/>
            </div>
          </div>
          {/* Notes */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>Notes (why are you taking this trade?)</div>
            <input type="text" value={form.notes} onChange={e=>handleFormChange('notes',e.target.value)}
              placeholder="e.g. AI signal 78%, MACD bullish, entering at VWAP bounce"
              style={{width:'100%',padding:'10px 12px',background:'var(--bg-primary)',border:'1px solid var(--border)',
                borderRadius:8,color:'var(--text-primary)',fontSize:13,outline:'none',boxSizing:'border-box'}}/>
          </div>
          {/* Cost preview */}
          {form.entryPremium && (
            <div style={{marginBottom:14,padding:'8px 12px',background:'rgba(201,168,76,0.08)',border:'1px solid rgba(201,168,76,0.3)',borderRadius:8}}>
              <span style={{fontSize:12,color:'var(--text-muted)'}}>Cost: </span>
              <span style={{fontSize:14,fontWeight:700,color:'var(--gold)',fontFamily:'DM Mono'}}>
                ₹{fmt(parseFloat(form.entryPremium||0)*form.lots*form.lotSize)}
              </span>
              <span style={{fontSize:11,color:'var(--text-muted)',marginLeft:8}}>
                ({form.lots} lot × {form.lotSize} qty × ₹{form.entryPremium})
              </span>
            </div>
          )}
          <div style={{display:'flex',gap:10}}>
            <button onClick={enterTrade}
              style={{padding:'11px 24px',borderRadius:9,border:'none',background:'var(--green)',
                color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>✅ Enter Trade</button>
            <button onClick={()=>setShowForm(false)}
              style={{padding:'11px 18px',borderRadius:9,border:'1px solid var(--border)',background:'var(--bg-secondary)',
                color:'var(--text-muted)',fontSize:13,cursor:'pointer'}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="nav-tabs" style={{marginBottom:16}}>
        {[['open','📂 Open ('+open.length+')'],['closed','✅ Closed ('+closed.length+')'],['stats','📊 Stats']].map(([k,l])=>(
          <button key={k} className={`nav-tab ${tab===k?'active':''}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      {/* Open trades */}
      {tab==='open' && (
        <div>
          {open.length===0?(
            <div style={{textAlign:'center',padding:'50px 20px'}}>
              <div style={{fontSize:40,marginBottom:12}}>📝</div>
              <div style={{fontSize:15,fontWeight:700,color:'var(--text-primary)',marginBottom:6}}>No Open Trades</div>
              <div style={{fontSize:13,color:'var(--text-muted)'}}>Click "+ New Trade" to enter a paper trade</div>
            </div>
          ):(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12}}>
              {open.map(tr=>{
                const [exitVal, setExitVal] = [editId===tr.id?'':undefined, undefined];
                return (
                  <div key={tr.id} style={{background:'var(--bg-secondary)',border:'1px solid rgba(201,168,76,0.3)',borderRadius:14,padding:16}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
                      <div>
                        <div style={{fontSize:15,fontWeight:800,color:'var(--gold)'}}>{tr.optionName}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>{tr.entryDate} · {tr.entryTime} · {tr.lots} lot</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>Entry</div>
                        <div style={{fontSize:18,fontWeight:800,color:'var(--gold)',fontFamily:'DM Mono'}}>₹{fmt(tr.entryPremium)}</div>
                      </div>
                    </div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:12,padding:'6px 10px',
                      background:'var(--bg-primary)',borderRadius:6}}>
                      {tr.notes||'No notes'}
                    </div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:10}}>
                      Capital locked: <strong style={{color:'var(--red)',fontFamily:'DM Mono'}}>₹{fmt(tr.cost)}</strong>
                    </div>
                    {/* Exit form */}
                    {editId===tr.id?(
                      <ExitForm onExit={ep=>exitTrade(tr.id,ep)} onCancel={()=>setEditId(null)} entryPremium={tr.entryPremium}/>
                    ):(
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>setEditId(tr.id)}
                          style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'var(--green)',
                            color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>📤 Exit Trade</button>
                        <button onClick={()=>deleteTrade(tr.id)}
                          style={{padding:'9px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-primary)',
                            color:'var(--text-muted)',fontSize:12,cursor:'pointer'}}>🗑</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Closed trades */}
      {tab==='closed' && (
        <div>
          {closed.length===0?(
            <div style={{textAlign:'center',padding:'50px 20px'}}>
              <div style={{fontSize:40,marginBottom:12}}>✅</div>
              <div style={{fontSize:15,fontWeight:700,color:'var(--text-primary)',marginBottom:6}}>No Closed Trades Yet</div>
            </div>
          ):(
            <table className="data-table">
              <thead>
                <tr><th>Option</th><th>Entry</th><th>Exit</th><th>Lots</th><th>P&L</th><th>%</th><th>Date</th></tr>
              </thead>
              <tbody>
                {closed.map(tr=>(
                  <tr key={tr.id}>
                    <td style={{fontWeight:700}}>{tr.optionName}</td>
                    <td style={{fontFamily:'DM Mono',color:'var(--gold)'}}>₹{fmt(tr.entryPremium)}</td>
                    <td style={{fontFamily:'DM Mono',color:tr.pnl>=0?'var(--green)':'var(--red)'}}>₹{fmt(tr.exitPremium)}</td>
                    <td style={{fontFamily:'DM Mono'}}>{tr.lots}</td>
                    <td style={{fontFamily:'DM Mono',fontWeight:700,color:tr.pnl>=0?'var(--green)':'var(--red)'}}>
                      {tr.pnl>=0?'+':''}₹{fmt(Math.abs(tr.pnl))}
                    </td>
                    <td style={{fontFamily:'DM Mono',color:tr.pnlPct>=0?'var(--green)':'var(--red)'}}>
                      {tr.pnlPct>=0?'+':''}{tr.pnlPct?.toFixed(1)}%
                    </td>
                    <td style={{fontSize:11,color:'var(--text-muted)'}}>{tr.exitDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Stats */}
      {tab==='stats' && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12,marginBottom:20}}>
            {[
              ['Total Trades',    closed.length,           'var(--text-primary)'],
              ['Win Rate',        winRate+'%',             winRate>=50?'var(--green)':'var(--red)'],
              ['Total P&L',       (totalPnl>=0?'+':'')+'₹'+fmt(Math.abs(totalPnl)), totalPnl>=0?'var(--green)':'var(--red)'],
              ['Avg Win',         '+₹'+fmt(avgWin),        'var(--green)'],
              ['Avg Loss',        '₹'+fmt(Math.abs(avgLoss)),'var(--red)'],
              ['Risk/Reward',     avgLoss?'1:'+(Math.abs(avgWin/avgLoss)).toFixed(1):'---','var(--gold)'],
              ['Current Balance', '₹'+fmt(balance),        'var(--gold)'],
              ['Open Trades',     open.length,             'var(--text-primary)'],
            ].map(([l,v,c])=>(
              <div key={l} style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:12,padding:16,textAlign:'center'}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>{l}</div>
                <div style={{fontSize:22,fontWeight:800,color:c,fontFamily:'DM Mono'}}>{v}</div>
              </div>
            ))}
          </div>

          {bestTrade&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:12,padding:16}}>
                <div style={{fontSize:11,color:'var(--green)',fontWeight:700,marginBottom:8}}>🏆 Best Trade</div>
                <div style={{fontSize:16,fontWeight:800,color:'var(--green)'}}>{bestTrade.optionName}</div>
                <div style={{fontSize:20,fontWeight:900,color:'var(--green)',fontFamily:'DM Mono'}}>+₹{fmt(bestTrade.pnl)}</div>
                <div style={{fontSize:12,color:'var(--text-muted)'}}>{bestTrade.entryDate}</div>
              </div>
              <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:12,padding:16}}>
                <div style={{fontSize:11,color:'var(--red)',fontWeight:700,marginBottom:8}}>📉 Worst Trade</div>
                <div style={{fontSize:16,fontWeight:800,color:'var(--red)'}}>{worstTrade.optionName}</div>
                <div style={{fontSize:20,fontWeight:900,color:'var(--red)',fontFamily:'DM Mono'}}>₹{fmt(worstTrade.pnl)}</div>
                <div style={{fontSize:12,color:'var(--text-muted)'}}>{worstTrade.entryDate}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExitForm({ onExit, onCancel, entryPremium }) {
  const [val, setVal] = useState('');
  const ep = parseFloat(val);
  const pnlPct = ep ? ((ep-entryPremium)/entryPremium*100).toFixed(1) : null;
  return (
    <div style={{background:'var(--bg-primary)',borderRadius:10,padding:12}}>
      <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>Enter exit premium:</div>
      <div style={{display:'flex',gap:8,marginBottom:8}}>
        <input type="number" step="0.5" value={val} onChange={e=>setVal(e.target.value)}
          placeholder="Exit ₹" autoFocus
          style={{flex:1,padding:'8px 10px',background:'var(--bg-secondary)',border:'1px solid var(--border)',
            borderRadius:7,color:'var(--text-primary)',fontSize:14,fontFamily:'DM Mono',outline:'none'}}/>
        <button onClick={()=>onExit(val)} disabled={!val}
          style={{padding:'8px 16px',borderRadius:7,border:'none',background:'var(--green)',
            color:'#fff',fontWeight:700,cursor:'pointer',fontSize:12}}>Exit</button>
        <button onClick={onCancel}
          style={{padding:'8px 12px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',
            color:'var(--text-muted)',cursor:'pointer',fontSize:12}}>✕</button>
      </div>
      {pnlPct&&(
        <div style={{fontSize:12,color:ep>=entryPremium?'var(--green)':'var(--red)',fontWeight:600}}>
          {ep>=entryPremium?'Profit':'Loss'}: {ep>=entryPremium?'+':''}{pnlPct}%
        </div>
      )}
    </div>
  );
}