import { describe, it, expect, vi } from 'vitest';
import {
    NotFoundError,
    ForbiddenError,
    InvalidStateError,
    ValidationError,
} from '../../src/errors/DomainError';
import { Email } from '../../src/value-objects/Email';
import { Money } from '../../src/value-objects/Money';
import { UniqueEntityID } from '../../src/value-objects/UniqueEntityID';
import { Listing } from '../../src/entities/Listing';
import { Operation } from '../../src/entities/Operation';
import { Contract } from '../../src/entities/Contract';
import { User } from '../../src/entities/User';
import { YouTubeStrategy } from '../../src/strategies/YouTubeStrategy';
import { UserRole } from '@marketplace/shared-types';
import { CreateOfferUseCase } from '../../src/use-cases/negotiation/CreateOfferUseCase';
import { IListingRepository, IOperationRepository } from '../../src/ports/Repositories';
import { Actor } from '../../src/ports/Actor';

// Un contrato sin documento no se puede firmar; en estos tests alcanza
// una huella cualquiera con forma válida.
const HASH = 'a'.repeat(64);

/**
 * Contrato de clasificación de errores.
 *
 * Cada tipo determina un código HTTP en apps/api, así que la clasificación es
 * una decisión de diseño y no un detalle. Este archivo la fija: si alguien
 * cambia el tipo que lanza una regla, cambia el status que ve el cliente.
 *
 *   NotFoundError     → 404
 *   ForbiddenError    → 403
 *   InvalidStateError → 409
 *   ValidationError   → 400
 */

// ── Mock Factories ───────────────────────────────────────
// Mismo idiom que el resto de la suite: tipo anotado en el retorno para que
// TypeScript verifique el puerto completo. Nunca un `as` — un cast dejaría
// pasar un mock desalineado del contrato que dice doblar.

function createMockListingRepo(
    overrides: Partial<IListingRepository> = {},
): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function createMockOperationRepo(
    overrides: Partial<IOperationRepository> = {},
): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function unListingPublicado(sellerId: UniqueEntityID): Listing {
    const listing = Listing.create({
        sellerId,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromFloat(1000),
            subscribers: 50_000,
            isMonetized: true,
        }),
        askingPrice: Money.fromFloat(24_000),
        isBlind: false,
    });
    listing.submitForReview();
    listing.approve();
    return listing;
}

describe('Clasificación de errores de dominio', () => {
    describe('ValidationError — los datos no cumplen una invariante', () => {
        it('email con formato inválido', () => {
            expect(() => Email.create('no-es-un-email')).toThrow(ValidationError);
        });

        it('monto que no está en centavos enteros', () => {
            expect(() => Money.fromCents(10.5)).toThrow(ValidationError);
        });

        it('aritmética entre monedas distintas', () => {
            expect(() => Money.fromCents(100, 'USD').add(Money.fromCents(100, 'ARS')))
                .toThrow(ValidationError);
        });

        it('rechazo de listing sin motivo', () => {
            const listing = Listing.create({
                sellerId: new UniqueEntityID(),
                assetStrategy: new YouTubeStrategy({
                    monthlyRevenueUsd: Money.fromFloat(500),
                    subscribers: 10_000,
                    isMonetized: true,
                }),
                askingPrice: Money.fromFloat(12_000),
                isBlind: false,
            });
            listing.submitForReview();

            expect(() => listing.reject('')).toThrow(ValidationError);
        });

        it('KYC sin los datos obligatorios', () => {
            const user = User.create({
                email: Email.create('sin-dni@test.com'),
                fullName: 'Sin Documento',
                role: UserRole.BUYER,
                passwordHash: 'hash-de-prueba',
            });

            expect(() => user.verifyKyc()).toThrow(ValidationError);
        });
    });

    describe('InvalidStateError — la acción es válida, el estado no la permite', () => {
        it('aprobar un listing que no está en revisión', () => {
            const listing = unListingPublicado(new UniqueEntityID());
            expect(() => listing.approve()).toThrow(InvalidStateError);
        });

        it('completar una operación sin pago confirmado', () => {
            const operation = Operation.create({
                listingId: new UniqueEntityID(),
                buyerId: new UniqueEntityID(),
                sellerId: new UniqueEntityID(),
                offerPrice: Money.fromFloat(1000),
            });

            expect(() => operation.complete()).toThrow(InvalidStateError);
        });

        it('negociar fuera de turno', () => {
            const operation = Operation.create({
                listingId: new UniqueEntityID(),
                buyerId: new UniqueEntityID(),
                sellerId: new UniqueEntityID(),
                offerPrice: Money.fromFloat(1000),
            });

            // El buyer ya ofertó al crear la operación; le toca al seller.
            expect(() => operation.counterOffer(Money.fromFloat(900), 'buyer'))
                .toThrow(InvalidStateError);
        });

        it('firmar dos veces con el mismo rol', () => {
            const contract = Contract.createTripartite(
                new UniqueEntityID(),
                new UniqueEntityID(),
            );
            contract.attachDocument(HASH);
            contract.sign('buyer', '1.1.1.1');

            expect(() => contract.sign('buyer', '1.1.1.1')).toThrow(InvalidStateError);
        });
    });

    describe('ForbiddenError — el actor no tiene lugar en esta relación', () => {
        it('firmar con un rol ajeno al contrato', () => {
            const nda = Contract.createBuyerNda(
                new UniqueEntityID(),
                new UniqueEntityID(),
            );

            nda.attachDocument(HASH);

            // Un buyer_nda solo tiene firmas de buyer y platform.
            expect(() => nda.sign('seller', '1.1.1.1')).toThrow(ForbiddenError);
        });

        it('ofertar sobre el propio listing', async () => {
            const sellerId = new UniqueEntityID();
            const listing = unListingPublicado(sellerId);

            const useCase = new CreateOfferUseCase(
                createMockOperationRepo(),
                createMockListingRepo({
                    findById: vi.fn().mockResolvedValue(listing),
                }),
            );

            const actor: Actor = { id: sellerId.toString(), role: UserRole.SELLER };

            await expect(useCase.execute({
                listingId: listing.id.toString(),
                offerPrice: { cents: 100_000, currency: 'USD' },
            }, actor)).rejects.toThrow(ForbiddenError);
        });
    });

    describe('NotFoundError — la entidad pedida no existe', () => {
        it('ofertar sobre un listing inexistente', async () => {
            // findById devuelve null por defecto en la factory.
            const useCase = new CreateOfferUseCase(
                createMockOperationRepo(),
                createMockListingRepo(),
            );

            const actor: Actor = { id: new UniqueEntityID().toString(), role: UserRole.BUYER };

            await expect(useCase.execute({
                listingId: 'no-existe',
                offerPrice: { cents: 100_000, currency: 'USD' },
            }, actor)).rejects.toThrow(NotFoundError);
        });
    });
});
