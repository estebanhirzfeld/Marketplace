import { redirect } from 'next/navigation';
import { perfilActual } from '@/lib/perfil';
import { actorActual } from '@/lib/sesion';
import { Revelar } from '@/components/Revelar';
import { FormularioVerificacion } from '@/components/FormularioVerificacion';
import { BotonEnlace, Panel, Titulo } from '@/components/ui';
import { verificar } from './acciones';

export const metadata = { title: 'Verificar identidad · Traspaso' };

const REQUIERE_KYC = [
    'Publicar un activo en el mercado',
    'Firmar el NDA para ver los datos de un activo confidencial',
    'Firmar el contrato que cierra una venta',
];

export default async function Verificar() {
    if (!(await actorActual())) redirect('/ingresar');

    const perfil = await perfilActual();

    return (
        <div className="mx-auto max-w-[900px] px-6 py-16 sm:px-12">
            <Revelar>
                <Titulo sub="Verificamos tu identidad una sola vez. Después podés publicar y firmar sin volver a hacerlo.">
                    Verificar identidad
                </Titulo>
            </Revelar>

            <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1fr]">
                <Revelar>
                    <Panel titulo={perfil?.isKycVerified ? 'IDENTIDAD VERIFICADA' : 'TUS DATOS'}>
                        {perfil?.isKycVerified ? (
                            <div className="flex flex-col gap-4">
                                <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                    Tu identidad ya está verificada con el documento{' '}
                                    <span className="font-mono text-[var(--color-tinta)]">{perfil.dni}</span>.
                                    Podés publicar activos y firmar contratos.
                                </p>
                                <div className="flex flex-wrap gap-3">
                                    <BotonEnlace href="/vender">Publicar un activo</BotonEnlace>
                                    <BotonEnlace href="/listings" variante="secundario">Ver el mercado</BotonEnlace>
                                </div>
                            </div>
                        ) : (
                            <FormularioVerificacion accion={verificar} />
                        )}
                    </Panel>
                </Revelar>

                <Revelar retraso={100}>
                    <Panel titulo="PARA QUÉ SIRVE">
                        <div className="flex flex-col gap-5">
                            <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                Acá se mueven activos de miles de dólares entre desconocidos. Antes
                                de que alguien firme algo con valor legal, necesitamos saber quién es.
                            </p>

                            <div className="flex flex-col gap-2.5">
                                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">
                                    REQUIERE IDENTIDAD VERIFICADA
                                </span>
                                {REQUIERE_KYC.map((item) => (
                                    <div key={item} className="flex gap-2.5 text-[14px] text-[var(--color-tenue)]">
                                        <span className="text-[var(--color-alerta)]">·</span>
                                        {item}
                                    </div>
                                ))}
                            </div>

                            <div className="border-t border-[var(--color-borde)] pt-4">
                                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">
                                    NO LA REQUIERE
                                </span>
                                <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                    Navegar el mercado, ofertar y negociar contraofertas. El KYC
                                    custodia instrumentos legales, no la navegación.
                                </p>
                            </div>
                        </div>
                    </Panel>
                </Revelar>
            </div>
        </div>
    );
}
