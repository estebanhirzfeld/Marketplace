'use client';

import { useEffect, useRef, useState } from 'react';
import { copyText } from '@/lib/clipboard';

/** Cuánto se muestra «Copiado» antes de volver a la dirección. */
const COPIED_MS = 2000;

export function CopyEmailButtonView({
    email,
    copied,
    onCopy,
}: {
    email: string;
    copied: boolean;
    onCopy: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={`Copiar ${email}`}
            onClick={onCopy}
            className="flex min-h-11 items-center gap-3 self-start break-all rounded-[var(--radius-chico)] bg-[var(--color-fondo)] px-3 py-2.5 text-left font-mono text-[14px] text-[var(--color-acento)] transition-colors hover:text-[var(--color-tinta)]"
        >
            <span>{email}</span>
            <span aria-live="polite" className="shrink-0 text-[12px] text-[var(--color-tenue)]">
                {copied ? 'Copiado' : ''}
            </span>
        </button>
    );
}

/** El mail de la cuenta de custodia: un clic y queda en el portapapeles. */
export function CopyEmailButton({ email }: { email: string }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    async function copy() {
        const ok = await copyText(email, typeof navigator === 'undefined' ? undefined : navigator.clipboard);
        if (!ok) return;
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    }

    return <CopyEmailButtonView email={email} copied={copied} onCopy={copy} />;
}
