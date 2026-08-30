import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { NotificationsDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { actorActual } from '@/lib/sesion';
import { Revelar } from '@/components/Revelar';
import { Boton, BotonEnlace, Titulo, Vacio } from '@/components/ui';
import { textoDe, enlaceDe, haceCuanto } from '@/lib/avisos';
import { marcarLeido } from './acciones';

export const metadata = { title: 'Avisos · Traspaso' };

export default async function Avisos() {
    if (!(await actorActual())) redirect('/ingresar');

    let bandeja: NotificationsDto = { items: [], sinLeer: 0 };
    try {
        bandeja = await api().notificaciones();
    } catch {
        // Se muestra vacía en vez de romper.
    }

    return (
        <div className="mx-auto max-w-[860px] px-6 py-16 sm:px-12">
            <Revelar>
                <Titulo sub="Todo lo que pasó mientras no estabas mirando: ofertas, contraofertas y cada avance de tus operaciones.">
                    Avisos
                </Titulo>
            </Revelar>

            <div className="mt-10">
                {bandeja.items.length === 0 ? (
                    <Vacio
                        titulo="No hay avisos"
                        texto="Cuando alguien oferte por un activo tuyo, o avance una operación en la que sos parte, te vas a enterar acá."
                        accion={<BotonEnlace href="/listings" variante="secundario">Ver el mercado</BotonEnlace>}
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {bandeja.items.map((n, i) => {
                            const { titulo, cuerpo } = textoDe(n);
                            return (
                                <Revelar key={n.id} retraso={Math.min(i, 6) * 60}>
                                    <div
                                        className={`flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-medio)] border p-5 ${
                                            n.read
                                                ? 'border-[var(--color-borde)] opacity-60'
                                                : 'border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)]'
                                        }`}
                                    >
                                        <Link href={enlaceDe(n)} className="flex flex-1 flex-col gap-1.5">
                                            <div className="flex items-center gap-2.5">
                                                {!n.read && (
                                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-acento)]" />
                                                )}
                                                <span className="text-[15px] font-medium">{titulo}</span>
                                            </div>
                                            <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                                {cuerpo}
                                            </p>
                                            <span className="font-mono text-[11px] text-[var(--color-apagado)]">
                                                {haceCuanto(n.createdAt)}
                                            </span>
                                        </Link>

                                        {!n.read && (
                                            <form action={marcarLeido.bind(null, n.id)}>
                                                <Boton
                                                    type="submit"
                                                    variante="fantasma"
                                                    className="px-3 py-1.5 text-[12px]"
                                                >
                                                    Marcar leído
                                                </Boton>
                                            </form>
                                        )}
                                    </div>
                                </Revelar>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
