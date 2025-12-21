import { NextResponse } from 'next/server';

import { swaggerSpec } from '@/lib/swagger.config';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/docs:
 *   get:
 *     summary: 获取 OpenAPI 规范文档
 *     description: 返回完整的 OpenAPI 3.0 规范 JSON
 *     tags:
 *       - 其他
 *     responses:
 *       200:
 *         description: 返回 OpenAPI 规范文档
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
export async function GET() {
  return NextResponse.json(swaggerSpec);
}

