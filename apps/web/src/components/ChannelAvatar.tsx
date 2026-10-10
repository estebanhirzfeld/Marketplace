'use client';

import { useState } from 'react';

/**
 * La foto del canal, o su inicial si no se puede mostrar.
 *
 * `referrerPolicy="no-referrer"`: la foto es de `yt3.ggpht.com` y en Firefox y
 * derivados no cargaba aunque la dirección respondiera 200, porque Google la
 * rechaza según el referrer. Y si igual falla, un `<img>` roto es peor que no
 * tener foto: se cae al marcador con la inicial.
 */
export function ChannelAvatarView({
    src,
    name,
    failed,
    onError,
}: {
    src?: string;
    name: string;
    failed: boolean;
    onError: () => void;
}) {
    if (src && !failed) {
        return (
            // Una foto de Google: next/image exigiría declarar el dominio
            // para una imagen de 48 píxeles que no necesita optimización.
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={src}
                alt=""
                width={48}
                height={48}
                referrerPolicy="no-referrer"
                onError={onError}
                className="h-12 w-12 rounded-full border border-[var(--color-borde)] object-cover"
            />
        );
    }

    return (
        <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-borde-fuerte)] text-[18px] font-bold text-[var(--color-tenue)]"
        >
            {name.trim().charAt(0).toUpperCase() || '?'}
        </span>
    );
}

export function ChannelAvatar({ src, name }: { src?: string; name: string }) {
    const [failed, setFailed] = useState(false);

    return <ChannelAvatarView src={src} name={name} failed={failed} onError={() => setFailed(true)} />;
}
