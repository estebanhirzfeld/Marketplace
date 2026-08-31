import { redirect } from 'next/navigation';

/**
 * Las ofertas de un activo dejaron de tener pantalla propia: viven en una
 * pestaña de la vista del activo, junto a su estado y sus verificaciones.
 * La ruta queda redirigiendo para no romper enlaces ya repartidos.
 */
export default async function OfertasDelActivo(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    redirect(`/activos/${id}?ver=ofertas`);
}
