'use client';

import { useActionState, useState } from 'react';
import { Alert, Button } from './ui';
import { SubmitButton } from './SubmitButton';
import { FileAttach, type FileAction } from './FileAttach';
import { fechaLarga } from '@/lib/format';

type State = { error?: string; ok?: boolean; message?: string };
type FormAction = (state: State, form: FormData) => Promise<State>;

/*
 * La revisión de un comprobante rechazado, para cada rol. Ningún documento de
 * las partes es prueba: la plataforma revisa la coherencia, el vendedor
 * responde en su plazo y la plataforma resuelve con el rastreo entre bancos.
 */

const TEXT = 'text-[15px] leading-relaxed text-[var(--color-tenue)]';
const STRONG = 'font-bold text-[var(--color-tinta)]';
const INPUT =
    'min-h-[44px] rounded-lg border border-[var(--color-borde)] bg-transparent px-3 font-mono text-[14px] outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]';

function Done({ state }: { state: State }) {
    return state.ok && state.message ? <Alert tono="listo">{state.message}</Alert> : null;
}

/** El campo del ID COELSA, con dónde conseguirlo. */
function BankReferenceField({ required = false }: { required?: boolean }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium">ID COELSA o número de operación</span>
            <input name="bankReference" required={required} maxLength={64} autoComplete="off" className={INPUT} placeholder="Por ejemplo: 0AB12CD34EF56GH78IJ90K" />
            <span className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                Solicitá a tu banco el <strong className={STRONG}>ID COELSA</strong> de la transferencia, o su número de operación.
                {!required && ' Si todavía no lo tenés, podrás agregarlo después.'}
            </span>
        </label>
    );
}

/** El comprador, con un comprobante rechazado: pide que la plataforma lo revise. */
export function ReviewRequest({ action, recipient }: { action: FormAction; recipient: 'seller' | 'platform' }) {
    const [open, setOpen] = useState(false);
    const [state, submit] = useActionState(action, {});

    if (state.ok) return <Done state={state} />;
    if (!open) {
        return (
            <div className="flex flex-col gap-2.5 border-t border-[var(--color-borde)] pt-4">
                <span className="text-[15px] font-medium">¿La transferencia figura como realizada en tu banco?</span>
                <Button type="button" variant="secundario" className="self-start" onClick={() => setOpen(true)}>
                    Solicitar la revisión de la plataforma
                </Button>
            </div>
        );
    }
    return (
        <form action={submit} className="flex flex-col gap-4 border-t border-[var(--color-borde)] pt-4">
            <span className="text-[18px] font-bold">Solicitar la revisión de la plataforma</span>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-relaxed">
                <li>
                    La plataforma verificará que el comprobante coincida con tu cuenta y con la cuenta{' '}
                    <strong>{recipient === 'seller' ? 'del vendedor' : 'de la plataforma'}</strong>.
                </li>
                <li>Si coincide, solicitará el rastreo de la transferencia entre los bancos.</li>
                <li>Con esa respuesta, resolverá si el pago se acreditó.</li>
            </ol>
            <BankReferenceField />
            <p className={TEXT}>Mientras dure la revisión, el plazo de pago queda suspendido y el activo permanece en custodia de la plataforma.</p>
            {state.error && <Alert>{state.error}</Alert>}
            <div className="flex flex-wrap gap-3">
                <SubmitButton pendingText="Registrando la solicitud…">Solicitar la revisión</SubmitButton>
                <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] px-2 text-[14px] text-[var(--color-tenue)]">
                    Volver
                </button>
            </div>
        </form>
    );
}

/** El comprador, con la revisión abierta: qué pasa y, si falta, el ID COELSA. */
export function ReviewStatus({ hasBankReference, addReferenceAction }: { hasBankReference: boolean; addReferenceAction: FormAction }) {
    const [state, submit] = useActionState(addReferenceAction, {});
    return (
        <div className="flex flex-col gap-4">
            <span className="text-[18px] font-bold">El comprobante está en revisión</span>
            <p className={TEXT}>
                La revisión es manual y puede demorar. El plazo de pago queda suspendido y el activo permanece en custodia: te
                avisaremos cuando se resuelva.
            </p>
            {!hasBankReference &&
                (state.ok ? (
                    <Done state={state} />
                ) : (
                    <form action={submit} className="flex flex-col gap-3">
                        <BankReferenceField required />
                        {state.error && <Alert>{state.error}</Alert>}
                        <SubmitButton className="self-start" variant="secundario" pendingText="Guardando…">
                            Agregar a la revisión
                        </SubmitButton>
                    </form>
                ))}
        </div>
    );
}

/** El vendedor, con un comprobante coherente en revisión: confirma o adjunta sus movimientos. */
export function SellerReviewResponse({
    fileHref,
    amount,
    account,
    deadline,
    confirmAction,
    statementAction,
}: {
    fileHref: string;
    amount?: string;
    account?: string;
    deadline?: string;
    confirmAction: FormAction;
    statementAction: FileAction;
}) {
    const [confirmed, confirm, confirming] = useActionState(confirmAction, {});
    if (confirmed.ok) return <Done state={confirmed} />;

    return (
        <div className="flex flex-col gap-5">
            <p className={TEXT}>
                <strong className={STRONG}>El comprador</strong> solicitó la revisión del pago
                {amount && (
                    <>
                        {' '}de <strong className={STRONG}>{amount}</strong>
                    </>
                )}
                . Su comprobante coincide con tu cuenta y con tu CUIT.
            </p>
            {deadline && (
                <div className="flex flex-col gap-1 rounded-[var(--radius-chico)] border border-[var(--color-alerta)] p-4">
                    <span className="text-[15px]">
                        Tenés tiempo hasta el <strong>{fechaLarga(deadline)}</strong>.
                    </span>
                    <span className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                        Si no respondés, daremos el pago por acreditado. El activo permanece en custodia mientras dure la revisión.
                    </span>
                </div>
            )}
            <a href={fileHref} target="_blank" rel="noopener" className="inline-flex min-h-[44px] items-center self-start text-[14px] text-[var(--color-acento)]">
                Ver el comprobante del comprador
            </a>
            <div className="flex flex-col gap-2.5">
                <span className="text-[15px] font-medium">¿El pago figura en tu cuenta{account ? ` ${account}` : ''}?</span>
                {confirmed.error && <Alert>{confirmed.error}</Alert>}
                <form action={confirm}>
                    <Button type="submit" disabled={confirming}>
                        {confirming ? 'Registrando tu confirmación…' : 'Confirmar la acreditación'}
                    </Button>
                </form>
            </div>
            <div className="flex flex-col gap-2.5 border-t border-[var(--color-borde)] pt-4">
                <span className="text-[15px] font-medium">Si el pago no figura</span>
                <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                    Solicitamos además el rastreo de la transferencia entre los bancos. Podés adjuntar los movimientos de tu cuenta de
                    ese día: los sumaremos a la revisión.
                </p>
                <FileAttach
                    action={statementAction}
                    attachText="Adjuntar los movimientos"
                    submitText="Enviar los movimientos"
                    pendingText="Enviando los movimientos…"
                    checkText="Verificá que la fecha y los créditos del día sean legibles."
                />
            </div>
        </div>
    );
}

/** Lo que el admin compara contra el comprobante. */
export interface CoherenceFacts {
    /** A quién iba la transferencia: el vendedor, o la plataforma por la comisión. */
    recipient: 'seller' | 'platform';
    amount?: string;
    destination?: string;
    destinationTaxId?: string;
    custodyDate?: string;
    bankReference?: string;
    /** El DNI verificado del comprador: el CUIT de origen tiene que contenerlo. */
    originDni?: string;
}

/** El admin revisa la coherencia del comprobante con las cuentas y los CUIT. */
export function CoherenceReview({
    fileHref,
    facts,
    coherentAction,
    incoherentAction,
}: {
    fileHref: string;
    facts: CoherenceFacts;
    coherentAction: FormAction;
    incoherentAction: FormAction;
}) {
    const [coherent, markCoherent, markingCoherent] = useActionState(coherentAction, {});
    const [incoherent, markIncoherent] = useActionState(incoherentAction, {});
    const [rejecting, setRejecting] = useState(false);
    const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
    const done = (coherent.ok && coherent) || (incoherent.ok && incoherent);
    if (done) return <Done state={done} />;

    const toSeller = facts.recipient === 'seller';
    const checks = [
        facts.amount && `Monto: ${facts.amount}`,
        facts.custodyDate && `Fecha: posterior a la custodia (${facts.custodyDate})`,
        toSeller
            ? facts.destination && `CBU o alias de destino: ${facts.destination}`
            : 'Destino: la cuenta de la plataforma',
        toSeller && `CUIT de destino: ${facts.destinationTaxId ?? 'el vendedor no lo declaró'}`,
        facts.originDni
            ? `CUIT de origen: contiene el DNI ${facts.originDni} del comprador`
            : 'CUIT de origen: el comprador no tiene la identidad verificada',
    ].filter(Boolean) as string[];
    // Pedir el rastreo afirma que todo coincide: sin cada comprobación tildada, no se puede.
    const allChecked = checks.every((c) => checked.has(c));
    const toggle = (c: string) =>
        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(c)) next.delete(c);
            else next.add(c);
            return next;
        });

    return (
        <div className="flex flex-col gap-4">
            <a href={fileHref} target="_blank" rel="noopener" className="inline-flex min-h-[44px] items-center self-start text-[14px] text-[var(--color-acento)]">
                Ver el comprobante
            </a>
            <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-[13px] text-[var(--color-apagado)]">Coherencia del comprobante</legend>
                {checks.map((c) => (
                    <label key={c} className="flex min-h-[40px] items-center gap-3 text-[14px]">
                        <input type="checkbox" className="size-[18px]" checked={checked.has(c)} onChange={() => toggle(c)} />
                        {c}
                    </label>
                ))}
            </fieldset>
            <span className="text-[13px] text-[var(--color-apagado)]">
                ID COELSA aportado por el comprador:{' '}
                <span className="font-mono text-[var(--color-tinta)]">{facts.bankReference ?? 'todavía no lo agregó'}</span>
            </span>
            {coherent.error && <Alert>{coherent.error}</Alert>}
            {!rejecting ? (
                <div className="flex flex-wrap gap-3">
                    <form action={markCoherent}>
                        <Button type="submit" disabled={markingCoherent || !allChecked}>
                            {markingCoherent ? 'Registrando la decisión…' : 'Solicitar el rastreo bancario'}
                        </Button>
                    </form>
                    <Button type="button" variant="secundario" onClick={() => setRejecting(true)}>
                        Rechazar el comprobante
                    </Button>
                </div>
            ) : (
                <form action={markIncoherent} className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[14px] font-medium">Por qué no es coherente (lo leerá el comprador)</span>
                        <textarea
                            name="reason"
                            rows={2}
                            required
                            maxLength={2000}
                            placeholder="Por ejemplo: el CUIT de destino no es el del vendedor."
                            className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 text-[14px] leading-relaxed outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
                        />
                    </label>
                    {incoherent.error && <Alert>{incoherent.error}</Alert>}
                    <div className="flex flex-wrap gap-3">
                        <SubmitButton variant="peligro" pendingText="Registrando la decisión…">
                            Rechazar el comprobante
                        </SubmitButton>
                        <button type="button" onClick={() => setRejecting(false)} className="min-h-[44px] px-2 text-[14px] text-[var(--color-tenue)]">
                            Volver
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

/** El admin resuelve con el rastreo bancario si el pago se acreditó. */
export function ReviewResolution({
    fileHref,
    statementHref,
    bankReference,
    creditedAction,
    notCreditedAction,
}: {
    fileHref: string;
    statementHref?: string;
    bankReference?: string;
    creditedAction: FormAction;
    notCreditedAction: FormAction;
}) {
    const [credited, markCredited, markingCredited] = useActionState(creditedAction, {});
    const [notCredited, markNotCredited, markingNotCredited] = useActionState(notCreditedAction, {});
    const done = (credited.ok && credited) || (notCredited.ok && notCredited);
    if (done) return <Done state={done} />;
    const busy = markingCredited || markingNotCredited;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-5">
                <a href={fileHref} target="_blank" rel="noopener" className="inline-flex min-h-[44px] items-center text-[14px] text-[var(--color-acento)]">
                    Ver el comprobante del comprador
                </a>
                {statementHref && (
                    <a href={statementHref} target="_blank" rel="noopener" className="inline-flex min-h-[44px] items-center text-[14px] text-[var(--color-acento)]">
                        Ver los movimientos del vendedor
                    </a>
                )}
            </div>
            <span className="text-[13px] text-[var(--color-apagado)]">
                ID COELSA: <span className="font-mono text-[var(--color-tinta)]">{bankReference ?? 'no informado'}</span>
            </span>
            <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                Resolvé según la respuesta del rastreo bancario. Los movimientos del vendedor son información, no prueba.
            </p>
            {(credited.error || notCredited.error) && <Alert>{credited.error ?? notCredited.error}</Alert>}
            {busy ? (
                <div aria-busy="true" className="min-h-[48px] text-[15px]">
                    Registrando la decisión…
                </div>
            ) : (
                <div className="flex flex-wrap gap-3">
                    <form action={markCredited}>
                        <Button type="submit">El pago se acreditó</Button>
                    </form>
                    <form action={markNotCredited}>
                        <Button type="submit" variant="secundario">
                            El pago no se acreditó
                        </Button>
                    </form>
                </div>
            )}
        </div>
    );
}
