import Link from 'next/link';
import { perfilActual } from '@/lib/perfil';
import { Candado } from './Candado';

/**
 * Avisa antes de que la persona choque contra el gate.
 *
 * Sin esto, un usuario nuevo carga un activo entero y recién al enviarlo a
 * revisión descubre que le falta verificarse.
 */
export async function AvisoKyc() {
    const perfil = await perfilActual();
    if (!perfil || perfil.isKycVerified) return null;

    return (
        <div className="border-b border-[var(--color-alerta)]/30 bg-[var(--color-alerta)]/5">
            <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-3 sm:px-12">
                <div className="flex items-center gap-2.5">
                    <Candado tamano={13} />
                    <span className="text-[13px] text-[var(--color-alerta)]">
                        Tu identidad no está verificada: todavía no podés publicar activos ni firmar.
                    </span>
                </div>
                <Link
                    href="/verificar"
                    className="rounded-[var(--radius-chico)] border border-[var(--color-alerta)]/40 px-3.5 py-1.5 text-[13px] font-medium text-[var(--color-alerta)] transition-colors hover:border-[var(--color-alerta)]"
                >
                    Verificar ahora
                </Link>
            </div>
        </div>
    );
}
