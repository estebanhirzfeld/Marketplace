import { AuthForm } from '@/components/AuthForm';
import { logIn } from './actions';

export const metadata = { title: 'Ingresar · Traspaso' };

export default function Ingresar() {
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
