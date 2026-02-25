import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './components/AuthProvider';
import { useToast } from './components/Toast';

export default function LoginPage() {
    const [isRegistering, setIsRegistering] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [role, setRole] = useState<'viewer' | 'creator'>('viewer');
    const { login, signUp } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (isRegistering) {
                if (!username.trim()) {
                    showToast('Please enter a username', 'error');
                    return;
                }
                await signUp(email, password, role, username);
                showToast('Account created successfully!', 'success');
                // Auto-login after signup
                setTimeout(() => {
                    navigate('/');
                }, 1000);
            } else {
                await login(email, password);
                showToast('Logged in successfully!', 'success');
                navigate('/');
            }
        } catch (error: any) {
            showToast(error.message || 'Authentication failed', 'error');
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-box">
                <div className="auth-header">
                    <h1 className="auth-title">Evano Streams</h1>
                    <p className="auth-subtitle">{isRegistering ? 'Create your account' : 'Welcome back'}</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {isRegistering && (
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="auth-input"
                            required
                        />
                    )}

                    <input
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="auth-input"
                        required
                    />

                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="auth-input"
                        required
                    />

                    {/* Forgot password — only shown on sign-in, not register */}
                    {!isRegistering && (
                        <div style={{ textAlign: 'right', marginTop: -6 }}>
                            <Link
                                to="/forgot-password"
                                style={{
                                    fontSize: 13,
                                    color: '#22C55E',
                                    textDecoration: 'none',
                                    fontWeight: 500,
                                }}
                            >
                                Forgot password?
                            </Link>
                        </div>
                    )}

                    {isRegistering && (
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value as 'viewer' | 'creator')}
                            className="auth-input auth-select"
                        >
                            <option value="viewer">Viewer</option>
                            <option value="creator">Creator</option>
                        </select>
                    )}

                    <button type="submit" className="auth-btn">
                        {isRegistering ? 'Create Account' : 'Sign In'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', fontSize: 14, color: '#aaa', marginTop: 10 }}>
                    {isRegistering ? 'Already have an account?' : "Don't have an account?"}
                    <button
                        onClick={() => setIsRegistering(!isRegistering)}
                        className="auth-switch-btn"
                    >
                        {isRegistering ? 'Login' : 'Sign Up'}
                    </button>
                </p>
            </div>
        </div>
    );
}
