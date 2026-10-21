import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HandoverStepDto, NotificationDto, NotificationTypeDto } from '@marketplace/api-contract';
import { SellerLevelGauge } from '@/components/SellerLevelGauge';
import { AccessPanel } from '@/components/AccessPanel';
import { AccessStatusPanel } from '@/components/AccessStatusPanel';
import { SellMoreAside } from '@/components/SellMoreAside';
import { VerificationCards } from '@/components/VerificationCards';
import { DraftPanel } from '@/components/DraftPanel';
import { PriceSection } from '@/components/PriceSection';
import { AssetSummaryCard, OwnershipCheck, OwnershipProof } from '@/components/AssetSummaryCard';
import { SendToReviewLink } from '@/components/SendToReviewLink';
import { AssetMark, WebLogo } from '@/components/AssetTypeCard';
import { AccessInbox } from '@/components/AdminInbox';
import { DnsVerificationDialogView } from '@/components/DnsVerificationDialog';
import { PublishListingForm } from '@/components/PublishListingForm';
import { listingDraftNotice } from '@/lib/listingDraftCopy';
import { DNS_CHOICES } from '@/lib/dnsProviders';
import { ownershipSourceLabel } from '@/lib/ownershipSource';
import { textFor } from '@/lib/notifications';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

/**
 * La guarda contra la fuga de vocabulario de YouTube a un sitio web.
 *
 * Los componentes compartidos se escribieron primero para los canales y
 * dejaron «tu canal», «7 días» y el logo de YouTube en la pantalla de un
 * sitio. Esto renderiza, con datos de un sitio, todo lo compartido que ve el
 * vendedor en su activo (y la bandeja del panel) y falla si aparece algo de
 * un canal. Un componente nuevo con texto o ícono que dependa del tipo de
 * activo se agrega acá.
 */

const FORBIDDEN: readonly RegExp[] = [/canal/i, /YouTube/i, /7 días/];

function expectNoYouTube(html: string): void {
    for (const pattern of FORBIDDEN) {
        expect(html, `aparece ${pattern} en un sitio web`).not.toMatch(pattern);
    }
}

// Los pasos que el dominio escribe para un sitio antes de la venta.
const WEB_STEPS: HandoverStepDto[] = [
    {
        id: '1',
        phase: 'listing',
        description: 'El vendedor se exime del bloqueo de 60 días, si su registrador lo permite',
        title: 'Eximite del bloqueo de 60 días',
        instruction: 'Antes de cedernos el dominio, fijate si tu registrador te deja eximirte del bloqueo de 60 días de la ICANN.',
    },
    {
        id: '2',
        phase: 'listing',
        description: 'El vendedor entrega el código de autorización (EPP) del dominio',
        title: 'Pasanos el código de autorización',
        instruction: 'Pedile a tu registrador el código de autorización (EPP) del dominio y pasánoslo',
    },
];

const NOW = '2026-10-13T12:00:00.000Z';
const noop = async () => ({});
const noopVoid = async () => {};
const dnsButton = <button type="button">Comprobar con tu DNS</button>;
const WEB_SOURCE = ownershipSourceLabel('dns');

describe('un sitio web no hereda texto ni íconos de un canal', () => {
    it('el nivel de vendedor', () => {
        for (const [ownershipVerified, accessRegistered] of [
            [false, false],
            [true, false],
            [true, true],
        ] as const) {
            for (const mercadoPago of ['not_linked', 'linked', 'unavailable'] as const) {
                expectNoYouTube(
                    renderToStaticMarkup(
                        <SellerLevelGauge
                            assetType="web"
                            ownershipVerified={ownershipVerified}
                            accessRegistered={accessRegistered}
                            mercadoPago={mercadoPago}
                        />,
                    ),
                );
            }
        }
    });

    it('el panel de acceso, en cada estado', () => {
        for (const status of ['pending', 'verifying', 'waiting', 'immediate'] as const) {
            expectNoYouTube(
                renderToStaticMarkup(
                    <AccessPanel
                        listingId="sitio"
                        subject="sitio"
                        waitingDays={0}
                        steps={WEB_STEPS}
                        status={status}
                        guided={false}
                        now={NOW}
                        requestAction={noop}
                    />,
                ),
            );
        }
    });

    it('el panel de acceso con la cuenta de custodia a la vista', () => {
        expectNoYouTube(
            renderToStaticMarkup(
                <AccessPanel
                    listingId="sitio"
                    subject="sitio"
                    waitingDays={0}
                    steps={WEB_STEPS}
                    email="custodia@forzalabs.online"
                    status="pending"
                    guided={false}
                    now={NOW}
                    requestAction={noop}
                />,
            ),
        );
    });

    it('el estado del acceso una vez avisado', () => {
        for (const status of ['verifying', 'immediate'] as const) {
            expectNoYouTube(renderToStaticMarkup(<AccessStatusPanel status={status} now={NOW} />));
        }
    });

    it('«Vendé más rápido»', () => {
        expectNoYouTube(
            renderToStaticMarkup(<SellMoreAside accessHref="#" subject="sitio" showAccess showMercadoPago />),
        );
    });

    it('las tarjetas de verificación', () => {
        for (const done of [false, true]) {
            expectNoYouTube(
                renderToStaticMarkup(
                    <VerificationCards
                        ownership={{ done, sourceLabel: WEB_SOURCE }}
                        mercadoPago={{ done: false }}
                        ownershipSource={WEB_SOURCE}
                        kycVerified={false}
                        verifyAction={noopVoid}
                        dnsVerification={dnsButton}
                    />,
                ),
            );
        }
    });

    it('el borrador, en sus tres estados', () => {
        for (const variant of ['ready', 'unverified', 'rejected'] as const) {
            expectNoYouTube(
                renderToStaticMarkup(
                    <DraftPanel
                        variant={variant}
                        subject="sitio"
                        sourceLabel={WEB_SOURCE}
                        price="US$ 1.500"
                        kycVerified
                        rejectionReason="El sitio no tiene contenido propio."
                        publishAction={noop}
                        reviewAction={noop}
                        verifyAction={noopVoid}
                        dnsVerification={dnsButton}
                    />,
                ),
            );
        }
    });

    it('el precio, con la valuación y sin ella', () => {
        for (const estimated of [null, { cents: 1_000_000, currency: 'USD' }]) {
            expectNoYouTube(
                renderToStaticMarkup(
                    <PriceSection
                        currency="ARS"
                        onCurrencyChange={() => {}}
                        price="13000"
                        onPriceChange={() => {}}
                        estimated={estimated}
                        basis="los datos que cargaste"
                    />,
                ),
            );
        }
    });

    it('la tarjeta del sitio en las verificaciones, pidiendo la titularidad y con la constancia', () => {
        const mark = <AssetMark assetType="web" width={52} />;
        expectNoYouTube(
            renderToStaticMarkup(
                <AssetSummaryCard name="Mi tienda" subtitle="ejemplo.com · Comercio" mark={mark}>
                    <OwnershipCheck
                        action={dnsButton}
                        alternative={<SendToReviewLink action={noop} />}
                    />
                </AssetSummaryCard>,
            ),
        );
        expectNoYouTube(
            renderToStaticMarkup(
                <AssetSummaryCard name="Mi tienda" subtitle="ejemplo.com · Comercio" mark={mark}>
                    <OwnershipProof sourceLabel={WEB_SOURCE} />
                </AssetSummaryCard>,
            ),
        );
    });

    it('el logo del sitio, grande y chico', () => {
        expectNoYouTube(renderToStaticMarkup(<WebLogo />));
        expectNoYouTube(renderToStaticMarkup(<AssetMark assetType="web" width={22} />));
    });

    it('los avisos, todos', () => {
        const types: Record<NotificationTypeDto, true> = {
            oferta_recibida: true,
            contraoferta_recibida: true,
            oferta_aceptada: true,
            oferta_cancelada: true,
            listing_aprobado: true,
            listing_rechazado: true,
            contrato_firmado: true,
            cesion_pendiente: true,
            activo_en_custodia: true,
            pago_confirmado: true,
            operacion_completada: true,
            denuncia_recibida: true,
            revision_pendiente: true,
            acceso_pendiente: true,
            custodia_pendiente: true,
            liquidacion_pendiente: true,
            acceso_no_encontrado: true,
            acceso_solicitado: true,
            acceso_confirmado: true,
            traspaso_recordatorio: true,
            traspaso_vencido: true,
            dominio_en_custodia: true,
            entrega_recordatorio: true,
            entrega_vencida: true,
        };
        for (const type of Object.keys(types) as NotificationTypeDto[]) {
            const aviso: NotificationDto = {
                id: 'n1',
                type,
                listingId: 'l1',
                occursAt: '2026-10-19T15:00:00.000Z',
                read: false,
                createdAt: NOW,
            };
            const { title, cuerpo } = textFor(aviso);
            expectNoYouTube(`${title} ${cuerpo}`);
        }
    });

    it('la bandeja de accesos del panel', () => {
        expectNoYouTube(
            renderToStaticMarkup(
                <AccessInbox
                    listings={[
                        {
                            id: 'a1',
                            assetType: 'web',
                            assetName: 'Mi tienda',
                            sellerName: 'Esteban Vendedor',
                            platformAccessRequestedAt: NOW,
                        },
                    ]}
                    now={new Date(NOW)}
                    verifyAction={noopVoid}
                    rejectAction={noopVoid}
                />,
            ),
        );
    });

    it('el diálogo de la comprobación por DNS, en cada pantalla, con cada proveedor y con «No sé»', () => {
        const challenge = {
            domain: 'ejemplo.com',
            host: '@',
            value: 'traspaso-verificacion=178cd4d4534d977fbdf74f70',
            nameservers: ['dns1.p08.nsone.net'],
            provider: 'netlify' as const,
        };
        const states = [
            { selectedProvider: null, unsure: false },
            ...DNS_CHOICES.map((selectedProvider) => ({ selectedProvider, unsure: false })),
            { selectedProvider: 'netlify' as const, unsure: true },
            { selectedProvider: null, unsure: true },
        ];
        for (const step of ['provider', 'record', 'result'] as const) {
            for (const status of ['searching', 'delayed', 'stopped', 'verified', 'error'] as const) {
                for (const { selectedProvider, unsure } of states) {
                    for (const provider of [challenge.provider, null]) {
                        for (const publishAction of [undefined, noop]) {
                            expectNoYouTube(
                                renderToStaticMarkup(
                                    <DnsVerificationDialogView
                                        step={step}
                                        challenge={{ ...challenge, provider }}
                                        status={status}
                                        error={status === 'error' ? 'La comprobación por DNS todavía no está disponible.' : undefined}
                                        checking={false}
                                        adsenseAction={noopVoid}
                                        selectedProvider={selectedProvider}
                                        unsure={unsure}
                                        publishAction={publishAction}
                                    />,
                                ),
                            );
                        }
                    }
                }
            }
        }
        // Sin el registro todavía: preparando y con error de carga.
        for (const loadError of [undefined, 'No pudimos consultar tu DNS. Probá de nuevo.']) {
            expectNoYouTube(
                renderToStaticMarkup(
                    <DnsVerificationDialogView
                        challenge={null}
                        loadError={loadError}
                        status="searching"
                        checking={false}
                        adsenseAction={noopVoid}
                    />,
                ),
            );
        }
    });

    it('el formulario de venta y su aviso', () => {
        expectNoYouTube(
            renderToStaticMarkup(<PublishListingForm action={noop} estimate={async () => null} types={['web']} />),
        );
        expectNoYouTube(listingDraftNotice('web'));
    });
});
