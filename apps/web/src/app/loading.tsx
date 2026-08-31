/**
 * Lo que se ve mientras el servidor arma la pantalla.
 *
 * No existía, así que una ruta que espera a la API dejaba la página anterior
 * congelada o en blanco sin señal de que algo estuviera pasando. Es una
 * silueta y no un texto de "cargando" porque ocupa el lugar del contenido que
 * viene y evita que la página salte cuando llega.
 */
function Linea({ ancho }: { ancho: string }) {
    return (
        <div
            className="late h-4 rounded-[var(--radius-chico)] bg-[var(--color-superficie)]"
            style={{ width: ancho }}
        />
    );
}

export default function Cargando() {
    return (
        <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12" aria-busy="true">
            <span className="sr-only">Cargando</span>
            <div className="flex flex-col gap-4">
                <Linea ancho="42%" />
                <Linea ancho="66%" />
            </div>
            <div className="mt-10 flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="h-[92px] rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)]/60"
                    />
                ))}
            </div>
        </div>
    );
}
