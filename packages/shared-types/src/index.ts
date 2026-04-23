// Export all generic shared types and DTOs here
export type Nullable<T> = T | null;

export enum AssetType {
    YOUTUBE = "youtube",
    WEB = "web",
    INSTAGRAM = "instagram",
    TIKTOK = "tiktok",
}

export enum UserRole {
    BUYER = "buyer",
    SELLER = "seller",
    ADMIN = "admin",
}
