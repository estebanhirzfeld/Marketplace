import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { ReportDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { requireCounterparty } from '@/lib/guards';
import { Reveal } from '@/components/Reveal';
import { Panel, Heading, EmptyState } from '@/components/ui';
import { MOTIVOS } from '@/components/ReportReasons';

export const metadata = { title: 'Reclamos · Traspaso' };

export default async function Denuncias() {
    await requireCounterparty();

    let reports: ReportDto[] = [];
    let error: string | undefined;

    try {
        reports = await api().misDenuncias();
    } catch (e) {
        error = e instanceof ApiError ? e.message : 'No pudimos cargar tus reclamos.';
    }

    return (
        <div className="mx-auto max-w-[900px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="Los reclamos que abriste y los que se abrieron contra vos. La plataforma no decide quién tiene razón: reúne lo que registró y se lo entrega a las dos partes.">
                    Reclamos
                </Heading>
            </Reveal>

            <div className="mt-10 flex flex-col gap-5">
                {error ? (
                    <EmptyState title="No pudimos cargar los reclamos" text={error} />
                ) : reports.length === 0 ? (
                    <EmptyState
                        title="No tenés reclamos"
                        text="Si algo sale mal en una operación después de firmado el contrato, vas a poder abrir uno desde la operación."
                    />
                ) : (
                    reports.map((r, i) => (
                        <Reveal key={r.id} delay={Math.min(i, 6) * 80}>
                            <Panel title={MOTIVOS[r.reason]}>
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-apagado)]">
                                            {r.miRol === 'denunciante' ? 'LO ABRISTE VOS' : 'CONTRA VOS'}
                                        </span>
                                        <span
                                            className={`font-mono text-[10px] tracking-[0.08em] ${
                                                r.status === 'open'
                                                    ? 'text-[var(--color-alerta)]'
                                                    : 'text-[var(--color-apagado)]'
                                            }`}
                                        >
                                            {r.status === 'open' ? 'ABIERTO' : 'CERRADO'}
                                        </span>
                                    </div>

                                    <p className="text-[14px] leading-relaxed">{r.detail}</p>

                                    <Link
                                        href={`/denuncias/${r.id}`}
                                        className="text-[13px] text-[var(--color-acento)]"
                                    >
                                        Ver el legajo →
                                    </Link>
                                </div>
                            </Panel>
                        </Reveal>
                    ))
                )}
            </div>
        </div>
    );
}
