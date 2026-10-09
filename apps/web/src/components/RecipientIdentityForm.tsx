'use client';

import { useActionState } from 'react';
import { Alert, Button } from './ui';

type State = { error?: string; ok?: boolean; message?: string };

/**
 * Qué se le dice al comprador según lo que va a recibir.
 *
 * El texto antes mezclaba los dos tipos en una sola frase y mostraba un correo
 * de Gmail como ejemplo incluso para un dominio. Acá cada tipo trae su título,
 * su explicación, el nombre del campo y su ejemplo.
 *
 * No se repite la regla de validación: para un canal el dominio acepta
 * cualquier correo con formato válido y para un dominio cualquier usuario del
 * registrador. Lo que el dominio rechaza vuelve con su propio mensaje, que se
 * muestra tal cual.
 */
export interface RecipientCopy {
    /** Cómo se llama lo que va a recibir, para las frases que lo nombran. */
    asset: string;
    title: string;
    correctionTitle: string;
    explanation: string;
    label: string;
    placeholder?: string;
    /** Qué pasa si falta, ya con el activo en custodia. */
    urgentNotice: string;
}

const COPY_BY_TYPE: Record<string, RecipientCopy> = {
    youtube: {
        asset: 'canal',
        title: 'Declarar dónde recibir el canal',
        correctionTitle: 'Corregir la cuenta donde recibís el canal',
        explanation:
            'Indicá la cuenta de Google que va a ser la dueña del canal: una dirección con la que ya ingresás a Google. Cuando cerremos la operación, el canal pasa a esa cuenta. Podés cambiarla mientras la operación no se haya cerrado.',
        label: 'Tu cuenta de Google',
        placeholder: 'tunombre@gmail.com',
        // Los siete días son la espera de YouTube desde la invitación; el
        // dominio (WebStrategy) no tiene espera, por eso solo se dicen acá.
        urgentNotice:
            'El canal ya está en custodia. Sin esta cuenta no podemos invitarte como propietario, y los siete días de espera de YouTube empiezan con esa invitación.',
    },
    web: {
        asset: 'dominio',
        title: 'Declarar dónde recibir el dominio',
        correctionTitle: 'Corregir el usuario donde recibís el dominio',
        explanation:
            'Indicá tu usuario en el registrador: la empresa donde registrás y administrás tus dominios. Cuando cerremos la operación, el dominio pasa a ese usuario. Podés cambiarlo mientras la operación no se haya cerrado.',
        label: 'Tu usuario en el registrador',
        placeholder: 'tu-usuario',
        urgentNotice:
            'El dominio ya está en custodia. Sin tu usuario del registrador no podemos hacerte la entrega.',
    },
};

const COPY_GENERIC: RecipientCopy = {
    asset: 'activo',
    title: 'Declarar dónde recibir el activo',
    correctionTitle: 'Corregir dónde recibís el activo',
    explanation:
        'Indicá la cuenta donde querés recibir el activo. Podés cambiarla mientras la operación no se haya cerrado.',
    label: 'Tu cuenta',
    urgentNotice:
        'El activo ya está en custodia. Sin esta cuenta no podemos hacerte la entrega.',
};

export function recipientCopy(assetType?: string): RecipientCopy {
    return (assetType && COPY_BY_TYPE[assetType]) || COPY_GENERIC;
}

/**
 * La cuenta ya declarada, a la vista.
 *
 * Antes quedaba solo el título de un desplegable cerrado, y al enviar el
 * formulario desaparecía sin dejar rastro de que se había guardado. Ahora lo
 * guardado se ve siempre; corregirlo es lo que queda detrás del desplegable.
 */
export function RecipientIdentitySaved({
    identifier,
    assetType,
}: {
    identifier: string;
    assetType?: string;
}) {
    const copy = recipientCopy(assetType);

    return (
        <div className="flex flex-col gap-1 rounded-[var(--radius-chico)] border border-[var(--color-listo)]/40 p-4">
            <span className="text-[12px] text-[var(--color-tenue)]">
                Vas a recibir el {copy.asset} en
            </span>
            <span className="font-mono text-[14px] text-[var(--color-listo)]">{identifier}</span>
        </div>
    );
}

/**
 * El comprador declara dónde quiere recibir el activo.
 *
 * Es una tarea pendiente: se puede resolver temprano y conviene hacerlo, pero
 * nadie la impone antes de tiempo. Desde que el activo está en custodia sube
 * de tono, porque a partir de ahí es lo que demora su propia entrega.
 */
export function RecipientIdentityForm({
    action,
    ...rest
}: {
    action: (state: State, form: FormData) => Promise<State>;
    urgente: boolean;
    /** Si ya la declaró y esto es una corrección. */
    valorActual?: string;
    /** Tipo de activo de la operación; decide el texto. */
    assetType?: string;
}) {
    const [state, submit, pending] = useActionState(action, {});

    return <RecipientIdentityFormView state={state} pending={pending} submit={submit} {...rest} />;
}

/**
 * La parte que dibuja. Separada del estado del formulario para poder mostrar
 * cada resultado sin enviar nada: el éxito y el error son parte de lo que el
 * comprador tiene que ver.
 */
export function RecipientIdentityFormView({
    state,
    pending,
    submit,
    urgente,
    valorActual,
    assetType,
}: {
    state: State;
    pending: boolean;
    submit: (form: FormData) => void;
    urgente: boolean;
    valorActual?: string;
    assetType?: string;
}) {
    const copy = recipientCopy(assetType);

    return (
        <form
            action={submit}
            className={`flex flex-col gap-3 rounded-[var(--radius-chico)] border p-4 ${
                urgente
                    ? 'border-[var(--color-alerta)]/50 bg-[var(--color-alerta)]/5'
                    : 'border-[var(--color-borde)]'
            }`}
        >
            {/* Guardar no cambia de pantalla en la corrección: sin esto el
                comprador no sabría si el cambio se registró. */}
            {state.ok && state.message && <Alert tono="listo">{state.message}</Alert>}
            {state.error && <Alert>{state.error}</Alert>}

            <div className="flex flex-col gap-1">
                <span className="text-[13px] font-medium">
                    {valorActual ? copy.correctionTitle : copy.title}
                    {urgente && !valorActual && (
                        <span className="ml-2 font-mono text-[10px] text-[var(--color-alerta)]">
                            PENDIENTE
                        </span>
                    )}
                </span>
                <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    {urgente ? copy.urgentNotice : copy.explanation}
                </span>
            </div>

            <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-[var(--color-tenue)]">{copy.label}</span>
                <input
                    name="identifier"
                    required
                    defaultValue={valorActual}
                    placeholder={copy.placeholder}
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 font-mono text-[13px] outline-none focus:border-[var(--color-acento)]"
                />
            </label>

            <Button type="submit" disabled={pending} className="text-[13px]">
                {pending ? 'Guardando…' : valorActual ? 'Guardar el cambio' : 'Declarar la cuenta'}
            </Button>
        </form>
    );
}
