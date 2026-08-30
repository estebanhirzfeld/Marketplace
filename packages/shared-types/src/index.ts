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
