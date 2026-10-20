import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleEstimate } from '@/lib/latestEstimate';

type Estimate = { cents: number; currency: string } | null;

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('scheduleEstimate', () => {
    it('espera la pausa antes de pedir', async () => {
        const run = vi.fn(async (): Promise<Estimate> => ({ cents: 1, currency: 'USD' }));
        const onResult = vi.fn();

        scheduleEstimate(run, onResult, 300);
        expect(run).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(300);
        expect(run).toHaveBeenCalledOnce();
        expect(onResult).toHaveBeenCalledWith({ cents: 1, currency: 'USD' });
    });

    it('cancelar antes de la pausa no pide nada', async () => {
        const run = vi.fn(async (): Promise<Estimate> => null);
        const cancel = scheduleEstimate(run, vi.fn(), 300);

        cancel();
        await vi.advanceTimersByTimeAsync(1000);

        expect(run).not.toHaveBeenCalled();
    });

    it('la respuesta de un pedido cancelado no pisa a la del último', async () => {
        const first = deferred<Estimate>();
        const second = deferred<Estimate>();
        const run = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const onResult = vi.fn();

        const cancelFirst = scheduleEstimate(run, onResult, 300);
        await vi.advanceTimersByTimeAsync(300);
        cancelFirst();
        scheduleEstimate(run, onResult, 300);
        await vi.advanceTimersByTimeAsync(300);

        second.resolve({ cents: 2, currency: 'USD' });
        await vi.advanceTimersByTimeAsync(0);
        first.resolve({ cents: 1, currency: 'USD' });
        await vi.advanceTimersByTimeAsync(0);

        expect(onResult).toHaveBeenCalledOnce();
        expect(onResult).toHaveBeenCalledWith({ cents: 2, currency: 'USD' });
    });

    it('un pedido que falla deja la valuación en null, sin rechazo sin manejar', async () => {
        const run = vi.fn().mockRejectedValue(new Error('red caída'));
        const onResult = vi.fn();

        scheduleEstimate(run, onResult, 300);
        await vi.advanceTimersByTimeAsync(300);

        expect(onResult).toHaveBeenCalledWith(null);
    });

    it('un fallo de un pedido cancelado tampoco toca el estado', async () => {
        const first = deferred<Estimate>();
        const onResult = vi.fn();

        const cancel = scheduleEstimate(() => first.promise, onResult, 300);
        await vi.advanceTimersByTimeAsync(300);
        cancel();
        first.reject(new Error('tarde'));
        await vi.advanceTimersByTimeAsync(0);

        expect(onResult).not.toHaveBeenCalled();
    });
});
