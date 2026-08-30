import { FormularioAuth } from '@/components/FormularioAuth';
import { ingresar } from './acciones';

export const metadata = { title: 'Ingresar · Traspaso' };

export default function Ingresar() {
    return (
        <FormularioAuth
            accion={ingresar}
            titulo="Ingresar"
            bajada="Entrá para ofertar, publicar activos y seguir tus operaciones."
            textoBoton="Ingresar"
            pie={{ texto: '¿Todavía no tenés cuenta?', enlace: 'Creá una', href: '/registro' }}
        />
    );
}
