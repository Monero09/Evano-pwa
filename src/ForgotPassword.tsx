import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useToast } from './components/Toast';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const { showToast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/update-password`,
            });
            if (error) throw error;
            setSent(true);
        } catch (error: any) {
            showToast(error.message || 'Failed to send reset email', 'error');
        } finally {
            setLoading(false);
        }
    };

    /* ── Success state ── */
    if (sent) {
        return (
            <div className="auth-container">
                <div className="auth-box">
                    <div className="auth-header">
                        <div style={{ fontSize: 52, marginBottom: 12, lineHeight: 1 }}>📬</div>
                        <h1 className="auth-title">Check Your Email</h1>
                        <p className="auth-subtitle">
                            We sent a reset link to{' '}
                            <strong style={{ color: '#22C55E' }}>{email}</strong>
                        </p>
                    </div>

                    <p style={{
                        textAlign: 'center',
                        fontSize: 13,
                        color: '#aaa',
                        marginTop: 16,
                        lineHeight: 1.7,
                    }}>
                        Click the link in the email to set a new password.
                        <br />
                        Didn't get it? Check your spam folder.
                    </p>

                    <p style={{ textAlign: 'center', marginTop: 28 }}>
                        <Link to="/login" style={backLinkStyle}>← Back to Login</Link>
                    </p>
                </div>
            </div>
        );
    }

    /* ── Form state ── */
    return (
        <div className="auth-container">
            <div className="auth-box">
                <div className="auth-header">
                    <h1 className="auth-title">Forgot Password?</h1>
                    <p className="auth-subtitle">
                        Enter your email and we'll send you a reset link
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    <input
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="auth-input"
                        required
                        autoFocus
                    />

                    <button type="submit" className="auth-btn" disabled={loading}>
                        {loading ? 'Sending…' : 'Send Reset Link'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: 20 }}>
                    <Link to="/login" style={backLinkStyle}>← Back to Login</Link>
                </p>
            </div>
        </div>
    );
}

const backLinkStyle: React.CSSProperties = {
    color: '#22C55E',
    fontSize: 14,
    textDecoration: 'none',
    fontWeight: 600,
};
