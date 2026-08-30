import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { ContractDocumentDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';
import { Reveal } from '@/components/Reveal';
import { ContractDocumentPanel } from '@/components/ContractDocumentPanel';
import { Heading } from '@/components/ui';

const TITULOS: Record<ContractDocumentDto['type'], string> = {
    buyer_nda: 'Acuerdo de confidencialidad',
    seller_nda: 'Acuerdo de confidencialidad y publicación',
    tripartite: 'Contrato de compraventa',
};

export default async function VerContrato(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;

    if (!(await currentActor())) redirect('/ingresar');

    let doc: ContractDocumentDto;
    try {
        doc = await api().documentoDelContrato(id);
    } catch (e) {
        if (e instanceof ApiError && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) notFound();
        throw e;
    }

    return (
        <div className="mx-auto max-w-[900px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading
                    sub={
                        doc.signed
                            ? 'Este documento ya está firmado. Podés consultarlo cuando quieras.'
                            : 'Leelo completo antes de firmar. Tu firma va a quedar atada a este texto exacto.'
                    }
                >
                    {TITULOS[doc.type]}
                </Heading>
            </Reveal>

            <div className="mt-8">
                <Link href="/operaciones" className="text-[14px] text-[var(--color-tenue)]">
                    ← Volver a mis operaciones
                </Link>
            </div>

            <div className="mt-6">
                <Reveal>
                    <ContractDocumentPanel doc={doc} />
                </Reveal>
            </div>
        </div>
    );
}
