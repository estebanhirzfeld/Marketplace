import Link from 'next/link';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';

/**
 * Contador de avisos sin leer. Es la única señal de que pasó algo mientras la
 * persona no estaba mirando.
 */
export async function NotificationBell() {
    if (!(await currentActor())) return null;

    let sinLeer = 0;
    try {
        sinLeer = (await api().notificaciones(true)).sinLeer;
    } catch {
        // La bandeja caída no debe romper el navbar.
        return null;
    }

    return (
        <Link
            href="/avisos"
            aria-label={sinLeer > 0 ? `${sinLeer} avisos sin leer` : 'Avisos'}
            className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] transition-colors hover:border-[var(--color-tenue)]"
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke={sinLeer > 0 ? 'var(--color-acento)' : 'var(--color-tenue)'}
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
                <path d="M13.7 21a2 2 0 01-3.4 0" />
            </svg>

            {sinLeer > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-acento)] px-1 font-mono text-[10px] font-bold text-[var(--color-fondo)]">
                    {sinLeer > 9 ? '9+' : sinLeer}
                </span>
            )}
        </Link>
    );
}
