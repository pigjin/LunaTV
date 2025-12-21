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
            save_time: {
              type: 'number',
              description: '保存时间戳',
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
            index: {
              type: 'integer',
              description: '播放集数',
              minimum: 1,
            },
            save_time: {
              type: 'number',
              description: '保存时间戳',
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

