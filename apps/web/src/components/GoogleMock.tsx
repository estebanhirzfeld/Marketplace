/**
 * Maquetas animadas de las pantallas de Google, para mostrar el gesto sin
 * mandar capturas que envejecen. Son una ilustración de Google, no de nuestra
 * interfaz: por eso llevan sus propios colores (blanco, azul de Google) y no
 * los tokens del sistema. Decorativas: el texto de al lado dice lo mismo.
 * Las animaciones viven en `globals.css` y se apagan con `prefers-reduced-motion`.
 */

const STAGE =
    'relative h-[380px] w-[520px] max-w-full overflow-hidden rounded-[var(--radius-grande)] bg-white font-sans text-[#202124]';

function Cursor({ className }: { className: string }) {
    return (
        <svg className={`${className} absolute left-0 top-0`} width="22" height="22" viewBox="0 0 24 24">
            <path d="M4 2l14 9-6 1.5L9 19z" fill="#202124" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
    );
}

function Lines({ widths }: { widths: string[] }) {
    return widths.map((w, i) => (
        <span key={i} className="h-2.5 rounded-[3px] bg-[#eceff1]" style={{ width: w }} />
    ));
}

/** Paso 1: «Mover canal a una cuenta de marca». */
export function BrandAccountMock() {
    return (
        <div aria-hidden="true" className={STAGE}>
            <div className="flex h-11 items-center gap-2.5 border-b border-[#e0e0e0] px-4">
                <span className="h-5 w-7 rounded-[5px] bg-[#ff0000]" />
                <span className="text-[14px] font-medium">Configuración avanzada</span>
            </div>
            <div className="flex flex-col gap-3.5 px-4 py-5">
                <Lines widths={['60%', '80%']} />
                <span className="mock-enlace-1 self-start rounded-[4px] px-2 py-1.5 text-[14px] text-[#1a73e8]">
                    Mover canal a una cuenta de marca
                </span>
                <Lines widths={['70%', '50%']} />
            </div>
            <div className="mock-dialogo-1 absolute left-[70px] top-[120px] flex w-[380px] max-w-[calc(100%-2rem)] flex-col gap-3 rounded-[8px] bg-white p-[18px] shadow-[0_6px_24px_rgba(0,0,0,0.25)]">
                <span className="text-[16px] font-medium">Crear una cuenta de marca</span>
                <span className="h-[34px] rounded-[4px] border border-[#dadce0]" />
                <div className="flex justify-end">
                    <span className="mock-boton-1 rounded-[4px] bg-[#1a73e8] px-3.5 py-2 text-[13px] text-white">Crear</span>
                </div>
            </div>
            <Cursor className="mock-cursor-1" />
        </div>
    );
}

/** Paso 2: invitar a la cuenta de custodia con el rol Administrador. */
export function InviteMock({ email }: { email: string }) {
    return (
        <div aria-hidden="true" className={STAGE}>
            <div className="flex h-11 items-center justify-between border-b border-[#e0e0e0] px-4">
                <span className="text-[14px] font-medium">Permisos de la cuenta</span>
                <span className="rounded-[4px] px-2.5 py-1.5 text-[13px] text-[#1a73e8]">Invitar usuarios</span>
            </div>
            <div className="flex flex-col gap-3.5 px-4 py-5">
                <Lines widths={['55%', '40%']} />
            </div>
            <div className="mock-dialogo-2 absolute left-[60px] top-[100px] flex w-[400px] max-w-[calc(100%-2rem)] flex-col gap-3 rounded-[8px] bg-white p-[18px] shadow-[0_6px_24px_rgba(0,0,0,0.25)]">
                <span className="text-[16px] font-medium">Agregar usuarios</span>
                <span className="flex h-[34px] items-center rounded-[4px] border border-[#dadce0] px-2.5 text-[13px]">
                    {/* `--n` es la cantidad de caracteres: el barrido revela una letra por paso. */}
                    <span className="mock-tipeado inline-block" style={{ '--n': email.length } as React.CSSProperties}>
                        {email}
                    </span>
                </span>
                <span className="mock-rol text-[13px]">Rol: Administrador ▾</span>
                <div className="flex justify-end">
                    <span className="rounded-[4px] bg-[#1a73e8] px-3.5 py-2 text-[13px] text-white">Invitar</span>
                </div>
            </div>
            <Cursor className="mock-cursor-2" />
        </div>
    );
}
