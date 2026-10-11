import { ICustodyAccountRepository, IListingRepository } from '../../ports/Repositories';
import { IYouTubeOwnershipReader } from '../../ports/IOwnershipReaders';
import { IYouTubeChannelReader } from '../../ports/IYouTubeChannelReader';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { Listing } from '../../entities/Listing';
import { CustodyAccount } from '../../entities/CustodyAccount';
import { YouTubeChannelRef } from '../../value-objects/YouTubeChannelRef';
import { RegisterPlatformAccessUseCase } from './RegisterPlatformAccessUseCase';
import {
    ForbiddenError,
    InvalidStateError,
    NotFoundError,
    ValidationError,
} from '../../errors/DomainError';
import { AssetType } from '@marketplace/shared-types';

/** Los estados en los que un activo puede estar esperando que confirmemos el acceso. */
const STATUSES_WITH_ACCESS_REQUEST = ['under_review', 'published', 'in_operation'] as const;

/** Lo que queda escrito en la constancia cuando la verificación la hizo Google. */
const OAUTH_NOTE = 'Verificado por OAuth de la cuenta de custodia';

async function loadVerifiableListing(repo: IListingRepository, listingId: string): Promise<Listing> {
    const listing = await repo.findById(listingId);
    if (!listing) {
        throw new NotFoundError('Activo no encontrado');
    }

    const { assetType } = listing.assetDataFor(true);
    if (assetType !== AssetType.YOUTUBE) {
        throw new ValidationError('Este activo no es un canal de YouTube.');
    }

    const status = listing.platformAccessStatus();
    if (status === 'pending') {
        throw new InvalidStateError('El vendedor todavía no avisó que invitó a la plataforma.');
    }
    if (status !== 'verifying') {
        throw new InvalidStateError('El acceso de la plataforma a este activo ya está registrado.');
    }
    return listing;
}

/** La cuenta que sostiene los canales: la primera activa de YouTube. */
async function findCustodyAccount(repo: ICustodyAccountRepository): Promise<CustodyAccount> {
    const [account] = await repo.findActive(AssetType.YOUTUBE);
    if (!account) {
        throw new InvalidStateError('No hay una cuenta de custodia de YouTube activa para verificar el acceso.');
    }
    return account;
}

/** Los activos que esperan que un admin confirme el acceso. */
export class ListListingsAwaitingAccessUseCase {
    constructor(private readonly listingRepo: IListingRepository) {}

    async execute(actor: Actor): Promise<Listing[]> {
        assertIsAdmin(actor);

        const groups = await Promise.all(STATUSES_WITH_ACCESS_REQUEST.map((s) => this.listingRepo.findByStatus(s)));
        return groups.flat().filter((l) => l.platformAccessStatus() === 'verifying');
    }
}

/**
 * Antes de mandar al admin a Google: comprueba que haya algo para verificar y
 * devuelve la cuenta de custodia, que es con la que tiene que ingresar.
 */
export class StartPlatformAccessVerificationUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly custodyRepo: ICustodyAccountRepository,
    ) {}

    async execute(listingId: string, actor: Actor): Promise<{ custodyAccountIdentifier: string }> {
        assertIsAdmin(actor);
        await loadVerifiableListing(this.listingRepo, listingId);
        const account = await findCustodyAccount(this.custodyRepo);
        return { custodyAccountIdentifier: account.identifier };
    }
}

/**
 * Comprueba contra Google que la cuenta de custodia administra el canal, en
 * vez de que un admin lo tipee a mano.
 *
 * El admin ingresa con la cuenta de custodia y elige la Cuenta de Marca en el
 * selector de Google; `channelsOf` devuelve los canales de esa sesión y se
 * busca el publicado entre ellos. Si está, se registra el acceso por el mismo
 * camino que la constancia manual. Si no, no se escribe nada.
 */
export class VerifyPlatformAccessUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly custodyRepo: ICustodyAccountRepository,
        private readonly ownershipReader: IYouTubeOwnershipReader,
        private readonly channelReader: IYouTubeChannelReader,
        private readonly registerAccess: RegisterPlatformAccessUseCase,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(listingId: string, grant: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);
        const listing = await loadVerifiableListing(this.listingRepo, listingId);
        const account = await findCustodyAccount(this.custodyRepo);

        const publishedChannelId = await this.publishedChannelId(listing);
        const managed = await this.ownershipReader.channelsOf(grant);
        if (!managed.some((c) => c.channelId === publishedChannelId)) {
            throw new ForbiddenError(
                'La cuenta elegida no administra este canal. Ingresá con la cuenta de custodia y ' +
                    'elegí la Cuenta de Marca del canal; si el vendedor todavía no nos invitó, esperá la invitación.',
            );
        }

        await this.registerAccess.execute(
            listingId,
            {
                accessSince: this.now().toISOString(),
                custodyAccountId: account.id.toString(),
                notes: OAUTH_NOTE,
            },
            actor,
        );
    }

    /** Un handle se puede cambiar y el ID no: se compara siempre por ID. */
    private async publishedChannelId(listing: Listing): Promise<string> {
        const declared = listing.assetDataFor(true).assetData.channelUrl;
        if (typeof declared !== 'string' || declared.trim() === '') {
            throw new ValidationError('Este activo no tiene cargada la dirección del canal.');
        }

        const ref = YouTubeChannelRef.parse(declared);
        if (ref.kind === 'id') return ref.value;

        const snapshot = await this.channelReader.read(ref);
        if (!snapshot) {
            throw new NotFoundError('No encontramos en YouTube el canal publicado.');
        }
        return snapshot.channelId;
    }
}
