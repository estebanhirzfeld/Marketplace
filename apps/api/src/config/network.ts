/**
 * Interfaz mínima del entorno que necesita esta función. Se recibe como
 * argumento en vez de leer `process.env` adentro para poder testearla sin
 * ensuciar el entorno del proceso.
 */
type Environment = Record<string, string | undefined>;

const LOOPBACK = '127.0.0.1';

/**
 * Decide en qué interfaz escucha la API.
 *
 * El navegador nunca llega hasta acá: todo el tráfico pasa por el código de
 * servidor de Next, que corre en la misma máquina. Por eso el valor por defecto
 * es loopback — así el puerto queda inalcanzable desde afuera aunque la lista
 * de seguridad de la nube o el firewall estén mal configurados, en lugar de que
 * ellos sean la única defensa.
 *
 * `API_HOST` existe para los casos en que el proceso vive en otra red que el
 * cliente, típicamente dentro de un contenedor, donde loopback lo dejaría
 * incomunicado.
 */
export function resolveListenHost(env: Environment): string {
    const configured = env.API_HOST?.trim();
    return configured ? configured : LOOPBACK;
}
