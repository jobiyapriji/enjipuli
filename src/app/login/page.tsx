'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogoWordmark } from '@/components/LogoWordmark';
import { ElephantMascot } from '@/components/ElephantMascot';
import { MuralBackground } from '@/components/MuralBackground';
import { FloralDivider } from '@/components/FloralDivider';
import { GraduationCap, ShieldCheck } from 'lucide-react';

export default function StudentLoginPage() {
  const [step, setStep]       = useState<1 | 2>(1);
  const [email, setEmail]     = useState('');
  const [code, setCode]       = useState('');
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError(null);
    setEmailNotice(null);
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, purpose: 'student' }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send code.');
      }
      
      setStep(2);
      setCountdown(60);
      if (data.previewCode) {
        setPreviewCode(data.previewCode);
        setCode(data.previewCode);
        if (data.emailError) {
          setEmailNotice(data.emailError);
        }
      } else {
        setPreviewCode(null);
        setCode('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await signIn('credentials', { 
        email: email.trim(), 
        code: code.trim(),
        purpose: 'student', 
        redirect: false 
      });
      if (res?.error) { 
        const msg = res.error === 'CredentialsSignin'
          ? 'Invalid or expired code. Please try again.'
          : res.error;
        setError(msg); 
        return; 
      }

      // Check if user has completed their profile
      try {
        const profileRes = await fetch('/api/user/profile');
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          // Only prompt for profile setup on the very first login if not completed
          if (profileData.profileCompleted === false && !profileData.name) {
            router.push('/profile?firstTime=true');
            router.refresh();
            return;
          }
        }
      } catch (checkErr) {
        console.error('Failed to check profile completion:', checkErr);
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      id="student-login-page"
      className="screen-branding"
      style={{
        minHeight: '100svh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        position: 'relative',
      }}
    >
      {/* Full mural decorative background */}
      <MuralBackground opacity={0.1} />

      {/* Elephant mascot — positioned behind the card */}
      <div
        className="animate-float"
        style={{
          position: 'absolute',
          bottom: '5%',
          right: '5%',
          opacity: 0.15,
          pointerEvents: 'none',
        }}
      >
        <ElephantMascot size={280} />
      </div>

      {/* Login card */}
      <div
        id="login-card"
        className="glass animate-fade-in-up"
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '2.5rem 2rem',
          textAlign: 'center',
          borderRadius: 'var(--radius-2xl)',
          position: 'relative',
          zIndex: 1,
          boxShadow: '0 8px 48px rgba(0,0,0,0.5)',
        }}
      >
        {/* Logo + tagline */}
        <div id="login-logo" style={{ marginBottom: '1.5rem' }}>
          <LogoWordmark size={180} light glow />
        </div>

        <FloralDivider width={140} className="mx-auto" />

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ej-teal/15 border border-ej-teal/40 text-ej-teal text-xs font-bold my-4">
          <GraduationCap className="w-4 h-4" />
          <span>STUDENT LOGIN</span>
        </div>

        <h1 style={{
          margin: '0.25rem 0 0.3rem',
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--ej-cream)',
        }}>
          Welcome!
        </h1>
        <p style={{
          color: 'var(--ej-muted)',
          fontSize: '0.8rem',
          margin: '0 0 1.25rem',
        }}>
          {step === 1 ? 'Enter your email to receive a login verification code.' : `Code sent to ${email}`}
        </p>

        {/* Error state */}
        {error && (
          <div
            id="login-error"
            role="alert"
            className="animate-shake"
            style={{
              padding: '0.65rem 0.85rem',
              background: 'rgba(240,86,46,0.1)',
              border: '1px solid rgba(240,86,46,0.4)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--ej-vermilion)',
              fontSize: '0.78rem',
              marginBottom: '1rem',
              textAlign: 'left',
              fontWeight: 500,
            }}
          >
            ⚠ {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-ej-muted text-left mb-1.5 pl-1">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                className="input-field w-full"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                style={{ textAlign: 'center', fontSize: '0.95rem' }}
              />
            </div>
            <button
              id="login-submit"
              type="submit"
              className="btn-primary"
              style={{
                width: '100%',
                padding: '0.85rem',
                fontSize: '0.9rem',
                fontWeight: 800,
              }}
              disabled={loading}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                  Sending…
                </span>
              ) : (
                'Send code →'
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {previewCode && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  background: 'rgba(234, 179, 8, 0.12)',
                  border: '1px solid rgba(234, 179, 8, 0.35)',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'left',
                  fontSize: '0.78rem',
                  color: 'var(--ej-gold)',
                  marginBottom: '0.25rem',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>
                  {emailNotice ? '⚠️ Email Delivery Restricted (Resend Free Tier):' : '🧪 Test Mode:'}
                </div>
                {emailNotice && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--ej-vermilion)', marginBottom: '0.3rem', lineHeight: 1.4 }}>
                    {emailNotice}
                  </div>
                )}
                <div style={{ color: 'var(--ej-cream)' }}>
                  Your login code is: <strong style={{ letterSpacing: '2px', fontSize: '1.05rem', color: 'var(--ej-lime)' }}>{previewCode}</strong>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--ej-muted)', marginTop: '0.25rem' }}>
                  (Auto-filled below! Click &quot;Verify &amp; Login&quot; to enter.)
                </div>
              </div>
            )}
            <input
              id="login-code"
              type="text"
              required
              maxLength={6}
              className="input-field"
              placeholder="123456"
              value={code}
              onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
              autoComplete="one-time-code"
              style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '4px', fontWeight: 'bold' }}
            />
            <button
              id="login-verify"
              type="submit"
              className="btn-primary"
              style={{
                width: '100%',
                padding: '0.85rem',
                fontSize: '0.9rem',
                fontWeight: 800,
              }}
              disabled={loading}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                  Verifying…
                </span>
              ) : (
                'Verify & Login'
              )}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem' }}>
              <button 
                type="button" 
                onClick={() => setStep(1)}
                style={{ color: 'var(--ej-muted)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Wrong email?
              </button>
              <button 
                type="button"
                onClick={() => handleRequestOtp()}
                disabled={countdown > 0 || loading}
                style={{ 
                  color: countdown > 0 ? 'var(--ej-dark-text)' : 'var(--ej-lime)', 
                  background: 'none', 
                  border: 'none', 
                  cursor: countdown > 0 ? 'not-allowed' : 'pointer'
                }}
              >
                {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {/* Back to role selection */}
        <div style={{
          marginTop: '1.75rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid var(--ej-border)',
          textAlign: 'center',
        }}>
          <Link
            href="/"
            style={{
              color: 'var(--ej-muted)',
              fontSize: '0.75rem',
              textDecoration: 'none',
              transition: 'color 0.15s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ej-lime)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ej-muted)'; }}
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
