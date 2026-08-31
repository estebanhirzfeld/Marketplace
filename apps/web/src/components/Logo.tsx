export function Logo({ tamano = 20 }: { tamano?: number }) {
    return (
        <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none"
             stroke="var(--color-acento)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 18l6-7 4 4 6-9" />
        </svg>
    );
}
