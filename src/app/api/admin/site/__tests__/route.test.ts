import type { AdminConfig } from '@/lib/admin.types';

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      body,
      headers: init?.headers,
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

jest.mock('@/lib/auth', () => ({
  verifyAuth: jest.fn(),
}));

jest.mock('@/lib/config', () => ({
  getConfig: jest.fn(),
  saveConfig: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {},
}));

const { verifyAuth } = jest.requireMock('@/lib/auth') as {
  verifyAuth: jest.Mock;
};
const { getConfig } = jest.requireMock('@/lib/config') as {
  getConfig: jest.Mock;
};
const { saveConfig } = jest.requireMock('@/lib/config') as {
  saveConfig: jest.Mock;
};

const ORIGINAL_ENV = process.env;

function createAdminConfig(): AdminConfig {
  return {
    ConfigFile: '',
    ConfigSubscribtion: {
      URL: '',
      AutoUpdate: false,
      LastCheck: '',
    },
    SiteConfig: {
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
      EnableWebLive: false,
    },
    UserConfig: {
      Users: [],
    },
    SourceConfig: [],
    CustomCategories: [],
    LiveConfig: [],
  };
}

function createSitePayload(enableWebLive: boolean) {
  return {
    SiteName: 'LunaTV',
    Announcement: 'hello',
    SearchDownstreamMaxPage: 5,
    SiteInterfaceCacheTime: 7200,
    DoubanProxyType: 'cmliussss-cdn-tencent',
    DoubanProxy: '',
    DoubanImageProxyType: 'cmliussss-cdn-tencent',
    DoubanImageProxy: '',
    DisableYellowFilter: false,
    FluidSearch: true,
    EnableWebLive: enableWebLive,
  };
}

function createRequest(body: unknown) {
  return {
    json: async () => body,
  } as never;
}

describe('/api/admin/site POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_STORAGE_TYPE: 'redis',
      USERNAME: 'owner',
    };
    verifyAuth.mockResolvedValue({ username: 'owner' });
    getConfig.mockResolvedValue(createAdminConfig());
    saveConfig.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('saves EnableWebLive true into SiteConfig', async () => {
    const { POST } = await import('../route');
    const response = await POST(createRequest(createSitePayload(true)));

    expect(response.status).toBe(200);
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        SiteConfig: expect.objectContaining({
          EnableWebLive: true,
        }),
      }),
    );
  });

  it('saves EnableWebLive false into SiteConfig', async () => {
    const { POST } = await import('../route');
    const response = await POST(createRequest(createSitePayload(false)));

    expect(response.status).toBe(200);
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        SiteConfig: expect.objectContaining({
          EnableWebLive: false,
        }),
      }),
    );
  });
});
