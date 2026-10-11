/**
 * Pide una valuación después de una pausa y entrega solo la respuesta del
 * último pedido: devuelve la función que cancela el pedido pendiente o en
 * vuelo, y una respuesta (o un fallo) de uno cancelado se descarta. Sin eso,
 * una respuesta lenta de un pedido viejo podía pisar la valuación nueva.
 *
 * Un fallo deja la valuación en `null`: el formulario muestra el guion en vez
 * de un número viejo que ya no corresponde a lo que el vendedor completó.
 */
export function scheduleEstimate<T>(
    run: () => Promise<T | null>,
    onResult: (result: T | null) => void,
    delayMs: number,
): () => void {
    let current = true;

    const timer = setTimeout(() => {
        run().then(
            (result) => {
                if (current) onResult(result);
            },
            () => {
                if (current) onResult(null);
            },
        );
    }, delayMs);

    return () => {
        current = false;
        clearTimeout(timer);
    };
}
