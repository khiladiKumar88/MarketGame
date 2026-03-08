import { useState, useEffect } from 'react';

export default function Header() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      setTime(ist.toISOString().slice(11, 19) + ' IST');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="header">
      <div className="logo">
        <div className="logo-icon">📈</div>
        <div>
          <div className="logo-text">MarketSaathi</div>
          <div className="logo-sub">Indian Market Intelligence</div>
        </div>
      </div>
      <div className="header-right">
        <div className="market-status">
          <div className="status-dot"></div>
          NSE Live
        </div>
        <div className="clock">{time}</div>
      </div>
    </header>
  );
}