import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/session';
import { AuthForm } from '@/components/AuthForm';
import { logIn } from './actions';

export const metadata = { title: 'Ingresar · Traspaso' };

export default async function Ingresar() {
    // Quien ya tiene sesión no tiene nada que hacer acá. Sin esto la
    // pantalla mostraba el formulario igual, y volver a completarlo no
    // cambiaba de cuenta de forma evidente.
    if (await currentActor()) redirect('/');

    return (
        <AuthForm
            action={logIn}
            title="Ingresar"
            bajada="Entrá para ofertar, publicar activos y seguir tus operaciones."
            textoBoton="Ingresar"
            pie={{ text: '¿Todavía no tenés cuenta?', enlace: 'Creá una', href: '/registro' }}
        />
    );
}
