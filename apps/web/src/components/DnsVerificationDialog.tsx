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
import { Alert, Button, ExternalButtonLink } from './ui';
import { CopyValueButton } from './CopyValueButton';
import { DnsRecordMock } from './DnsMock';
import { OperationAction } from './OperationAction';
import { SubmitButton } from './SubmitButton';

const TXT_LABEL = 'Copiar el valor del registro';

/** Las tres pantallas del diálogo: dónde está el DNS, el registro y la comprobación. */
export type DnsDialogStep = 'provider' | 'record' | 'result';

type PublishAction = React.ComponentProps<typeof OperationAction>['action'];

const HOW_TO_FIND =
    'En general es donde compraste el dominio, salvo que lo hayas apuntado a otro servicio. En el panel donde lo compraste, buscá «DNS» o «Servidores de nombres»: si ahí figura otro servicio, el DNS se maneja allá.';

/**
 * El contenido del diálogo de la comprobación por DNS, sin estado: lo que dice
 * cada momento. Lo monta `DnsVerificationDialog` con la consulta real y
 * `/sistema` con datos de muestra. Los manejadores son opcionales justamente
 * por eso: en el catálogo no hay nada que consultar.
 *
 * Tres pantallas. Primero solo la pregunta, centrada, con las opciones: el
 * vendedor no ve nada más hasta contestar. Al elegir, las opciones pasan a una
 * columna a la izquierda (sin animación: se mueven de golpe) y a la derecha
 * entra, con un fundido, lo que va a hacer en ese proveedor. Después el
 * registro con la maqueta, y al final la lista de lo que se comprobó.
 */
export function DnsVerificationDialogView({
    step = 'provider',
    challenge,
    loadError,
    status,
    error,
    checking,
    selectedProvider = null,
    unsure = false,
    titleId,
    onSelectProvider,
    onUnsure,
    onPrev,
    onNext,
    onLoaded,
    onCheckNow,
    onRetryLoad,
    onClose,
    adsenseAction,
    publishAction,
}: {
    step?: DnsDialogStep;
    /** El registro a cargar, o `null` mientras se pide o si no se pudo pedir. */
    challenge: DomainOwnershipChallengeDto | null;
    loadError?: string;
    status: DnsCheckStatus;
    /** Motivo cuando `status` es `error`. */
    error?: string;
    checking: boolean;
    /** Dónde dijo el vendedor que maneja su DNS. Solo cambia por su elección o por «No sé». */
    selectedProvider?: DnsChoice | null;
    /** «No sé» apretado: se muestra lo que se deduce de los servidores y cómo averiguarlo. */
    unsure?: boolean;
    titleId?: string;
    onSelectProvider?: (choice: DnsChoice) => void;
    onUnsure?: () => void;
    onPrev?: () => void;
    /** De la pregunta al registro. */
    onNext?: () => void;
    /** «Ya lo cargué»: del registro a la comprobación. */
    onLoaded?: () => void;
    onCheckNow?: () => void;
    /** Vuelve a pedir el registro cuando no se pudo pedir. */
    onRetryLoad?: () => void;
    onClose?: () => void;
    adsenseAction: () => Promise<void>;
    /** Publicar el borrador una vez comprobado el sitio. Sin él, el final solo cierra. */
    publishAction?: PublishAction;
    // Los manejadores son opcionales porque `/sistema` pinta cada pantalla con
    // la elección fija, sin nada que escuchar.
}) {
    const verified = status === 'verified';

    return (
        <div className="flex flex-col">
            <Header titleId={titleId} counter={counter(step, status, challenge !== null)} onClose={onClose} />
            {challenge ? (
                <>
                    {step === 'provider' && (
                        <ProviderStep
                            challenge={challenge}
                            selected={selectedProvider}
                            unsure={unsure}
                            onSelect={onSelectProvider}
                            onUnsure={onUnsure}
                        />
                    )}
                    {step === 'record' && (
                        <RecordStep challenge={challenge} selected={selectedProvider} adsenseAction={adsenseAction} />
                    )}
                    {step === 'result' && (
                        <ResultStep
                            challenge={challenge}
                            selected={selectedProvider}
                            status={status}
                            error={error}
                        />
                    )}
                    <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-borde)] px-6 py-3.5">
                        <Button
                            type="button"
                            variant="secundario"
                            disabled={step === 'provider' || (step === 'result' && verified)}
                            onClick={onPrev}
                            className="min-h-11 px-[18px]"
                        >
                            ← Anterior
                        </Button>
                        {step === 'provider' && (
                            <Button
                                type="button"
                                disabled={!selectedProvider}
                                onClick={onNext}
                                className="min-h-11 px-[18px]"
                            >
                                Siguiente →
                            </Button>
                        )}
                        {step === 'record' && (
                            <Button type="button" onClick={onLoaded} className="min-h-11 px-[18px]">
                                Ya lo cargué
                            </Button>
                        )}
                        {step === 'result' &&
                            (verified ? (
                                publishAction ? (
                                    <div className="w-fit min-w-[140px]">
                                        <OperationAction action={publishAction} text="Publicar" />
                                    </div>
                                ) : (
                                    <Button type="button" onClick={onClose} className="min-h-11 px-[18px]">
                                        Cerrar
                                    </Button>
                                )
                            ) : (
                                <Button
                                    type="button"
                                    disabled={checking}
                                    onClick={onCheckNow}
                                    className="min-h-11 px-[18px]"
                                >
                                    {checking ? 'Consultando…' : 'Buscar de nuevo'}
                                </Button>
                            ))}
                    </footer>
                </>
            ) : loadError ? (
                <div className="flex min-h-[240px] flex-col items-start justify-center gap-4 px-6 py-8">
                    <Alert>{loadError}</Alert>
                    {onRetryLoad && (
                        <Button type="button" variant="secundario" onClick={onRetryLoad} className="px-4 py-2.5">
                            Reintentar
                        </Button>
                    )}
                    <AdsenseAlternative action={adsenseAction} />
                </div>
            ) : (
                <p role="status" className="px-6 py-10 text-[15px] text-[var(--color-tenue)]">
                    Preparando tu registro…
                </p>
            )}
        </div>
    );
}

function counter(step: DnsDialogStep, status: DnsCheckStatus, hasChallenge: boolean): string {
    if (!hasChallenge) return '';
    if (step === 'provider') return '1 / 2';
    if (step === 'record') return '2 / 2';
    if (status === 'verified') return 'Listo';
    return status === 'searching' || status === 'delayed' ? 'Buscando' : 'Sin resultado';
}

function Header({ titleId, counter, onClose }: { titleId?: string; counter: string; onClose?: () => void }) {
    return (
        <header className="flex items-center justify-between border-b border-[var(--color-borde)] py-3 pl-6 pr-4">
            <div className="flex items-center gap-4">
                <h2 id={titleId} className="text-[15px] font-medium">
                    Comprobá que el sitio es tuyo
                </h2>
                {counter && <span className="font-mono text-[12px] text-[var(--color-apagado)]">{counter}</span>}
            </div>
            <button
                type="button"
                aria-label="Cerrar"
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-chico)] text-[var(--color-tenue)] hover:text-[var(--color-tinta)]"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            </button>
        </header>
    );
}

/** El nombre del proveedor elegido, o `null` si no eligió uno concreto («Otro» o nada). */
function providerName(selected: DnsChoice | null): string | null {
    return selected && selected !== 'other' ? DNS_PROVIDERS[selected].name : null;
}

function ProviderStep({
    challenge,
    selected,
    unsure,
    onSelect,
    onUnsure,
}: {
    challenge: DomainOwnershipChallengeDto;
    selected: DnsChoice | null;
    unsure: boolean;
    onSelect?: (choice: DnsChoice) => void;
    onUnsure?: () => void;
}) {
    const chosen = selected !== null || unsure;
    const title = '¿Dónde manejás el DNS de tu dominio?';
    const options = (
        <div
            role="radiogroup"
            aria-label="Dónde manejás el DNS"
            className={`grid gap-2 ${chosen ? 'grid-cols-2' : 'w-full max-w-[660px] grid-cols-2 sm:grid-cols-4'}`}
        >
            {DNS_CHOICES.map((choice) => (
                <button
                    key={choice}
                    type="button"
                    role="radio"
                    aria-checked={selected === choice}
                    onClick={() => onSelect?.(choice)}
                    className={`min-h-11 rounded-[var(--radius-chico)] border px-3 text-left text-[14px] ${
                        selected === choice
                            ? 'border-[var(--color-acento)] bg-[var(--color-acento)]/[0.06] text-[var(--color-tinta)]'
                            : 'border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] text-[var(--color-tinta)] hover:border-[var(--color-tenue)]'
                    }`}
                >
                    {dnsChoiceName(choice)}
                </button>
            ))}
        </div>
    );
    const unsureButton = (
        <button
            type="button"
            aria-pressed={unsure}
            onClick={onUnsure}
            className={`min-h-11 rounded-[var(--radius-chico)] border px-3 text-[14px] underline underline-offset-[3px] hover:text-[var(--color-tinta)] ${
                unsure ? 'border-[var(--color-acento)] text-[var(--color-tinta)]' : 'border-transparent text-[var(--color-tenue)]'
            }`}
        >
            No sé
        </button>
    );

    if (!chosen) {
        return (
            <div data-layout="centered" className="flex min-h-[480px] flex-col items-center justify-center gap-6 px-6 py-10">
                <h3 className="text-center text-[24px] font-bold leading-tight">{title}</h3>
                {options}
                {unsureButton}
            </div>
        );
    }

    return (
        <div data-layout="split" className="grid min-h-[480px] md:grid-cols-[420px_minmax(0,1fr)]">
            <div className="flex flex-col items-start gap-5 px-6 py-7">
                <h3 className="text-[24px] font-bold leading-tight">{title}</h3>
                {options}
                {unsureButton}
            </div>
            <ProviderPanel challenge={challenge} selected={selected} unsure={unsure} />
        </div>
    );
}

/** Lo que entra a la derecha al contestar: lo que se deduce y los pasos del proveedor. */
function ProviderPanel({
    challenge,
    selected,
    unsure,
}: {
    challenge: DomainOwnershipChallengeDto;
    selected: DnsChoice | null;
    unsure: boolean;
}) {
    const name = providerName(selected);
    const guess = challenge.provider ? DNS_PROVIDERS[challenge.provider].name : null;
    // En un subdominio la zona es la del dominio principal, que no sabemos nombrar.
    const zone = challenge.host === '@' ? challenge.domain : 'tu dominio';
    const steps = [
        name
            ? `Entrá a ${name} y buscá la sección DNS de ${zone}.`
            : 'Entrá al panel donde administrás el DNS de tu dominio y buscá «Zona DNS» o «Registros».',
        'Agregá un registro nuevo de tipo TXT.',
        'Pegá el nombre y el valor, y guardá.',
    ];

    return (
        <div className="dns-panel-in flex flex-col justify-center gap-4 border-t border-[var(--color-borde)] bg-[var(--color-fondo)]/60 p-7 md:border-l md:border-t-0">
            {unsure && (
                <div className="flex flex-col gap-2 rounded-[var(--radius-medio)] border border-[var(--color-borde-fuerte)] px-4 py-3.5">
                    <p className="text-[14px]">
                        {guess ? `Por tus servidores DNS, parece que es ${guess}.` : 'No pudimos deducirlo de tus servidores DNS.'}
                    </p>
                    <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">{HOW_TO_FIND}</p>
                </div>
            )}
            {selected && (
                <>
                    <h4 className="text-[20px] font-bold">Vas a cargarlo en {name ?? 'el panel de tu dominio'}</h4>
                    <ol className="flex flex-col gap-2.5 text-[14px] leading-relaxed text-[#c4c8cd]">
                        {steps.map((text, i) => (
                            <li key={text} className="flex gap-3">
                                <span className="font-mono text-[13px] text-[var(--color-apagado)]">{i + 1}.</span>
                                {text}
                            </li>
                        ))}
                    </ol>
                </>
            )}
        </div>
    );
}

function RecordStep({
    challenge,
    selected,
    adsenseAction,
}: {
    challenge: DomainOwnershipChallengeDto;
    selected: DnsChoice | null;
    adsenseAction: () => Promise<void>;
}) {
    const isSubdomain = challenge.host !== '@';
    const name = providerName(selected);
    const provider = selected && selected !== 'other' ? DNS_PROVIDERS[selected] : null;

    return (
        <div className="grid min-h-[480px] md:grid-cols-[420px_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col items-start gap-4 px-6 py-7">
                <h3 className="text-[24px] font-bold leading-tight">
                    Agregá este registro en {name ?? 'el panel de tu dominio'}
                </h3>
                <dl className="flex w-full flex-col gap-3 rounded-[var(--radius-medio)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] p-4">
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
                {provider && (
                    <ExternalButtonLink href={provider.panelUrl} variant="secundario" className="px-4 py-2.5">
                        Abrir {provider.name}
                        <span aria-hidden="true">↗</span>
                    </ExternalButtonLink>
                )}
                <div className="mt-auto flex w-full flex-col gap-1">
                    <Why />
                    <AdsenseAlternative action={adsenseAction} />
                </div>
            </div>
            <div className="hidden items-center justify-center border-l border-[var(--color-borde)] bg-[var(--color-fondo)]/60 p-6 md:flex">
                <DnsRecordMock host={challenge.host} value={challenge.value} />
            </div>
        </div>
    );
}

function ResultStep({
    challenge,
    selected,
    status,
    error,
}: {
    challenge: DomainOwnershipChallengeDto;
    selected: DnsChoice | null;
    status: DnsCheckStatus;
    error?: string;
}) {
    const found = status === 'verified';
    const searching = status === 'searching' || status === 'delayed';
    const hint =
        status === 'delayed'
            ? 'Todavía no lo vemos. Los cambios en el DNS pueden tardar unos minutos.'
            : status === 'stopped'
              ? 'Cuando lo hayas cargado, tocá «Buscar de nuevo».'
              : status === 'error'
                ? error
                : undefined;
    const headline = found
        ? 'Listo: comprobamos que el sitio es tuyo'
        : searching
          ? 'Lo estamos buscando…'
          : status === 'stopped'
            ? 'Dejamos de buscar'
            : 'No pudimos comprobarlo';
    const lastLine = found
        ? 'Registro TXT encontrado'
        : searching
          ? 'Buscando el registro TXT…'
          : 'Todavía no encontramos el registro TXT';

    return (
        <div className="flex min-h-[480px] flex-col items-center justify-center gap-6 px-6 py-10 text-center">
            <div role="status" aria-live="polite" className="flex flex-col items-center gap-4">
                {found && (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-listo)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                )}
                {searching && (
                    <svg
                        className="animate-spin motion-reduce:animate-none"
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-acento)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                    >
                        <path d="M12 3a9 9 0 1 0 9 9" />
                    </svg>
                )}
                <h3 className="text-[22px] font-bold">{headline}</h3>
                {hint && (
                    <p className={`max-w-[460px] text-[14px] ${status === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-alerta)]'}`}>
                        {hint}
                    </p>
                )}
            </div>
            <ul className="flex flex-col gap-2.5 text-left text-[14px] text-[#c4c8cd]">
                <ChecklistLine done>Registro generado para {challenge.domain}</ChecklistLine>
                <ChecklistLine done>Servidores DNS encontrados: {providerName(selected) ?? 'tu proveedor'}</ChecklistLine>
                <ChecklistLine done={found}>{lastLine}</ChecklistLine>
            </ul>
        </div>
    );
}

function ChecklistLine({ done, children }: { done: boolean; children: React.ReactNode }) {
    return (
        <li className="flex items-center gap-2.5">
            <span aria-hidden="true" className={done ? 'text-[var(--color-listo)]' : 'text-[var(--color-tenue)]'}>
                {done ? '✓' : '○'}
            </span>
            {children}
        </li>
    );
}

/** AdSense queda como alternativa al pie: además de la titularidad verifica los ingresos. */
function AdsenseAlternative({ action }: { action: () => Promise<void> }) {
    return (
        <form
            action={action}
            className="flex flex-wrap items-center gap-x-2 border-t border-[var(--color-borde)] pt-2 text-[14px] text-[var(--color-tenue)]"
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
 * último resultado y el error de carga.
 *
 * Al verificarse el diálogo salta a la vista final y se queda: la pantalla de
 * atrás, al actualizarse, cambia el botón que lo abre por la constancia y lo
 * desmontaría con el «Listo» a medio leer. Por eso pide la pantalla
 * actualizada al cerrar, y publicar (si hay con qué) lo hace desde ahí.
 */
export function DnsVerificationDialog({
    open,
    onClose,
    getChallenge,
    checkAction,
    adsenseAction,
    publishAction,
}: {
    open: boolean;
    onClose: () => void;
    getChallenge: () => Promise<ChallengeResult>;
    checkAction: (state: DomainCheckState) => Promise<DomainCheckState>;
    adsenseAction: () => Promise<void>;
    /** Publicar el borrador una vez comprobado. Sin él, la vista final solo cierra. */
    publishAction?: PublishAction;
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
    const [step, setStep] = useState<DnsDialogStep>('provider');
    const [selectedProvider, setSelectedProvider] = useState<DnsChoice | null>(null);
    const [unsure, setUnsure] = useState(false);

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

    function retryLoad() {
        setLoadError(undefined);
        setLoadKey((n) => n + 1);
    }

    function checkNow() {
        setAttempts((n) => (n >= DNS_POLL_MAX_ATTEMPTS ? DNS_DELAYED_AFTER_ATTEMPTS : n + 1));
        startTransition(() => check());
    }

    function selectProvider(choice: DnsChoice) {
        setSelectedProvider(choice);
        setUnsure(false);
    }

    // «No sé» elige lo que se deduce de los servidores DNS; si no se deduce
    // nada, no elige nada y el vendedor sigue sin poder avanzar.
    function chooseUnsure() {
        setUnsure(true);
        setSelectedProvider(challenge?.provider ?? null);
    }

    function goBack() {
        setStep((current) => (current === 'result' ? 'record' : 'provider'));
    }

    function confirmLoaded() {
        setStep('result');
        checkNow();
    }

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            onClose={() => {
                // Lo comprobado ya quedó guardado: la pantalla de atrás se entera ahora.
                if (verified) router.refresh();
                setAttempts(0);
                setLoadError(undefined);
                setStep('provider');
                setSelectedProvider(null);
                setUnsure(false);
                sessionRef.current += 1;
                setSession(sessionRef.current);
                onClose();
            }}
            onClick={(e) => {
                if (e.target === dialogRef.current) dialogRef.current?.close();
            }}
            className="m-auto w-[min(980px,calc(100vw-2rem))] max-h-[92vh] overflow-y-auto rounded-[var(--radius-grande)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-0 text-[var(--color-tinta)] backdrop:bg-black/70"
        >
            <DnsVerificationDialogView
                step={verified ? 'result' : step}
                titleId={titleId}
                challenge={challenge}
                loadError={loadError}
                status={dnsCheckStatus({ verified, error: state.error, attempts, checking })}
                error={state.error}
                checking={checking}
                selectedProvider={selectedProvider}
                unsure={unsure}
                onSelectProvider={selectProvider}
                onUnsure={chooseUnsure}
                onPrev={goBack}
                onNext={() => setStep('record')}
                onLoaded={confirmLoaded}
                onCheckNow={checkNow}
                onRetryLoad={retryLoad}
                onClose={() => dialogRef.current?.close()}
                adsenseAction={adsenseAction}
                publishAction={publishAction}
            />
        </dialog>
    );
}
