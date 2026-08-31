'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export interface NotificationPreview {
    id: string;
    title: string;
    body: string;
    href: string;
    when: string;
    read: boolean;
}

/**
 * La campana con las novedades recientes.
 *
 * Es un desplegable y no un enlace directo porque el aviso suele ser
 * consultable de un vistazo —te toca responder, se firmó el contrato— y
 * mandar a otra pantalla para leer una línea es más fricción de la que el
 * contenido justifica. Los avisos completos siguen estando en `/avisos`.
 *
 * El contenido se resuelve del lado del servidor y llega ya redactado: acá
 * solo vive el abrir y cerrar, que es lo único que necesita el navegador.
 */
export function NotificationDropdown({
    items,
    unread,
}: {
    items: NotificationPreview[];
    unread: number;
}) {
    const [open, setOpen] = useState(false);
    const contenedor = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        function alClickear(evento: MouseEvent) {
            if (!contenedor.current?.contains(evento.target as Node)) setOpen(false);
        }
        function alTeclear(evento: KeyboardEvent) {
            if (evento.key === 'Escape') setOpen(false);
        }

        document.addEventListener('mousedown', alClickear);
        document.addEventListener('keydown', alTeclear);
        return () => {
            document.removeEventListener('mousedown', alClickear);
            document.removeEventListener('keydown', alTeclear);
        };
    }, [open]);

    return (
        <div ref={contenedor} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="true"
                aria-label={unread > 0 ? `${unread} avisos sin leer` : 'Avisos'}
                className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] transition-colors hover:border-[var(--color-tenue)]"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={unread > 0 ? 'var(--color-acento)' : 'var(--color-tenue)'}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
                    <path d="M13.7 21a2 2 0 01-3.4 0" />
                </svg>

                {unread > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-acento)] px-1 font-mono text-[10px] font-bold text-[var(--color-fondo)]">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-11 z-50 w-[320px] overflow-hidden rounded-[var(--radius-medio)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] shadow-lg sm:w-[360px]">
                    <div className="border-b border-[var(--color-borde)] px-4 py-3">
                        <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-apagado)]">
                            AVISOS
                        </span>
                    </div>

                    {items.length === 0 ? (
                        <p className="px-4 py-6 text-[13px] leading-relaxed text-[var(--color-tenue)]">
                            No hay avisos todavía. Cuando alguien oferte por un activo tuyo, o avance
                            una operación en la que sos parte, te vas a enterar acá.
                        </p>
                    ) : (
                        <ul className="flex max-h-[340px] flex-col divide-y divide-[var(--color-borde-sutil)] overflow-y-auto">
                            {items.map((n) => (
                                <li key={n.id}>
                                    <Link
                                        href={n.href}
                                        onClick={() => setOpen(false)}
                                        className={`flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-[var(--color-fondo)] ${
                                            n.read ? 'opacity-60' : ''
                                        }`}
                                    >
                                        <span className="flex items-center gap-2">
                                            {!n.read && (
                                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-acento)]" />
                                            )}
                                            <span className="text-[13px] font-medium">{n.title}</span>
                                        </span>
                                        <span className="text-[12px] leading-relaxed text-[var(--color-tenue)]">
                                            {n.body}
                                        </span>
                                        <span className="font-mono text-[10px] text-[var(--color-apagado)]">
                                            {n.when}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}

                    <Link
                        href="/avisos"
                        onClick={() => setOpen(false)}
                        className="block border-t border-[var(--color-borde)] px-4 py-3 text-center text-[13px] text-[var(--color-acento)] transition-colors hover:bg-[var(--color-fondo)]"
                    >
                        Ver todos los avisos
                    </Link>
                </div>
            )}
        </div>
    );
}
