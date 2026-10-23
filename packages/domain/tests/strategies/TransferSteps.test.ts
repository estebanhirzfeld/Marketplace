import { describe, it, expect } from 'vitest';
import { YouTubeStrategy } from '../../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../../src/strategies/WebStrategy';
import { Money } from '../../src/value-objects/Money';

/**
 * `getTransferSteps(context?)` deja que la estrategia escriba la frase —es la
 * única que sabe cómo se dice el paso en su plataforma— y que quien la llama
 * aporte los identificadores concretos. Sin contexto, la variante genérica que
 * usa el catálogo antes de que exista ninguna operación.
 *
 * YouTube suma el paso que faltaba: salir de los permisos de canal de YouTube
 * Studio antes de invitar. Es el que rompe el traspaso con un error
 * incomprensible —la invitación parece funcionar y el cambio de propietario
 * principal falla sin explicar por qué.
 */

function youtube() {
    return new YouTubeStrategy({
        monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
        subscribers: 10000,
        isMonetized: true,
    });
}

function web() {
    return new WebStrategy({ monthlyRevenueUsd: Money.fromCents(210000, 'USD'), domain: 'ejemplo.com' });
}

const mencionaPermisosDeCanal = (texto: string) =>
    /permisos de canal/i.test(texto);

describe('YouTubeStrategy.getTransferSteps sin contexto', () => {
    it('el paso de invitación a la plataforma es genérico y no nombra ninguna cuenta', () => {
        const pasos = youtube().getTransferSteps();
        const invitacion = pasos.find((p) => /invita a la plataforma/i.test(p.description));

        expect(invitacion).toBeDefined();
        expect(invitacion!.description).not.toContain('@');
    });

    it('incluye el paso de salir de los permisos de canal, con requiredActor seller', () => {
        const pasos = youtube().getTransferSteps();
        const optOut = pasos.find((p) => mencionaPermisosDeCanal(p.description));

        expect(optOut).toBeDefined();
        expect(optOut!.requiredActor).toBe('seller');
    });

    it('el opt-out es de la fase de operación y va DESPUÉS de la invitación, antes de la promoción', () => {
        const pasos = youtube().getTransferSteps();
        const iOptOut = pasos.findIndex((p) => mencionaPermisosDeCanal(p.description));
        const iInvitacion = pasos.findIndex((p) => /invita a la plataforma/i.test(p.description));
        const iPromocion = pasos.findIndex((p) => /promueve a/i.test(p.description));

        expect(pasos[iOptOut].stage).toBe('custody');
        expect(iOptOut).toBeGreaterThan(iInvitacion);
        expect(iOptOut).toBeLessThan(iPromocion);
    });

    it('los pasos del vendedor van en la publicación y en la custodia', () => {
        const delVendedor = youtube()
            .getTransferSteps()
            .filter((p) => p.requiredActor === 'seller');

        expect(delVendedor.filter((p) => p.stage === 'listing').map((p) => p.title)).toEqual([
            'Pasá tu canal a una cuenta de marca',
            'Invitanos como administrador',
        ]);
        expect(delVendedor.filter((p) => p.stage === 'custody').map((p) => p.title)).toEqual([
            'Quitá tu acceso directo al canal',
            'Hacenos propietario principal',
        ]);
        expect(delVendedor.every((p) => p.stage === 'listing' || p.stage === 'custody')).toBe(true);
    });

    it('los id son posicionales y correlativos', () => {
        const pasos = youtube().getTransferSteps();
        expect(pasos.map((p) => p.id)).toEqual(pasos.map((_, i) => String(i + 1)));
    });
});

describe('YouTubeStrategy.getTransferSteps: avisos de la prueba real', () => {
    const textoDe = (p: { description: string; instruction?: string; details?: string[] }) =>
        `${p.description} ${p.instruction ?? ''} ${(p.details ?? []).join(' ')}`;

    it('hay un paso de la plataforma que acepta la invitación, entre la invitación del vendedor y la verificación', () => {
        const pasos = youtube().getTransferSteps();
        const iInvitacion = pasos.findIndex((p) => /invita a la plataforma/i.test(p.description));
        const iVerificacion = pasos.findIndex((p) => /verifica la titularidad/i.test(p.description));
        const iAceptacion = pasos.findIndex(
            (p) => p.requiredActor === 'platform' && /acepta la invitaci/i.test(p.description),
        );

        expect(iAceptacion).toBeGreaterThan(iInvitacion);
        expect(iAceptacion).toBeLessThan(iVerificacion);
        expect(pasos[iAceptacion].requiredActor).toBe('platform');
        expect(pasos[iAceptacion].check).toBe('admin');
    });

    it('la invitación del vendedor pide no elegir el rol Propietario', () => {
        const pasos = youtube().getTransferSteps();
        const invitacion = pasos.find((p) => /invita a la plataforma/i.test(p.description))!;

        expect(textoDe(invitacion)).toMatch(/no elijas.*Propietario/i);
        expect(textoDe(invitacion)).toMatch(/Supervisor/i);
    });

    it('el paso 1 avisa del canal vacío que se reemplaza y de los delegados que se quitan', () => {
        const [primero] = youtube().getTransferSteps();

        expect(primero.requiredActor).toBe('seller');
        expect(textoDe(primero)).toMatch(/Reemplazar/);
        expect(textoDe(primero)).toMatch(/canal vac/i);
        expect(textoDe(primero)).toMatch(/delegados/i);
    });

    it('el paso de promoción avisa que Google lo rechaza hasta pasados los 7 días', () => {
        const pasos = youtube().getTransferSteps();
        const promocion = pasos.find((p) => /promueve a/i.test(p.description))!;

        expect(textoDe(promocion)).toMatch(/rechaza/i);
        expect(textoDe(promocion)).toMatch(/7 días/);
    });

    it('ningún texto de los pasos afirma que el plazo corre desde la invitación', () => {
        const pasos = youtube().getTransferSteps({ custodyAccountIdentifier: 'custodia1@gmail.com' });

        expect(pasos.some((p) => /desde la invitaci/i.test(textoDe(p)))).toBe(false);
    });

    it('los id siguen siendo correlativos con el paso nuevo', () => {
        const pasos = youtube().getTransferSteps();

        expect(pasos).toHaveLength(13);
        expect(pasos.map((p) => p.id)).toEqual(pasos.map((_, i) => String(i + 1)));
    });
});

describe('YouTubeStrategy.getTransferSteps con contexto', () => {
    it('el identificador de custodia aparece en description e instruction del paso de invitación', () => {
        const pasos = youtube().getTransferSteps({ custodyAccountIdentifier: 'custodia1@gmail.com' });
        const invitacion = pasos.find((p) => /invita/i.test(p.description) && p.requiredActor === 'seller')!;

        expect(invitacion.description).toContain('custodia1@gmail.com');
        expect(invitacion.instruction).toContain('custodia1@gmail.com');
    });

    it('el identificador del comprador aparece en el paso en que se lo invita', () => {
        const pasos = youtube().getTransferSteps({ recipientIdentifier: 'comprador@gmail.com' });
        const invitacionComprador = pasos.find(
            (p) => p.requiredActor === 'platform' && /invita al comprador/i.test(p.description),
        )!;

        expect(invitacionComprador.description).toContain('comprador@gmail.com');
    });
});

describe('WebStrategy.getTransferSteps', () => {
    it('acepta contexto con o sin datos y devuelve su lista sin error', () => {
        expect(() => web().getTransferSteps()).not.toThrow();
        expect(() => web().getTransferSteps({ custodyAccountIdentifier: 'x@y.com' })).not.toThrow();
        expect(web().getTransferSteps().length).toBeGreaterThan(0);
    });

    it('ningún paso menciona permisos de canal', () => {
        const pasos = web().getTransferSteps();
        expect(pasos.some((p) => mencionaPermisosDeCanal(p.description))).toBe(false);
    });

    it('nombra el identificador del comprador en el paso en que la plataforma le traslada el dominio', () => {
        const pasos = web().getTransferSteps({ recipientIdentifier: 'comprador@gmail.com' });
        const haciaElComprador = pasos.find((p) => p.key === 'domain-to-buyer')!;

        expect(haciaElComprador.requiredActor).toBe('platform');
        expect(haciaElComprador.check).toBe('automatic');
        expect(haciaElComprador.description).toContain('comprador@gmail.com');
    });

    it('nombra la cuenta de custodia en el paso en que el vendedor traslada el dominio a la plataforma', () => {
        const pasos = web().getTransferSteps({ custodyAccountIdentifier: 'custodia@marketplace.com' });
        const haciaLaPlataforma = pasos.find((p) => p.key === 'domain-to-platform')!;

        expect(haciaLaPlataforma.requiredActor).toBe('seller');
        expect(haciaLaPlataforma.stage).toBe('custody');
        expect(haciaLaPlataforma.check).toBe('automatic');
        expect(haciaLaPlataforma.instruction).toContain('custodia@marketplace.com');
    });

    it('el comprador ya no inicia el traslado en su registrador: el dominio va de la plataforma al comprador', () => {
        const pasos = web().getTransferSteps();
        const iALaPlataforma = pasos.findIndex((p) => p.key === 'domain-to-platform');
        const iAlComprador = pasos.findIndex((p) => p.key === 'domain-to-buyer');

        expect(pasos.some((p) => p.requiredActor === 'buyer')).toBe(false);
        expect(iALaPlataforma).toBeGreaterThanOrEqual(0);
        expect(iAlComprador).toBeGreaterThan(iALaPlataforma);
    });

    it('antes de la venta se le pide al vendedor tener el dominio en Hostinger y se le avisa de los 60 días', () => {
        const [previo, ...resto] = web().getTransferSteps().filter((p) => p.stage === 'listing');

        expect(resto).toHaveLength(0);
        expect(previo.requiredActor).toBe('seller');
        expect(previo.check).toBe('declared');
        expect(`${previo.instruction} ${(previo.details ?? []).join(' ')}`).toMatch(/Hostinger/);
        expect(`${previo.instruction} ${(previo.details ?? []).join(' ')}`).toMatch(/60 días/);
    });

    it('en la operación el vendedor traslada el dominio y declara hosting, código y cuentas', () => {
        const delVendedor = web()
            .getTransferSteps()
            .filter((p) => p.requiredActor === 'seller' && p.stage !== 'listing');

        expect(delVendedor.map((p) => p.key)).toEqual(['domain-to-platform', 'hosting', 'code', 'accounts']);
        expect(delVendedor.filter((p) => p.key !== 'domain-to-platform').every((p) => p.check === 'declared')).toBe(true);
        for (const paso of delVendedor) {
            expect(paso.title).toBeTruthy();
            expect(paso.instruction).toBeTruthy();
        }
    });

    it('el paso hacia el comprador entrega en Hostinger y explica que mudarlo a otro registrador espera 60 días', () => {
        const haciaElComprador = web().getTransferSteps().find((p) => p.key === 'domain-to-buyer')!;
        const texto = `${haciaElComprador.description} ${haciaElComprador.instruction ?? ''} ${(haciaElComprador.details ?? []).join(' ')}`;

        // El traslado a la cuenta de la plataforma ya activó el bloqueo: durante
        // la custodia no se puede mudar a otro registrador, así que no se ofrece
        // el código EPP como alternativa de entrega.
        expect(texto).not.toMatch(/EPP/);
        expect(texto).toMatch(/Hostinger/);
        expect(texto).toMatch(/60 días/);
    });

    it('ningún texto de los pasos insinúa que la plataforma retiene la plata', () => {
        const todo = web()
            .getTransferSteps()
            .map((p) => [p.title, p.description, p.instruction, ...(p.details ?? [])].join(' '))
            .join(' ');

        expect(todo).not.toMatch(/retien|dinero|fondos/i);
    });

    it('los pasos del vendedor antes de la venta llevan título, dicho al vendedor', () => {
        const antes = web()
            .getTransferSteps()
            .filter((p) => p.stage === 'listing');

        expect(antes.length).toBeGreaterThan(0);
        for (const paso of antes) {
            // Sin título, el panel de acceso muestra la descripción en tercera persona.
            expect(paso.title).toBeTruthy();
            expect(paso.title).not.toMatch(/^El vendedor/);
        }
    });

    it('ningún paso habla de canales, de YouTube ni de la espera de 7 días', () => {
        const todo = web()
            .getTransferSteps()
            .map((p) => [p.title, p.description, p.instruction, ...(p.details ?? [])].join(' '))
            .join(' ');

        expect(todo).not.toMatch(/canal|youtube|7 días/i);
    });
});

/**
 * El texto largo vivía todo en `instruction` y se mostraba como una pared. Ahora
 * `instruction` es una oración y el detalle viaja estructurado: título, viñetas
 * cortas y enlaces directos, que es lo que dibuja el carrusel del vendedor.
 */
describe('YouTubeStrategy.getTransferSteps: contenido estructurado del vendedor', () => {
    const delVendedor = () => youtube().getTransferSteps().filter((p) => p.requiredActor === 'seller');
    const completo = (p: { instruction?: string; details?: string[] }) =>
        `${p.instruction ?? ''} ${(p.details ?? []).join(' ')}`;

    it('cada paso del vendedor trae título, de 2 a 5 viñetas y al menos un enlace', () => {
        const pasos = delVendedor();

        expect(pasos).toHaveLength(4);
        for (const paso of pasos) {
            expect(paso.title).toBeTruthy();
            expect(paso.details!.length).toBeGreaterThanOrEqual(2);
            expect(paso.details!.length).toBeLessThanOrEqual(5);
            expect(paso.links!.length).toBeGreaterThanOrEqual(1);
        }
    });

    it('la instrucción es una sola oración', () => {
        for (const paso of delVendedor()) {
            const oraciones = paso.instruction!.split(/(?<=[.!?])\s+/).filter(Boolean);
            expect(oraciones).toHaveLength(1);
            expect(paso.instruction!.length).toBeLessThanOrEqual(160);
        }
    });

    it('los enlaces son directos a Google o YouTube, con https', () => {
        const permitidos = [
            'https://www.youtube.com/channel_switcher',
            'https://www.youtube.com/account_advanced',
            'https://myaccount.google.com/brandaccounts',
            'https://studio.youtube.com',
        ];
        for (const paso of delVendedor()) {
            for (const enlace of paso.links!) {
                expect(enlace.label).toBeTruthy();
                expect(permitidos).toContain(enlace.href);
            }
        }
    });

    it('cada paso lleva los enlaces que le corresponden', () => {
        const [convertir, invitar, permisos, promover] = delVendedor();
        const hrefs = (p: { links?: { href: string }[] }) => p.links!.map((l) => l.href);

        expect(hrefs(convertir)).toEqual([
            'https://www.youtube.com/channel_switcher',
            'https://www.youtube.com/account_advanced',
        ]);
        expect(hrefs(permisos)).toEqual(['https://studio.youtube.com']);
        expect(hrefs(invitar)).toEqual(['https://myaccount.google.com/brandaccounts']);
        expect(hrefs(promover)).toEqual(['https://myaccount.google.com/brandaccounts']);
    });

    it('el primer paso conserva todos los avisos verificados', () => {
        const [primero] = delVendedor();
        const t = completo(primero);

        expect(t).toMatch(/Reemplazar/);
        expect(t).toMatch(/canal vac/i);
        expect(t).toMatch(/10 minutos/);
        expect(t).toMatch(/delegados/i);
        expect(t).toMatch(/verificaci/i);
        expect(t).toMatch(/foto/i);
        expect(t).toMatch(/nombre/i);
        expect(t).toMatch(/No hay otras cuentas disponibles/);
        expect(t).toMatch(/antes de invitar/i);
    });

    it('la invitación conserva los avisos y nombra la cuenta de custodia en la instrucción', () => {
        const pasos = youtube().getTransferSteps({ custodyAccountIdentifier: 'custodia1@gmail.com' });
        const invitacion = pasos.find((p) => /invita/i.test(p.description) && p.requiredActor === 'seller')!;
        const t = completo(invitacion);

        expect(invitacion.instruction).toContain('custodia1@gmail.com');
        expect(t).toMatch(/no elijas.*Propietario/i);
        expect(t).toMatch(/Administrador/);
        expect(t).toMatch(/Supervisor\/a/);
        expect(t).toMatch(/no puede eliminar el canal/i);
        // La mecánica de la espera no se explica antes de la venta.
        expect(t).not.toMatch(/siete días|7 días/);
    });

    it('la promoción conserva el aviso del rechazo hasta el día 7 y lo que se cede', () => {
        const promocion = delVendedor()[3];
        const t = completo(promocion);

        expect(t).toMatch(/contrato ya firmado/i);
        expect(t).toMatch(/rechaza/i);
        expect(t).toMatch(/7 días/);
        expect(t).toMatch(/borrar la cuenta/i);
    });

    it('el paso de permisos conserva el aviso de que la promoción falla sin explicar por qué', () => {
        const permisos = delVendedor()[2];

        expect(completo(permisos)).toMatch(/falla sin avisar/i);
    });

    it('los pasos de otras partes no llevan contenido estructurado', () => {
        const ajenos = youtube().getTransferSteps().filter((p) => p.requiredActor !== 'seller');

        for (const paso of ajenos) {
            expect(paso.links).toBeUndefined();
            expect(paso.details).toBeUndefined();
        }
    });
});

/**
 * `key` y `check` reemplazan al `automated` que nadie leía: la clave es estable
 * para poder guardar el progreso de cada paso, y el tipo de comprobación dice
 * quién da fe de que se cumplió.
 */
describe.each([
    ['YouTubeStrategy', youtube],
    ['WebStrategy', web],
])('%s.getTransferSteps: clave y tipo de comprobación', (_nombre, estrategia) => {
    it('cada paso declara una clave única y no vacía', () => {
        const claves = estrategia().getTransferSteps().map((p) => p.key);

        expect(claves.every((k) => typeof k === 'string' && k.length > 0)).toBe(true);
        expect(new Set(claves).size).toBe(claves.length);
    });

    it('cada paso declara un tipo de comprobación válido y ninguno conserva automated', () => {
        for (const paso of estrategia().getTransferSteps()) {
            expect(['automatic', 'declared', 'admin']).toContain(paso.check);
            expect(Object.keys(paso)).not.toContain('automated');
        }
    });

    it('las claves no cambian con el contexto', () => {
        const sin = estrategia().getTransferSteps().map((p) => p.key);
        const con = estrategia()
            .getTransferSteps({ custodyAccountIdentifier: 'c@x.com', recipientIdentifier: 'r@x.com' })
            .map((p) => p.key);

        expect(con).toEqual(sin);
    });
});

describe('WebStrategy.getTransferSteps: pasos de la operación', () => {
    it('hay pasos fuera de la publicación, que es lo que muestra el detalle de la operación', () => {
        expect(web().getTransferSteps().some((p) => p.stage !== 'listing')).toBe(true);
    });
});
