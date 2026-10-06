import {
    ExchangeRate,
    IExchangeRateProvider,
} from '@marketplace/domain/src/ports/IExchangeRateProvider';

const COTIZACIONES_USD =
    'https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD';

const UNA_HORA_MS = 60 * 60 * 1000;
const CUATRO_DIAS_MS = 4 * 24 * UNA_HORA_MS;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface BcraExchangeRateOptions {
    fetchImpl?: typeof fetch;
    now?: () => Date;
    /** Cuánto se reutiliza una tasa leída antes de volver a consultar. */
    cacheTtlMs?: number;
    /**
     * Hasta qué antigüedad sirve la última tasa leída cuando el BCRA no
     * responde. Cubre fines de semana y feriados, en que no hay publicación.
     */
    maxStaleMs?: number;
    timeoutMs?: number;
    /** Tasa manual de emergencia: si es válida, no se consulta al BCRA. */
    override?: number;
    /**
     * Espera tras una consulta fallida durante la cual no se lanza otra. Acota
     * la latencia en una caída del BCRA: sin ella cada llamada esperaría el
     * tiempo de espera completo.
     */
    failureBackoffMs?: number;
}

interface TasaGuardada {
    value: ExchangeRate;
    fetchedAt: number;
}

/**
 * Cotización A3500 del BCRA.
 *
 * API pública, sin clave. Nunca lanza: cualquier falla (red, tiempo de espera,
 * estado distinto de 200, cuerpo inválido) cae a la última tasa leída si no es
 * demasiado vieja, y si no, a `null`, que el llamador interpreta como "sin
 * cotización disponible". Mejor no ofrecer Mercado Pago que cobrar con una
 * tasa desactualizada.
 */
export class BcraExchangeRateProvider implements IExchangeRateProvider {
    private readonly fetchImpl: typeof fetch;
    private readonly now: () => Date;
    private readonly cacheTtlMs: number;
    private readonly maxStaleMs: number;
    private readonly timeoutMs: number;
    private readonly override?: number;
    private readonly failureBackoffMs: number;

    private cached?: TasaGuardada;
    private inFlight?: Promise<ExchangeRate | null>;
    /** Instante de la última consulta fallida; un éxito lo borra. */
    private lastFailureAt?: number;

    constructor(options: BcraExchangeRateOptions = {}) {
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.now = options.now ?? (() => new Date());
        this.cacheTtlMs = options.cacheTtlMs ?? UNA_HORA_MS;
        this.maxStaleMs = options.maxStaleMs ?? CUATRO_DIAS_MS;
        this.timeoutMs = options.timeoutMs ?? 5000;
        this.override = options.override;
        this.failureBackoffMs = options.failureBackoffMs ?? 30_000;
    }

    async getUsdArsRate(): Promise<ExchangeRate | null> {
        if (this.override !== undefined && Number.isFinite(this.override) && this.override > 0) {
            return {
                rate: this.override,
                date: this.now().toISOString().slice(0, 10),
                source: 'manual',
            };
        }

        if (this.cached && this.edad(this.cached) < this.cacheTtlMs) {
            return this.cached.value;
        }

        // Tras una falla reciente no se insiste: se sirve lo guardado, si sirve.
        if (this.enEspera()) {
            return this.respaldo();
        }

        // Las llamadas simultáneas comparten la misma consulta.
        this.inFlight ??= this.refrescar().finally(() => {
            this.inFlight = undefined;
        });
        return this.inFlight;
    }

    private edad(guardada: TasaGuardada): number {
        return this.now().getTime() - guardada.fetchedAt;
    }

    private enEspera(): boolean {
        return (
            this.lastFailureAt !== undefined &&
            this.now().getTime() - this.lastFailureAt < this.failureBackoffMs
        );
    }

    /** La última tasa leída, si no es más vieja que el máximo tolerado. */
    private respaldo(): ExchangeRate | null {
        if (this.cached && this.edad(this.cached) <= this.maxStaleMs) {
            return this.cached.value;
        }
        return null;
    }

    private async refrescar(): Promise<ExchangeRate | null> {
        const tasa = await this.consultar();
        if (tasa) {
            this.cached = { value: tasa, fetchedAt: this.now().getTime() };
            this.lastFailureAt = undefined;
            return tasa;
        }

        this.lastFailureAt = this.now().getTime();
        return this.respaldo();
    }

    /** `null` ante cualquier falla; el motivo no importa a quien llama. */
    private async consultar(): Promise<ExchangeRate | null> {
        const controller = new AbortController();
        let temporizador: ReturnType<typeof setTimeout> | undefined;
        const vencido = new Promise<never>((_, reject) => {
            temporizador = setTimeout(() => {
                controller.abort();
                reject(new Error('Tiempo de espera agotado.'));
            }, this.timeoutMs);
        });

        try {
            const lectura = (async () => {
                const respuesta = await this.fetchImpl(COTIZACIONES_USD, {
                    headers: { accept: 'application/json' },
                    signal: controller.signal,
                });
                if (respuesta.status !== 200) return null;
                return extraerTasa(await respuesta.json());
            })();
            // Si gana el tiempo de espera, la lectura queda huérfana: se
            // silencia su rechazo para que no suba como error sin manejar.
            lectura.catch(() => undefined);
            return await Promise.race([lectura, vencido]);
        } catch {
            return null;
        } finally {
            clearTimeout(temporizador);
        }
    }
}

/**
 * Valida la forma de la respuesta del BCRA y devuelve la tasa de la fecha más
 * reciente. Si esa fecha no trae una tasa válida no se retrocede a una más
 * vieja: sería devolver un dato desactualizado sin que nadie lo note.
 */
function extraerTasa(cuerpo: unknown): ExchangeRate | null {
    const resultados = (cuerpo as { results?: unknown } | null)?.results;
    if (!Array.isArray(resultados)) return null;

    let masReciente: { fecha: string; detalle: unknown } | null = null;
    for (const resultado of resultados) {
        const fecha = (resultado as { fecha?: unknown } | null)?.fecha;
        if (typeof fecha !== 'string' || !FECHA.test(fecha)) continue;
        if (!masReciente || fecha > masReciente.fecha) {
            masReciente = { fecha, detalle: (resultado as { detalle?: unknown }).detalle };
        }
    }
    if (!masReciente || !Array.isArray(masReciente.detalle)) return null;

    const usd = masReciente.detalle.find(
        (d: unknown) => (d as { codigoMoneda?: unknown } | null)?.codigoMoneda === 'USD',
    ) as { tipoCotizacion?: unknown } | undefined;
    const rate = usd?.tipoCotizacion;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null;

    return { rate, date: masReciente.fecha, source: 'BCRA_A3500' };
}
