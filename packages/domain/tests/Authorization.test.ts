import { describe, it, expect } from 'vitest';
import { Operation } from '../src/entities/Operation';
import { Listing } from '../src/entities/Listing';
import { Contract } from '../src/entities/Contract';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { Money } from '../src/value-objects/Money';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { ForbiddenError } from '../src/errors/DomainError';
import { assertIsAdmin } from '../src/ports/Actor';
import { UserRole } from '@marketplace/shared-types';

// Un contrato sin documento no se puede firmar; en estos tests alcanza
// una huella cualquiera con forma válida.
const HASH = 'a'.repeat(64);

function unaOperacion(buyerId: UniqueEntityID, sellerId: UniqueEntityID): Operation {
    return Operation.create({
        listingId: new UniqueEntityID(),
        buyerId,
        sellerId,
        offerPrice: Money.fromFloat(1000),
    });
}

function unListing(sellerId: UniqueEntityID): Listing {
    return Listing.create({
        sellerId,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromFloat(1000),
            subscribers: 50_000,
            isMonetized: true,
        }),
        askingPrice: Money.fromFloat(24_000),
        isBlind: false,
    });
}

describe('Operation.partyFor', () => {
    it('reconoce al buyer de esta operación', () => {
        const buyerId = new UniqueEntityID();
        const operation = unaOperacion(buyerId, new UniqueEntityID());

        expect(operation.partyFor(buyerId.toString())).toBe('buyer');
    });

    it('reconoce al seller de esta operación', () => {
        const sellerId = new UniqueEntityID();
        const operation = unaOperacion(new UniqueEntityID(), sellerId);

        expect(operation.partyFor(sellerId.toString())).toBe('seller');
    });

    it('rechaza a un tercero', () => {
        const operation = unaOperacion(new UniqueEntityID(), new UniqueEntityID());

        expect(() => operation.partyFor(new UniqueEntityID().toString()))
            .toThrow(ForbiddenError);
    });

    /**
     * El caso que justifica todo el modelo: varios buyers compiten por el mismo
     * listing. Cada uno es 'buyer' en SU operación y un tercero en las demás.
     * Un chequeo de rol global no podría distinguirlas y dejaría que el buyer A
     * operara sobre la oferta del buyer B.
     */
    it('aísla a buyers que compiten por el mismo listing', () => {
        const listingId = new UniqueEntityID();
        const sellerId = new UniqueEntityID();
        const buyerA = new UniqueEntityID();
        const buyerB = new UniqueEntityID();

        const ofertaA = Operation.create({
            listingId, sellerId, buyerId: buyerA, offerPrice: Money.fromFloat(1000),
        });
        const ofertaB = Operation.create({
            listingId, sellerId, buyerId: buyerB, offerPrice: Money.fromFloat(1200),
        });

        expect(ofertaA.partyFor(buyerA.toString())).toBe('buyer');
        expect(ofertaB.partyFor(buyerB.toString())).toBe('buyer');

        // Ninguno puede tocar la operación del otro.
        expect(() => ofertaA.partyFor(buyerB.toString())).toThrow(ForbiddenError);
        expect(() => ofertaB.partyFor(buyerA.toString())).toThrow(ForbiddenError);

        // El seller sí es parte de ambas.
        expect(ofertaA.partyFor(sellerId.toString())).toBe('seller');
        expect(ofertaB.partyFor(sellerId.toString())).toBe('seller');
    });
});

describe('Operation.assertIsSeller', () => {
    it('acepta al seller', () => {
        const sellerId = new UniqueEntityID();
        const operation = unaOperacion(new UniqueEntityID(), sellerId);

        expect(() => operation.assertIsSeller(sellerId.toString())).not.toThrow();
    });

    it('rechaza al buyer de la misma operación', () => {
        const buyerId = new UniqueEntityID();
        const operation = unaOperacion(buyerId, new UniqueEntityID());

        expect(() => operation.assertIsSeller(buyerId.toString())).toThrow(ForbiddenError);
    });
});

describe('Listing.isOwnedBy / assertOwnedBy', () => {
    it('reconoce a su seller', () => {
        const sellerId = new UniqueEntityID();
        const listing = unListing(sellerId);

        expect(listing.isOwnedBy(sellerId.toString())).toBe(true);
        expect(() => listing.assertOwnedBy(sellerId.toString())).not.toThrow();
    });

    it('rechaza a cualquier otro', () => {
        const listing = unListing(new UniqueEntityID());
        const ajeno = new UniqueEntityID().toString();

        expect(listing.isOwnedBy(ajeno)).toBe(false);
        expect(() => listing.assertOwnedBy(ajeno)).toThrow(ForbiddenError);
    });
});

describe('Contract.signAsPlatform', () => {
    it('completa un NDA que el buyer ya firmó', () => {
        const nda = Contract.createBuyerNda(new UniqueEntityID(), new UniqueEntityID());
        nda.attachDocument(HASH);
        nda.sign('buyer', '1.1.1.1');

        expect(nda.isFullySigned()).toBe(false);

        nda.signAsPlatform();

        expect(nda.isFullySigned()).toBe(true);
        expect(nda.hasSignedBy('platform')).toBe(true);
    });

    it('registra la firma como automática, no como una IP de usuario', () => {
        const nda = Contract.createSellerNda(new UniqueEntityID(), new UniqueEntityID());
        nda.attachDocument(HASH);
        nda.signAsPlatform();

        const firma = nda.signatures.find((s) => s.role === 'platform');
        expect(firma?.signatureIp).toBe('system');
        expect(firma?.signedAt).toBeInstanceOf(Date);
    });

    it('no permite firmar dos veces como plataforma', () => {
        const nda = Contract.createBuyerNda(new UniqueEntityID(), new UniqueEntityID());
        nda.attachDocument(HASH);
        nda.signAsPlatform();

        expect(() => nda.signAsPlatform()).toThrow();
    });
});

describe('assertIsAdmin', () => {
    it('acepta a un admin', () => {
        expect(() => assertIsAdmin({ id: 'x', role: UserRole.ADMIN })).not.toThrow();
    });

    it('rechaza a buyer y seller', () => {
        expect(() => assertIsAdmin({ id: 'x', role: UserRole.BUYER })).toThrow(ForbiddenError);
        expect(() => assertIsAdmin({ id: 'x', role: UserRole.SELLER })).toThrow(ForbiddenError);
    });
});
