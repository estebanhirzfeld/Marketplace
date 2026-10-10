import type { YouTubeConnectionDto } from '@marketplace/api-contract';
import { formatNumber, money } from '@/lib/format';
import { nombreDePais } from './paises';
import { ChannelAvatar } from './ChannelAvatar';
import { VerificationSeal } from './VerificationSeal';

/**
 * El canal que el vendedor conectó, tal como lo leyó Google.
 *
 * Es de solo lectura a propósito: son los números que va a ver el comprador y
 * no se tipean. Cada número lleva su unidad y su período, y un cero se muestra
 * como cero: ocultarlo haría pensar que la lectura falló.
 *
 * Es presentacional y no hace pedidos: `/vender` le pasa la conexión y
 * `/sistema` la muestra con datos inventados.
 */
export function VerifiedChannelCard({ channel }: { channel: YouTubeConnectionDto }) {
    const hasRevenue = channel.revenue12MonthsCents > 0;

    return (
        <div className="flex flex-col gap-5 rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)] p-5">
            <div className="flex items-center gap-4">
                <ChannelAvatar src={channel.thumbnailUrl} name={channel.channelTitle} />
                <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[17px] font-bold">{channel.channelTitle}</span>
                    <VerificationSeal source="YouTube" at={channel.readAt} />
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <Stat value={formatNumber(channel.subscribers)} caption="suscriptores" />
                <Stat value={formatNumber(channel.views12Months)} caption="vistas en los últimos 12 meses" />
                {hasRevenue ? (
                    <Stat
                        value={money({ cents: channel.revenue12MonthsCents, currency: 'USD' })}
                        caption="de ingresos en los últimos 12 meses"
                    />
                ) : (
                    <div className="flex flex-col gap-1">
                        <span className="text-[15px] text-[var(--color-tenue)]">
                            Sin ingresos en los últimos 12 meses
                        </span>
                    </div>
                )}
            </div>

            {channel.topCountry && (
                <p className="text-[13px] text-[var(--color-tenue)]">
                    Audiencia principal {nombreDePais(channel.topCountry)}
                </p>
            )}

            {/* Sin vistas hay dos explicaciones: el canal es nuevo o no tiene
                actividad. La plataforma no sabe la fecha de alta, así que el
                aviso del retraso se condiciona a lo único que se ve. */}
            {channel.views12Months === 0 && (
                <p className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                    Si tu canal es nuevo: YouTube tarda hasta 3 días en informar las estadísticas.
                </p>
            )}
        </div>
    );
}

function Stat({ value, caption }: { value: string; caption: string }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="font-mono text-[22px] font-bold leading-none">{value}</span>
            <span className="text-[13px] text-[var(--color-apagado)]">{caption}</span>
        </div>
    );
}
