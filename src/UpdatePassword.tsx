import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useToast } from './components/Toast';

type SessionStatus = 'loading' | 'valid' | 'invalid';

export default function UpdatePassword() {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionStatus, setSessionStatus] = useState<SessionStatus>('loading');
    const navigate = useNavigate();
    const { showToast } = useToast();

    useEffect(() => {
        let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

        // Supabase auto-exchanges the recovery code/token from the URL on init.
        // PASSWORD_RECOVERY fires when the user arrives via a reset link.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                setSessionStatus('valid');
            } else if (event === 'SIGNED_IN' && session) {
                setSessionStatus('valid');
            }
        });

        // Fallback: check current session in case the event already fired
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setSessionStatus('valid');
            } else {
                // Give onAuthStateChange 1.5 s to fire before marking invalid
                fallbackTimer = setTimeout(() => {
                    setSessionStatus((prev) => prev === 'loading' ? 'invalid' : prev);
                }, 1500);
            }
        });

        return () => {
            subscription.unsubscribe();
            if (fallbackTimer) clearTimeout(fallbackTimer);
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) {
            showToast('Passwords do not match', 'error');
            return;
        }
        if (password.length < 8) {
            showToast('Password must be at least 8 characters', 'error');
            return;
        }
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            showToast('Password updated! Redirecting…', 'success');
            setTimeout(() => navigate('/'), 1500);
        } catch (error: any) {
            showToast(error.message || 'Failed to update password', 'error');
        } finally {
            setLoading(false);
        }
    };

    const passwordsMatch = confirm.length > 0 && password === confirm;
    const passwordsMismatch = confirm.length > 0 && password !== confirm;

    /* ── Loading: verifying the recovery token ── */
    if (sessionStatus === 'loading') {
        return (
            <div className="auth-container">
                <div className="auth-box" style={{ textAlign: 'center', padding: '60px 40px' }}>
                    <div style={{ fontSize: 32, marginBottom: 16 }}>🔐</div>
                    <p style={{ color: '#aaa', fontSize: 14 }}>Verifying reset link…</p>
                </div>
            </div>
        );
    }

    /* ── Invalid / expired token ── */
    if (sessionStatus === 'invalid') {
        return (
            <div className="auth-container">
                <div className="auth-box">
                    <div className="auth-header">
                        <div style={{ fontSize: 52, marginBottom: 12, lineHeight: 1 }}>⚠️</div>
                        <h1 className="auth-title" style={{ color: '#ff4d4f' }}>Link Expired</h1>
                        <p className="auth-subtitle">
                            This reset link is invalid or has already been used.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/forgot-password')}
                        className="auth-btn"
                        style={{ marginTop: 28 }}
                    >
                        Request a New Link
                    </button>
                </div>
            </div>
        );
    }

    /* ── Valid session: show password form ── */
    return (
        <div className="auth-container">
            <div className="auth-box">
                <div className="auth-header">
                    <h1 className="auth-title">Set New Password</h1>
                    <p className="auth-subtitle">Choose a strong password for your account</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    <input
                        type="password"
                        placeholder="New password (min. 8 characters)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="auth-input"
                        required
                        minLength={8}
                        autoFocus
                    />

                    <input
                        type="password"
                        placeholder="Confirm new password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="auth-input"
                        required
                    />

                    {/* Live password match indicator */}
                    {(passwordsMatch || passwordsMismatch) && (
                        <p style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: passwordsMatch ? '#22C55E' : '#ff4d4f',
                            margin: '-6px 0 0',
                            paddingLeft: 2,
                            transition: 'color 0.2s',
                        }}>
                            {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                        </p>
                    )}

                    <button
                        type="submit"
                        className="auth-btn"
                        disabled={loading || passwordsMismatch || !password || !confirm}
                    >
                        {loading ? 'Updating…' : 'Update Password'}
                    </button>
                </form>
            </div>
        </div>
    );
}
