import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/profile';
import { AuthForm } from '@/components/AuthForm';
import { logIn } from './actions';

export const metadata = { title: 'Ingresar · Traspaso' };

export default async function Ingresar() {
    /*
     * La guarda mira el perfil y no solo la cookie. Con `currentActor()`
     * alcanzaba que la cookie existiera, así que una sesión muerta —un token
     * de un usuario que ya no está, o vencido del lado del servidor— redirigía
     * igual y dejaba a la persona sin ninguna forma de volver a entrar salvo
     * borrar los datos del navegador a mano. `currentProfile()` le pregunta a
     * la API, que es la única que sabe si el token todavía vale.
     */
    if (await currentProfile()) redirect('/');

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
