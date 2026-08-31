import type { ReportReasonDto } from '@marketplace/api-contract';

/** Los motivos, escritos como los diría la parte que reclama. */
export const MOTIVOS: Record<ReportReasonDto, string> = {
    metricas_falsas: 'Las métricas no eran las declaradas',
    ingreso_falso: 'El ingreso no era el declarado',
    activo_no_entregado: 'El activo nunca se entregó',
    activo_recuperado: 'El vendedor recuperó el activo después de la venta',
    pago_no_recibido: 'El pago nunca llegó',
    otro: 'Otro motivo',
};
