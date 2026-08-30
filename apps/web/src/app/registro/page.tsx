import { FormularioAuth } from '@/components/FormularioAuth';
import { registrar } from './acciones';

export const metadata = { title: 'Crear cuenta · Traspaso' };

export default function Registro() {
    return (
        <FormularioAuth
            accion={registrar}
            titulo="Crear cuenta"
            bajada="Con una sola cuenta podés comprar y vender. Verificás tu identidad recién cuando vayas a publicar o firmar."
            conNombre
            textoBoton="Crear cuenta"
            pie={{ texto: '¿Ya tenés cuenta?', enlace: 'Ingresá', href: '/ingresar' }}
        />
    );
}
