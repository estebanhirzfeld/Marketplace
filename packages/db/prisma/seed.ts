import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { User } from "@marketplace/domain/src/entities/User";
import { Email } from "@marketplace/domain/src/value-objects/Email";
import { UserRole } from "@marketplace/shared-types";
import { Money } from "@marketplace/domain/src/value-objects/Money";
import { Listing } from "@marketplace/domain/src/entities/Listing";
import { YouTubeStrategy } from "@marketplace/domain/src/strategies/YouTubeStrategy";
import { Operation } from "@marketplace/domain/src/entities/Operation";
import { Contract } from "@marketplace/domain/src/entities/Contract";
import { PrismaUserRepository } from "../src/repositories/PrismaUserRepository";
import { PrismaListingRepository } from "../src/repositories/PrismaListingRepository";
import { PrismaOperationRepository } from "../src/repositories/PrismaOperationRepository";
import { PrismaContractRepository } from "../src/repositories/PrismaContractRepository";

// Setup similar al client.ts
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const userRepo = new PrismaUserRepository();
const listingRepo = new PrismaListingRepository();
const operationRepo = new PrismaOperationRepository();
const contractRepo = new PrismaContractRepository();

async function main() {
  console.log("🌱 Iniciando Seed...");

  // 1. Limpiar todo
  await prisma.contract.deleteMany();
  await prisma.operation.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.user.deleteMany();

  // 2. Crear Seller
  const seller = User.create({
    email: Email.create("esteban.seller@example.com"),
    fullName: "Esteban Vendedor",
    dni: "20123456789",
    role: UserRole.SELLER,
    country: "AR"
  });
  seller.verifyKyc();
  await userRepo.save(seller);
  console.log("✅ Seller creado");

  // 3. Crear Listing (YouTube)
  const strategy = new YouTubeStrategy({
    monthlyRevenueUsd: Money.fromCents(120000, "USD"), // $1200
    subscribers: 55000,
    growthFactor: 1.1,
    isMonetized: true,
    hasNoFaceContent: true,
    audienceTopCountry: "US"
  });

  const listing = Listing.create({
    sellerId: seller.id,
    assetStrategy: strategy,
    askingPrice: Money.fromCents(1500000, "USD"), // $15,000
    isBlind: false
  });
  // Lo ponemos en publicado para que se vea real
  (listing as any).props.status = "published";
  (listing as any).props.publishedAt = new Date();
  
  await listingRepo.save(listing);
  console.log("✅ Listing creado");

  // 4. Crear Buyer
  const buyer = User.create({
    email: Email.create("marcos.buyer@example.com"),
    fullName: "Marcos Comprador",
    dni: "20998877665",
    role: UserRole.BUYER,
    country: "ES"
  });
  buyer.verifyKyc();
  await userRepo.save(buyer);
  console.log("✅ Buyer creado");

  // 5. Crear Operación con Negociación
  const operation = Operation.create({
    listingId: listing.id,
    buyerId: buyer.id,
    sellerId: seller.id,
    offerPrice: Money.fromCents(1200000, "USD") // Oferta inicial $12,000
  });

  // Simulamos un ida y vuelta
  operation.counterOffer(Money.fromCents(1400000, "USD"), "seller"); // Seller pide $14,000
  operation.counterOffer(Money.fromCents(1350000, "USD"), "buyer");  // Buyer ofrece $13,500
  
  await operationRepo.save(operation);
  console.log("✅ Operación creada con historial de negociación");

  // 6. Crear un NDA firmado para el Buyer
  const nda = Contract.createBuyerNda(listing.id, buyer.id);
  nda.sign("buyer", "192.168.1.10");
  // La plataforma también firma
  nda.sign("platform", "127.0.0.1");
  
  await contractRepo.save(nda);
  console.log("✅ Contrato NDA (Firmado) creado");

  console.log("✨ Seed finalizado con éxito!");
}

main()
  .catch((e) => {
    console.error("❌ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
