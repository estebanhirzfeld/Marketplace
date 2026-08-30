import { FastifyInstance } from 'fastify';
import { Container } from '../container';
import { UserRole } from '@marketplace/shared-types';
import type {
    AuthTokenDto,
    LoginRequest,
    RegisterRequest,
    RegisteredUserDto,
} from '@marketplace/api-contract';

const registerSchema = {
    body: {
        type: 'object',
        required: ['email', 'fullName', 'password', 'role'],
        properties: {
            email: { type: 'string' },
            fullName: { type: 'string' },
            password: { type: 'string' },
            role: { type: 'string', enum: Object.values(UserRole) },
            phone: { type: 'string' },
            country: { type: 'string' },
            dni: { type: 'string' },
        },
    },
} as const;

const loginSchema = {
    body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
            email: { type: 'string' },
            password: { type: 'string' },
        },
    },
} as const;

export function registerAuthRoutes(app: FastifyInstance, c: Container): void {
    app.post<{ Body: RegisterRequest; Reply: RegisteredUserDto }>(
        '/auth/register',
        { schema: registerSchema },
        async (request, reply) => {
            const user = await c.registerUser.execute(request.body);

            // El tipo Reply obliga a que esto sea exactamente el DTO: si el
            // contrato cambia, la ruta deja de compilar.
            const dto: RegisteredUserDto = {
                id: user.id.toString(),
                email: user.email.getValue(),
                role: user.role,
                isKycVerified: user.isKycVerified,
            };
            return reply.code(201).send(dto);
        },
    );

    app.post<{ Body: LoginRequest; Reply: AuthTokenDto }>(
        '/auth/login',
        { schema: loginSchema },
        async (request, reply) => {
            // El dominio devuelve el actor; firmar el token es cosa del transporte.
            const actor = await c.login.execute(request.body.email, request.body.password);
            const token = app.jwt.sign(actor);

            const dto: AuthTokenDto = { token, actor };
            return reply.send(dto);
        },
    );
}
