import type { AdminConfig } from '@/lib/admin.types';

const ORIGINAL_ENV = process.env;

function createLegacyAdminConfig(
  siteConfigOverrides: Record<string, unknown> = {},
): AdminConfig {
  const siteConfig = {
    SiteName: 'LunaTV',
    Announcement: '',
    SearchDownstreamMaxPage: 5,
    SiteInterfaceCacheTime: 7200,
    DoubanProxyType: 'cmliussss-cdn-tencent',
    DoubanProxy: '',
    DoubanImageProxyType: 'cmliussss-cdn-tencent',
    DoubanImageProxy: '',
    DisableYellowFilter: false,
    FluidSearch: true,
    ...siteConfigOverrides,
  } as AdminConfig['SiteConfig'];

  return {
    ConfigFile: '',
    ConfigSubscribtion: {
      URL: '',
      AutoUpdate: false,
      LastCheck: '',
    },
    SiteConfig: siteConfig,
    UserConfig: {
      Users: [],
    },
    SourceConfig: [],
    CustomCategories: [],
    LiveConfig: [],
  };
}

function createCheckedAdminConfig(siteName: string): AdminConfig {
  return {
    ...createLegacyAdminConfig({
      SiteName: siteName,
      EnableWebLive: true,
    }),
    UserConfig: {
      Users: [
        {
          username: 'owner',
          role: 'owner',
          banned: false,
        },
      ],
    },
  };
}

describe('configSelfCheck', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, USERNAME: 'owner' };
    jest.doMock('@/lib/db', () => ({
      db: {
        getAdminConfig: jest.fn().mockResolvedValue(null),
        getAllUsers: jest.fn().mockResolvedValue([]),
        saveAdminConfig: jest.fn().mockResolvedValue(undefined),
      },
    }));
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('fills EnableWebLive from env when old database config is missing the field', async () => {
    process.env.NEXT_PUBLIC_ENABLE_WEB_LIVE = 'true';
    const config = createLegacyAdminConfig();
    const { configSelfCheck } = await import('@/lib/config');

    const checked = configSelfCheck(config);

    expect(checked.SiteConfig.EnableWebLive).toBe(true);
  });

  it('preserves EnableWebLive true from the database', async () => {
    process.env.NEXT_PUBLIC_ENABLE_WEB_LIVE = 'false';
    const config = createLegacyAdminConfig({ EnableWebLive: true });
    const { configSelfCheck } = await import('@/lib/config');

    const checked = configSelfCheck(config);

    expect(checked.SiteConfig.EnableWebLive).toBe(true);
  });

  it('preserves EnableWebLive false from the database', async () => {
    process.env.NEXT_PUBLIC_ENABLE_WEB_LIVE = 'true';
    const config = createLegacyAdminConfig({ EnableWebLive: false });
    const { configSelfCheck } = await import('@/lib/config');

    const checked = configSelfCheck(config);

    expect(checked.SiteConfig.EnableWebLive).toBe(false);
  });
});

describe('getConfig', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      USERNAME: 'owner',
      NEXT_PUBLIC_ENABLE_WEB_LIVE: 'true',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('waits for the self-checked config to be saved before resolving', async () => {
    const legacyConfig = createLegacyAdminConfig();
    let releaseSave: () => void = () => {};
    const getAdminConfig = jest.fn().mockResolvedValue(legacyConfig);
    const saveAdminConfig = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve;
        }),
    );

    jest.doMock('@/lib/db', () => ({
      db: {
        getAdminConfig,
        getAllUsers: jest.fn().mockResolvedValue([]),
        saveAdminConfig,
      },
    }));

    const { getConfig } = await import('@/lib/config');
    const resolved = jest.fn();
    const configPromise = getConfig().then((config) => {
      resolved(config.SiteConfig.EnableWebLive);
      return config;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getAdminConfig).toHaveBeenCalledTimes(1);
    expect(saveAdminConfig).toHaveBeenCalledTimes(1);
    expect(resolved).not.toHaveBeenCalled();

    releaseSave();
    const config = await configPromise;

    expect(config.SiteConfig.EnableWebLive).toBe(true);
    expect(resolved).toHaveBeenCalledWith(true);
  });

  it('fails closed when reading admin config throws and does not write defaults', async () => {
    const getAdminConfig = jest
      .fn()
      .mockRejectedValue(new Error('redis unavailable'));
    const saveAdminConfig = jest.fn().mockResolvedValue(undefined);

    jest.doMock('@/lib/db', () => ({
      db: {
        getAdminConfig,
        getAllUsers: jest.fn().mockResolvedValue([]),
        saveAdminConfig,
      },
    }));

    const { getConfig } = await import('@/lib/config');

    await expect(getConfig()).rejects.toThrow('redis unavailable');
    expect(saveAdminConfig).not.toHaveBeenCalled();
  });

  it('force refresh bypasses the cached admin config', async () => {
    const firstConfig = createCheckedAdminConfig('first');
    const secondConfig = createCheckedAdminConfig('second');
    const getAdminConfig = jest
      .fn()
      .mockResolvedValueOnce(firstConfig)
      .mockResolvedValueOnce(secondConfig);

    jest.doMock('@/lib/db', () => ({
      db: {
        getAdminConfig,
        getAllUsers: jest.fn().mockResolvedValue([]),
        saveAdminConfig: jest.fn().mockResolvedValue(undefined),
      },
    }));

    const { getConfig } = await import('@/lib/config');

    const cached = await getConfig();
    const refreshed = await getConfig({ forceRefresh: true });

    expect(cached.SiteConfig.SiteName).toBe('first');
    expect(refreshed.SiteConfig.SiteName).toBe('second');
    expect(getAdminConfig).toHaveBeenCalledTimes(2);
  });

  it('saveConfig updates the cache only after a successful write', async () => {
    const originalConfig = createCheckedAdminConfig('original');
    const failedConfig = createCheckedAdminConfig('failed');
    const savedConfig = createCheckedAdminConfig('saved');
    const getAdminConfig = jest.fn().mockResolvedValue(originalConfig);
    const saveAdminConfig = jest
      .fn()
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined);

    jest.doMock('@/lib/db', () => ({
      db: {
        getAdminConfig,
        getAllUsers: jest.fn().mockResolvedValue([]),
        saveAdminConfig,
      },
    }));

    const { getConfig, saveConfig } = await import('@/lib/config');

    await expect(saveConfig(failedConfig)).rejects.toThrow('write failed');
    const afterFailedSave = await getConfig();

    expect(afterFailedSave.SiteConfig.SiteName).toBe('original');

    await saveConfig(savedConfig);
    const afterSuccessfulSave = await getConfig();

    expect(afterSuccessfulSave.SiteConfig.SiteName).toBe('saved');
    expect(getAdminConfig).toHaveBeenCalledTimes(1);
  });

  it('initializes the default config only when deployment env is complete and storage is empty', async () => {
    process.env = {
      ...process.env,
      USERNAME: 'owner',
      PASSWORD: 'secret',
      NEXT_PUBLIC_STORAGE_TYPE: 'redis',
      REDIS_URL: 'redis://localhost:6379',
    };
    const getAdminConfig = jest.fn().mockResolvedValue(null);
    const hasAnyData = jest.fn().mockResolvedValue(false);
    const saveAdminConfig = jest.fn().mockResolvedValue(undefined);

    jest.doMock('@/lib/db', () => ({
      db: {
        getAdminConfig,
        getAllUsers: jest.fn().mockResolvedValue([]),
        hasAnyData,
        saveAdminConfig,
      },
    }));

    const { getConfig } = await import('@/lib/config');

    const config = await getConfig();

    expect(config.UserConfig.Users[0]).toMatchObject({
      username: 'owner',
      role: 'owner',
    });
    expect(hasAnyData).toHaveBeenCalledTimes(1);
    expect(saveAdminConfig).toHaveBeenCalledTimes(1);
  });

  it('does not initialize when required first-deploy env is missing', async () => {
    process.env = {
      ...process.env,
      USERNAME: 'owner',
      PASSWORD: '',
      NEXT_PUBLIC_STORAGE_TYPE: 'redis',
      REDIS_URL: 'redis://localhost:6379',
    };
    const hasAnyData = jest.fn().mockResolvedValue(false);
    const saveAdminConfig = jest.fn().mockResolvedValue(undefined);

    jest.doMock('@/lib/db', () => ({
      db: {
        getAdminConfig: jest.fn().mockResolvedValue(null),
        getAllUsers: jest.fn().mockResolvedValue([]),
        hasAnyData,
        saveAdminConfig,
      },
    }));

    const { getConfig } = await import('@/lib/config');

    await expect(getConfig()).rejects.toThrow('PASSWORD');
    expect(hasAnyData).not.toHaveBeenCalled();
    expect(saveAdminConfig).not.toHaveBeenCalled();
  });

  it('does not initialize when redis storage env is incomplete', async () => {
    process.env = {
      ...process.env,
      USERNAME: 'owner',
      PASSWORD: 'secret',
      NEXT_PUBLIC_STORAGE_TYPE: 'redis',
      REDIS_URL: '',
    };
    const hasAnyData = jest.fn().mockResolvedValue(false);
    const saveAdminConfig = jest.fn().mockResolvedValue(undefined);

    jest.doMock('@/lib/db', () => ({
      db: {
        getAdminConfig: jest.fn().mockResolvedValue(null),
        getAllUsers: jest.fn().mockResolvedValue([]),
        hasAnyData,
        saveAdminConfig,
      },
    }));

    const { getConfig } = await import('@/lib/config');

    await expect(getConfig()).rejects.toThrow('REDIS_URL');
    expect(hasAnyData).not.toHaveBeenCalled();
    expect(saveAdminConfig).not.toHaveBeenCalled();
  });

  it('does not initialize when admin config is missing but storage already has data', async () => {
    process.env = {
      ...process.env,
      USERNAME: 'owner',
      PASSWORD: 'secret',
      NEXT_PUBLIC_STORAGE_TYPE: 'kvrocks',
      KVROCKS_URL: 'redis://localhost:6666',
    };
    const hasAnyData = jest.fn().mockResolvedValue(true);
    const saveAdminConfig = jest.fn().mockResolvedValue(undefined);

    jest.doMock('@/lib/db', () => ({
      db: {
        getAdminConfig: jest.fn().mockResolvedValue(null),
        getAllUsers: jest.fn().mockResolvedValue([]),
        hasAnyData,
        saveAdminConfig,
      },
    }));

    const { getConfig } = await import('@/lib/config');

    await expect(getConfig()).rejects.toThrow('后台配置缺失');
    expect(hasAnyData).toHaveBeenCalledTimes(1);
    expect(saveAdminConfig).not.toHaveBeenCalled();
  });

  it('does not check storage emptiness when admin config already exists', async () => {
    process.env = {
      ...process.env,
      USERNAME: 'owner',
      PASSWORD: 'secret',
      NEXT_PUBLIC_STORAGE_TYPE: 'upstash',
      UPSTASH_URL: 'https://example.upstash.io',
      UPSTASH_TOKEN: 'token',
    };
    const hasAnyData = jest.fn().mockResolvedValue(true);

    jest.doMock('@/lib/db', () => ({
      db: {
        getAdminConfig: jest
          .fn()
          .mockResolvedValue(createCheckedAdminConfig('existing')),
        getAllUsers: jest.fn().mockResolvedValue([]),
        hasAnyData,
        saveAdminConfig: jest.fn().mockResolvedValue(undefined),
      },
    }));

    const { getConfig } = await import('@/lib/config');

    const config = await getConfig();

    expect(config.SiteConfig.SiteName).toBe('existing');
    expect(hasAnyData).not.toHaveBeenCalled();
  });
});
