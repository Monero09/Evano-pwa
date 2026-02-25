import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import HomePage from './HomePage';
import SearchPage from './SearchPage';
import WatchPage from './WatchPage';
import NotFoundPage from './NotFoundPage';
import LoginPage from './LoginPage';
import CreatorDashboard from './CreatorDashboard';
import AdminDashboard from './AdminDashboard';
import AdminAdsPage from './AdminAdsPage';
import AuthGuard from './components/AuthGuard';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';

// Type for PWA install prompt
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Simple transition wrapper (optional)
const PageTransition = ({ children }: { children: React.ReactNode }) => {
    const location = useLocation();

    // PWA Install Prompt Logic
    const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
    const [showInstall, setShowInstall] = React.useState(false);

    React.useEffect(() => {
        const handler = (e: Event) => {
            const event = e as BeforeInstallPromptEvent;
            event.preventDefault();
            setDeferredPrompt(event);
            // Show banner immediately — no delay, event fires only once
            setShowInstall(true);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        // Hide banner regardless of accept or dismiss
        setShowInstall(false);
        setDeferredPrompt(null);
    };

    return (
        <div key={location.pathname} className="page-transition">
            <Sidebar />
            <div className="page-content">
                {children}
            </div>

            {showInstall && (
                <div className="install-prompt">
                    <span>Install Evano Streams for better experience!</span>
                    <button onClick={handleInstall} className="install-btn">Install</button>
                    <button onClick={() => setShowInstall(false)} className="close-btn">×</button>
                </div>
            )}
        </div>
    );
};

export default function App() {
    return (
        <ErrorBoundary>
            <Router>
                <PageTransition>
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/search" element={<SearchPage />} />
                        <Route path="/watch/:id" element={<WatchPage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route
                            path="/creator"
                            element={
                                <AuthGuard allowedRoles={['creator', 'admin']}>
                                    <CreatorDashboard />
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/admin"
                            element={
                                <AuthGuard allowedRoles={['admin']}>
                                    <AdminDashboard />
                                </AuthGuard>
                            }
                        />
                        <Route
                            path="/admin/ads"
                            element={
                                <AuthGuard allowedRoles={['admin']}>
                                    <AdminAdsPage />
                                </AuthGuard>
                            }
                        />
                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </PageTransition>
            </Router>
        </ErrorBoundary>
    );
}