/**
 * Maqueta animada de un panel de DNS cargando el registro, para mostrar el
 * gesto sin depender de la captura de ningún proveedor. A propósito es
 * genérica: lleva colores propios (como las de Google) y no nombra ni imita a
 * ningún panel, porque el vendedor puede estar en cualquiera. Decorativa: los
 * pasos de al lado dicen lo mismo. Las animaciones viven en `globals.css` y se
 * apagan con `prefers-reduced-motion`.
 */
export function DnsRecordMock({ host, value }: { host: string; value: string }) {
    return (
        <div
            aria-hidden="true"
            className="relative h-[380px] w-[400px] max-w-full overflow-hidden rounded-[var(--radius-grande)] bg-white font-sans text-[#1f2933]"
        >
            <div className="flex h-11 items-center border-b border-[#e4e7eb] px-4">
                <span className="text-[14px] font-medium">Registros DNS</span>
            </div>
            <div className="absolute left-6 top-16 flex w-[352px] flex-col gap-3 rounded-[8px] border border-[#e4e7eb] bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
                <span className="text-[15px] font-medium">Agregar registro</span>
                <div className="flex h-[34px] items-center gap-3 rounded-[4px] border border-[#cbd2d9] px-2.5 text-[13px]">
                    <span className="w-14 text-[#7b8794]">Tipo</span>
                    <span className="font-mono">TXT</span>
                </div>
                <div className="flex h-[34px] items-center gap-3 rounded-[4px] border border-[#cbd2d9] px-2.5 text-[13px]">
                    <span className="w-14 text-[#7b8794]">Nombre</span>
                    <span className="min-w-0 truncate font-mono">{host}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-[4px] border border-[#cbd2d9] px-2.5 py-1.5 text-[13px]">
                    <span className="text-[11px] text-[#7b8794]">Valor</span>
                    <span className="flex h-[22px] items-center overflow-hidden">
                        {/* `--n` es la cantidad de caracteres: el barrido revela una letra por paso. */}
                        <span
                            className="mock-tipeado mock-dns-tipeado inline-block max-w-full text-[11px]"
                            style={{ '--n': value.length } as React.CSSProperties}
                        >
                            {value}
                        </span>
                    </span>
                </div>
                <div className="flex justify-end">
                    <span className="mock-dns-boton rounded-[4px] bg-[#334155] px-3.5 py-2 text-[13px] text-white">
                        Guardar
                    </span>
                </div>
            </div>
            <div className="mock-dns-guardado absolute inset-x-6 bottom-4 flex items-center gap-2 rounded-[6px] bg-[#e3f9e5] px-3 py-2 text-[13px] text-[#0e5814]">
                <span>✓</span>
                Registro guardado
            </div>
            <svg className="mock-cursor-dns absolute left-0 top-0" width="22" height="22" viewBox="0 0 24 24">
                <path d="M4 2l14 9-6 1.5L9 19z" fill="#1f2933" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
        </div>
    );
}
