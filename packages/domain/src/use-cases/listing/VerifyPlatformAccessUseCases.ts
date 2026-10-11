import { ICustodyAccountRepository, IListingRepository } from '../../ports/Repositories';
import { GoogleAuthorizer, IYouTubeCustodyAccessReader, OwnedYouTubeChannel } from '../../ports/IOwnershipReaders';
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
function oauthNote(authorizer: GoogleAuthorizer): string {
    return `Verificado por OAuth de la cuenta de custodia ${authorizer.email} (sub ${authorizer.subject})`;
}

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
 * El admin ingresa con la cuenta de custodia y elige el canal en el
 * selector de Google. Primero se exige que quien inició sesión sea la cuenta de
 * custodia (correo verificado e igual al sugerido): que otra cuenta administre
 * el canal no prueba que la plataforma tenga acceso. Después se buscan, entre
 * los canales de esa sesión, el publicado. Si está, se registra el acceso por
 * el mismo camino que la constancia manual. Si no, no se escribe nada.
 */
export class VerifyPlatformAccessUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly custodyRepo: ICustodyAccountRepository,
        private readonly ownershipReader: IYouTubeCustodyAccessReader,
        private readonly channelReader: IYouTubeChannelReader,
        private readonly registerAccess: RegisterPlatformAccessUseCase,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(listingId: string, grant: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);
        const listing = await loadVerifiableListing(this.listingRepo, listingId);
        const account = await findCustodyAccount(this.custodyRepo);

        const publishedChannelId = await this.publishedChannelId(listing);
        const { authorizer, channels: managed } = await this.ownershipReader.authorizedChannelsOf(grant);
        const signedIn = this.assertCustodyAccount(authorizer, account);
        if (!managed.some((c) => c.channelId === publishedChannelId)) {
            throw new ForbiddenError(await this.channelMismatchMessage(managed, publishedChannelId, listing));
        }

        await this.registerAccess.execute(
            listingId,
            {
                accessSince: this.now().toISOString(),
                custodyAccountId: account.id.toString(),
                notes: oauthNote(signedIn),
            },
            actor,
        );
    }

    /**
     * Dice qué canal(es) devolvió Google y cuál es el del activo. Google
     * reutiliza la elección de un permiso anterior y puede no mostrar el
     * selector: por eso el mensaje explica cómo quitar ese permiso.
     */
    private async channelMismatchMessage(
        managed: OwnedYouTubeChannel[],
        publishedChannelId: string,
        listing: Listing,
    ): Promise<string> {
        const chosen = managed.length > 0 ? managed.map((c) => c.title).join(', ') : 'una cuenta sin canal';
        const publishedTitle = await this.publishedChannelTitle(listing, publishedChannelId);
        return (
            `Elegiste «${chosen}» y el activo es «${publishedTitle}». Volvé a intentar y elegí ese canal. ` +
            'Si Google no te deja elegir, quitá el acceso de Traspaso en myaccount.google.com/connections y probá de nuevo.'
        );
    }

    /** El título es solo para el mensaje: si no se puede leer, se muestra el ID. */
    private async publishedChannelTitle(listing: Listing, channelId: string): Promise<string> {
        try {
            const ref = YouTubeChannelRef.parse(String(listing.assetDataFor(true).assetData.channelUrl));
            const snapshot = await this.channelReader.read(ref);
            return snapshot?.title ?? channelId;
        } catch {
            return channelId;
        }
    }

    /** Quien inició sesión tiene que ser la cuenta de custodia, con el correo verificado por Google. */
    private assertCustodyAccount(authorizer: GoogleAuthorizer | null, account: CustodyAccount): GoogleAuthorizer {
        if (!authorizer) {
            throw new ForbiddenError('Google no informó quién inició sesión; volvé a intentarlo.');
        }
        const normalize = (value: string) => value.trim().toLowerCase();
        if (!authorizer.emailVerified || normalize(authorizer.email) !== normalize(account.identifier)) {
            throw new ForbiddenError(
                `Ingresaste con otra cuenta de Google. Usá la cuenta de custodia (${account.identifier}).`,
            );
        }
        return authorizer;
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
