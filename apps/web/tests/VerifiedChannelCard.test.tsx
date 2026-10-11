import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { YouTubeConnectionDto } from '@marketplace/api-contract';
import { VerifiedChannelCard } from '@/components/VerifiedChannelCard';
import { ChannelAvatarView } from '@/components/ChannelAvatar';
import { VerificationSeal } from '@/components/VerificationSeal';
import { YouTubeConnectStep } from '@/components/YouTubeConnectStep';

/**
 * El vendedor mira esta tarjeta para confirmar que es SU canal y que los
 * números que Google leyó son los que va a ver el comprador. Los tests fijan
 * que cada número lleve su unidad y su período, que un canal sin ingresos lo
 * diga con palabras y que los ceros se muestren como ceros.
 */

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

const CANAL: YouTubeConnectionDto = {
    connectionId: 'c1',
    channelId: 'UC123',
    channelTitle: 'Nivel Completo',
    thumbnailUrl: 'https://yt3.ggpht.com/foto',
    subscribers: 12_400,
    views12Months: 1_250_000,
    revenue12MonthsCents: 345_600,
    monthlyRevenueCents: 28_800,
    isMonetized: true,
    topCountry: 'AR',
    periodStart: '2025-10-01T00:00:00.000Z',
    periodEnd: '2026-09-30T00:00:00.000Z',
    readAt: '2026-10-09T15:00:00.000Z',
};

const EN_CERO: YouTubeConnectionDto = {
    ...CANAL,
    channelTitle: 'Canal nuevo',
    thumbnailUrl: undefined,
    subscribers: 0,
    views12Months: 0,
    revenue12MonthsCents: 0,
    monthlyRevenueCents: 0,
    isMonetized: false,
    topCountry: undefined,
};

describe('VerifiedChannelCard', () => {
    it('muestra nombre, foto y sello con fecha', () => {
        const html = renderToStaticMarkup(<VerifiedChannelCard channel={CANAL} />);

        expect(texto(html)).toContain('Nivel Completo');
        expect(html).toContain('https://yt3.ggpht.com/foto');
        expect(texto(html)).toMatch(/Verificado con YouTube · 9 de octubre de 2026/);
    });

    it('cada número lleva su unidad y su período', () => {
        const t = texto(renderToStaticMarkup(<VerifiedChannelCard channel={CANAL} />));

        expect(t).toContain('12.400 suscriptores');
        expect(t).toContain('1.250.000 vistas en los últimos 12 meses');
        expect(t).toContain('US$ 3.456 de ingresos en los últimos 12 meses');
        expect(t).toContain('Audiencia principal Argentina');
    });

    it('un canal en cero muestra los ceros con su período', () => {
        const t = texto(renderToStaticMarkup(<VerifiedChannelCard channel={EN_CERO} />));

        expect(t).toContain('0 suscriptores');
        expect(t).toContain('0 vistas en los últimos 12 meses');
        expect(t).toContain('Sin ingresos en los últimos 12 meses');
        expect(t).not.toMatch(/US\$ 0/);
    });

    it('sin país no inventa uno', () => {
        const t = texto(renderToStaticMarkup(<VerifiedChannelCard channel={EN_CERO} />));

        expect(t).not.toContain('Audiencia principal');
    });

    it('avisa del retraso de YouTube solo cuando no hay vistas', () => {
        const conDatos = texto(renderToStaticMarkup(<VerifiedChannelCard channel={CANAL} />));
        const enCero = texto(renderToStaticMarkup(<VerifiedChannelCard channel={EN_CERO} />));

        expect(conDatos).not.toContain('3 días');
        expect(enCero).toContain('YouTube tarda hasta 3 días en informar las estadísticas');
    });

    it('sin foto muestra la inicial del canal en vez de una imagen rota', () => {
        const html = renderToStaticMarkup(<VerifiedChannelCard channel={EN_CERO} />);

        expect(html).not.toContain('<img');
        // El marcador es el elemento de la inicial, no una "C" suelta en el texto.
        expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>C<\/span>/);
    });

    /*
     * En Firefox y derivados la foto de yt3.ggpht.com no cargaba aunque la
     * dirección respondiera 200: Google la rechaza según el referrer. Sin
     * referrer carga, y si igual falla se cae a la inicial.
     */
    it('la foto se pide sin referrer', () => {
        const html = renderToStaticMarkup(<VerifiedChannelCard channel={CANAL} />);

        expect(html).toMatch(/referrerPolicy="no-referrer"/i);
    });

    it('puede llevar un pie con el ingreso mensual comprobado', () => {
        const t = texto(
            renderToStaticMarkup(
                <VerifiedChannelCard channel={CANAL}>Ingreso mensual comprobado: US$ 288</VerifiedChannelCard>,
            ),
        );

        expect(t).toContain('Ingreso mensual comprobado: US$ 288');
    });

    it('es de solo lectura: no tiene campos', () => {
        const html = renderToStaticMarkup(<VerifiedChannelCard channel={CANAL} />);

        expect(html).not.toContain('<input');
        expect(html).not.toContain('<select');
    });
});

describe('VerificationSeal', () => {
    it('dice con qué se verificó y cuándo', () => {
        const t = texto(renderToStaticMarkup(<VerificationSeal source="YouTube" at="2026-10-09T15:00:00.000Z" />));

        expect(t).toBe(' Verificado con YouTube · 9 de octubre de 2026 ');
    });
});

describe('YouTubeConnectStep', () => {
    async function start() {}

    it('ofrece conectar y dice qué se pide, sin prometer lo que no hace', () => {
        const t = texto(renderToStaticMarkup(<YouTubeConnectStep startAction={start} />));

        expect(t).toContain('Conectar con YouTube');
        expect(t).toMatch(/ver tu canal y sus estadísticas, incluidos los ingresos/i);
        expect(t).toMatch(/no podemos publicar ni borrar nada/i);
    });

    it('tras un fallo muestra el motivo y el botón que corresponde', () => {
        const t = texto(
            renderToStaticMarkup(<YouTubeConnectStep startAction={start} failure={{ reason: 'cancelada' }} />),
        );

        expect(t).toContain('No conectaste el canal. Sin conexión no se puede publicar.');
        expect(t).toContain('Intentar de nuevo');
        expect(t).not.toContain('Conectar con YouTube');
    });

    it('con canales ya conectados ofrece conectar otro', () => {
        const t = texto(renderToStaticMarkup(<YouTubeConnectStep startAction={start} hasConnections />));

        expect(t).toContain('Conectar otro canal');
    });
});

describe('ChannelAvatarView', () => {
    const noop = () => {};

    it('con foto y sin fallo dibuja la imagen sin referrer', () => {
        const html = renderToStaticMarkup(
            <ChannelAvatarView src="https://yt3.ggpht.com/foto" name="Nivel Completo" failed={false} onError={noop} />,
        );

        expect(html).toContain('<img');
        expect(html).toMatch(/referrerPolicy="no-referrer"/i);
    });

    it('si la imagen falló muestra el marcador con la inicial', () => {
        const html = renderToStaticMarkup(
            <ChannelAvatarView src="https://yt3.ggpht.com/foto" name="nivel completo" failed onError={noop} />,
        );

        expect(html).not.toContain('<img');
        expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>N<\/span>/);
    });

    it('sin nombre usa un signo de pregunta', () => {
        const html = renderToStaticMarkup(<ChannelAvatarView name="  " failed onError={noop} />);

        expect(html).toMatch(/>\?<\/span>/);
    });

    it('la variante cuadrada usa el radio chico del sistema, no el redondo', () => {
        const html = renderToStaticMarkup(
            <ChannelAvatarView src="https://yt3.ggpht.com/foto" name="Nivel Completo" failed={false} onError={noop} shape="square" />,
        );
        expect(html).toContain('rounded-[var(--radius-chico)]');
        expect(html).not.toContain('rounded-full');
    });

    it('la variante cuadrada tambien cae a la inicial con esquinas chicas', () => {
        const html = renderToStaticMarkup(
            <ChannelAvatarView name="nivel" failed onError={noop} shape="square" />,
        );
        expect(html).toContain('N');
        expect(html).toContain('rounded-[var(--radius-chico)]');
        expect(html).not.toContain('rounded-full');
    });

    it('por defecto sigue siendo redonda', () => {
        const html = renderToStaticMarkup(<ChannelAvatarView name="nivel" failed onError={noop} />);
        expect(html).toContain('rounded-full');
    });
});
