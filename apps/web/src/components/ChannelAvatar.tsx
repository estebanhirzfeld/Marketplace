'use client';

import { useState } from 'react';

/**
 * La foto del canal, o su inicial si no se puede mostrar.
 *
 * `referrerPolicy="no-referrer"`: la foto es de `yt3.ggpht.com` y en Firefox y
 * derivados no cargaba aunque la dirección respondiera 200, porque Google la
 * rechaza según el referrer. Y si igual falla, un `<img>` roto es peor que no
 * tener foto: se cae al marcador con la inicial.
 *
 * `shape`: redonda para la ficha del canal; cuadrada, con el radio chico del
 * sistema, para las filas de un listado.
 */
export type ChannelAvatarShape = 'circle' | 'square';

const FORMA: Record<ChannelAvatarShape, string> = {
    circle: 'rounded-full',
    square: 'rounded-[var(--radius-chico)]',
};

export function ChannelAvatarView({
    src,
    name,
    failed,
    onError,
    shape = 'circle',
}: {
    src?: string;
    name: string;
    failed: boolean;
    onError: () => void;
    shape?: ChannelAvatarShape;
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
                className={`h-12 w-12 flex-none ${FORMA[shape]} border border-[var(--color-borde)] object-cover`}
            />
        );
    }

    return (
        <span
            aria-hidden="true"
            className={`flex h-12 w-12 flex-none items-center justify-center ${FORMA[shape]} border border-[var(--color-borde-fuerte)] text-[18px] font-bold text-[var(--color-tenue)]`}
        >
            {name.trim().charAt(0).toUpperCase() || '?'}
        </span>
    );
}

export function ChannelAvatar({ src, name, shape }: { src?: string; name: string; shape?: ChannelAvatarShape }) {
    const [failed, setFailed] = useState(false);

    return <ChannelAvatarView src={src} name={name} failed={failed} onError={() => setFailed(true)} shape={shape} />;
}
