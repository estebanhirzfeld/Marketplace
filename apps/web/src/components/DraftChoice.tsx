import { ChannelAvatar } from './ChannelAvatar';
import { ButtonLink } from './ui';
import { SubmitButton } from './SubmitButton';

/**
 * La vista de «Vender» cuando el canal que el vendedor conectó ya tiene un
 * borrador: seguir con ese o traer otro canal desde YouTube.
 *
 * Son dos tarjetas del mismo peso; la del borrador lleva el acento porque es lo
 * que casi siempre se quiere. Lo que falta del borrador (el precio) se dice en
 * la propia tarjeta, para que el botón no prometa «solo falta publicarlo» cuando
 * todavía no se puede.
 */
export function DraftChoice({
    channelTitle,
    thumbnailUrl,
    hasPrice,
    draftHref,
    connectAction,
}: {
    channelTitle: string;
    thumbnailUrl?: string;
    hasPrice: boolean;
    draftHref: string;
    connectAction: () => Promise<void>;
}) {
    return (
        <section className="flex flex-col gap-7">
            <h1 className="text-[30px] font-bold tracking-[-0.03em] sm:text-[32px]">
                Tenés un canal a medio publicar
            </h1>

            <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-[18px] rounded-[var(--radius-grande)] border-2 border-[var(--color-acento)] bg-[var(--color-superficie)] p-7">
                    <div className="flex items-center gap-3.5">
                        <ChannelAvatar src={thumbnailUrl} name={channelTitle} shape="square" />
                        <div className="flex min-w-0 flex-col gap-1">
                            <span className="truncate text-[20px] font-bold">{channelTitle}</span>
                            <span className="self-start rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] px-2 py-0.5 font-mono text-[11px] tracking-[0.1em] text-[var(--color-tenue)]">
                                BORRADOR
                            </span>
                        </div>
                    </div>
                    <p className="text-[15px] leading-relaxed text-[var(--color-tenue)]">
                        {hasPrice ? 'Ya tiene precio: solo falta publicarlo.' : 'Te falta ponerle precio.'}
                    </p>
                    <ButtonLink href={draftHref} className="mt-auto min-h-[50px] justify-center">
                        Continuar con este borrador
                    </ButtonLink>
                </div>

                <div className="flex flex-col gap-[18px] rounded-[var(--radius-grande)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-7">
                    <span
                        aria-hidden="true"
                        className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-chico)] border border-dashed border-[var(--color-borde-fuerte)] text-[26px] text-[var(--color-tenue)]"
                    >
                        +
                    </span>
                    <span className="text-[20px] font-bold">Publicar otro canal</span>
                    <p className="text-[15px] leading-relaxed text-[var(--color-tenue)]">
                        Te llevamos a YouTube para que elijas cuál.
                    </p>
                    <form action={connectAction} className="mt-auto flex">
                        <SubmitButton pendingText="Abriendo Google…" variant="secundario" className="min-h-[50px] w-full justify-center">
                            Conectar otro canal
                        </SubmitButton>
                    </form>
                </div>
            </div>
        </section>
    );
}
