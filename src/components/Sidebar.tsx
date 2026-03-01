import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Menu,
    X,
    Home,
    Search,
    Video as VideoIcon,
    ShieldAlert,
    LogOut
} from 'lucide-react';
import NotificationsBell from './NotificationsBell';

export default function Sidebar() {
    const [isOpen, setIsOpen] = useState(false);
    const { user, role, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const toggleSidebar = () => setIsOpen(!isOpen);

    const menuItems = [
        { icon: Home, label: 'Home', path: '/' },
        { icon: Search, label: 'Search', path: '/search' },
        ...(role === 'creator' || role === 'admin' ? [{ icon: VideoIcon, label: 'Studio', path: '/creator' }] : []),
        ...(role === 'admin' ? [{ icon: ShieldAlert, label: 'Admin', path: '/admin' }] : []),
    ];

    const isActive = (path: string) => location.pathname === path;

    const handleNavigation = (path: string) => {
        navigate(path);
        setIsOpen(false);
    };

    const handleLogout = async () => {
        await logout();
        window.location.reload();
    };

    return (
        <>
            {/* Hamburger Button (Fixed Top-Left) */}
            <button
                onClick={toggleSidebar}
                style={{
                    position: 'fixed',
                    top: 15,
                    left: 20,
                    zIndex: 2000,
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    padding: '8px',
                    color: 'white',
                    cursor: 'pointer',
                    backdropFilter: 'blur(4px)'
                }}
            >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Notifications Bell (Fixed Top-Right) */}
            <div
                style={{
                    position: 'fixed',
                    top: 15,
                    right: 20,
                    zIndex: 2000,
                }}
            >
                <NotificationsBell />
            </div>

            {/* Sidebar Drawer Overly */}
            {isOpen && (
                <div
                    onClick={() => setIsOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.6)',
                        zIndex: 1400,
                        backdropFilter: 'blur(3px)'
                    }}
                />
            )}

            {/* Slide-out Sidebar */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: '260px',
                    background: '#0B0F19', // Dark bg
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    zIndex: 1500,
                    transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
                    transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '80px 20px 20px 20px',
                    boxShadow: '10px 0 30px rgba(0,0,0,0.5)'
                }}
            >
                {/* Navigation Links */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                    {menuItems.map((item) => (
                        <button
                            key={item.path}
                            onClick={() => handleNavigation(item.path)}
                            className={`sidebar-nav-item ${isActive(item.path) ? 'active' : ''}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 16px',
                                borderRadius: '12px',
                                background: isActive(item.path)
                                    ? 'rgba(34, 197, 94, 0.3)' // Subtle purple tint
                                    : 'transparent',
                                color: isActive(item.path) ? 'white' : '#B0B8C1',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '15px',
                                fontWeight: isActive(item.path) ? 600 : 400,
                                transition: 'all 0.2s ease',
                                textAlign: 'left',
                                position: 'relative'
                            }}
                        >
                            <item.icon size={20} />
                            {item.label}
                        </button>
                    ))}
                </div>

                {/* User Section / Login or Logout */}
                {user ? (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20 }}>
                        {/* User Profile Info */}
                        <div style={{
                            background: 'rgba(34, 197, 94, 0.1)',
                            padding: 12,
                            borderRadius: '12px',
                            marginBottom: 16,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            cursor: 'pointer',
                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            border: '1px solid rgba(34, 197, 94, 0.2)'
                        }}
                            onClick={() => handleNavigation('/profile')}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
                                e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)';
                                e.currentTarget.style.transform = 'translateX(4px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)';
                                e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.2)';
                                e.currentTarget.style.transform = 'translateX(0)';
                            }}
                        >
                            <div className="user-avatar" style={{ width: 36, height: 36, fontSize: 14, transition: 'all 0.3s ease', boxShadow: '0 2px 8px rgba(34, 197, 94, 0.2)' }}>
                                {user.email?.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 2 }}>Signed in as</div>
                                <div style={{ fontSize: 13, color: 'white', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {user.email?.split('@')[0]}
                                </div>
                                <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                    <span style={{ color: '#22C55E', textTransform: 'capitalize', fontWeight: 600 }}>
                                        {role || 'viewer'}
                                    </span>
                                </div>
                            </div>
                        </div>


                        {/* Sign Out */}
                        <button
                            onClick={handleLogout}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 16px',
                                width: '100%',
                                borderRadius: '12px',
                                background: 'rgba(255, 68, 68, 0.1)',
                                color: '#ff4444',
                                border: '1px solid rgba(255, 68, 68, 0.2)',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 500,
                                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 68, 68, 0.2)';
                                e.currentTarget.style.borderColor = 'rgba(255, 68, 68, 0.4)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 68, 68, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 68, 68, 0.1)';
                                e.currentTarget.style.borderColor = 'rgba(255, 68, 68, 0.2)';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            <LogOut size={18} />
                            Sign Out
                        </button>
                    </div>
                ) : (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20 }}>
                        <button
                            onClick={() => handleNavigation('/login')}
                            className="btn-primary"
                            style={{ width: '100%' }}
                        >
                            Sign In
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
