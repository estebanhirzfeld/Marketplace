import type { MetadataRoute } from 'next';
import { isSearchIndexingEnabled, robotsRules } from '@/lib/indexing';

/**
 * `robots.txt` gobernado por `SEARCH_INDEXING` (ver `@/lib/indexing`).
 *
 * `force-dynamic` para que el interruptor se pueda mover con solo cambiar la
 * variable de entorno y reiniciar el servicio: sin este flag, Next hornearía el
 * resultado en el build y haría falta recompilar.
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: robotsRules(isSearchIndexingEnabled()),
    };
}
