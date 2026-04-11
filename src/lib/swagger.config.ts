import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LunaTV API 文档',
      version: '1.0.0',
      description: 'LunaTV 项目的完整 API 接口文档',
      contact: {
        name: 'LunaTV',
      },
    },
    servers: [
      {
        url: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
        description: '开发服务器',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: '通过 Authorization 请求头传递的 JWT token，格式：Bearer {token}',
        },
      },
      parameters: {
        ClientPlatform: {
          in: 'header',
          name: 'X-Client-Platform',
          schema: {
            type: 'string',
            default: 'web',
            example: 'web',
          },
          required: false,
          description: '客户端平台标识 (如: web, ios, android, tv)。默认为 web。用于区分不同设备的多端登录。',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: '错误信息',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: '操作是否成功',
            },
          },
        },
        PlayRecord: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: '标题',
            },
            source_name: {
              type: 'string',
              description: '来源名称',
            },
            cover: {
              type: 'string',
              description: '封面图片URL',
            },
            year: {
              type: 'string',
              description: '年份',
            },
            index: {
              type: 'integer',
              description: '播放集数',
              minimum: 1,
            },
            total_episodes: {
              type: 'integer',
              description: '总集数',
            },
            play_time: {
              type: 'number',
              description: '播放进度（秒）',
            },
            total_time: {
              type: 'number',
              description: '总时长（秒）',
            },
            save_time: {
              type: 'number',
              description: '保存时间戳',
            },
            search_title: {
              type: 'string',
              description: '搜索时使用的标题',
            },
          },
        },
        Favorite: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: '标题',
            },
            source_name: {
              type: 'string',
              description: '来源名称',
            },
            cover: {
              type: 'string',
              description: '封面图片URL',
            },
            year: {
              type: 'string',
              description: '年份',
            },
            total_episodes: {
              type: 'integer',
              description: '总集数',
            },
            save_time: {
              type: 'number',
              description: '保存时间戳',
            },
            search_title: {
              type: 'string',
              description: '搜索时使用的标题',
            },
            origin: {
              type: 'string',
              enum: ['vod', 'live'],
              description: '来源类型',
            },
          },
        },
        SearchResult: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '视频ID',
            },
            title: {
              type: 'string',
              description: '标题',
            },
            poster: {
              type: 'string',
              description: '海报图片URL',
            },
            episodes: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '剧集列表（播放地址）',
            },
            episodes_titles: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '剧集标题列表',
            },
            source: {
              type: 'string',
              description: '来源代码',
            },
            source_name: {
              type: 'string',
              description: '来源名称',
            },
            class: {
              type: 'string',
              description: '分类',
            },
            year: {
              type: 'string',
              description: '年份',
            },
            desc: {
              type: 'string',
              description: '描述',
            },
            type_name: {
              type: 'string',
              description: '类型名称',
            },
            douban_id: {
              type: 'integer',
              description: '豆瓣ID',
            },
          },
        },
        LiveChannel: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '频道ID',
            },
            tvgId: {
              type: 'string',
              description: 'TVG ID',
            },
            name: {
              type: 'string',
              description: '频道名称',
            },
            logo: {
              type: 'string',
              description: '频道Logo URL',
            },
            group: {
              type: 'string',
              description: '频道分组',
            },
            url: {
              type: 'string',
              description: '播放地址',
            },
          },
        },
        EPGProgram: {
          type: 'object',
          properties: {
            start: {
              type: 'string',
              description: '开始时间',
            },
            end: {
              type: 'string',
              description: '结束时间',
            },
            title: {
              type: 'string',
              description: '节目名称',
            },
          },
        },
        MovieItem: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID',
            },
            title: {
              type: 'string',
              description: '标题',
            },
            poster: {
              type: 'string',
              description: '海报URL',
            },
            rate: {
              type: 'string',
              description: '评分',
            },
            year: {
              type: 'string',
              description: '年份',
            },
          },
        },
        MovieResult: {
          type: 'object',
          properties: {
            code: {
              type: 'integer',
              description: '状态码',
            },
            message: {
              type: 'string',
              description: '消息',
            },
            list: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/MovieItem',
              },
              description: '电影/电视剧列表',
            },
          },
        },
        SearchSuggestion: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '建议文本',
            },
            type: {
              type: 'string',
              enum: ['exact', 'related', 'suggestion'],
              description: '建议类型',
            },
            score: {
              type: 'number',
              description: '匹配分数',
            },
          },
        },
        ApiSite: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'API源标识',
            },
            name: {
              type: 'string',
              description: 'API源名称',
            },
            api: {
              type: 'string',
              description: 'API基础URL',
            },
            detail: {
              type: 'string',
              description: '详情页URL（可选）',
            },
          },
        },
        LiveSource: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: '直播源标识',
            },
            name: {
              type: 'string',
              description: '直播源名称',
            },
            url: {
              type: 'string',
              description: 'M3U播放列表URL',
            },
            ua: {
              type: 'string',
              description: 'User-Agent（可选）',
            },
            epg: {
              type: 'string',
              description: 'EPG节目单URL（可选）',
            },
            from: {
              type: 'string',
              enum: ['config', 'custom'],
              description: '来源类型',
            },
            channelNumber: {
              type: 'integer',
              description: '频道数量',
            },
            disabled: {
              type: 'boolean',
              description: '是否禁用',
            },
          },
        },
      },
    },
    tags: [
      { name: '认证', description: '用户认证相关接口' },
      { name: '搜索', description: '视频搜索相关接口' },
      { name: '详情', description: '视频详情相关接口' },
      { name: '收藏', description: '收藏管理相关接口' },
      { name: '播放记录', description: '播放记录相关接口' },
      { name: '直播', description: '直播相关接口' },
      { name: '豆瓣', description: '豆瓣相关接口' },
      { name: '番剧', description: '番剧相关接口' },
      { name: '管理', description: '管理员相关接口' },
      { name: '代理', description: '代理相关接口' },
      { name: '其他', description: '其他功能接口' },
    ],
  },
  apis: ['./src/app/api/**/*.ts'], // 扫描所有 API 路由文件
};

export const swaggerSpec = swaggerJsdoc(options);

