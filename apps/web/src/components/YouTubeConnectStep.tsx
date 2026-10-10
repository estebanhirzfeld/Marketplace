import { Alert } from './ui';
import { SubmitButton } from './SubmitButton';
import {
    describeConnectionFailure,
    type ConnectionFailure,
} from '@/lib/youtubeConnection';

/**
 * El primer paso de publicar un canal: autorizar a YouTube.
 *
 * El vendedor decide una sola cosa —conectar— y lo único que necesita saber es
 * qué se le pide. Cuando vuelve de Google con un problema, el motivo y el botón
 * para reintentar van juntos: un cartel sin salida lo deja donde empezó.
 *
 * Es presentacional: la acción llega por prop, así `/sistema` lo muestra en
 * cada estado sin salir a Google.
 */
export function YouTubeConnectStep({
    startAction,
    failure,
    hasConnections = false,
}: {
    startAction: () => Promise<void>;
    failure?: ConnectionFailure;
    /** Con canales ya conectados, el botón ofrece sumar otro. */
    hasConnections?: boolean;
}) {
    const described = failure ? describeConnectionFailure(failure.reason, failure.detail) : null;
    const label = described?.actionLabel ?? (hasConnections ? 'Conectar otro canal' : 'Conectar con YouTube');

    return (
        <form action={startAction} className="flex flex-col gap-4">
            {described && <Alert tono="alerta">{described.text}</Alert>}

            {!hasConnections && !described && (
                <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                    Te pedimos permiso para ver tu canal y sus estadísticas, incluidos los
                    ingresos. No podemos publicar ni borrar nada.
                </p>
            )}

            <SubmitButton pendingText="Abriendo Google…" variant={hasConnections && !described ? 'secundario' : 'primario'} className="self-start">
                {label}
            </SubmitButton>
        </form>
    );
}
