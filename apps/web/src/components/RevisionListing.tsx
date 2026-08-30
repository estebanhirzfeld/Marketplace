'use client';

import { useActionState, useState } from 'react';
import { Aviso, Boton, Campo } from './ui';

type Estado = { error?: string };

/**
 * Aprobar es un click; rechazar exige escribir el motivo, porque el dominio
 * lo requiere y porque un rechazo sin explicación deja al vendedor sin saber
 * qué corregir.
 */
export function RevisionListing({
    aprobar,
    rechazar,
}: {
    aprobar: (estado: Estado) => Promise<Estado>;
    rechazar: (estado: Estado, datos: FormData) => Promise<Estado>;
}) {
    const [estadoAprobar, enviarAprobar, aprobando] = useActionState(aprobar, {});
    const [estadoRechazar, enviarRechazar, rechazando] = useActionState(rechazar, {});
    const [mostrarRechazo, setMostrarRechazo] = useState(false);

    return (
        <div className="flex flex-col gap-3">
            {estadoAprobar.error && <Aviso>{estadoAprobar.error}</Aviso>}
            {estadoRechazar.error && <Aviso>{estadoRechazar.error}</Aviso>}

            {mostrarRechazo ? (
                <form action={enviarRechazar} className="flex flex-col gap-3">
                    <Campo
                        etiqueta="Motivo del rechazo"
                        name="motivo"
                        required
                        placeholder="Las métricas no coinciden con lo declarado"
                    />
                    <div className="flex gap-2.5">
                        <Boton type="submit" variante="peligro" disabled={rechazando} className="px-4 py-2 text-[13px]">
                            {rechazando ? 'Rechazando…' : 'Confirmar rechazo'}
                        </Boton>
                        <Boton
                            type="button"
                            variante="fantasma"
                            onClick={() => setMostrarRechazo(false)}
                            className="px-4 py-2 text-[13px]"
                        >
                            Volver
                        </Boton>
                    </div>
                </form>
            ) : (
                <div className="flex flex-wrap gap-2.5">
                    <form action={enviarAprobar}>
                        <Boton type="submit" disabled={aprobando} className="px-4 py-2 text-[13px]">
                            {aprobando ? 'Aprobando…' : 'Aprobar y publicar'}
                        </Boton>
                    </form>
                    <Boton
                        type="button"
                        variante="peligro"
                        onClick={() => setMostrarRechazo(true)}
                        className="px-4 py-2 text-[13px]"
                    >
                        Rechazar
                    </Boton>
                </div>
            )}
        </div>
    );
}
