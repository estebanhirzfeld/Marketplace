'use client';

import { useEffect, useRef, useState } from 'react';
import { copyText } from '@/lib/clipboard';

/** Cuánto se muestra «Copiado» antes de volver al valor. */
const COPIED_MS = 2000;

export function CopyValueButtonView({
    value,
    label,
    copied,
    onCopy,
}: {
    value: string;
    /** Lo que lee el lector de pantalla. Sin él, «Copiar <valor>». */
    label?: string;
    copied: boolean;
    onCopy: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={label ?? `Copiar ${value}`}
            onClick={onCopy}
            className="flex min-h-11 items-center gap-3 self-start break-all rounded-[var(--radius-chico)] bg-[var(--color-fondo)] px-3 py-2.5 text-left font-mono text-[14px] text-[var(--color-acento)] transition-colors hover:text-[var(--color-tinta)]"
        >
            <span>{value}</span>
            <span aria-live="polite" className="shrink-0 text-[12px] text-[var(--color-tenue)]">
                {copied ? 'Copiado' : ''}
            </span>
        </button>
    );
}

/**
 * Un valor que se copia con un clic: el mail de la cuenta de custodia, el TXT
 * del DNS. Si el navegador no deja copiar, el botón queda como estaba.
 */
export function CopyValueButton({ value, label }: { value: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    async function copy() {
        const ok = await copyText(value, typeof navigator === 'undefined' ? undefined : navigator.clipboard);
        if (!ok) return;
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    }

    return <CopyValueButtonView value={value} label={label} copied={copied} onCopy={copy} />;
}
