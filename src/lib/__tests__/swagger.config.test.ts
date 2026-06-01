import fs from 'fs';
import path from 'path';

import { swaggerSpec } from '@/lib/swagger.config';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const API_ROOT = path.join(process.cwd(), 'src', 'app', 'api');

type RouteOperation = {
  method: string;
  routePath: string;
  file: string;
};

function walkRouteFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return walkRouteFiles(fullPath);
    }

    return entry.isFile() && entry.name === 'route.ts' ? [fullPath] : [];
  });
}

function toOpenApiPath(routeFile: string): string {
  const routeDir = path.dirname(path.relative(API_ROOT, routeFile));
  const segments = routeDir === '.' ? [] : routeDir.split(path.sep);
  const openApiSegments = segments.map((segment) => {
    const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
    if (optionalCatchAll) {
      return `{${optionalCatchAll[1]}}`;
    }

    const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
    if (catchAll) {
      return `{${catchAll[1]}}`;
    }

    const dynamic = segment.match(/^\[(.+)\]$/);
    if (dynamic) {
      return `{${dynamic[1]}}`;
    }

    return segment;
  });

  return `/api${openApiSegments.length ? `/${openApiSegments.join('/')}` : ''}`;
}

function getRouteOperations(): RouteOperation[] {
  return walkRouteFiles(API_ROOT).flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const exportedMethods = Array.from(
      source.matchAll(
        /export\s+(?:async\s+)?(?:function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g
      )
    );

    return exportedMethods.map((match) => ({
      method: match[1].toLowerCase(),
      routePath: toOpenApiPath(file),
      file: path.relative(process.cwd(), file),
    }));
  });
}

describe('swaggerSpec', () => {
  it('documents every Next.js API route operation and no stale API operations', () => {
    const paths = (swaggerSpec as { paths?: Record<string, Record<string, unknown>> })
      .paths;
    expect(paths).toBeDefined();

    const routeOperations = getRouteOperations();
    const actualOperationKeys = new Set(
      routeOperations.map(({ routePath, method }) => `${routePath} ${method}`)
    );

    const missingOperations = routeOperations
      .filter(({ routePath, method }) => !paths?.[routePath]?.[method])
      .map(({ routePath, method, file }) => `${method.toUpperCase()} ${routePath} (${file})`);

    const staleOperations = Object.entries(paths ?? {}).flatMap(([routePath, operations]) =>
      HTTP_METHODS.filter((method) => operations[method])
        .filter((method) => !actualOperationKeys.has(`${routePath} ${method}`))
        .map((method) => `${method.toUpperCase()} ${routePath}`)
    );

    expect(missingOperations).toEqual([]);
    expect(staleOperations).toEqual([]);
  });

  it('gives each documented API operation a summary and response map', () => {
    const paths = (swaggerSpec as { paths?: Record<string, Record<string, unknown>> })
      .paths;
    const routeOperations = getRouteOperations();

    const incompleteOperations = routeOperations
      .map(({ routePath, method, file }) => {
        const operation = paths?.[routePath]?.[method] as
          | { summary?: unknown; responses?: Record<string, unknown> }
          | undefined;

        if (
          !operation?.summary ||
          !operation.responses ||
          Object.keys(operation.responses).length === 0
        ) {
          return `${method.toUpperCase()} ${routePath} (${file})`;
        }

        return null;
      })
      .filter(Boolean);

    expect(incompleteOperations).toEqual([]);
  });
});
