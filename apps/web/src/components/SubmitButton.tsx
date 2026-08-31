'use client';

import { useFormStatus } from 'react-dom';
import { Button } from './ui';

/**
 * Un botón de envío que se bloquea mientras la acción corre.
 *
 * Varios formularios eran un `<form action={...}>` plano con un `<Button
 * type="submit">`: no había forma de saber que algo estaba pasando, y nada
 * impedía apretar dos veces. El caso que más importa es el de pagar, que es la
 * acción de más peso de la aplicación.
 *
 * `useFormStatus` da ese estado sin convertir cada formulario a
 * `useActionState`, que obligaría a que la acción devuelva un estado. Tiene que
 * vivir en un componente aparte del `<form>`: el hook lee el formulario padre,
 * así que dentro del mismo componente que lo declara siempre diría que no hay
 * nada pendiente.
 */
export function SubmitButton({
    children,
    pendingText,
    className,
    variant,
}: {
    children: React.ReactNode;
    /** Qué decir mientras espera. */
    pendingText?: string;
    className?: string;
    variant?: React.ComponentProps<typeof Button>['variant'];
}) {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" disabled={pending} className={className} variant={variant}>
            {pending ? (pendingText ?? 'Enviando…') : children}
        </Button>
    );
}
