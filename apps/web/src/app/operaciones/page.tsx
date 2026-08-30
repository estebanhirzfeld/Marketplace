import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { MyOperationDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';
import { Reveal } from '@/components/Reveal';
import { ButtonLink, OperationStatusBadge, Heading, EmptyState } from '@/components/ui';
import { money } from '@/lib/format';

export const metadata = { title: 'Mis operaciones · Traspaso' };

export default async function Operaciones() {
    if (!(await currentActor())) redirect('/ingresar');

    let operaciones: MyOperationDto[] = [];
    try {
        operaciones = await api().misOperaciones();
    } catch {
        operaciones = [];
    }

    return (
        <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="Todo lo que estás comprando o vendiendo, con la etapa en la que está cada operación.">
                    Mis operaciones
                </Heading>
            </Reveal>

            <div className="mt-10">
                {operaciones.length === 0 ? (
                    <EmptyState
                        title="Todavía no tenés operaciones"
                        text="Cuando ofertes por un activo, o alguien oferte por uno tuyo, la vas a seguir desde acá."
                        action={<ButtonLink href="/listings">Ver el mercado</ButtonLink>}
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {operaciones.map((op, i) => {
                            const miTurno = op.miParte && op.pendingResponseFrom === op.miParte;
                            return (
                                <Reveal key={op.id} delay={Math.min(i, 6) * 70}>
                                    <Link
                                        href={`/operaciones/${op.id}`}
                                        className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)] p-5 transition-colors hover:border-[var(--color-borde-fuerte)]"
                                    >
                                        <div className="flex flex-col gap-2">
                                            <div className="flex flex-wrap items-center gap-2.5">
                                                <OperationStatusBadge state={op.status} />
                                                {miTurno && (
                                                    <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-acento)]">
                                                        TE TOCA RESPONDER
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[13px] text-[var(--color-apagado)]">
                                                {op.miParte === 'buyer' ? 'Estás comprando' : 'Estás vendiendo'}
                                            </span>
                                        </div>

                                        <span className="font-mono text-[21px] font-bold text-[var(--color-acento)]">
                                            {money(op.currentOfferPrice)}
                                        </span>
                                    </Link>
                                </Reveal>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
