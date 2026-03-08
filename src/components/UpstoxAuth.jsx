import { useState, useEffect } from 'react';

export default function UpstoxAuth() {
  const [status,      setStatus]      = useState('checking'); // checking | valid | expired | error
  const [message,     setMessage]     = useState('');
  const [loading,     setLoading]     = useState(false);
  const [loginUrl,    setLoginUrl]    = useState('');
  const [tokenInfo,   setTokenInfo]   = useState(null);
  const [countdown,   setCountdown]   = useState(null);

  // ── On mount: check token + handle redirect code ──────
  useEffect(() => {
    // Check if redirected back with ?code=
    const params  = new URLSearchParams(window.location.search);
    const code    = params.get('code');
    if (code) {
      window.history.replaceState({}, '', window.location.pathname); // clean URL
      exchangeCode(code);
      return;
    }
    checkStatus();
  }, []);

  // ── Midnight countdown ─────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now  = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight - now;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Check current token status ─────────────────────────
  async function checkStatus() {
    setStatus('checking');
    try {
      const res  = await fetch('http://localhost:5000/api/upstox/status');
      const data = await res.json();
      if (data.hasToken) {
        // Try a quick profile call to verify token is still valid
        const profile = await fetch('http://localhost:5000/api/upstox/profile');
        const pdata   = await profile.json();
        if (pdata.data) {
          setStatus('valid');
          setTokenInfo(pdata.data);
          setMessage('Token is active and working.');
        } else {
          setStatus('expired');
          setMessage('Token has expired. Please refresh.');
        }
      } else {
        setStatus('expired');
        setMessage('No token found. Please login.');
      }
    } catch {
      setStatus('error');
      setMessage('Cannot reach server. Is node server.js running?');
    }
    // Also fetch login URL for use later
    fetchLoginUrl();
  }

  async function fetchLoginUrl() {
    try {
      const res  = await fetch('http://localhost:5000/api/upstox/login-url');
      const data = await res.json();
      setLoginUrl(data.url || data.loginUrl || '');
    } catch {}
  }

  // ── Step 1: Open Upstox login ──────────────────────────
  function handleLogin() {
    if (!loginUrl) { setMessage('Login URL not loaded yet. Try again.'); return; }
    window.location.href = loginUrl; // redirect in same tab so code comes back here
  }

  // ── Step 2: Exchange code for token ───────────────────
  async function exchangeCode(code) {
    setLoading(true);
    setStatus('checking');
    setMessage('Exchanging code for access token...');
    try {
      const res  = await fetch(`http://localhost:5000/api/upstox/token?code=${code}`);
      const data = await res.json();
      if (data.access_token || data.status === 'success' || data.token) {
        setStatus('valid');
        setMessage('✅ Token refreshed successfully! You are all set for today.');
        // Re-check profile
        const profile = await fetch('http://localhost:5000/api/upstox/profile');
        const pdata   = await profile.json();
        if (pdata.data) setTokenInfo(pdata.data);
      } else {
        setStatus('expired');
        setMessage('Token exchange failed: ' + (data.error || data.message || JSON.stringify(data)));
      }
    } catch (e) {
      setStatus('error');
      setMessage('Error: ' + e.message);
    }
    setLoading(false);
  }

  // ── Manual code paste fallback ─────────────────────────
  const [manualCode, setManualCode] = useState('');
  async function handleManualCode() {
    const code = manualCode.trim();
    if (!code) return;
    setManualCode('');
    await exchangeCode(code);
  }

  // ── UI helpers ─────────────────────────────────────────
  const statusConfig = {
    checking: { color: 'var(--gold)',  icon: '⏳', label: 'Checking...'   },
    valid:    { color: 'var(--green)', icon: '✅', label: 'Token Valid'    },
    expired:  { color: 'var(--red)',   icon: '⚠️', label: 'Token Expired' },
    error:    { color: 'var(--red)',   icon: '❌', label: 'Server Error'   },
  };
  const sc = statusConfig[status] || statusConfig.error;

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{ width: '100%', maxWidth: 520 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
            Upstox Token Refresh
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Tokens expire daily at midnight. Refresh every morning before trading.
          </div>
        </div>

        {/* Token expires in */}
        {countdown && (
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px 20px', marginBottom: 20,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⏰ Current token expires in</span>
            <span style={{ fontFamily: 'DM Mono', fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>
              {countdown}
            </span>
          </div>
        )}

        {/* Status Card */}
        <div style={{
          background: 'var(--bg-secondary)', border: `1px solid ${sc.color}33`,
          borderRadius: 12, padding: 24, marginBottom: 20
        }}>
          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', fontSize: 22,
              background: `${sc.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>{sc.icon}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: sc.color }}>{sc.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{message}</div>
            </div>
            <button onClick={checkStatus} style={{
              marginLeft: 'auto', background: 'transparent',
              border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text-muted)', fontSize: 11, padding: '4px 10px', cursor: 'pointer'
            }}>🔄 Recheck</button>
          </div>

          {/* Profile info if valid */}
          {status === 'valid' && tokenInfo && (
            <div style={{
              background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 8, padding: 14, display: 'flex', gap: 20, flexWrap: 'wrap'
            }}>
              {[
                ['👤 Name',   tokenInfo.user_name  || tokenInfo.name],
                ['📧 Email',  tokenInfo.email],
                ['🆔 User ID', tokenInfo.user_id   || tokenInfo.poa_flag],
                ['🏦 Broker', tokenInfo.broker     || 'Upstox'],
              ].map(([label, val]) => val ? (
                <div key={label}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{val}</div>
                </div>
              ) : null)}
            </div>
          )}
        </div>

        {/* Action: Login Button */}
        {(status === 'expired' || status === 'error') && (
          <button onClick={handleLogin} disabled={loading || !loginUrl} style={{
            width: '100%', padding: '16px', borderRadius: 10, border: 'none',
            background: loading ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            transition: 'opacity 0.2s', opacity: loading ? 0.6 : 1
          }}>
            {loading ? (
              <><div className="loader" style={{ width: 18, height: 18, borderWidth: 2 }} /> Authenticating...</>
            ) : (
              <>🔐 Login with Upstox & Refresh Token</>
            )}
          </button>
        )}

        {/* Already valid — offer refresh anyway */}
        {status === 'valid' && (
          <button onClick={handleLogin} style={{
            width: '100%', padding: '14px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 16
          }}>
            🔄 Force Refresh Token (optional)
          </button>
        )}

        {/* Manual code fallback */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 16, marginBottom: 20
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
            📋 Manual Code Entry (if redirect doesn't work)
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
            After logging in to Upstox, copy the <code style={{ color: 'var(--gold)' }}>code</code> value
            from your browser URL bar (e.g. <code style={{ color: 'var(--text-muted)' }}>http://localhost:5173?code=XXXXXXXX</code>)
            and paste it below.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="Paste code here..."
              onKeyDown={e => e.key === 'Enter' && handleManualCode()}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', fontSize: 13, fontFamily: 'DM Mono',
                outline: 'none'
              }}
            />
            <button onClick={handleManualCode} disabled={!manualCode.trim()} style={{
              padding: '10px 18px', borderRadius: 7, border: 'none',
              background: manualCode.trim() ? 'var(--gold)' : 'var(--bg-primary)',
              color: manualCode.trim() ? '#000' : 'var(--text-muted)',
              fontWeight: 700, fontSize: 13, cursor: manualCode.trim() ? 'pointer' : 'not-allowed'
            }}>Submit</button>
          </div>
        </div>

        {/* Steps guide */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 16
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
            📖 How to refresh (every morning)
          </div>
          {[
            ['1', 'Open this page', 'http://localhost:5173 → click "🔐 Token Refresh" in the header'],
            ['2', 'Click Login button', 'You will be redirected to Upstox login page'],
            ['3', 'Enter TOTP', 'Use Google Authenticator for the 6-digit code'],
            ['4', 'Auto redirect', 'Page comes back here and token is refreshed automatically'],
            ['5', 'Start trading', 'All tabs now have fresh live data for the day'],
          ].map(([num, title, desc]) => (
            <div key={num} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(201,168,76,0.2)', color: 'var(--gold)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700
              }}>{num}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Back to dashboard */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/" style={{
            fontSize: 13, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500
          }}>← Back to Dashboard</a>
        </div>

      </div>
    </div>
  );
}