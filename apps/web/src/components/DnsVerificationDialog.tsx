'use client';

import { startTransition, useActionState, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DomainOwnershipChallengeDto } from '@marketplace/api-contract';
import type { DomainCheckState } from '@/app/vender/actions';
import { DNS_CHOICES, DNS_PROVIDERS, dnsChoiceName, type DnsChoice } from '@/lib/dnsProviders';
import {
    DNS_DELAYED_AFTER_ATTEMPTS,
    DNS_POLL_INTERVAL_MS,
    DNS_POLL_MAX_ATTEMPTS,
    dnsCheckStatus,
    shouldPoll,
    type DnsCheckStatus,
} from '@/lib/dnsCheckStatus';
import { safeChallenge, safeCheck, visibleCheckState, type ChallengeResult } from '@/lib/dnsDialogActions';
import { Alert, Button, CheckIcon, ExternalButtonLink } from './ui';
import { CopyValueButton } from './CopyValueButton';
import { DnsRecordMock } from './DnsMock';
import { SubmitButton } from './SubmitButton';

const TXT_LABEL = 'Copiar el valor del registro';

/**
 * El contenido del diálogo de la comprobación por DNS, sin estado: lo que dice
 * cada momento. Lo monta `DnsVerificationDialog` con la consulta real y
 * `/sistema` con datos de muestra. Los manejadores son opcionales justamente
 * por eso: en el catálogo no hay nada que consultar.
 *
 * El «por qué» es un `<details>` nativo: se pliega sin estado propio.
 */
export function DnsVerificationDialogView({
    challenge,
    loadError,
    status,
    error,
    checking,
    onCheckNow,
    onRetryLoad,
    adsenseAction,
    selectedProvider = null,
    onSelectProvider,
    unsureOpen = false,
    onToggleUnsure,
}: {
    /** El registro a cargar, o `null` mientras se pide o si no se pudo pedir. */
    challenge: DomainOwnershipChallengeDto | null;
    loadError?: string;
    status: DnsCheckStatus;
    /** Motivo cuando `status` es `error`. */
    error?: string;
    checking: boolean;
    onCheckNow?: () => void;
    /** Vuelve a pedir el registro cuando no se pudo pedir. */
    onRetryLoad?: () => void;
    adsenseAction: () => Promise<void>;
    /** Dónde dijo el vendedor que maneja su DNS. Nunca se deduce: lo elige él. */
    selectedProvider?: DnsChoice | null;
    onSelectProvider?: (choice: DnsChoice) => void;
    /** «No sé» desplegado. */
    unsureOpen?: boolean;
    onToggleUnsure?: () => void;
    // Los manejadores son opcionales porque `/sistema` pinta cada estado con
    // `selectedProvider` y `unsureOpen` fijos, sin nada que escuchar.
}) {
    return (
        <div className="grid md:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex min-w-0 flex-col gap-6 px-6 py-6">
            {challenge ? (
                <>
                    <RecordStep challenge={challenge} />
                    <ProviderStep
                        challenge={challenge}
                        selected={selectedProvider}
                        onSelect={onSelectProvider}
                        unsureOpen={unsureOpen}
                        onToggleUnsure={onToggleUnsure}
                    />
                    <StatusArea status={status} error={error} checking={checking} onCheckNow={onCheckNow} />
                </>
            ) : loadError ? (
                <div className="flex flex-col items-start gap-3">
                    <Alert>{loadError}</Alert>
                    {onRetryLoad && (
                        <Button type="button" variant="secundario" onClick={onRetryLoad} className="px-4 py-2.5">
                            Reintentar
                        </Button>
                    )}
                </div>
            ) : (
                <p role="status" className="text-[15px] text-[var(--color-tenue)]">
                    Preparando tu registro…
                </p>
            )}

            <Why />

            <form
                action={adsenseAction}
                className="flex flex-wrap items-center gap-x-2 border-t border-[var(--color-borde)] pt-4 text-[14px] text-[var(--color-tenue)]"
            >
                <span>¿Tenés AdSense?</span>
                <SubmitButton
                    variant="fantasma"
                    pendingText="Redirigiendo a Google…"
                    className="min-h-11 px-0 py-0 text-[14px] underline underline-offset-[3px]"
                >
                    Comprobalo con AdSense, que además verifica tus ingresos
                </SubmitButton>
            </form>
        </div>
        {challenge && (
            <div className="hidden items-start justify-center border-l border-[var(--color-borde)] bg-[var(--color-fondo)]/60 p-6 md:flex">
                <DnsRecordMock host={challenge.host} value={challenge.value} />
            </div>
        )}
        </div>
    );
}

function RecordStep({ challenge }: { challenge: DomainOwnershipChallengeDto }) {
    const isSubdomain = challenge.host !== '@';
    return (
        <section className="flex flex-col gap-3">
            <StepTitle n={1}>Agregá este registro</StepTitle>
            <dl className="flex flex-col gap-3 rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie-alta)] p-4">
                <Row label="Tipo">
                    <span className="font-mono text-[14px] text-[var(--color-tinta)]">TXT</span>
                </Row>
                <Row label="Nombre">
                    <span className="break-all font-mono text-[14px] text-[var(--color-tinta)]">{challenge.host}</span>
                    {isSubdomain && (
                        <span className="text-[13px] text-[var(--color-apagado)]">
                            Es el nombre completo. Si tu panel agrega el dominio solo, poné solo la parte que va antes de él.
                        </span>
                    )}
                </Row>
                <Row label="Valor">
                    <CopyValueButton value={challenge.value} label={TXT_LABEL} />
                </Row>
            </dl>
            <p className="text-[13px] text-[var(--color-apagado)]">Si te pide TTL, dejá el valor que viene por defecto.</p>
        </section>
    );
}

function ProviderStep({
    challenge,
    selected,
    onSelect,
    unsureOpen,
    onToggleUnsure,
}: {
    challenge: DomainOwnershipChallengeDto;
    selected: DnsChoice | null;
    onSelect?: (choice: DnsChoice) => void;
    unsureOpen: boolean;
    onToggleUnsure?: () => void;
}) {
    // En un subdominio la zona es la del dominio principal, que no sabemos nombrar.
    const zone = challenge.host === '@' ? challenge.domain : 'tu dominio';
    const provider = selected && selected !== 'other' ? DNS_PROVIDERS[selected] : null;
    const guess = challenge.provider ? DNS_PROVIDERS[challenge.provider] : null;
    const steps = selected
        ? [
              provider ? `Entrá a tu cuenta de ${provider.name}.` : 'Entrá al panel donde administrás el DNS de tu dominio.',
              `Buscá la sección DNS de ${zone}${provider ? '' : ' (a veces se llama «Zona DNS» o «Registros»)'} y agregá un registro nuevo de tipo TXT.`,
              'Pegá el nombre y el valor de arriba, y guardá.',
          ]
        : [];
    return (
        <section className="flex flex-col gap-3">
            <StepTitle n={2}>¿Dónde manejás el DNS de tu dominio?</StepTitle>
            <div className="flex flex-wrap gap-2">
                {DNS_CHOICES.map((choice) => (
                    <button
                        key={choice}
                        type="button"
                        aria-pressed={selected === choice}
                        onClick={() => onSelect?.(choice)}
                        className={`min-h-11 rounded-[var(--radius-chico)] border px-3.5 text-[14px] ${
                            selected === choice
                                ? 'border-[var(--color-acento)] bg-[var(--color-superficie-alta)] text-[var(--color-tinta)]'
                                : 'border-[var(--color-borde)] text-[var(--color-tenue)] hover:text-[var(--color-tinta)]'
                        }`}
                    >
                        {dnsChoiceName(choice)}
                    </button>
                ))}
            </div>
            <div className="flex flex-col gap-2">
                <button
                    type="button"
                    aria-expanded={unsureOpen}
                    onClick={onToggleUnsure}
                    className="min-h-11 self-start text-[14px] text-[var(--color-tenue)] underline underline-offset-[3px] hover:text-[var(--color-tinta)]"
                >
                    No sé
                </button>
                {unsureOpen && (
                    <div className="flex flex-col items-start gap-2 rounded-[var(--radius-medio)] border border-[var(--color-borde)] p-4 text-[14px] leading-relaxed text-[var(--color-tenue)]">
                        {guess && challenge.provider ? (
                            <>
                                <p>Por tus servidores DNS, parece que es {guess.name}.</p>
                                <Button
                                    type="button"
                                    variant="secundario"
                                    onClick={() => challenge.provider && onSelect?.(challenge.provider)}
                                    className="px-4 py-2.5"
                                >
                                    Es {guess.name}
                                </Button>
                            </>
                        ) : (
                            <p>No pudimos deducirlo de tus servidores DNS.</p>
                        )}
                        <p>
                            En general es donde compraste el dominio, salvo que lo hayas apuntado a otro servicio. En el
                            panel donde lo compraste, buscá «DNS» o «Servidores de nombres»: si ahí figura otro
                            servicio, el DNS se maneja allá.
                        </p>
                    </div>
                )}
            </div>
            {selected ? (
                <ol className="flex flex-col gap-2.5 text-[15px] leading-relaxed text-[#c4c8cd]">
                    {steps.map((text, i) => (
                        <li key={text} className="flex gap-3">
                            <span className="font-mono text-[13px] text-[var(--color-apagado)]">{i + 1}.</span>
                            {text}
                        </li>
                    ))}
                </ol>
            ) : (
                <p className="text-[14px] text-[var(--color-tenue)]">Elegí uno y te mostramos los pasos.</p>
            )}
            {provider && (
                <ExternalButtonLink href={provider.panelUrl} variant="secundario" className="self-start px-4 py-2.5">
                    Abrir {provider.name}
                    <span aria-hidden="true">↗</span>
                </ExternalButtonLink>
            )}
        </section>
    );
}

function StatusArea({
    status,
    error,
    checking,
    onCheckNow,
}: {
    status: DnsCheckStatus;
    error?: string;
    checking: boolean;
    onCheckNow?: () => void;
}) {
    return (
        <section className="flex flex-col gap-3 rounded-[var(--radius-medio)] border border-[var(--color-borde)] p-4">
            <div role="status" aria-live="polite" className="flex items-start gap-2.5 text-[14px]">
                {status === 'verified' && (
                    <>
                        <CheckIcon />
                        <span className="text-[var(--color-listo)]">Listo: comprobamos que el sitio es tuyo.</span>
                    </>
                )}
                {status === 'searching' && (
                    <>
                        <span aria-hidden="true" className="mt-1.5 h-2 w-2 flex-none animate-pulse rounded-full bg-[var(--color-acento)]" />
                        <span className="text-[var(--color-tenue)]">Lo estamos buscando…</span>
                    </>
                )}
                {status === 'delayed' && (
                    <span className="text-[var(--color-alerta)]">
                        Todavía no lo vemos. Los cambios en el DNS pueden tardar unos minutos.
                    </span>
                )}
                {status === 'stopped' && (
                    <span className="text-[var(--color-alerta)]">
                        Dejamos de buscar. Cuando lo hayas cargado, tocá «Ya lo cargué».
                    </span>
                )}
                {status === 'error' && <span className="text-[var(--color-error)]">{error}</span>}
            </div>
            {status !== 'verified' && (
                <Button
                    type="button"
                    variant="secundario"
                    disabled={checking}
                    onClick={onCheckNow}
                    className="self-start px-4 py-2.5"
                >
                    {checking ? 'Consultando…' : 'Ya lo cargué'}
                </Button>
            )}
        </section>
    );
}

function Why() {
    return (
        <details className="group text-[14px] text-[var(--color-tenue)]">
            <summary className="min-h-11 cursor-pointer list-none py-2 underline underline-offset-[3px] hover:text-[var(--color-tinta)]">
                ¿Por qué te pedimos esto?
            </summary>
            <div className="flex flex-col gap-2 pb-2 pt-1 leading-relaxed">
                <p>
                    Solo quien administra el DNS de un dominio puede agregarle registros. Si el registro aparece,
                    sabemos que el sitio es tuyo.
                </p>
                <p>El registro es un dato de verificación. Podés dejarlo; no afecta tu sitio ni tu mail.</p>
            </div>
        </details>
    );
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
    return (
        <h3 className="flex items-baseline gap-3 text-[18px] font-bold leading-tight">
            <span className="font-mono text-[13px] font-normal text-[var(--color-apagado)]">{n}</span>
            {children}
        </h3>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-4">
            <dt className="w-16 flex-none pt-3 font-mono text-[12px] tracking-[0.08em] text-[var(--color-apagado)] sm:pt-2.5">
                {label}
            </dt>
            <dd className="flex min-w-0 flex-col gap-1">{children}</dd>
        </div>
    );
}

/**
 * El diálogo con la consulta real. Es un `<dialog>` nativo con `showModal()`,
 * igual que el de acceso: atrapa el foco, cierra con Esc y devuelve el foco.
 *
 * El registro se pide al abrir y, apenas llega, se consulta una primera vez.
 * Mientras está abierto consulta cada 10 segundos, hasta 30 veces (unos 5
 * minutos): no hay tarea en segundo plano, así que cerrar el diálogo corta la
 * consulta. Un error de la consulta también la corta. «Ya lo cargué» consulta
 * ya y, si había dejado de buscar, vuelve a empezar. Al cerrar se descartan el
 * último resultado y el error de carga. Al verificarse pide la pantalla
 * actualizada, como el panel de acceso.
 */
export function DnsVerificationDialog({
    open,
    onClose,
    getChallenge,
    checkAction,
    adsenseAction,
}: {
    open: boolean;
    onClose: () => void;
    getChallenge: () => Promise<ChallengeResult>;
    checkAction: (state: DomainCheckState) => Promise<DomainCheckState>;
    adsenseAction: () => Promise<void>;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const router = useRouter();
    const [challenge, setChallenge] = useState<DomainOwnershipChallengeDto | null>(null);
    const [loadError, setLoadError] = useState<string | undefined>();
    const [attempts, setAttempts] = useState(0);
    const [loadKey, setLoadKey] = useState(0);
    const [session, setSession] = useState(0);
    const sessionRef = useRef(0);
    const [stamped, check, checking] = useActionState(
        (previous: Parameters<typeof visibleCheckState>[0]) => safeCheck(checkAction, previous, sessionRef.current),
        { session: 0 },
    );
    const state = visibleCheckState(stamped, session);
    const checkingRef = useRef(false);
    // Lo que el vendedor eligió vale mientras el diálogo siga abierto.
    const [selectedProvider, setSelectedProvider] = useState<DnsChoice | null>(null);
    const [unsureOpen, setUnsureOpen] = useState(false);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    useEffect(() => {
        if (!open || challenge) return;
        let cancelled = false;
        void safeChallenge(getChallenge).then((result) => {
            if (cancelled) return;
            if (result.challenge) setChallenge(result.challenge);
            else setLoadError(result.error ?? 'No pudimos consultar tu DNS. Probá de nuevo.');
        });
        return () => {
            cancelled = true;
        };
    }, [open, challenge, getChallenge, loadKey]);

    useEffect(() => {
        checkingRef.current = checking;
    }, [checking]);

    const verified = state.verified === true;
    const hasChallenge = challenge !== null;
    const polling = shouldPoll({ open, hasChallenge, verified, attempts, error: state.error });

    // La primera consulta no espera al primer intervalo: el registro puede
    // estar cargado de antes. Corre al llegar el registro y al reabrir.
    useEffect(() => {
        if (!open || !hasChallenge) return;
        startTransition(() => check());
    }, [open, hasChallenge, check]);

    useEffect(() => {
        if (!polling) return;
        const timer = setInterval(() => {
            if (checkingRef.current) return;
            setAttempts((n) => n + 1);
            startTransition(() => check());
        }, DNS_POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [polling, check]);

    useEffect(() => {
        if (verified) router.refresh();
    }, [verified, router]);

    function retryLoad() {
        setLoadError(undefined);
        setLoadKey((n) => n + 1);
    }

    function checkNow() {
        setAttempts((n) => (n >= DNS_POLL_MAX_ATTEMPTS ? DNS_DELAYED_AFTER_ATTEMPTS : n + 1));
        startTransition(() => check());
    }

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            onClose={() => {
                setAttempts(0);
                setLoadError(undefined);
                setSelectedProvider(null);
                setUnsureOpen(false);
                sessionRef.current += 1;
                setSession(sessionRef.current);
                onClose();
            }}
            onClick={(e) => {
                if (e.target === dialogRef.current) dialogRef.current?.close();
            }}
            className="m-auto w-[min(980px,calc(100vw-2rem))] max-h-[92vh] overflow-y-auto rounded-[var(--radius-grande)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-0 text-[var(--color-tinta)] backdrop:bg-black/70"
        >
            <header className="flex items-center justify-between border-b border-[var(--color-borde)] py-3 pl-6 pr-4">
                <h2 id={titleId} className="text-[15px] font-medium">
                    Comprobá tu sitio con tu DNS
                </h2>
                <button
                    type="button"
                    aria-label="Cerrar"
                    onClick={() => dialogRef.current?.close()}
                    className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-chico)] text-[var(--color-tenue)] hover:text-[var(--color-tinta)]"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                </button>
            </header>
            <DnsVerificationDialogView
                challenge={challenge}
                loadError={loadError}
                status={dnsCheckStatus({ verified, error: state.error, attempts, checking })}
                error={state.error}
                checking={checking}
                onCheckNow={checkNow}
                onRetryLoad={retryLoad}
                adsenseAction={adsenseAction}
                selectedProvider={selectedProvider}
                onSelectProvider={setSelectedProvider}
                unsureOpen={unsureOpen}
                onToggleUnsure={() => setUnsureOpen((v) => !v)}
            />
        </dialog>
    );
}
