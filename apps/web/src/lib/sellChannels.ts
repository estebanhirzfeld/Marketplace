/**
 * Qué ofrece la tarjeta «Canal de YouTube» de `/vender`.
 *
 * Un canal ya publicado (o en revisión, en operación o vendido) no se vuelve a
 * ofrecer: dos activos sobre el mismo canal no tienen sentido. Un canal con un
 * borrador o un activo rechazado lleva a una vista intermedia para continuarlo
 * en vez de crear otro. Un canal conectado sin activo se ofrece como siempre.
 */

const CHANNEL_ID = /UC[A-Za-z0-9_-]{22}/;
const OCCUPIED = ['published', 'in_operation', 'sold', 'under_review'];
const DRAFT_LIKE = ['draft', 'rejected'];

/**
 * El ID de canal dentro de una dirección `/channel/UC…` (o suelto). Un handle
 * (`@nombre`) no lo trae: ahí no se puede saber de qué canal es el activo.
 */
export function channelIdOf(channelUrl: string | undefined): string | undefined {
    return channelUrl?.match(CHANNEL_ID)?.[0];
}

interface Channel {
    channelId: string;
    channelTitle: string;
}

interface SellerListing {
    id: string;
    status: string;
    channelUrl?: string;
}

export type YouTubeSellPlan<C extends Channel> =
    | { kind: 'connect' }
    | { kind: 'offer'; channels: C[] }
    | {
          kind: 'draft-choice';
          draftListingId: string;
          channelTitle: string;
          /** Los canales conectados que todavía no tienen activo. */
          offerable: C[];
      };

export function planYouTubeSell<C extends Channel>(connections: C[], listings: SellerListing[]): YouTubeSellPlan<C> {
    const statusesOf = (channelId: string) =>
        listings.filter((l) => channelIdOf(l.channelUrl) === channelId);

    const offerable: C[] = [];
    let draft: { id: string; channelTitle: string } | undefined;

    for (const channel of connections) {
        const own = statusesOf(channel.channelId);
        if (own.some((l) => OCCUPIED.includes(l.status))) continue;

        const retakable = own.find((l) => DRAFT_LIKE.includes(l.status));
        if (retakable) {
            draft ??= { id: retakable.id, channelTitle: channel.channelTitle };
            continue;
        }
        offerable.push(channel);
    }

    if (draft) {
        return { kind: 'draft-choice', draftListingId: draft.id, channelTitle: draft.channelTitle, offerable };
    }
    return offerable.length > 0 ? { kind: 'offer', channels: offerable } : { kind: 'connect' };
}
