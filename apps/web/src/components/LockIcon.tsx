export function LockIcon({ tamano = 11, color = 'var(--color-alerta)' }: { tamano?: number; color?: string }) {
    return (
        <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none"
             stroke={color} strokeWidth="2.4" aria-hidden="true">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 018 0v3" />
        </svg>
    );
}
