import { NextResponse } from 'next/server';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';
import { readSession } from '@/lib/session';

/**
 * El archivo de un comprobante, para quien le corresponde verlo.
 *
 * El navegador no habla con la API: este handler la consulta con la sesión de
 * quien pide, y la API decide si puede verlo (el vendedor no ve el de la
 * comisión). Nada se guarda en caché y el tipo no se adivina: un comprobante
 * es un archivo que subió otra persona.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; recipient: string }> }) {
    const { id, recipient } = await params;
    if (recipient !== 'seller' && recipient !== 'platform') {
        return new NextResponse(null, { status: 404 });
    }
    if (!(await readSession())) return new NextResponse(null, { status: 401 });

    try {
        const { bytes, contentType } = await api().receiptFile(id, recipient);
        return new NextResponse(new Uint8Array(bytes), {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': 'inline',
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
                // Se abre aislado: sin scripts ni acceso a la sesión de la app.
                'Content-Security-Policy': 'sandbox',
            },
        });
    } catch (e) {
        if (e instanceof ApiError && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) {
            return new NextResponse(null, { status: 404 });
        }
        throw e;
    }
}
