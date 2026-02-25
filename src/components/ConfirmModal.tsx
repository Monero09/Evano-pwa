import { useEffect } from 'react';

type ConfirmModalProps = {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void | Promise<void>;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
};

export default function ConfirmModal({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDestructive = false,
}: ConfirmModalProps) {
    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    return (
        // Backdrop — click outside to cancel
        <div
            onClick={onCancel}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                animation: 'cmFadeIn 0.15s ease',
            }}
        >
            {/* Modal card — stop click from bubbling to backdrop */}
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'linear-gradient(135deg, #1A1F2E 0%, #0B0F19 100%)',
                    border: `1px solid ${isDestructive ? 'rgba(255,77,79,0.3)' : 'rgba(214,0,116,0.25)'}`,
                    borderRadius: 16,
                    padding: '32px 28px',
                    maxWidth: 420,
                    width: '100%',
                    boxShadow: `0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)`,
                    animation: 'cmSlideIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
            >
                {/* Icon */}
                <div style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: isDestructive
                        ? 'rgba(255, 77, 79, 0.12)'
                        : 'rgba(34, 197, 94, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    marginBottom: 20,
                    border: `1px solid ${isDestructive ? 'rgba(255,77,79,0.25)' : 'rgba(34,197,94,0.25)'}`,
                }}>
                    {isDestructive ? '🗑' : '⚠️'}
                </div>

                {/* Title */}
                <h2 style={{
                    margin: '0 0 10px',
                    fontSize: 20,
                    fontWeight: 700,
                    color: '#ffffff',
                    lineHeight: 1.3,
                }}>
                    {title}
                </h2>

                {/* Message */}
                <p style={{
                    margin: '0 0 28px',
                    fontSize: 14,
                    color: '#9CA3AF',
                    lineHeight: 1.6,
                }}>
                    {message}
                </p>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 12 }}>
                    {/* Cancel — always secondary */}
                    <button
                        onClick={onCancel}
                        style={{
                            flex: 1,
                            padding: '11px 16px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(255,255,255,0.06)',
                            color: '#D1D5DB',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                            e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                            e.currentTarget.style.color = '#D1D5DB';
                        }}
                    >
                        {cancelText}
                    </button>

                    {/* Confirm — red if destructive, brand gradient otherwise */}
                    <button
                        onClick={onConfirm}
                        style={{
                            flex: 1,
                            padding: '11px 16px',
                            borderRadius: 8,
                            border: 'none',
                            background: isDestructive
                                ? 'linear-gradient(135deg, #dc2626, #ff4d4f)'
                                : 'linear-gradient(135deg, #16A34A, #22C55E)',
                            color: 'white',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxShadow: isDestructive
                                ? '0 4px 16px rgba(220,38,38,0.35)'
                                : '0 4px 16px rgba(214,0,116,0.35)',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '0.88';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>

            {/* Keyframe animations injected inline */}
            <style>{`
                @keyframes cmFadeIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes cmSlideIn {
                    from { opacity: 0; transform: scale(0.88) translateY(12px); }
                    to   { opacity: 1; transform: scale(1)    translateY(0);    }
                }
            `}</style>
        </div>
    );
}
