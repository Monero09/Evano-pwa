import { useEffect, useState } from 'react';

interface SplashScreenProps {
    onDone: () => void;
}

export default function SplashScreen({ onDone }: SplashScreenProps) {
    const [fading, setFading] = useState(false);

    useEffect(() => {
        // Hold for 1.4s then fade out over 0.5s, then unmount
        const fadeTimer = setTimeout(() => setFading(true), 1400);
        const doneTimer = setTimeout(() => onDone(), 1900);

        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(doneTimer);
        };
    }, [onDone]);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: '#0B0F19',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 99999,
                opacity: fading ? 0 : 1,
                transition: 'opacity 0.5s ease',
                pointerEvents: fading ? 'none' : 'all',
            }}
        >
            {/* Logo — fades + scales in via CSS animation */}
            <img
                src="/logo.png"
                alt="Evano Streams"
                style={{
                    width: 200,
                    maxWidth: '60vw',
                    height: 'auto',
                    animation: 'splashLogoIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                }}
            />

            {/* Green pulse bar below logo */}
            <div
                style={{
                    marginTop: 32,
                    width: 48,
                    height: 3,
                    borderRadius: 99,
                    background: '#22C55E',
                    animation: 'splashPulse 1.1s ease-in-out infinite',
                }}
            />

            <style>{`
                @keyframes splashLogoIn {
                    from {
                        opacity: 0;
                        transform: scale(0.82) translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }

                @keyframes splashPulse {
                    0%, 100% {
                        transform: scaleX(1);
                        opacity: 0.45;
                    }
                    50% {
                        transform: scaleX(2);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
}
