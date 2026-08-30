export { prisma } from "./client";
// Prisma v7 genera `client.ts` como entry point — el directorio no tiene index.
export * from "../generated/prisma/client";

// Mappers
export { UserMapper } from "./mappers/UserMapper";
export { ListingMapper } from "./mappers/ListingMapper";
export { OperationMapper } from "./mappers/OperationMapper";
export { ContractMapper } from "./mappers/ContractMapper";
export { NotificationMapper } from "./mappers/NotificationMapper";

// Repositories
export { PrismaUserRepository } from "./repositories/PrismaUserRepository";
export { PrismaListingRepository } from "./repositories/PrismaListingRepository";
export { PrismaOperationRepository } from "./repositories/PrismaOperationRepository";
export { PrismaContractRepository } from "./repositories/PrismaContractRepository";
export { PrismaNotificationRepository } from "./repositories/PrismaNotificationRepository";

// Unit of Work
export { PrismaUnitOfWork } from "./PrismaUnitOfWork";
export { PrismaReportRepository } from "./repositories/PrismaReportRepository";
export { ReportMapper } from "./mappers/ReportMapper";
