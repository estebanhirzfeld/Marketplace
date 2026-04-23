import { FastifyPluginAsync } from 'fastify'
import { AssetType } from '@marketplace/shared-types'

const app: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
    fastify.get('/', async function (request, reply) {
        return { status: 'Online', assetTypes: Object.values(AssetType) }
    })
}

export default app;
export const options = {}
