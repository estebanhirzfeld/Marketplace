import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/profile';
import { currentActor } from '@/lib/session';
import { Reveal } from '@/components/Reveal';
import { IdentityVerificationForm } from '@/components/IdentityVerificationForm';
import { ButtonLink, Panel, Heading } from '@/components/ui';
import { verifyIdentityAction } from './actions';

export const metadata = { title: 'Verificar identidad · Traspaso' };

const REQUIERE_KYC = [
    'Publicar un activo en el mercado',
    'Firmar el NDA para ver los datos de un activo confidencial',
    'Firmar el contrato que cierra una venta',
];

export default async function Verificar() {
    if (!(await currentActor())) redirect('/ingresar');

    const perfil = await currentProfile();

    return (
        <div className="mx-auto max-w-[900px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="Verificamos tu identidad una sola vez. Después podés publicar y firmar sin volver a hacerlo.">
                    Verificar identidad
                </Heading>
            </Reveal>

            <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1fr]">
                <Reveal>
                    <Panel title={perfil?.isKycVerified ? 'IDENTIDAD VERIFICADA' : 'TUS DATOS'}>
                        {perfil?.isKycVerified ? (
                            <div className="flex flex-col gap-4">
                                <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                    Tu identidad ya está verificada con el documento{' '}
                                    <span className="font-mono text-[var(--color-tinta)]">{perfil.dni}</span>.
                                    Ya podés publicar activos y firmar contratos.
                                </p>
                                <div className="flex flex-wrap gap-3">
                                    <ButtonLink href="/vender">Publicar un activo</ButtonLink>
                                    <ButtonLink href="/listings" variant="secundario">Ver el mercado</ButtonLink>
                                </div>
                            </div>
                        ) : (
                            <IdentityVerificationForm action={verifyIdentityAction} />
                        )}
                    </Panel>
                </Reveal>

                <Reveal delay={100}>
                    <Panel title="PARA QUÉ SIRVE">
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
                </Reveal>
            </div>
        </div>
    );
}
