import { describe, it, expect } from 'vitest';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { IAssetStrategy } from '../src/strategies/IAssetStrategy';
import { Money } from '../src/value-objects/Money';

/*
 * Lo que cada tipo de activo sabe de sí mismo.
 *
 * La interfaz venía preguntando "¿de qué tipo sos?" y decidiendo por su
 * cuenta: qué etiqueta poner, contra qué fuente se comprueba la titularidad,
 * cuántos días hay que esperar. El resultado fue un cartel que le anunciaba a
 * un sitio web que "YouTube exige esperar siete días".
 *
 * El descriptor invierte eso. La estrategia cuenta lo que sabe y la pantalla
 * lo dibuja, sin ramificar por tipo. Lo que viaja es semántica —claves, tipos
 * de dato, cuál identifica al activo—; el formato lo sigue poniendo la vista.
 */

const estrategias: Array<[string, IAssetStrategy]> = [
    [
        'youtube',
        new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
            subscribers: 10000,
            growthFactor: 1.2,
            isMonetized: true,
            channelUrl: 'https://youtube.com/@ejemplo',
        }),
    ],
    ['web', new WebStrategy(Money.fromCents(210000, 'USD'), 52, 'ejemplo.com')],
];

describe('IAssetStrategy.describe', () => {
    it.each(estrategias)('%s se describe a sí mismo', (_, strategy) => {
        const d = strategy.describe();

        expect(d.assetType).toBe(strategy.toJSON().assetType);
        expect(d.label.length).toBeGreaterThan(0);
        expect(d.fields.length).toBeGreaterThan(0);
    });

    it.each(estrategias)('%s declara sus días de espera sin que nadie los adivine', (_, strategy) => {
        expect(strategy.describe().transferWaitingDays).toBe(strategy.transferWaitingDays());
    });

    it.each(estrategias)('%s dice contra qué fuente se comprueba su titularidad', (_, strategy) => {
        expect(['youtube', 'adsense']).toContain(strategy.describe().ownershipSource);
    });

    it.each(estrategias)('%s describe exactamente los campos que emite', (_, strategy) => {
        const d = strategy.describe();
        const emitidos = Object.keys(strategy.toJSON().assetData);

        // Un campo sin descriptor sale a pantalla con su nombre técnico; uno
        // descrito que no existe deja una fila vacía. Tienen que coincidir.
        expect(d.fields.map((f) => f.key).sort()).toEqual(emitidos.sort());
    });

    it.each(estrategias)('%s marca como reservados los mismos campos que oculta', (_, strategy) => {
        const d = strategy.describe();
        const reservados = d.fields.filter((f) => f.confidential).map((f) => f.key);

        expect(reservados.sort()).toEqual([...strategy.getConfidentialFields()].sort());
    });

    it.each(estrategias)('%s señala cuál es el campo que lo identifica', (_, strategy) => {
        const d = strategy.describe();

        // Lo que identifica al activo es justamente lo que el NDA protege: si
        // quedara público, el blindaje no serviría de nada.
        expect(d.identityField.confidential).toBe(true);
        expect(strategy.getConfidentialFields()).toContain(d.identityField.key);
    });

    it.each(estrategias)('%s resume con campos que existen y son públicos', (_, strategy) => {
        const d = strategy.describe();
        const publicos = strategy.getPublicFields();

        for (const clave of d.summaryMetricKeys) {
            expect(publicos).toContain(clave);
        }
    });

    it('explica por qué el acceso lo registra una persona, en sus propios términos', () => {
        const [, youtube] = estrategias[0];
        const [, web] = estrategias[1];

        // Era un texto único que hablaba de YouTube frente a cualquier activo.
        expect(youtube.describe().handoverNotice).not.toBe(web.describe().handoverNotice);
        expect(web.describe().handoverNotice).not.toContain('YouTube');
    });

    it('explica en sus propios términos qué plazo impone su plataforma', () => {
        const [, youtube] = estrategias[0];
        const [, web] = estrategias[1];

        // El canal enuncia la regla completa: alcanza con ser administrador.
        expect(youtube.describe().waitingNotice).toContain('administrador o propietario');

        // El sitio se transfiere de inmediato, pero eso no significa que no
        // haya nada que avisar: cambiar el titular activa el bloqueo de 60
        // días de la ICANN para moverlo a otro registrador, que es una
        // limitación real sobre algo que el comprador acaba de comprar.
        expect(web.describe().waitingNotice).toContain('60 días');
        expect(web.describe().waitingNotice).toContain('otro registrador');
    });
});
