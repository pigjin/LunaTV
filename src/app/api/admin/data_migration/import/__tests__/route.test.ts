import { gzipSync } from 'zlib';

import type { AdminConfig } from '@/lib/admin.types';

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

jest.mock('@/lib/auth', () => ({
  verifyAuth: jest.fn(),
}));

jest.mock('@/lib/config', () => ({
  configSelfCheck: jest.fn((config) => config),
  saveConfig: jest.fn(),
  setCachedConfig: jest.fn(),
}));

jest.mock('@/lib/crypto', () => ({
  SimpleCrypto: {
    decrypt: jest.fn(),
  },
}));

jest.mock('@/lib/db', () => ({
  db: {
    clearAllData: jest.fn(),
    getAdminConfig: jest.fn(),
    saveAdminConfig: jest.fn(),
    getAllUsers: jest.fn(),
    getAllPlayRecords: jest.fn(),
    getAllFavorites: jest.fn(),
    getSearchHistory: jest.fn(),
    getAllSkipConfigs: jest.fn(),
    restoreUserPassword: jest.fn(),
    registerUser: jest.fn(),
    addSearchHistory: jest.fn(),
    setSkipConfig: jest.fn(),
    storage: {
      setPlayRecord: jest.fn(),
      setFavorite: jest.fn(),
    },
  },
}));

const { verifyAuth } = jest.requireMock('@/lib/auth') as {
  verifyAuth: jest.Mock;
};
const { configSelfCheck, saveConfig } = jest.requireMock('@/lib/config') as {
  configSelfCheck: jest.Mock;
  saveConfig: jest.Mock;
};
const { SimpleCrypto } = jest.requireMock('@/lib/crypto') as {
  SimpleCrypto: {
    decrypt: jest.Mock;
  };
};
const { db } = jest.requireMock('@/lib/db') as {
  db: {
    clearAllData: jest.Mock;
    getAdminConfig: jest.Mock;
    saveAdminConfig: jest.Mock;
    getAllUsers: jest.Mock;
    getAllPlayRecords: jest.Mock;
    getAllFavorites: jest.Mock;
    getSearchHistory: jest.Mock;
    getAllSkipConfigs: jest.Mock;
    restoreUserPassword: jest.Mock;
    registerUser: jest.Mock;
    addSearchHistory: jest.Mock;
    setSkipConfig: jest.Mock;
    storage: {
      setPlayRecord: jest.Mock;
      setFavorite: jest.Mock;
    };
  };
};

const ORIGINAL_ENV = process.env;

function createAdminConfig(siteName: string): AdminConfig {
  return {
    ConfigFile: '',
    ConfigSubscribtion: {
      URL: '',
      AutoUpdate: false,
      LastCheck: '',
    },
    SiteConfig: {
      SiteName: siteName,
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
      Users: [
        {
          username: 'owner',
          role: 'owner',
          banned: false,
        },
      ],
    },
    SourceConfig: [],
    CustomCategories: [],
    LiveConfig: [],
  };
}

function encryptImportPayload(payload: unknown) {
  return gzipSync(JSON.stringify(payload)).toString('base64');
}

function createRequest(payload: unknown) {
  SimpleCrypto.decrypt.mockReturnValue(encryptImportPayload(payload));

  return {
    formData: async () =>
      new Map<string, unknown>([
        [
          'file',
          {
            text: async () => 'encrypted-data',
          },
        ],
        ['password', 'backup-password'],
      ]),
  } as never;
}

function mockExistingSnapshot(adminConfig = createAdminConfig('original')) {
  db.getAdminConfig.mockResolvedValue(adminConfig);
  db.getAllUsers.mockResolvedValue(['existing']);
  db.getAllPlayRecords.mockResolvedValue({});
  db.getAllFavorites.mockResolvedValue({});
  db.getSearchHistory.mockResolvedValue([]);
  db.getAllSkipConfigs.mockResolvedValue({});
}

describe('/api/admin/data_migration/import POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_STORAGE_TYPE: 'redis',
      USERNAME: 'owner',
    };
    verifyAuth.mockResolvedValue({ username: 'owner' });
    configSelfCheck.mockImplementation((config) => config);
    saveConfig.mockResolvedValue(undefined);
    db.clearAllData.mockResolvedValue(undefined);
    db.saveAdminConfig.mockResolvedValue(undefined);
    db.restoreUserPassword.mockResolvedValue(undefined);
    db.registerUser.mockResolvedValue(undefined);
    db.addSearchHistory.mockResolvedValue(undefined);
    db.setSkipConfig.mockResolvedValue(undefined);
    db.storage.setPlayRecord.mockResolvedValue(undefined);
    db.storage.setFavorite.mockResolvedValue(undefined);
    mockExistingSnapshot();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('does not clear current data when imported admin config fails self-check', async () => {
    configSelfCheck.mockImplementationOnce(() => {
      throw new Error('bad admin config');
    });

    const { POST } = await import('../route');
    const response = await POST(
      createRequest({
        data: {
          adminConfig: createAdminConfig('imported'),
          userData: {},
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(db.clearAllData).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('restores the previous snapshot when user data import fails after clearing data', async () => {
    const originalConfig = createAdminConfig('original');
    mockExistingSnapshot(originalConfig);
    db.getAllPlayRecords.mockResolvedValueOnce({
      'old+1': {
        title: 'Old',
      },
    });
    db.storage.setPlayRecord
      .mockRejectedValueOnce(new Error('play record restore failed'))
      .mockResolvedValue(undefined);

    const { POST } = await import('../route');
    const response = await POST(
      createRequest({
        data: {
          adminConfig: createAdminConfig('imported'),
          userData: {
            alice: {
              password: 'hashed-password',
              playRecords: {
                'src+1': {
                  title: 'Imported',
                },
              },
            },
          },
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(db.clearAllData).toHaveBeenCalledTimes(2);
    expect(saveConfig).toHaveBeenLastCalledWith(originalConfig);
    expect(db.storage.setPlayRecord).toHaveBeenLastCalledWith(
      'existing',
      'old+1',
      {
        title: 'Old',
      },
    );
  });

  it('restores imported user passwords exactly instead of rehashing them', async () => {
    const hashedPassword = 'a'.repeat(32) + ':' + 'b'.repeat(128);

    const { POST } = await import('../route');
    const response = await POST(
      createRequest({
        data: {
          adminConfig: createAdminConfig('imported'),
          userData: {
            alice: {
              password: hashedPassword,
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(db.restoreUserPassword).toHaveBeenCalledWith(
      'alice',
      hashedPassword,
    );
    expect(db.registerUser).not.toHaveBeenCalled();
  });
});
