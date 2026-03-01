import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import {
    getUserNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    type Notification,
} from '../lib/api';

// ─── helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function NotificationsBell() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isMarkingAll, setIsMarkingAll] = useState(false);
    const [isMobile, setIsMobile] = useState(
        typeof window !== 'undefined' && window.innerWidth <= 480
    );
    const dropdownRef = useRef<HTMLDivElement>(null);

    const unreadCount = notifications.filter((n) => !n.is_read).length;

    // ── track viewport width changes ───────────────────────────────────────
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth <= 480);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // ── initial fetch ───────────────────────────────────────────────────────
    const fetchNotifications = useCallback(async () => {
        if (!user) return;
        const data = await getUserNotifications(user.id);
        setNotifications(data);
    }, [user]);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    // ── Supabase Realtime subscription ─────────────────────────────────────
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel(`notifications:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const newNotif = payload.new as Notification;
                    setNotifications((prev) => [newNotif, ...prev]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    // ── close dropdown on outside click (desktop only) ─────────────────────
    useEffect(() => {
        if (isMobile) return; // mobile uses the backdrop overlay instead
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isMobile]);

    // ── mark single as read ─────────────────────────────────────────────────
    const handleMarkRead = async (notif: Notification) => {
        if (notif.is_read) return;
        // Optimistic update
        setNotifications((prev) =>
            prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
        try {
            await markNotificationRead(notif.id);
        } catch {
            // Revert on failure
            setNotifications((prev) =>
                prev.map((n) => (n.id === notif.id ? { ...n, is_read: false } : n))
            );
        }
    };

    // ── mark all as read ───────────────────────────────────────────────────
    const handleMarkAllRead = async () => {
        if (!user || unreadCount === 0) return;
        setIsMarkingAll(true);
        // Optimistic update
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        try {
            await markAllNotificationsRead(user.id);
        } catch {
            // Revert
            await fetchNotifications();
        } finally {
            setIsMarkingAll(false);
        }
    };

    // ── Don't render for non-logged-in users ──────────────────────────────
    if (!user) return null;

    // ── dropdown position: centered+fixed on mobile, absolute on desktop ───
    const dropdownPositionStyle: React.CSSProperties = isMobile
        ? {
            position: 'fixed',
            top: '68px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100vw - 32px)',
            maxWidth: 380,
        }
        : {
            position: 'absolute',
            top: 'calc(100% + 12px)',
            right: 0,
            width: 340,
        };

    return (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
            {/* Bell Button */}
            <button
                id="notifications-bell-btn"
                onClick={() => setIsOpen((o) => !o)}
                title="Notifications"
                style={{
                    position: 'relative',
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: isOpen
                        ? 'rgba(34, 197, 94, 0.15)'
                        : 'rgba(255,255,255,0.07)',
                    border: `1px solid ${isOpen ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    color: 'white',
                    flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(34,197,94,0.4)';
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(34, 197, 94, 0.3)';
                }}
                onMouseLeave={(e) => {
                    if (!isOpen) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    }
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                }}
            >
                <Bell size={18} style={{ stroke: 'white', strokeWidth: 2 }} />

                {/* Unread Badge */}
                {unreadCount > 0 && (
                    <span
                        style={{
                            position: 'absolute',
                            top: -4,
                            right: -4,
                            minWidth: 18,
                            height: 18,
                            background: 'linear-gradient(135deg, #ff4d4f, #ff1a1a)',
                            color: 'white',
                            fontSize: 10,
                            fontWeight: 800,
                            borderRadius: 9,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 4px',
                            border: '2px solid #0B0F19',
                            animation: 'bellPulse 1.5s ease-in-out infinite',
                            lineHeight: 1,
                        }}
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Mobile backdrop — tap outside to close */}
            {isOpen && isMobile && (
                <div
                    onClick={() => setIsOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 2999,
                        background: 'rgba(0,0,0,0.55)',
                        backdropFilter: 'blur(2px)',
                        WebkitBackdropFilter: 'blur(2px)',
                    }}
                />
            )}

            {/* Dropdown Panel */}
            {isOpen && (
                <div
                    id="notifications-dropdown"
                    style={{
                        ...dropdownPositionStyle,
                        maxHeight: isMobile ? '70vh' : 460,
                        background: 'rgba(18, 22, 36, 0.98)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(34, 197, 94, 0.2)',
                        borderRadius: 16,
                        boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
                        zIndex: 3000,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        animation: 'notifSlideIn 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            padding: '14px 16px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexShrink: 0,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Bell size={15} style={{ stroke: '#22C55E', strokeWidth: 2.5 }} />
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'white' }}>
                                Notifications
                            </span>
                            {unreadCount > 0 && (
                                <span
                                    style={{
                                        background: 'rgba(34,197,94,0.15)',
                                        color: '#22C55E',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: '1px 7px',
                                        borderRadius: 10,
                                        border: '1px solid rgba(34,197,94,0.25)',
                                    }}
                                >
                                    {unreadCount} new
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllRead}
                                    disabled={isMarkingAll}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#22C55E',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        opacity: isMarkingAll ? 0.5 : 1,
                                        padding: '4px 8px',
                                        borderRadius: 6,
                                        transition: 'background 0.2s',
                                        whiteSpace: 'nowrap',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.1)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                                >
                                    {isMarkingAll ? 'Clearing…' : 'Mark all read'}
                                </button>
                            )}
                            {/* ✕ close button — visible on mobile */}
                            {isMobile && (
                                <button
                                    onClick={() => setIsOpen(false)}
                                    aria-label="Close notifications"
                                    style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '50%',
                                        width: 28,
                                        height: 28,
                                        color: '#aaa',
                                        fontSize: 18,
                                        lineHeight: 1,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        transition: 'background 0.2s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Notification List */}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {notifications.length === 0 ? (
                            <div
                                style={{
                                    padding: '40px 16px',
                                    textAlign: 'center',
                                    color: '#555',
                                }}
                            >
                                <Bell
                                    size={32}
                                    style={{
                                        stroke: '#2a3040',
                                        strokeWidth: 1.5,
                                        margin: '0 auto 12px',
                                        display: 'block',
                                    }}
                                />
                                <p style={{ fontSize: 13, color: '#666' }}>
                                    You're all caught up!
                                </p>
                                <p style={{ fontSize: 11, color: '#444', marginTop: 4 }}>
                                    Notifications about your videos appear here.
                                </p>
                            </div>
                        ) : (
                            notifications.map((notif) => (
                                <NotificationItem
                                    key={notif.id}
                                    notif={notif}
                                    onMarkRead={handleMarkRead}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Keyframe styles */}
            <style>{`
                @keyframes bellPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(255, 77, 79, 0.5); }
                    50% { box-shadow: 0 0 0 5px rgba(255, 77, 79, 0); }
                }
                @keyframes notifSlideIn {
                    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}

// ─── sub-component: single notification row ──────────────────────────────────

function NotificationItem({
    notif,
    onMarkRead,
}: {
    notif: Notification;
    onMarkRead: (n: Notification) => void;
}) {
    const isApproval = notif.title.toLowerCase().includes('approved');
    const accentColor = isApproval ? '#22C55E' : '#ff4d4f';
    const bgAccent = isApproval ? 'rgba(34,197,94,0.06)' : 'rgba(255,77,79,0.06)';
    const borderAccent = isApproval ? 'rgba(34,197,94,0.15)' : 'rgba(255,77,79,0.15)';

    return (
        <div
            onClick={() => onMarkRead(notif)}
            style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: notif.is_read ? 'default' : 'pointer',
                background: notif.is_read ? 'transparent' : bgAccent,
                transition: 'background 0.2s',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
            }}
            onMouseEnter={(e) => {
                if (!notif.is_read)
                    e.currentTarget.style.background = isApproval
                        ? 'rgba(34,197,94,0.1)'
                        : 'rgba(255,77,79,0.1)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = notif.is_read ? 'transparent' : bgAccent;
            }}
        >
            {/* Icon Dot */}
            <div
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: `${accentColor}22`,
                    border: `1px solid ${borderAccent}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    flexShrink: 0,
                    marginTop: 2,
                }}
            >
                {isApproval ? '✅' : '❌'}
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: 13,
                        fontWeight: notif.is_read ? 500 : 700,
                        color: notif.is_read ? '#ccc' : 'white',
                        marginBottom: 3,
                        lineHeight: 1.4,
                    }}
                >
                    {notif.title}
                </div>
                <div
                    style={{
                        fontSize: 12,
                        color: '#888',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                    }}
                >
                    {notif.message}
                </div>
                <div
                    style={{
                        fontSize: 11,
                        color: '#555',
                        marginTop: 5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    {timeAgo(notif.created_at)}
                    {!notif.is_read && (
                        <span
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: accentColor,
                                display: 'inline-block',
                                flexShrink: 0,
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
