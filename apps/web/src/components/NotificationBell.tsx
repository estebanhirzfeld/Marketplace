import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';
import { textFor, linkFor, timeAgo } from '@/lib/notifications';
import { NotificationDropdown, NotificationPreview } from './NotificationDropdown';

/** Cuántos avisos entran en el desplegable antes de mandar a la bandeja. */
const RECIENTES = 5;

/**
 * Los avisos del navbar.
 *
 * Trae la bandeja y redacta cada aviso acá, del lado del servidor: al cliente
 * solo le llega texto ya armado y el abrir y cerrar del desplegable. Así el
 * diccionario de mensajes no se manda al navegador y sigue habiendo un único
 * lugar donde se redactan.
 */
export async function NotificationBell() {
    if (!(await currentActor())) return null;

    let bandeja;
    try {
        bandeja = await api().notificaciones();
    } catch {
        // La bandeja caída no debe romper el navbar.
        return null;
    }

    const recientes: NotificationPreview[] = bandeja.items.slice(0, RECIENTES).map((n) => {
        const { title, cuerpo } = textFor(n);
        return {
            id: n.id,
            title,
            body: cuerpo,
            href: linkFor(n),
            when: timeAgo(n.createdAt),
            read: n.read,
        };
    });

    return <NotificationDropdown items={recientes} unread={bandeja.sinLeer} />;
}
