import { AuthForm } from '@/components/AuthForm';
import { registerUser } from './actions';

export const metadata = { title: 'Crear cuenta · Traspaso' };

export default function Registro() {
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
