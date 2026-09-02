import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { User } from "@marketplace/domain/src/entities/User";
import { Email } from "@marketplace/domain/src/value-objects/Email";
import { Money } from "@marketplace/domain/src/value-objects/Money";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { AssetNiche, UserRole } from "@marketplace/shared-types";
import { Listing } from "@marketplace/domain/src/entities/Listing";
import { IAssetStrategy } from "@marketplace/domain/src/strategies/IAssetStrategy";
import { YouTubeStrategy } from "@marketplace/domain/src/strategies/YouTubeStrategy";
import { WebStrategy } from "@marketplace/domain/src/strategies/WebStrategy";
import { Operation } from "@marketplace/domain/src/entities/Operation";
import { Contract } from "@marketplace/domain/src/entities/Contract";
import { ContractDataBuilder } from "@marketplace/domain/src/contracts/ContractDataBuilder";
import { generateDocument } from "@marketplace/domain/src/contracts/ContractGenerator";
import { CustodyAccount } from "@marketplace/domain/src/entities/CustodyAccount";
import { AssetType } from "@marketplace/shared-types";
import { PrismaUserRepository } from "../src/repositories/PrismaUserRepository";
import { PrismaListingRepository } from "../src/repositories/PrismaListingRepository";
import { PrismaOperationRepository } from "../src/repositories/PrismaOperationRepository";
import { PrismaContractRepository } from "../src/repositories/PrismaContractRepository";
import { PrismaCustodyAccountRepository } from "../src/repositories/PrismaCustodyAccountRepository";

// Setup similar al client.ts
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const userRepo = new PrismaUserRepository();
const listingRepo = new PrismaListingRepository();
const operationRepo = new PrismaOperationRepository();
const contractRepo = new PrismaContractRepository();
const custodyRepo = new PrismaCustodyAccountRepository();

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Una fecha a tantos días atrás de ahora. */
function daysAgo(days: number): Date {
    return new Date(Date.now() - days * MILLISECONDS_PER_DAY);
}

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

interface UserSeed {
    email: string;
    fullName: string;
    dni: string;
    role: UserRole;
    country: string;
}

async function createUser({ email, fullName, dni, role, country }: UserSeed): Promise<User> {
    const user = User.create({
        email: Email.create(email),
        fullName,
        dni,
        role,
        country,
        passwordHash: await bcrypt.hash(email, SALT_ROUNDS),
    });
    user.verifyKyc();
    await userRepo.save(user);
    return user;
}

interface ListingSeed {
    sellerId: UniqueEntityID;
    assetStrategy: IAssetStrategy;
    askingPrice: Money;
    createdDaysAgo: number;
    /** Ausente en un activo que todavía no llegó al mercado. */
    publishedDaysAgo?: number;
}

/**
 * Construye un activo con su fecha de publicación elegida.
 *
 * Va por `reconstitute` y no por `create()` + `submitForReview()` + `approve()`
 * porque `approve()` sella `publishedAt` con la fecha de hoy: los siete activos
 * quedarían publicados en el mismo instante y el orden por antigüedad de
 * publicación —uno de los criterios del mercado— no mostraría nada.
 * `reconstitute` es el camino que usa la persistencia para rehidratar un estado
 * ya alcanzado, que es exactamente lo que el seed escribe.
 *
 * Antes esto se resolvía asignando `props.status` con un `as any`, que además
 * de saltear la entidad dejaba `publishedAt` a cargo de quien se acordara de
 * escribirlo.
 */
function seedListing({
    sellerId,
    assetStrategy,
    askingPrice,
    createdDaysAgo,
    publishedDaysAgo,
}: ListingSeed): Listing {
    return Listing.reconstitute(
        {
            sellerId,
            assetStrategy,
            askingPrice,
            status: publishedDaysAgo === undefined ? "under_review" : "published",
            publishedAt: publishedDaysAgo === undefined ? undefined : daysAgo(publishedDaysAgo),
        },
        new UniqueEntityID(),
        daysAgo(createdDaysAgo),
    );
}

/**
 * Firma el NDA de un comprador sobre un activo.
 *
 * El documento se genera con el mismo armador que usa la aplicación en vez de
 * firmar una huella inventada: así la huella firmada coincide con la que se
 * regenera al abrirlo, y la pantalla del contrato no aparece avisando que el
 * documento cambió después de la firma.
 */
async function signBuyerNda(listing: Listing, buyer: User): Promise<void> {
    const builder = new ContractDataBuilder(userRepo, listingRepo, operationRepo);
    const nda = Contract.createBuyerNda(listing.id, buyer.id);
    const { hash } = await generateDocument(await builder.para(nda));
    nda.attachDocument(hash);

    nda.sign("buyer", "192.168.1.10");
    // La plataforma también firma: sin las dos firmas el NDA no desbloquea nada.
    nda.sign("platform", "127.0.0.1");

    await contractRepo.save(nda);
}

async function main() {
    console.log("🌱 Iniciando Seed...");

    // ── 1. Limpiar todo, de las tablas hijas hacia las padres ──
    //
    // El orden no es cosmético: ninguna relación del schema declara
    // `onDelete: Cascade`, así que Postgres rechaza borrar una fila mientras
    // algo la referencie. Borrar un usuario que todavía tiene avisos falla con
    // P2003 sobre `notifications_userId_fkey`.
    //
    // Y son restrictivas a propósito. Un reclamo es la evidencia que la
    // plataforma le entrega a la parte damnificada si el caso termina en un
    // juicio: que desaparezca solo porque se borró al denunciado sería
    // exactamente lo que no queremos. Por eso el arreglo va acá, en el orden
    // del borrado, y no aflojando las restricciones en el schema.
    //
    // Al agregar un modelo nuevo que apunte a alguno de estos, se suma acá.
    await prisma.notification.deleteMany();
    await prisma.report.deleteMany();
    await prisma.contract.deleteMany();
    await prisma.operation.deleteMany();
    await prisma.listing.deleteMany();
    // Después de los listings: la FK `listings.custodyAccountId` es
    // `onDelete: SetNull`, pero igual conviene borrar los listings primero
    // para no dejar la tabla a medias si algo falla.
    await prisma.custodyAccount.deleteMany();
    await prisma.user.deleteMany();

    // ── 2. Usuarios ────────────────────────────────────────
    //
    // El admin es quien atestigua la custodia y el acceso a los activos: sin él
    // ninguno de los dos flujos se puede demostrar.
    const admin = await createUser({
        email: "admin@traspaso.com",
        fullName: "Administración Traspaso",
        dni: "20111222333",
        role: UserRole.ADMIN,
        country: "AR",
    });

    const seller = await createUser({
        email: "seller@traspaso.com",
        fullName: "Esteban Vendedor",
        dni: "20123456789",
        role: UserRole.SELLER,
        country: "AR",
    });

    // Un segundo vendedor para que el mercado no sea el catálogo de una sola
    // persona y el panel de vendedor muestre un subconjunto, no todo.
    const seller2 = await createUser({
        email: "seller2@traspaso.com",
        fullName: "Lucía Ferreyra",
        dni: "27334455667",
        role: UserRole.SELLER,
        country: "AR",
    });

    const buyer = await createUser({
        email: "buyer@traspaso.com",
        fullName: "Marcos Comprador",
        dni: "20998877665",
        role: UserRole.BUYER,
        country: "ES",
    });

    const buyer2 = await createUser({
        email: "buyer2@traspaso.com",
        fullName: "Ana Beltrán",
        dni: "27556677889",
        role: UserRole.BUYER,
        country: "AR",
    });

    console.log("✅ 5 usuarios creados (1 admin, 2 vendedores, 2 compradores)");

    // ── 2b. Cuentas de custodia ────────────────────────────
    //
    // La identidad que sostiene los activos en custodia. Sin al menos una, el
    // flujo queda trabado: registrar el acceso pasa a exigirla.
    //
    // ⚠️ Los `identifier` son PLACEHOLDERS. La cuenta de Google real que va a
    // figurar como propietaria de las Cuentas de Marca todavía no existe: hay
    // que crearla y reemplazar este valor. Lo mismo para el usuario del
    // registrador. El código funciona; el dato hay que ponerlo.
    const custodiaYouTube = CustodyAccount.create({
        label: "Custodia YouTube 01",
        identifier: "custodia-yt-01@traspaso.com", // PLACEHOLDER — reemplazar por la cuenta de Google real
        assetType: AssetType.YOUTUBE,
        notes: "Cuenta de Marca propietaria. Reemplazar el identifier por la cuenta real.",
    });
    const custodiaWeb = CustodyAccount.create({
        label: "Custodia Web 01",
        identifier: "custodia-web-01@traspaso.com", // PLACEHOLDER — reemplazar por el usuario del registrador real
        assetType: AssetType.WEB,
        notes: "Usuario del registrador. Reemplazar el identifier por el real.",
    });
    await custodyRepo.save(custodiaYouTube);
    await custodyRepo.save(custodiaWeb);
    console.log("✅ 2 cuentas de custodia creadas (identifiers placeholder)");

    // ── 3. Activos ─────────────────────────────────────────
    //
    // Siete, con precios pedidos cerca de lo que estima cada strategy y fechas
    // escalonadas para que los filtros de antigüedad y los ordenamientos del
    // mercado tengan sobre qué trabajar.

    // Monetizado, audiencia de CPM alto y sin cara: el más caro de los canales.
    const programmingChannel = seedListing({
        sellerId: seller.id,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, "USD"), // $1.200
            subscribers: 55000,
            growthFactor: 1.1,
            isMonetized: true,
            hasNoFaceContent: true,
            audienceTopCountry: "US",
            channelUrl: "https://youtube.com/@midudev",
            name: "Midudev",
            niche: AssetNiche.TECHNOLOGY,
        }),
        askingPrice: Money.fromCents(3600000, "USD"), // $36.000
        createdDaysAgo: 20,
        publishedDaysAgo: 12,
    });
    // La plataforma tiene el acceso desde hace más de la ventana de YouTube, así
    // que este activo arranca transferible. Sin al menos uno así el tripartito
    // no se puede firmar y la demo termina en la negociación.
    programmingChannel.registerPlatformAccess({
        verifiedBy: admin.id,
        heldRole: 'manager',
        custodyAccountId: custodiaYouTube.id,
        accessSince: daysAgo(9),
        notes: "Invitada como administradora de la Cuenta de Marca.",
    });

    // Acceso cedido hace dos días: todavía dentro de los siete de espera, así
    // que sirve para mostrar el candado del plazo con una fecha concreta.
    const financeChannel = seedListing({
        sellerId: seller2.id,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(340000, "USD"), // $3.400
            subscribers: 128000,
            growthFactor: 1.25,
            isMonetized: true,
            hasNoFaceContent: true,
            audienceTopCountry: "US",
            channelUrl: "https://youtube.com/@finanzassincara",
            name: "Finanzas Sin Cara",
            niche: AssetNiche.FINANCE,
        }),
        askingPrice: Money.fromCents(10500000, "USD"), // $105.000
        createdDaysAgo: 8,
        publishedDaysAgo: 5,
    });
    financeChannel.registerPlatformAccess({
        verifiedBy: admin.id,
        heldRole: 'manager',
        custodyAccountId: custodiaYouTube.id,
        accessSince: daysAgo(2),
        notes: "Invitación aceptada; corriendo el plazo de propietario principal.",
    });

    // Audiencia local, con cara y decreciendo: el extremo barato del catálogo.
    // Sin constancia de acceso, que es el estado normal de un activo recién
    // publicado.
    const gamingChannel = seedListing({
        sellerId: seller.id,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(45000, "USD"), // $450
            subscribers: 92000,
            growthFactor: 0.95,
            isMonetized: true,
            hasNoFaceContent: false,
            audienceTopCountry: "AR",
            channelUrl: "https://youtube.com/@nivelcompleto",
            name: "Nivel Completo",
            niche: AssetNiche.GAMING,
        }),
        askingPrice: Money.fromCents(950000, "USD"), // $9.500
        createdDaysAgo: 30,
        publishedDaysAgo: 22,
    });

    // Sin monetizar: la strategy lo valúa por alcance y no por ingreso, que es
    // la otra mitad de `calculateEstimatedPrice()` y conviene tenerla a la vista.
    const recipesChannel = seedListing({
        sellerId: seller2.id,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(0, "USD"),
            subscribers: 31000,
            growthFactor: 1.4,
            isMonetized: false,
            hasNoFaceContent: true,
            audienceTopCountry: "AR",
            channelUrl: "https://youtube.com/@cocinadediario",
            name: "Cocina de Diario",
            niche: AssetNiche.FOOD,
        }),
        askingPrice: Money.fromCents(2900000, "USD"), // $29.000
        createdDaysAgo: 3,
        publishedDaysAgo: 2,
    });

    // Web con buena autoridad de dominio. Un sitio no tiene plazo de espera
    // —cambiar registrador y hosting es inmediato—, así que con la constancia
    // de acceso ya queda transferible.
    const saasBlog = seedListing({
        sellerId: seller.id,
        assetStrategy: new WebStrategy(Money.fromCents(210000, "USD"), 52, "herramientas-saas.com", AssetNiche.TECHNOLOGY, "Herramientas SaaS"),
        askingPrice: Money.fromCents(6800000, "USD"), // $68.000
        createdDaysAgo: 15,
        publishedDaysAgo: 9,
    });
    saasBlog.registerPlatformAccess({
        verifiedBy: admin.id,
        heldRole: 'manager',
        custodyAccountId: custodiaWeb.id,
        accessSince: daysAgo(1),
        notes: "Accesos de registrador y hosting entregados y verificados.",
    });

    // El único con precio pedido en pesos: sin él, el filtro por moneda del
    // mercado no tiene contra qué mostrarse.
    //
    // El monto es chico a la fuerza. `askingPrice` es `Int` en Postgres, o sea
    // 2.147.483.647 centavos como techo, así que un precio en pesos por encima
    // de $21.474.836 desborda la columna. Con la cotización de hoy eso son unos
    // USD 16.000: cualquier activo más caro no se puede publicar en pesos.
    const nicheStore = seedListing({
        sellerId: seller2.id,
        assetStrategy: new WebStrategy(Money.fromCents(25000, "USD"), 28, "decoclub.com.ar", AssetNiche.LIFESTYLE, "DecoClub"),
        askingPrice: Money.fromCents(975000000, "ARS"), // $9.750.000
        createdDaysAgo: 35,
        publishedDaysAgo: 30,
    });

    // Sin publicar: queda en revisión para que la cola del admin no esté vacía.
    const hardwareReviews = seedListing({
        sellerId: seller.id,
        assetStrategy: new WebStrategy(Money.fromCents(135000, "USD"), 41, "probamostodo.com", AssetNiche.TECHNOLOGY, "Probamos Todo"),
        askingPrice: Money.fromCents(4300000, "USD"), // $43.000
        createdDaysAgo: 1,
    });

    const listings = [
        programmingChannel,
        financeChannel,
        gamingChannel,
        recipesChannel,
        saasBlog,
        nicheStore,
        hardwareReviews,
    ];
    for (const listing of listings) {
        await listingRepo.save(listing);
    }
    console.log(`✅ ${listings.length} activos creados (6 publicados, 1 en revisión)`);

    // ── 4. Operaciones ─────────────────────────────────────

    // Ida y vuelta completo: le toca responder al vendedor.
    const negotiation = Operation.create({
        listingId: programmingChannel.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        offerPrice: Money.fromCents(3000000, "USD"), // $30.000
    });
    negotiation.counterOffer(Money.fromCents(3500000, "USD"), "seller"); // $35.000
    negotiation.counterOffer(Money.fromCents(3300000, "USD"), "buyer"); // $33.000
    await operationRepo.save(negotiation);

    // Segunda oferta viva sobre el MISMO activo, de otro comprador. Es el caso
    // que justifica la cascada de `AcceptOfferUseCase`: aceptar una cancela el
    // resto. Con un solo comprador no había forma de verlo.
    const competingOffer = Operation.create({
        listingId: programmingChannel.id,
        buyerId: buyer2.id,
        sellerId: seller.id,
        offerPrice: Money.fromCents(3400000, "USD"), // $34.000
    });
    await operationRepo.save(competingOffer);

    // Sobre un activo distinto y esperando respuesta del comprador, para que la
    // bandeja de cada parte tenga algo pendiente.
    const websiteOffer = Operation.create({
        listingId: saasBlog.id,
        buyerId: buyer2.id,
        sellerId: seller.id,
        offerPrice: Money.fromCents(6000000, "USD"), // $60.000
    });
    websiteOffer.counterOffer(Money.fromCents(6600000, "USD"), "seller"); // $66.000
    await operationRepo.save(websiteOffer);

    console.log("✅ 3 operaciones creadas (2 compitiendo por el mismo activo)");

    // ── 5. NDAs firmados ───────────────────────────────────
    //
    // Uno por comprador y sobre activos distintos: así cada uno ve los datos
    // reservados de un activo y sigue viendo el resto blindado, que es la
    // diferencia que hay que poder mostrar.
    await signBuyerNda(programmingChannel, buyer);
    await signBuyerNda(saasBlog, buyer2);
    console.log("✅ 2 NDAs firmados");

    console.log("✨ Seed finalizado con éxito!");
    console.log("   La contraseña de cada usuario es su propio correo:");
    for (const email of [
        "admin@traspaso.com",
        "seller@traspaso.com",
        "seller2@traspaso.com",
        "buyer@traspaso.com",
        "buyer2@traspaso.com",
    ]) {
        console.log(`   · ${email}`);
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
