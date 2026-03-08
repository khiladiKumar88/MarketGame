// src/components/TradeJournal.jsx
import { useState, useEffect } from 'react';

const JOURNAL_KEY = 'Market KA Khiladi_journal';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '---';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}

const EMOTIONS = ['😊 Confident','😰 Anxious','😤 Greedy','😱 Fearful','😐 Neutral','🎯 Focused'];
const MISTAKES  = ['Entered too early','Entered too late','Ignored SL','Held too long','Exited too early','Overtraded','Traded against trend','No clear reason'];

export default function TradeJournal() {
  const [entries, setEntries] = useState(() => JSON.parse(localStorage.getItem(JOURNAL_KEY)||'[]'));
  const [tab,     setTab]     = useState('add');
  const [form,    setForm]    = useState({
    date: new Date().toISOString().split('T')[0],
    symbol:'NIFTY', type:'CE', strike:'', expiry:'',
    entry:'', exit:'', lots:1, lotSize:75,
    result:'WIN', pnl:'', pnlPct:'',
    emotion:'😊 Confident', mistake:'', lesson:'', notes:'', setup:'',
    followed_plan: true, used_sl: true,
  });

  useEffect(()=>{ localStorage.setItem(JOURNAL_KEY,JSON.stringify(entries)); },[entries]);

  const LOT_SIZES = {NIFTY:75,BANKNIFTY:15,FINNIFTY:40};

  function fc(k,v) { setForm(f=>({...f,[k]:v, ...(k==='symbol'?{lotSize:LOT_SIZES[v]||75}:{})})); }

  function calcPnl() {
    const e=parseFloat(form.entry), x=parseFloat(form.exit), l=parseInt(form.lots), ls=parseInt(form.lotSize);
    if (!e||!x||!l||!ls) return;
    const pnl = (x-e)*l*ls;
    const pct = ((x-e)/e*100).toFixed(1);
    fc('pnl', pnl.toFixed(0));
    fc('pnlPct', pct);
    fc('result', pnl>=0?'WIN':'LOSS');
  }

  function addEntry() {
    if (!form.date||!form.symbol||!form.entry) return;
    setEntries(e=>[{...form,id:Date.now()},...e]);
    setForm(f=>({...f,strike:'',entry:'',exit:'',pnl:'',pnlPct:'',lesson:'',notes:'',setup:'',emotion:'😊 Confident',mistake:'',followed_plan:true,used_sl:true}));
    setTab('list');
  }

  function deleteEntry(id) { setEntries(e=>e.filter(x=>x.id!==id)); }

  // Stats
  const wins   = entries.filter(e=>e.result==='WIN');
  const losses = entries.filter(e=>e.result==='LOSS');
  const totalPnl = entries.reduce((a,e)=>a+parseFloat(e.pnl||0),0);
  const winRate  = entries.length?Math.round(wins.length/entries.length*100):0;
  const avgWin   = wins.length?wins.reduce((a,e)=>a+parseFloat(e.pnl),0)/wins.length:0;
  const avgLoss  = losses.length?losses.reduce((a,e)=>a+parseFloat(e.pnl),0)/losses.length:0;

  // Most common mistakes
  const mistakeCount = {};
  entries.forEach(e=>{if(e.mistake){mistakeCount[e.mistake]=(mistakeCount[e.mistake]||0)+1;}});
  const topMistakes = Object.entries(mistakeCount).sort((a,b)=>b[1]-a[1]).slice(0,3);

  // Followed plan / used SL stats
  const followedPlan = entries.filter(e=>e.followed_plan).length;
  const usedSL       = entries.filter(e=>e.used_sl).length;

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{background:'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(10,14,26,0))',
        border:'1px solid rgba(139,92,246,0.25)',borderRadius:14,padding:'16px 22px',marginBottom:20,
        display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
        <span style={{fontSize:28}}>📓</span>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:'var(--text-primary)'}}>Trade Journal</div>
          <div style={{fontSize:12,color:'var(--text-muted)'}}>Log every trade · Track patterns · Improve your win rate</div>
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:20}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>Win Rate</div>
            <div style={{fontSize:20,fontWeight:900,color:winRate>=50?'var(--green)':'var(--red)',fontFamily:'DM Mono'}}>{winRate}%</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>Total P&L</div>
            <div style={{fontSize:20,fontWeight:900,color:totalPnl>=0?'var(--green)':'var(--red)',fontFamily:'DM Mono'}}>
              {totalPnl>=0?'+':''}₹{fmt(Math.abs(totalPnl),0)}
            </div>
          </div>
        </div>
      </div>

      <div className="nav-tabs" style={{marginBottom:16}}>
        {[['add','➕ Log Trade'],['list','📋 All Trades ('+entries.length+')'],['analysis','📊 Analysis']].map(([k,l])=>(
          <button key={k} className={`nav-tab ${tab===k?'active':''}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      {/* Add trade */}
      {tab==='add'&&(
        <div className="panel">
          <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:18}}>📋 Log Today's Trade</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:14}}>
            {/* Date */}
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Date</div>
              <input type="date" value={form.date} onChange={e=>fc('date',e.target.value)}
                style={{width:'100%',padding:'8px 10px',background:'var(--bg-primary)',border:'1px solid var(--border)',
                  borderRadius:8,color:'var(--text-primary)',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
            </div>
            {/* Symbol */}
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Index</div>
              <select value={form.symbol} onChange={e=>fc('symbol',e.target.value)} className="ai-select" style={{width:'100%'}}>
                <option>NIFTY</option><option>BANKNIFTY</option><option>FINNIFTY</option>
              </select>
            </div>
            {/* Strike */}
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Strike</div>
              <input type="number" value={form.strike} onChange={e=>fc('strike',e.target.value)} placeholder="23200"
                style={{width:'100%',padding:'8px 10px',background:'var(--bg-primary)',border:'1px solid var(--border)',
                  borderRadius:8,color:'var(--text-primary)',fontSize:13,fontFamily:'DM Mono',outline:'none',boxSizing:'border-box'}}/>
            </div>
            {/* Type */}
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
            {/* Entry */}
            <div>
              <div style={{fontSize:11,color:'var(--gold)',marginBottom:5,fontWeight:600}}>Entry Premium ₹</div>
              <input type="number" step="0.5" value={form.entry} onChange={e=>fc('entry',e.target.value)} onBlur={calcPnl} placeholder="₹0"
                style={{width:'100%',padding:'8px 10px',background:'var(--bg-primary)',border:'1px solid rgba(201,168,76,0.4)',
                  borderRadius:8,color:'var(--text-primary)',fontSize:14,fontFamily:'DM Mono',outline:'none',boxSizing:'border-box'}}/>
            </div>
            {/* Exit */}
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Exit Premium ₹</div>
              <input type="number" step="0.5" value={form.exit} onChange={e=>fc('exit',e.target.value)} onBlur={calcPnl} placeholder="₹0"
                style={{width:'100%',padding:'8px 10px',background:'var(--bg-primary)',border:'1px solid var(--border)',
                  borderRadius:8,color:'var(--text-primary)',fontSize:14,fontFamily:'DM Mono',outline:'none',boxSizing:'border-box'}}/>
            </div>
            {/* Lots */}
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Lots</div>
              <input type="number" min={1} value={form.lots} onChange={e=>{fc('lots',e.target.value);calcPnl();}}
                style={{width:'100%',padding:'8px 10px',background:'var(--bg-primary)',border:'1px solid var(--border)',
                  borderRadius:8,color:'var(--text-primary)',fontSize:14,fontFamily:'DM Mono',outline:'none',boxSizing:'border-box'}}/>
            </div>
            {/* Result */}
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Result</div>
              <div style={{display:'flex',borderRadius:8,overflow:'hidden',border:'1px solid var(--border)'}}>
                {['WIN','LOSS','BREAKEVEN'].map(r=>(
                  <button key={r} onClick={()=>fc('result',r)} style={{flex:1,padding:'7px 4px',border:'none',fontSize:10,fontWeight:700,cursor:'pointer',
                    background:form.result===r?(r==='WIN'?'var(--green)':r==='LOSS'?'var(--red)':'var(--gold)'):'var(--bg-primary)',
                    color:form.result===r?'#fff':'var(--text-muted)'}}>{r}</button>
                ))}
              </div>
            </div>
          </div>

          {/* P&L display */}
          {form.pnl&&(
            <div style={{marginBottom:14,padding:'10px 14px',
              background:parseFloat(form.pnl)>=0?'rgba(34,197,94,0.08)':'rgba(239,68,68,0.08)',
              border:`1px solid ${parseFloat(form.pnl)>=0?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}`,borderRadius:8}}>
              <span style={{fontSize:12,color:'var(--text-muted)'}}>P&L: </span>
              <span style={{fontSize:18,fontWeight:800,color:parseFloat(form.pnl)>=0?'var(--green)':'var(--red)',fontFamily:'DM Mono'}}>
                {parseFloat(form.pnl)>=0?'+':''}₹{fmt(Math.abs(parseFloat(form.pnl)))} ({form.pnlPct}%)
              </span>
            </div>
          )}

          {/* Psychology + Checklist */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>How did you feel?</div>
              <select value={form.emotion} onChange={e=>fc('emotion',e.target.value)} className="ai-select" style={{width:'100%'}}>
                {EMOTIONS.map(e=><option key={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>Mistake made (if any)</div>
              <select value={form.mistake} onChange={e=>fc('mistake',e.target.value)} className="ai-select" style={{width:'100%'}}>
                <option value="">No mistake</option>
                {MISTAKES.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Checklist */}
          <div style={{display:'flex',gap:20,marginBottom:14}}>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,color:'var(--text-secondary)'}}>
              <input type="checkbox" checked={form.followed_plan} onChange={e=>fc('followed_plan',e.target.checked)}
                style={{accentColor:'var(--green)',width:16,height:16}}/>
              Followed my trade plan
            </label>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,color:'var(--text-secondary)'}}>
              <input type="checkbox" checked={form.used_sl} onChange={e=>fc('used_sl',e.target.checked)}
                style={{accentColor:'var(--green)',width:16,height:16}}/>
              Used stop loss
            </label>
          </div>

          {/* Setup + Lesson */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Trade Setup / Reason</div>
              <input type="text" value={form.setup} onChange={e=>fc('setup',e.target.value)}
                placeholder="e.g. MACD crossover + VWAP bounce"
                style={{width:'100%',padding:'9px 12px',background:'var(--bg-primary)',border:'1px solid var(--border)',
                  borderRadius:8,color:'var(--text-primary)',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:5}}>Lesson Learned</div>
              <input type="text" value={form.lesson} onChange={e=>fc('lesson',e.target.value)}
                placeholder="e.g. Don't enter after 1 PM"
                style={{width:'100%',padding:'9px 12px',background:'var(--bg-primary)',border:'1px solid var(--border)',
                  borderRadius:8,color:'var(--text-primary)',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
            </div>
          </div>

          <button onClick={addEntry}
            style={{width:'100%',padding:'13px',borderRadius:10,border:'none',
              background:'linear-gradient(135deg,#8b5cf6,#6d28d9)',
              color:'#fff',fontSize:14,fontWeight:800,cursor:'pointer'}}>
            📓 Save to Journal
          </button>
        </div>
      )}

      {/* All trades list */}
      {tab==='list'&&(
        <div>
          {entries.length===0?(
            <div style={{textAlign:'center',padding:'50px 20px'}}>
              <div style={{fontSize:40,marginBottom:12}}>📓</div>
              <div style={{fontSize:15,fontWeight:700,color:'var(--text-primary)',marginBottom:6}}>No Journal Entries Yet</div>
              <div style={{fontSize:13,color:'var(--text-muted)'}}>Log your first trade to start tracking your progress</div>
            </div>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {entries.map(e=>(
                <div key={e.id} style={{background:'var(--bg-secondary)',
                  border:`1px solid ${e.result==='WIN'?'rgba(34,197,94,0.3)':e.result==='LOSS'?'rgba(239,68,68,0.3)':'rgba(201,168,76,0.3)'}`,
                  borderRadius:12,padding:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                        <span style={{fontSize:15,fontWeight:800,color:'var(--text-primary)'}}>{e.symbol} {e.strike} {e.type}</span>
                        <span style={{fontSize:12,fontWeight:700,padding:'2px 10px',borderRadius:12,
                          background:e.result==='WIN'?'rgba(34,197,94,0.15)':e.result==='LOSS'?'rgba(239,68,68,0.15)':'rgba(201,168,76,0.15)',
                          color:e.result==='WIN'?'var(--green)':e.result==='LOSS'?'var(--red)':'var(--gold)'}}>
                          {e.result}
                        </span>
                        <span style={{fontSize:11,color:'var(--text-muted)'}}>{e.emotion}</span>
                      </div>
                      <div style={{fontSize:11,color:'var(--text-muted)'}}>
                        {e.date} · Entry ₹{e.entry} → Exit ₹{e.exit} · {e.lots} lot
                      </div>
                      {e.setup&&<div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>📋 {e.setup}</div>}
                      {e.lesson&&<div style={{fontSize:12,color:'#a78bfa',marginTop:4}}>💡 {e.lesson}</div>}
                      {e.mistake&&<div style={{fontSize:12,color:'var(--red)',marginTop:4}}>⚠️ {e.mistake}</div>}
                    </div>
                    <div style={{display:'flex',gap:14,alignItems:'center'}}>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:20,fontWeight:900,color:parseFloat(e.pnl)>=0?'var(--green)':'var(--red)',fontFamily:'DM Mono'}}>
                          {parseFloat(e.pnl)>=0?'+':''}₹{fmt(Math.abs(parseFloat(e.pnl)),0)}
                        </div>
                        <div style={{fontSize:12,color:parseFloat(e.pnlPct)>=0?'var(--green)':'var(--red)'}}>
                          {e.pnlPct}%
                        </div>
                      </div>
                      <button onClick={()=>deleteEntry(e.id)}
                        style={{padding:'6px 10px',borderRadius:7,border:'1px solid var(--border)',
                          background:'transparent',color:'var(--text-muted)',cursor:'pointer',fontSize:12}}>🗑</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Analysis */}
      {tab==='analysis'&&(
        <div>
          {entries.length<3?(
            <div style={{textAlign:'center',padding:'50px 20px',color:'var(--text-muted)'}}>
              Log at least 3 trades to see analysis
            </div>
          ):(
            <div>
              {/* Stats grid */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12,marginBottom:20}}>
                {[
                  ['Total Trades',    entries.length,                         'var(--text-primary)'],
                  ['Win Rate',        winRate+'%',                            winRate>=50?'var(--green)':'var(--red)'],
                  ['Total P&L',       (totalPnl>=0?'+':'')+'₹'+fmt(Math.abs(totalPnl),0), totalPnl>=0?'var(--green)':'var(--red)'],
                  ['Avg Win',         '+₹'+fmt(avgWin,0),                    'var(--green)'],
                  ['Avg Loss',        '-₹'+fmt(Math.abs(avgLoss),0),         'var(--red)'],
                  ['Risk:Reward',     avgLoss?'1:'+(Math.abs(avgWin/avgLoss)).toFixed(1):'---','var(--gold)'],
                  ['Followed Plan',   followedPlan+'/'+entries.length,       followedPlan/entries.length>=0.8?'var(--green)':'var(--red)'],
                  ['Used SL',         usedSL+'/'+entries.length,             usedSL/entries.length>=0.8?'var(--green)':'var(--red)'],
                ].map(([l,v,c])=>(
                  <div key={l} style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:12,padding:14,textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:5}}>{l}</div>
                    <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:'DM Mono'}}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Top mistakes */}
              {topMistakes.length>0&&(
                <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:12,padding:16,marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--red)',marginBottom:12}}>⚠️ Your Most Common Mistakes</div>
                  {topMistakes.map(([m,n])=>(
                    <div key={m} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(239,68,68,0.1)'}}>
                      <span style={{fontSize:13,color:'var(--text-secondary)'}}>{m}</span>
                      <span style={{fontSize:13,fontWeight:700,color:'var(--red)',fontFamily:'DM Mono'}}>{n}×</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Improvement tips */}
              <div style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:12,padding:16}}>
                <div style={{fontSize:12,fontWeight:700,color:'#a78bfa',marginBottom:12}}>✦ AI Improvement Tips (based on your data)</div>
                {[
                  winRate<50&&'Your win rate is below 50%. Focus on quality over quantity — take fewer, higher confidence trades only.',
                  Math.abs(avgLoss)>avgWin&&'Your average loss is bigger than average win. This is dangerous. Reduce your stop loss distance.',
                  followedPlan/entries.length<0.8&&'You are not following your plan consistently. Write down your plan BEFORE entering the trade.',
                  usedSL/entries.length<0.8&&'You are not using stop loss every trade. This is the #1 reason traders lose money. Always set SL.',
                  topMistakes[0]&&'Most common mistake: "'+topMistakes[0][0]+'". Work on fixing this first.',
                ].filter(Boolean).map((tip,i)=>(
                  <div key={i} style={{display:'flex',gap:8,marginBottom:8}}>
                    <span style={{color:'#a78bfa',flexShrink:0}}>•</span>
                    <span style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.7}}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}