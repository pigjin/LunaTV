function createRedisClientMock(overrides: Record<string, unknown> = {}) {
  return {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    keys: jest.fn().mockResolvedValue([]),
    isOpen: true,
    ...overrides,
  };
}

describe('storage hasAnyData', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = ORIGINAL_ENV;
    delete (global as Record<symbol, unknown>)[
      Symbol.for('__MOONTV_UPSTASH_REDIS_CLIENT__')
    ];
  });

  async function createRedisStorage(
    client: ReturnType<typeof createRedisClientMock>,
  ) {
    jest.resetModules();
    jest.doMock('redis', () => ({
      createClient: jest.fn(() => client),
    }));
    const { BaseRedisStorage } = await import('@/lib/redis-base.db');

    class TestRedisStorage extends BaseRedisStorage {
      constructor() {
        super(
          {
            url: 'redis://localhost:6379',
            clientName: 'Redis',
          },
          Symbol('test-redis-client'),
        );
      }
    }

    return new TestRedisStorage();
  }

  async function createUpstashStorage(
    client: ReturnType<typeof createRedisClientMock>,
  ) {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      UPSTASH_URL: 'https://example.upstash.io',
      UPSTASH_TOKEN: 'token',
    };
    jest.doMock('@upstash/redis', () => ({
      Redis: jest.fn(() => client),
    }));
    const { UpstashRedisStorage } = await import('@/lib/upstash.db');

    return new UpstashRedisStorage();
  }

  it('detects existing data in Redis-compatible storage when any known key pattern matches', async () => {
    const client = createRedisClientMock({
      keys: jest.fn((pattern: string) =>
        Promise.resolve(pattern === 'u:*:fav:*' ? ['u:bob:fav:site+1'] : []),
      ),
    });
    const storage = await createRedisStorage(client);

    await expect(storage.hasAnyData()).resolves.toBe(true);
    expect(client.get).toHaveBeenCalledWith('admin:config');
    expect(client.keys).toHaveBeenCalledWith('u:*:fav:*');
  });

  it('reports Redis-compatible storage as empty when no known keys exist', async () => {
    const client = createRedisClientMock();
    const storage = await createRedisStorage(client);

    await expect(storage.hasAnyData()).resolves.toBe(false);
    expect(client.get).toHaveBeenCalledWith('admin:config');
    expect(client.keys).toHaveBeenCalledWith('rtu:*');
  });

  it('detects existing data in Upstash storage when any known key pattern matches', async () => {
    const client = createRedisClientMock({
      keys: jest.fn((pattern: string) =>
        Promise.resolve(pattern === 'rt:*' ? ['rt:web:token'] : []),
      ),
    });
    const storage = await createUpstashStorage(client);

    await expect(storage.hasAnyData()).resolves.toBe(true);
    expect(client.get).toHaveBeenCalledWith('admin:config');
    expect(client.keys).toHaveBeenCalledWith('rt:*');
  });

  it('reports Upstash storage as empty when no known keys exist', async () => {
    const client = createRedisClientMock();
    const storage = await createUpstashStorage(client);

    await expect(storage.hasAnyData()).resolves.toBe(false);
    expect(client.get).toHaveBeenCalledWith('admin:config');
    expect(client.keys).toHaveBeenCalledWith('rtu:*');
  });
});
