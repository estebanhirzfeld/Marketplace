import { describe, it, expect, vi } from 'vitest';
import { CreateOfferUseCase } from '../../../src/use-cases/negotiation/CreateOfferUseCase';
import { IListingRepository, IOperationRepository } from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { Listing } from '../../../src/entities/Listing';
import { Operation } from '../../../src/entities/Operation';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { InvalidStateError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/**
 * Una oferta viva por comprador y por activo.
 *
 * Sin la regla, cada envío del formulario abría una operación nueva: cinco
 * clics dejaban cinco negociaciones paralelas contra el mismo vendedor, que no
 * tenía forma de saber cuál responder. Para cambiar el monto está la
 * contraoferta, que además deja el historial a la vista.
 */

const SELLER_ID = new UniqueEntityID();
const LISTING_ID = new UniqueEntityID();
const BUYER: Actor = { id: new UniqueEntityID().toString(), role: UserRole.BUYER };
const OTRO_BUYER: Actor = { id: new UniqueEntityID().toString(), role: UserRole.BUYER };

const UNA_OFERTA = { listingId: LISTING_ID.toString(), offerPrice: { cents: 100000, currency: 'USD' } };

function unActivoPublicado(): Listing {
    return Listing.reconstitute(
        {
            sellerId: SELLER_ID,
            assetStrategy: new WebStrategy(Money.fromCents(50000, 'USD'), 30, 'ejemplo.com'),
            askingPrice: Money.fromCents(1500000, 'USD'),
            status: 'published',
            publishedAt: new Date(),
        },
        LISTING_ID,
        new Date(),
    );
}

function unaOperacionDe(buyerId: string): Operation {
    return Operation.create({
        listingId: LISTING_ID,
        buyerId: new UniqueEntityID(buyerId),
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(90000, 'USD'),
    });
}

function armar(existentes: Operation[]) {
    const operationRepo: IOperationRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByListing: vi.fn().mockResolvedValue(existentes),
        findByParty: vi.fn().mockResolvedValue([]),
        findByStatuses: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const listingRepo: IListingRepository = {
        findById: vi.fn().mockResolvedValue(unActivoPublicado()),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    return { uso: new CreateOfferUseCase(operationRepo, listingRepo), operationRepo };
}

describe('Una oferta viva por comprador y por activo', () => {
    it('deja ofertar cuando el comprador no tiene ninguna', async () => {
        const { uso, operationRepo } = armar([]);

        await uso.execute(UNA_OFERTA, BUYER);

        expect(operationRepo.save).toHaveBeenCalledOnce();
    });

    it('rechaza la segunda oferta del mismo comprador sobre el mismo activo', async () => {
        const { uso, operationRepo } = armar([unaOperacionDe(BUYER.id)]);

        await expect(uso.execute(UNA_OFERTA, BUYER)).rejects.toThrow(InvalidStateError);
        expect(operationRepo.save).not.toHaveBeenCalled();
    });

    it('le dice que contraoferte, en vez de solo negarse', async () => {
        const { uso } = armar([unaOperacionDe(BUYER.id)]);

        await expect(uso.execute(UNA_OFERTA, BUYER)).rejects.toThrow(/contraofert/i);
    });

    /** El multi-oferta sigue vivo: lo que se limita es repetir, no competir. */
    it('no le impide ofertar a OTRO comprador sobre el mismo activo', async () => {
        const { uso, operationRepo } = armar([unaOperacionDe(OTRO_BUYER.id)]);

        await uso.execute(UNA_OFERTA, BUYER);

        expect(operationRepo.save).toHaveBeenCalledOnce();
    });

    it('deja volver a ofertar si la anterior quedó cancelada', async () => {
        const anterior = unaOperacionDe(BUYER.id);
        anterior.cancel();

        const { uso, operationRepo } = armar([anterior]);
        await uso.execute(UNA_OFERTA, BUYER);

        expect(operationRepo.save).toHaveBeenCalledOnce();
    });
});
