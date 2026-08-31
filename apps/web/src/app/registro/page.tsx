import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/profile';
import { AuthForm } from '@/components/AuthForm';
import { registerUser } from './actions';

export const metadata = { title: 'Crear cuenta · Traspaso' };

export default async function Registro() {
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
            action={registerUser}
            title="Crear cuenta"
            bajada="Con una sola cuenta podés comprar y vender. Verificás tu identidad recién cuando vayas a publicar o firmar."
            conNombre
            textoBoton="Crear cuenta"
            pie={{ text: '¿Ya tenés cuenta?', enlace: 'Ingresá', href: '/ingresar' }}
        />
    );
}
