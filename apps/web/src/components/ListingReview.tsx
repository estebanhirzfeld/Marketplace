'use client';

import { useActionState, useState } from 'react';
import { Alert, Button, Field } from './ui';

type State = { error?: string };

/**
 * Aprobar es un click; rechazar exige escribir el motivo, porque el dominio
 * lo requiere y porque un rechazo sin explicación deja al vendedor sin saber
 * qué corregir.
 */
export function ListingReview({
    approveListing,
    rejectListing,
}: {
    approveListing: (state: State) => Promise<State>;
    rejectListing: (state: State, form: FormData) => Promise<State>;
}) {
    const [estadoAprobar, enviarAprobar, aprobando] = useActionState(approveListing, {});
    const [estadoRechazar, enviarRechazar, rechazando] = useActionState(rejectListing, {});
    const [showRejection, setMostrarRechazo] = useState(false);

    return (
        <div className="flex flex-col gap-3">
            {estadoAprobar.error && <Alert>{estadoAprobar.error}</Alert>}
            {estadoRechazar.error && <Alert>{estadoRechazar.error}</Alert>}

            {showRejection ? (
                <form action={enviarRechazar} className="flex flex-col gap-3">
                    <Field
                        label="Motivo del rechazo"
                        name="motivo"
                        required
                        placeholder="Las métricas no coinciden con lo declarado"
                    />
                    <div className="flex gap-2.5">
                        <Button type="submit" variant="peligro" disabled={rechazando} className="px-4 py-2 text-[13px]">
                            {rechazando ? 'Rechazando…' : 'Confirmar rechazo'}
                        </Button>
                        <Button
                            type="button"
                            variant="fantasma"
                            onClick={() => setMostrarRechazo(false)}
                            className="px-4 py-2 text-[13px]"
                        >
                            Volver
                        </Button>
                    </div>
                </form>
            ) : (
                <div className="flex flex-wrap gap-2.5">
                    <form action={enviarAprobar}>
                        <Button type="submit" disabled={aprobando} className="px-4 py-2 text-[13px]">
                            {aprobando ? 'Aprobando…' : 'Aprobar y publicar'}
                        </Button>
                    </form>
                    <Button
                        type="button"
                        variant="peligro"
                        onClick={() => setMostrarRechazo(true)}
                        className="px-4 py-2 text-[13px]"
                    >
                        Rechazar
                    </Button>
                </div>
            )}
        </div>
    );
}
