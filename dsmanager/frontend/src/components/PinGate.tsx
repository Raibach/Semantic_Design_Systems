import { useState, useRef, useEffect } from 'react';
import raibachLogo from '@/assets/raibach-logo.jpg';
import { storeUserId, DEFAULT_USER_ID } from '@/services/authService';

const PIN_CODES: Record<string, { role: string; label: string; userId: string }> = {
  '7377': { role: 'admin', label: 'Administrator', userId: DEFAULT_USER_ID },
};

interface PinGateProps {
  onLoginSuccess: () => void;
}

export default function PinGate({ onLoginSuccess }: PinGateProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const submitPin = (pin: string[]) => {
    const code = pin.join('');
    const match = PIN_CODES[code];
    if (match) {
      localStorage.setItem("grace_is_authenticated", "true");
      localStorage.setItem("grace_user_role", match.role);
      storeUserId(match.userId);
      console.log(`🔐 Authenticated as ${match.label} (${match.userId})`);
      setShaking(false);
      setTimeout(() => onLoginSuccess(), 600);
    } else {
      setShaking(true);
      setError('Invalid access code');
      setTimeout(() => {
        setShaking(false);
        setDigits(['', '', '', '']);
        inputRefs.current[0]?.focus();
      }, 600);
    }
  };

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...digits];
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);
    setError('');
    if (value && index < 3) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 3) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;
    const newDigits = [...digits];
    for (let i = 0; i < pasted.length; i++) newDigits[i] = pasted[i];
    setDigits(newDigits);
    const next = pasted.length < 4 ? pasted.length : 3;
    inputRefs.current[next]?.focus();
  };

  const inputStyle = (hasValue: boolean): React.CSSProperties => ({
    width: '48px',
    height: '56px',
    textAlign: 'center',
    fontSize: '24px',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    color: '#f5f0e8',
    background: hasValue ? 'rgba(254,209,65,0.12)' : 'rgba(255,255,255,0.04)',
    border: hasValue ? '1px solid rgba(254,209,65,0.5)' : '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    outline: 'none',
    transition: 'border-color 0.2s, background 0.2s',
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1625',
        margin: 0,
        padding: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '380px',
          background: '#231f2e',
          borderRadius: '16px',
          padding: '48px 40px 44px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '14px',
            overflow: 'hidden',
            marginBottom: '28px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          <img
            src={raibachLogo}
            alt="Raibach"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 900,
              fontSize: '32px',
              letterSpacing: '-0.02em',
              color: '#f5f0e8',
              lineHeight: 1,
            }}
          >
            Raibach
          </div>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              fontSize: '14px',
              color: 'rgba(245,240,232,0.35)',
              marginTop: '4px',
              letterSpacing: '0.02em',
            }}
          >
            Interactive Design
          </div>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 400,
              fontSize: '13px',
              color: 'rgba(245,240,232,0.55)',
              marginTop: '6px',
              letterSpacing: '0.01em',
            }}
          >
            AI-Driven Design System Management
          </div>
        </div>

        <div
          style={{
            width: '40px',
            height: '2px',
            background: 'linear-gradient(-90deg, rgb(240,179,35), rgb(254,209,65))',
            borderRadius: '2px',
            margin: '20px 0',
          }}
        />

        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '13px',
            color: 'rgba(255,255,255,0.45)',
            marginBottom: '28px',
            textAlign: 'center',
            letterSpacing: '0.01em',
          }}
        >
          Enter your access code
        </p>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '24px',
            animation: shaking ? 'shake 0.5s ease' : 'none',
          }}
        >
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              style={inputStyle(!!digit)}
            />
          ))}
        </div>

        {error && (
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              color: '#ff6b6b',
              margin: '0 0 16px',
              textAlign: 'center',
            }}
          >
            {error}
          </p>
        )}

        <button
          onClick={() => submitPin(digits)}
          disabled={digits.some((d) => d === '')}
          style={{
            width: '100%',
            padding: '12px 0',
            background: digits.some((d) => d === '')
              ? 'rgba(255,255,255,0.06)'
              : 'linear-gradient(-90deg, rgb(240,179,35), rgb(254,209,65))',
            color: digits.some((d) => d === '') ? 'rgba(255,255,255,0.25)' : '#1a0800',
            border: 'none',
            borderRadius: '10px',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: '15px',
            cursor: digits.some((d) => d === '') ? 'default' : 'pointer',
            transition: 'background 0.2s, color 0.2s',
          }}
        >
          Enter
        </button>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 50%, 90% { transform: translateX(-6px); }
          30%, 70% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}