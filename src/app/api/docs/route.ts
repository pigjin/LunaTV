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
  const spec = JSON.parse(JSON.stringify(swaggerSpec)) as {
    paths?: Record<
      string,
      Record<
        string,
        {
          parameters?: Array<{ name?: string; $ref?: string }>;
        }
      >
    >;
  };

  // 全局注入 X-Client-Platform 请求头参数
  const clientPlatformParam = {
    $ref: '#/components/parameters/ClientPlatform',
  };

  const paths = spec.paths;
  if (paths) {
    Object.keys(paths).forEach((path) => {
      const pathItem = paths[path];
      Object.keys(pathItem).forEach((method) => {
        if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
          const operation = pathItem[method];
          operation.parameters = operation.parameters || [];

          // 检查是否已经存在该参数，避免重复添加
          const exists = operation.parameters.some(
            (p) =>
              p.name === 'X-Client-Platform' ||
              (p.$ref && p.$ref.endsWith('ClientPlatform'))
          );

          if (!exists) {
            operation.parameters.push(clientPlatformParam);
          }
        }
      });
    });
  }

  return NextResponse.json(spec);
}
