import { AssetType } from '@marketplace/shared-types';
import { ValidationError } from '../errors/DomainError';

/**
 * Tipos de activo cuya venta está en pausa. La venta de sitios web se pausó el
 * 22/10/2026: el dominio se pone en custodia, pero el sitio en sí no tiene
 * todavía una entrega comprobable (`odd/tasks/entrega-de-un-sitio.md`). La
 * decide el container (`WEBSITE_SALES_ENABLED`); acá solo se aplica, igual al
 * crear, al enviar a revisión y al publicar, para que ningún camino la saltee.
 */
const PAUSED_MESSAGES: Partial<Record<string, string>> = {
    [AssetType.WEB]: 'Habilitaremos la venta de sitios web próximamente.',
};

export function assertSalesOpen(assetType: string, paused: ReadonlySet<string>): void {
    if (paused.has(assetType)) {
        throw new ValidationError(PAUSED_MESSAGES[assetType] ?? 'Por ahora no se pueden vender activos de este tipo.');
    }
}
