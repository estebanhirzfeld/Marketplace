// Export all generic shared types and DTOs here
export type Nullable<T> = T | null;

/**
 * Los activos que la plataforma puede intermediar.
 *
 * Instagram y TikTok quedaron afuera por una razón anterior a la técnica: sus
 * términos prohíben transferir una cuenta —TikTok explícitamente, en su
 * sección 3.2— así que el activo no se puede entregar de forma legítima y la
 * plataforma estaría facilitando el incumplimiento de sus propios usuarios
 * frente a un tercero. No es que falte una API: no hay traspaso posible.
 */
export enum AssetType {
    YOUTUBE = "youtube",
    WEB = "web",
}

export enum UserRole {
    BUYER = "buyer",
    SELLER = "seller",
    ADMIN = "admin",
}

/**
 * El rubro del activo.
 *
 * Es una lista cerrada y no texto libre por dos razones. Se puede filtrar por
 * él, cosa imposible si cada vendedor escribe lo que quiere; y es lo único que
 * dice de qué trata un activo blindado sin revelar cuál es, así que conviene
 * que signifique lo mismo en todas las publicaciones.
 *
 * No es un dato reservado: describe la categoría, no la identidad.
 */
export enum AssetNiche {
    GAMING = "gaming",
    FINANCE = "finance",
    TECHNOLOGY = "technology",
    EDUCATION = "education",
    ENTERTAINMENT = "entertainment",
    HEALTH = "health",
    LIFESTYLE = "lifestyle",
    NEWS = "news",
    FOOD = "food",
    TRAVEL = "travel",
    BUSINESS = "business",
    OTHER = "other",
}

export const ASSET_NICHES: readonly AssetNiche[] = Object.values(AssetNiche);
