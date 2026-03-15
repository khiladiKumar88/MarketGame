import { useState } from 'react';
import Header from './components/Header';
import UpstoxDashboard from './components/UpstoxDashboard';
import UpstoxAuth from './components/UpstoxAuth';
import CryptoDashboard from './components/CryptoDashboard';
import DashboardHome from './components/DashboardHome';
import MarketNews from './components/MarketNews';
import SmartSignals from './components/SmartSignals';
import { useUpstoxIndices } from './hooks/useUpstoxData';
import './index.css';

export default function App() {
  const [tab, setTab] = useState('home');
  const upstoxIndices = useUpstoxIndices();

  // Handle Upstox OAuth redirect
  if (window.location.pathname === '/auth' || window.location.search.includes('code=')) {
    return <UpstoxAuth />;
  }

  return (
    <>
      <Header />

      {/* MAIN NAV */}
      <nav className="nav-tabs">
        {[
          ['home',   '🏠 Home'],
          ['upstox', '📡 Upstox Live'],
          ['crypto', '🪙 Crypto'],
          ['news',   '📰 News'],
          ['smart',  '🎯 Smart Signals'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`nav-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}

        <a href="/auth" style={{
          marginLeft: 'auto',
          background: 'rgba(201,168,76,0.15)',
          border: '1px solid rgba(201,168,76,0.3)',
          color: 'var(--gold)',
          padding: '6px 14px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
        }}>
          🔐 Token Refresh
        </a>
      </nav>

      <div className="main">

        {/* HOME */}
        {tab === 'home' && (
          <div className="fade-in">
            <DashboardHome
              indices={upstoxIndices}
              onNavigate={(section) => setTab(section)}
            />
          </div>
        )}

        {/* UPSTOX LIVE */}
        {tab === 'upstox' && (
          <div className="fade-in">
            <UpstoxDashboard />
          </div>
        )}

        {/* CRYPTO */}
        {tab === 'crypto' && (
          <div className="fade-in">
            <CryptoDashboard />
          </div>
        )}

        {/* NEWS */}
        {tab === 'news' && (
          <div className="fade-in">
            <MarketNews />
          </div>
        )}

        {/* SMART SIGNALS */}
        {tab === 'smart' && (
          <div className="fade-in">
            <SmartSignals indices={upstoxIndices} />
          </div>
        )}

        <div className="disclaimer">
          ⚠️ <strong>Disclaimer:</strong> MarketSaathi is for educational purposes only.
          AI signals are not financial advice. Always consult a SEBI-registered advisor before investing.
          Trading involves risk of capital loss.
        </div>
      </div>
    </>
  );
}







// import { useState } from 'react';
// import Header from './components/Header';
// import UpstoxDashboard from './components/UpstoxDashboard';
// import UpstoxAuth from './components/UpstoxAuth';
// import CryptoDashboard from './components/CryptoDashboard';
// import DashboardHome from './components/DashboardHome';
// import MarketNews from './components/MarketNews';
// import { useUpstoxIndices } from './hooks/useUpstoxData';
// import './index.css';
// import SmartSignals from './components/SmartSignals';

// export default function App() {
//   const [tab, setTab] = useState('home');
//   const upstoxIndices = useUpstoxIndices();

//   // Handle Upstox OAuth redirect
//   if (window.location.pathname === '/auth' || window.location.search.includes('code=')) {
//     return <UpstoxAuth />;
//   }

//   return (
//     <>
//       <Header />

//       {/* MAIN NAV */}
//       <nav className="nav-tabs">
//         {[
//           ['home',   '🏠 Home'],
//           ['upstox', '📡 Upstox Live'],
//           ['crypto', '🪙 Crypto'],
//           ['news',   '📰 News'],
//           ['smart', '🎯 Smart Signals'],

//         ].map(([key, label]) => (
//           <button
//             key={key}
//             className={`nav-tab ${tab === key ? 'active' : ''}`}
//             onClick={() => setTab(key)}
//           >
//             {label}
//           </button>
//         ))}

//         <a href="/auth" style={{
//           marginLeft: 'auto',
//           background: 'rgba(201,168,76,0.15)',
//           border: '1px solid rgba(201,168,76,0.3)',
//           color: 'var(--gold)',
//           padding: '6px 14px',
//           borderRadius: 6,
//           fontSize: 12,
//           fontWeight: 600,
//           textDecoration: 'none',
//           display: 'flex',
//           alignItems: 'center',
//           gap: 6,
//           whiteSpace: 'nowrap',
//         }}>
//           🔐 Token Refresh
//         </a>
//       </nav>

//       <div className="main">

//         {/* HOME */}
//         {tab === 'home' && (
//           <div className="fade-in">
//             <DashboardHome
//               indices={upstoxIndices}
//               onNavigate={(section) => setTab(section)}
//             />
//           </div>
//         )}

//         {/* UPSTOX LIVE */}
//         {tab === 'upstox' && (
//           <div className="fade-in">
//             <UpstoxDashboard />
//           </div>
//         )}

//         {/* CRYPTO */}
//         {tab === 'crypto' && (
//           <div className="fade-in">
//             <CryptoDashboard />
//           </div>
//         )}

//         {/* NEWS */}
//         {tab === 'news' && (
//           <div className="fade-in">
//             <MarketNews />
//           </div>
//         )}

//         {tab === 'smart' && <SmartSignals indices={indices} stocks={stocks} />}


//         <div className="disclaimer">
//           ⚠️ <strong>Disclaimer:</strong> Market KA Khiladi is for educational purposes only.
//           AI signals are not financial advice. Always consult a SEBI-registered advisor before investing.
//           Trading involves risk of capital loss.
//         </div>
//       </div>
//     </>
//   );
// }