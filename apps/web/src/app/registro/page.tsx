import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/session';
import { AuthForm } from '@/components/AuthForm';
import { registerUser } from './actions';

export const metadata = { title: 'Crear cuenta · Traspaso' };

export default async function Registro() {
    // Quien ya tiene sesión no tiene nada que hacer acá. Sin esto la
    // pantalla mostraba el formulario igual, y volver a completarlo no
    // cambiaba de cuenta de forma evidente.
    if (await currentActor()) redirect('/');

    return (
        <AuthForm
            action={registerUser}
            title="Crear cuenta"
            bajada="Con una sola cuenta podés comprar y vender. Verificás tu identidad recién cuando vayas a publicar o firmar."
            conNombre
            textoBoton="Crear cuenta"
            pie={{ text: '¿Ya tenés cuenta?', enlace: 'Ingresá', href: '/ingresar' }}
        />
    );
}
