import { NextResponse } from 'next/server';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';
import { readSession } from '@/lib/session';

/**
 * Los movimientos que el vendedor adjuntó a la revisión de un comprobante. Los
 * ven la plataforma y el propio vendedor; la API decide. Como un comprobante,
 * es un archivo de otra persona: sin caché, sin adivinar el tipo y aislado.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!(await readSession())) return new NextResponse(null, { status: 401 });

    try {
        const { bytes, contentType } = await api().sellerStatementFile(id);
        return new NextResponse(new Uint8Array(bytes), {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': 'inline',
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
                'Content-Security-Policy': 'sandbox',
            },
        });
    } catch (e) {
        if (e instanceof ApiError && e.code === 'UNAUTHORIZED') return new NextResponse(null, { status: 401 });
        if (e instanceof ApiError && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) {
            return new NextResponse(null, { status: 404 });
        }
        throw e;
    }
}
