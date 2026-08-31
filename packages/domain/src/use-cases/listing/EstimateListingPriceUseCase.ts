import { Money } from '../../value-objects/Money';
import { createAssetStrategy } from '../../strategies/AssetStrategyFactory';

export interface EstimateListingPriceInput {
    assetType: string;
    assetData: Record<string, unknown>;
}

/**
 * Calcula la valuación de un activo que todavía no existe.
 *
 * El vendedor necesita el número ANTES de fijar el precio, que es cuando le
 * sirve: hasta ahora la fórmula solo se aplicaba sobre listings ya creados, así
 * que el formulario de publicación pedía un precio sin ninguna referencia y la
 * estimación aparecía recién en la ficha, cuando ya estaba decidido.
 *
 * No guarda nada ni exige rol: es un cálculo puro sobre datos que la persona
 * acaba de escribir. Lanza ValidationError si el activo no cierra, igual que al
 * crearlo, así que el formulario recibe el mismo mensaje en los dos momentos.
 */
export class EstimateListingPriceUseCase {
    async execute(input: EstimateListingPriceInput): Promise<Money> {
        return createAssetStrategy(input.assetType, input.assetData).calculateEstimatedPrice();
    }
}
