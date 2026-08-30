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
import bcrypt from "bcryptjs";
import { Contract } from "@marketplace/domain/src/entities/Contract";
import { ContractDataBuilder } from "@marketplace/domain/src/contracts/ContractDataBuilder";
import { generateDocument } from "@marketplace/domain/src/contracts/ContractGenerator";
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

/**
 * La contraseña de cada usuario de ejemplo es su propio correo.
 *
 * No hace falta recordar nada: quien prueba la aplicación lee el correo en la
 * pantalla de ingreso y ya tiene la contraseña. Antes había una sola clave
 * compartida con el hash precomputado a mano, lo que evitaba depender de
 * bcrypt acá; con una contraseña distinta por usuario esa tabla de hashes se
 * desactualizaría en silencio en cuanto alguien agregue un usuario, así que se
 * calculan al sembrar.
 *
 * Son doce rondas, las mismas que usa `BcryptPasswordHasher` en la API: un
 * hash con otro costo no fallaría al verificar, pero dejaría de representar lo
 * que la aplicación produce de verdad.
 */
const SALT_ROUNDS = 12;

function hashDelCorreo(email: string): Promise<string> {
    return bcrypt.hash(email, SALT_ROUNDS);
}

async function main() {
  console.log("🌱 Iniciando Seed...");

  // 1. Limpiar todo
  await prisma.contract.deleteMany();
  await prisma.operation.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.user.deleteMany();

  // 2. Crear el admin de la plataforma. Es quien atestigua la custodia y el
  // acceso a los activos: sin él ninguno de los dos flujos se puede demostrar.
  const adminEmail = "admin@traspaso.com";
  const admin = User.create({
    email: Email.create(adminEmail),
    fullName: "Administración Traspaso",
    dni: "20111222333",
    role: UserRole.ADMIN,
    country: "AR",
    passwordHash: await hashDelCorreo(adminEmail),
  });
  admin.verifyKyc();
  await userRepo.save(admin);
  console.log("✅ Admin creado");

  // 3. Crear Seller
  const sellerEmail = "esteban.seller@example.com";
  const seller = User.create({
    email: Email.create(sellerEmail),
    fullName: "Esteban Vendedor",
    dni: "20123456789",
    role: UserRole.SELLER,
    country: "AR",
    passwordHash: await hashDelCorreo(sellerEmail),
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
    audienceTopCountry: "US",
    channelUrl: "https://youtube.com/@midudev"
  });

  const listing = Listing.create({
    sellerId: seller.id,
    assetStrategy: strategy,
    askingPrice: Money.fromCents(1500000, "USD"), // $15,000
  });
  // Lo ponemos en publicado para que se vea real
  (listing as any).props.status = "published";
  (listing as any).props.publishedAt = new Date();
  
  // La plataforma tiene el acceso desde hace más de la ventana de YouTube, así
  // que el listing arranca transferible. Sin esto el tripartito no se puede
  // firmar y la demo termina en la negociación.
  listing.registerPlatformAccess({
    verifiedBy: admin.id,
    accessSince: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
    notes: "Invitada como propietaria de la Cuenta de Marca.",
  });

  await listingRepo.save(listing);
  console.log("✅ Listing creado (transferible)");

  // 5. Crear Buyer
  const buyerEmail = "marcos.buyer@example.com";
  const buyer = User.create({
    email: Email.create(buyerEmail),
    fullName: "Marcos Comprador",
    dni: "20998877665",
    role: UserRole.BUYER,
    country: "ES",
    passwordHash: await hashDelCorreo(buyerEmail),
  });
  buyer.verifyKyc();
  await userRepo.save(buyer);
  console.log("✅ Buyer creado");

  // 6. Crear Operación con Negociación
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

  // 7. Crear un NDA firmado para el Buyer.
  //
  // El documento se genera con el mismo armador que usa la aplicación en vez
  // de firmar una huella inventada: así la huella firmada coincide con la que
  // se regenera al abrirlo, y la pantalla del contrato no aparece avisando que
  // el documento cambió después de la firma.
  const armador = new ContractDataBuilder(userRepo, listingRepo, operationRepo);
  const nda = Contract.createBuyerNda(listing.id, buyer.id);
  const { hash } = await generateDocument(await armador.para(nda));
  nda.attachDocument(hash);

  nda.sign("buyer", "192.168.1.10");
  // La plataforma también firma
  nda.sign("platform", "127.0.0.1");
  
  await contractRepo.save(nda);
  console.log("✅ Contrato NDA (Firmado) creado");

  console.log("✨ Seed finalizado con éxito!");
  console.log("   La contraseña de cada usuario es su propio correo:");
  for (const correo of [adminEmail, sellerEmail, buyerEmail]) {
    console.log(`   · ${correo}`);
  }
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
