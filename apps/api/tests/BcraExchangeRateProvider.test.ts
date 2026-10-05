import { describe, it, expect, vi } from 'vitest';
import { BcraExchangeRateProvider } from '../src/adapters/BcraExchangeRateProvider';

/**
 * El adaptador del BCRA contra respuestas fabricadas, con `fetch` y reloj
 * inyectados: ningún test sale a la red.
 */

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const INICIO = new Date('2026-10-05T12:00:00Z');

function json(cuerpo: unknown, status = 200): Response {
    return new Response(JSON.stringify(cuerpo), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

/** La forma real de la respuesta de `Cotizaciones/USD`. */
function respuestaBcra(
    resultados: Array<{ fecha: string; tipoCotizacion: number; codigoMoneda?: string }> = [
        { fecha: '2026-10-02', tipoCotizacion: 1520 },
    ],
) {
    return {
        status: 200,
        metadata: { resultset: { count: resultados.length, offset: 0, limit: 1000 } },
        results: resultados.map((r) => ({
            fecha: r.fecha,
            detalle: [
                {
                    codigoMoneda: r.codigoMoneda ?? 'USD',
                    descripcion: 'DOLAR E.E.U.U.',
                    tipoPase: 0,
                    tipoCotizacion: r.tipoCotizacion,
                },
            ],
        })),
    };
}

function armar(opciones: { override?: number; cacheTtlMs?: number; maxStaleMs?: number; timeoutMs?: number } = {}) {
    const fetchImpl = vi.fn<typeof fetch>();
    const reloj = { ahora: INICIO };
    const provider = new BcraExchangeRateProvider({
        fetchImpl,
        now: () => reloj.ahora,
        ...opciones,
    });
    return { provider, fetchImpl, reloj };
}

describe('BcraExchangeRateProvider — lectura', () => {
    it('interpreta la forma real de la respuesta', async () => {
        const { provider, fetchImpl } = armar();
        fetchImpl.mockResolvedValueOnce(json(respuestaBcra()));

        const tasa = await provider.getUsdArsRate();

        expect(tasa).toEqual({ rate: 1520, date: '2026-10-02', source: 'BCRA_A3500' });
        expect(String(fetchImpl.mock.calls[0][0])).toBe(
            'https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD',
        );
    });

    it('toma la fecha más reciente cuando vienen varias', async () => {
        const { provider, fetchImpl } = armar();
        fetchImpl.mockResolvedValueOnce(
            json(
                respuestaBcra([
                    { fecha: '2026-09-30', tipoCotizacion: 1500 },
                    { fecha: '2026-10-02', tipoCotizacion: 1520 },
                    { fecha: '2026-10-01', tipoCotizacion: 1510 },
                ]),
            ),
        );

        const tasa = await provider.getUsdArsRate();

        expect(tasa).toEqual({ rate: 1520, date: '2026-10-02', source: 'BCRA_A3500' });
    });
});

describe('BcraExchangeRateProvider — caché', () => {
    it('dentro de la vigencia llama una sola vez', async () => {
        const { provider, fetchImpl, reloj } = armar();
        fetchImpl.mockResolvedValueOnce(json(respuestaBcra()));

        await provider.getUsdArsRate();
        reloj.ahora = new Date(INICIO.getTime() + HORA - 1);
        const segunda = await provider.getUsdArsRate();

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(segunda?.rate).toBe(1520);
    });

    it('vencida la vigencia vuelve a consultar', async () => {
        const { provider, fetchImpl, reloj } = armar();
        fetchImpl.mockResolvedValueOnce(json(respuestaBcra()));
        fetchImpl.mockResolvedValueOnce(json(respuestaBcra([{ fecha: '2026-10-05', tipoCotizacion: 1600 }])));

        await provider.getUsdArsRate();
        reloj.ahora = new Date(INICIO.getTime() + HORA);
        const segunda = await provider.getUsdArsRate();

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(segunda).toEqual({ rate: 1600, date: '2026-10-05', source: 'BCRA_A3500' });
    });

    it('respeta una vigencia configurada', async () => {
        const { provider, fetchImpl, reloj } = armar({ cacheTtlMs: 1000 });
        fetchImpl.mockResolvedValue(json(respuestaBcra()));

        await provider.getUsdArsRate();
        reloj.ahora = new Date(INICIO.getTime() + 1000);
        await provider.getUsdArsRate();

        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
});

describe('BcraExchangeRateProvider — respaldo ante fallas', () => {
    async function conCacheVencido() {
        const ctx = armar();
        ctx.fetchImpl.mockResolvedValueOnce(json(respuestaBcra()));
        await ctx.provider.getUsdArsRate();
        ctx.reloj.ahora = new Date(INICIO.getTime() + 2 * HORA);
        return ctx;
    }

    it('si falla, usa el último valor guardado dentro del máximo de antigüedad', async () => {
        const { provider, fetchImpl } = await conCacheVencido();
        fetchImpl.mockRejectedValueOnce(new TypeError('fetch failed'));

        const tasa = await provider.getUsdArsRate();

        expect(tasa).toEqual({ rate: 1520, date: '2026-10-02', source: 'BCRA_A3500' });
    });

    it('si falla pasado el máximo de antigüedad, devuelve null', async () => {
        const { provider, fetchImpl, reloj } = await conCacheVencido();
        reloj.ahora = new Date(INICIO.getTime() + 4 * DIA + 1);
        fetchImpl.mockRejectedValueOnce(new TypeError('fetch failed'));

        expect(await provider.getUsdArsRate()).toBeNull();
    });

    it('justo en el máximo de antigüedad todavía sirve', async () => {
        const { provider, fetchImpl, reloj } = await conCacheVencido();
        reloj.ahora = new Date(INICIO.getTime() + 4 * DIA);
        fetchImpl.mockRejectedValueOnce(new TypeError('fetch failed'));

        expect((await provider.getUsdArsRate())?.rate).toBe(1520);
    });

    it('si falla y no hay nada guardado, devuelve null', async () => {
        const { provider, fetchImpl } = armar();
        fetchImpl.mockRejectedValueOnce(new TypeError('fetch failed'));

        expect(await provider.getUsdArsRate()).toBeNull();
    });

    it('una falla no renueva la antigüedad del valor guardado', async () => {
        const { provider, fetchImpl, reloj } = await conCacheVencido();
        fetchImpl.mockRejectedValue(new TypeError('fetch failed'));
        await provider.getUsdArsRate();

        reloj.ahora = new Date(INICIO.getTime() + 4 * DIA + 1);

        expect(await provider.getUsdArsRate()).toBeNull();
    });
});

describe('BcraExchangeRateProvider — respuestas inválidas', () => {
    const casos: Array<[string, () => Response]> = [
        ['un estado que no es 200', () => json(respuestaBcra(), 500)],
        ['un JSON mal formado', () => new Response('{no es json', { status: 200 })],
        ['un cuerpo sin resultados', () => json({ status: 200, results: [] })],
        ['una respuesta sin USD', () => json(respuestaBcra([{ fecha: '2026-10-02', tipoCotizacion: 1, codigoMoneda: 'EUR' }]))],
        ['una tasa en cero', () => json(respuestaBcra([{ fecha: '2026-10-02', tipoCotizacion: 0 }]))],
        ['una tasa negativa', () => json(respuestaBcra([{ fecha: '2026-10-02', tipoCotizacion: -5 }]))],
        ['una tasa que no es número', () => json(respuestaBcra([{ fecha: '2026-10-02', tipoCotizacion: 'mucho' as unknown as number }]))],
        ['una fecha mal formada', () => json(respuestaBcra([{ fecha: '02/10/2026', tipoCotizacion: 1520 }]))],
    ];

    it.each(casos)('sin valor guardado devuelve null ante %s', async (_nombre, respuesta) => {
        const { provider, fetchImpl } = armar();
        fetchImpl.mockResolvedValueOnce(respuesta());

        expect(await provider.getUsdArsRate()).toBeNull();
    });

    it.each(casos)('con valor guardado vuelve a él ante %s', async (_nombre, respuesta) => {
        const { provider, fetchImpl, reloj } = armar();
        fetchImpl.mockResolvedValueOnce(json(respuestaBcra()));
        await provider.getUsdArsRate();
        reloj.ahora = new Date(INICIO.getTime() + 2 * HORA);
        fetchImpl.mockResolvedValueOnce(respuesta());

        expect((await provider.getUsdArsRate())?.rate).toBe(1520);
    });

    it('una tasa NaN en el cuerpo (null en JSON) se descarta', async () => {
        const { provider, fetchImpl } = armar();
        fetchImpl.mockResolvedValueOnce(
            json(respuestaBcra([{ fecha: '2026-10-02', tipoCotizacion: null as unknown as number }])),
        );

        expect(await provider.getUsdArsRate()).toBeNull();
    });
});

describe('BcraExchangeRateProvider — tiempo de espera', () => {
    it('si la consulta no responde a tiempo devuelve null', async () => {
        const { provider, fetchImpl } = armar({ timeoutMs: 20 });
        fetchImpl.mockImplementationOnce(
            (_url, init) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => reject(new DOMException('abortado', 'AbortError')));
                }),
        );

        expect(await provider.getUsdArsRate()).toBeNull();
    });

    it('corta aunque el fetch ignore la señal', async () => {
        const { provider, fetchImpl } = armar({ timeoutMs: 20 });
        fetchImpl.mockImplementationOnce(() => new Promise(() => undefined));

        expect(await provider.getUsdArsRate()).toBeNull();
    });

    it('pasa una señal de aborto al fetch', async () => {
        const { provider, fetchImpl } = armar();
        fetchImpl.mockResolvedValueOnce(json(respuestaBcra()));

        await provider.getUsdArsRate();

        expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    });
});

describe('BcraExchangeRateProvider — concurrencia', () => {
    it('las llamadas simultáneas comparten una sola consulta', async () => {
        const { provider, fetchImpl } = armar();
        let liberar: (r: Response) => void = () => undefined;
        fetchImpl.mockImplementationOnce(
            () =>
                new Promise<Response>((resolve) => {
                    liberar = resolve;
                }),
        );

        const llamadas = [provider.getUsdArsRate(), provider.getUsdArsRate(), provider.getUsdArsRate()];
        liberar(json(respuestaBcra()));
        const tasas = await Promise.all(llamadas);

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(tasas.map((t) => t?.rate)).toEqual([1520, 1520, 1520]);
    });

    it('después de una consulta fallida se puede volver a intentar', async () => {
        const { provider, fetchImpl } = armar();
        fetchImpl.mockRejectedValueOnce(new TypeError('fetch failed'));
        fetchImpl.mockResolvedValueOnce(json(respuestaBcra()));

        expect(await provider.getUsdArsRate()).toBeNull();
        expect((await provider.getUsdArsRate())?.rate).toBe(1520);
    });
});

describe('BcraExchangeRateProvider — tasa manual', () => {
    it('la tasa manual manda y nunca consulta', async () => {
        const { provider, fetchImpl } = armar({ override: 1700 });

        const tasa = await provider.getUsdArsRate();

        expect(tasa).toEqual({ rate: 1700, date: '2026-10-05', source: 'manual' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('la fecha de la tasa manual sigue al reloj', async () => {
        const { provider, reloj } = armar({ override: 1700 });
        reloj.ahora = new Date('2026-10-09T03:00:00Z');

        expect((await provider.getUsdArsRate())?.date).toBe('2026-10-09');
    });

    it.each([Number.NaN, 0, -10, Number.POSITIVE_INFINITY])('ignora una tasa manual inválida (%s)', async (override) => {
        const { provider, fetchImpl } = armar({ override });
        fetchImpl.mockResolvedValueOnce(json(respuestaBcra()));

        const tasa = await provider.getUsdArsRate();

        expect(tasa?.source).toBe('BCRA_A3500');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
