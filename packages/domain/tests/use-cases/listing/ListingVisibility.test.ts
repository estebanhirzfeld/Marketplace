import { describe, it, expect, vi } from 'vitest';
import { GetListingDetailsUseCase } from '../../../src/use-cases/listing/GetListingDetailsUseCase';
import { IContractRepository, IListingRepository } from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { Listing, ListingStatus } from '../../../src/entities/Listing';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { NotFoundError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/**
 * Quién puede ver un activo según su estado.
 *
 * El detalle devolvía cualquier activo por id sin mirar el estado, así que un
 * borrador ajeno —o uno en revisión, que todavía nadie aprobó— quedaba
 * alcanzable escribiendo la dirección a mano. Eso expone al vendedor antes de
 * que decida publicar.
 *
 * El dueño y la plataforma sí los ven: el dueño porque es suyo, y la
 * plataforma porque su trabajo es justamente revisarlos.
 */

const SELLER_ID = new UniqueEntityID();

const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };
const ADMIN: Actor = { id: new UniqueEntityID().toString(), role: UserRole.ADMIN };
const AJENO: Actor = { id: new UniqueEntityID().toString(), role: UserRole.BUYER };

function unActivo(status: ListingStatus): Listing {
    return Listing.reconstitute(
        {
            sellerId: SELLER_ID,
            assetStrategy: new WebStrategy(Money.fromCents(210000, 'USD'), 52, 'ejemplo.com'),
            askingPrice: Money.fromCents(6800000, 'USD'),
            status,
            publishedAt: status === 'published' ? new Date() : undefined,
        },
        new UniqueEntityID(),
        new Date(),
    );
}

function armar(listing: Listing): GetListingDetailsUseCase {
    const listingRepo: IListingRepository = {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const contractRepo: IContractRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByOperation: vi.fn().mockResolvedValue([]),
        findByListingAndSigner: vi.fn().mockResolvedValue(null),
        findAllByListing: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    return new GetListingDetailsUseCase(listingRepo, contractRepo);
}

/** Los que todavía no salieron al mercado. */
const RESERVADOS: ListingStatus[] = ['draft', 'under_review', 'rejected'];

/** Los que salieron alguna vez y por lo tanto ya se mostraron en público. */
const PUBLICOS: ListingStatus[] = ['published', 'in_operation', 'sold'];

describe('Un activo que todavía no salió al mercado', () => {
    it.each(RESERVADOS)('no existe para un tercero cuando está en %s', async (status) => {
        await expect(armar(unActivo(status)).execute('l1', AJENO)).rejects.toThrow(NotFoundError);
    });

    it.each(RESERVADOS)('no existe para un visitante anónimo cuando está en %s', async (status) => {
        await expect(armar(unActivo(status)).execute('l1')).rejects.toThrow(NotFoundError);
    });

    it.each(RESERVADOS)('su dueño sí lo ve cuando está en %s', async (status) => {
        await expect(armar(unActivo(status)).execute('l1', SELLER)).resolves.toBeDefined();
    });

    /** La cola de revisión no podría funcionar de otra forma. */
    it.each(RESERVADOS)('la plataforma sí lo ve cuando está en %s', async (status) => {
        await expect(armar(unActivo(status)).execute('l1', ADMIN)).resolves.toBeDefined();
    });
});

describe('Un activo que ya salió al mercado', () => {
    it.each(PUBLICOS)('sigue siendo visible para cualquiera cuando está en %s', async (status) => {
        await expect(armar(unActivo(status)).execute('l1', AJENO)).resolves.toBeDefined();
    });

    /**
     * Vendido o en operación se sigue viendo, pero el estado viaja en la vista
     * para que la pantalla no ofrezca ofertar sobre algo que ya no se vende.
     */
    it('informa el estado para que la pantalla sepa qué ofrecer', async () => {
        const vista = await armar(unActivo('in_operation')).execute('l1', AJENO);

        expect(vista.status).toBe('in_operation');
    });
});
