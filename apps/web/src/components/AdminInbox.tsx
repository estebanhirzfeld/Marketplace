import Link from 'next/link';
import type { MyListingDto } from '@marketplace/api-contract';

/** Lo único que la tabla necesita de cada activo. */
export type AccessInboxRow = Pick<MyListingDto, 'id' | 'assetType' | 'assetName' | 'sellerName' | 'platformAccessRequestedAt'>;
import { AssetMark } from './AssetTypeCard';
import { SubmitButton } from './SubmitButton';
import { EmptyState } from './ui';
import { shortAgo, type InboxCounts, type InboxTab } from '@/lib/adminInbox';

const TAB_LABELS: Record<InboxTab, string> = {
    accesos: 'Accesos por verificar',
    revision: 'Activos por revisar',
    reclamos: 'Reclamos',
};

/** Las pestañas de la bandeja: cada una es un enlace, así que se comparte y funciona sin JavaScript. */
export function InboxTabs({ active, counts }: { active: InboxTab; counts: InboxCounts }) {
    return (
        <nav aria-label="Bandeja" className="mt-10 flex flex-wrap gap-1 border-b border-[var(--color-borde)]">
            {(Object.keys(TAB_LABELS) as InboxTab[]).map((key) => {
                const isActive = key === active;
                const pending = counts[key] > 0;
                return (
                    <Link
                        key={key}
                        href={`/admin?bandeja=${key}`}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex min-h-11 items-center gap-2 border-b-2 px-4 text-[15px] transition-colors ${
                            isActive
                                ? 'border-[var(--color-acento)] text-[var(--color-tinta)]'
                                : 'border-transparent text-[var(--color-tenue)] hover:text-[var(--color-tinta)]'
                        }`}
                    >
                        {TAB_LABELS[key]}
                        <span
                            className={`rounded-full px-[7px] py-px font-mono text-[12px] ${
                                pending
                                    ? 'bg-[var(--color-alerta)] text-[var(--color-fondo)]'
                                    : 'bg-[var(--color-borde-fuerte)] text-[var(--color-apagado)]'
                            }`}
                        >
                            {counts[key]}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}

/**
 * La bandeja de accesos: una fila por activo que esperó nuestra verificación.
 * Las dos acciones son las de siempre; lo que cambia es que escalan en una
 * tabla en vez de apilarse en un panel.
 */
export function AccessInbox({
    listings,
    now,
    verifyAction,
    rejectAction,
}: {
    listings: AccessInboxRow[];
    now: Date;
    verifyAction: (listingId: string) => Promise<void>;
    rejectAction: (listingId: string) => Promise<void>;
}) {
    if (listings.length === 0) {
        return (
            <EmptyState
                title="No hay accesos por verificar"
                text="Cuando un vendedor avise que ya nos dio acceso a su activo va a aparecer acá."
            />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <p className="text-[14px] text-[var(--color-tenue)]">
                Entrá con la cuenta de custodia y verificá el acceso al activo.
            </p>
            <div className="overflow-hidden rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)]">
                <div className="hidden grid-cols-[2fr_1.4fr_1fr_2.6fr] gap-3 border-b border-[var(--color-borde)] px-5 py-3 font-mono text-[11px] tracking-[0.1em] text-[var(--color-apagado)] md:grid">
                    <span>ACTIVO</span>
                    <span>VENDEDOR</span>
                    <span>AVISÓ</span>
                    <span />
                </div>
                {listings.map((l) => {
                    const recent = l.platformAccessRequestedAt
                        ? now.getTime() - new Date(l.platformAccessRequestedAt).getTime() < 24 * 60 * 60 * 1000
                        : false;
                    return (
                        <div
                            key={l.id}
                            className="grid items-center gap-3 border-b border-[var(--color-borde)] px-5 py-4 last:border-0 md:grid-cols-[2fr_1.4fr_1fr_2.6fr]"
                        >
                            <span className="flex items-center gap-2.5">
                                <AssetMark assetType={l.assetType} width={22} />
                                <Link
                                    href={`/listings/${l.id}`}
                                    className="truncate text-[15px] transition-colors hover:text-[var(--color-acento)]"
                                >
                                    {l.assetName ?? 'Activo sin nombre'}
                                </Link>
                            </span>
                            <span className="truncate text-[14px] text-[var(--color-tenue)]">{l.sellerName ?? '—'}</span>
                            <span
                                className={`font-mono text-[13px] ${
                                    recent ? 'text-[var(--color-alerta)]' : 'text-[var(--color-tenue)]'
                                }`}
                            >
                                {l.platformAccessRequestedAt ? shortAgo(l.platformAccessRequestedAt, now) : '—'}
                            </span>
                            <span className="flex flex-wrap gap-2 md:justify-end">
                                <form action={verifyAction.bind(null, l.id)}>
                                    <SubmitButton pendingText="Verificando…" className="min-h-10 px-3.5 py-2 text-[14px]">
                                        Verificar acceso
                                    </SubmitButton>
                                </form>
                                <form action={rejectAction.bind(null, l.id)}>
                                    <SubmitButton
                                        pendingText="Avisando…"
                                        variant="secundario"
                                        className="min-h-10 px-3.5 py-2 text-[14px]"
                                    >
                                        No encontramos la invitación
                                    </SubmitButton>
                                </form>
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
