import { decodeJwt, jwtVerify, SignJWT } from 'jose';

// 密钥，使用环境变量 PASSWORD
// 注意：必须确保服务端有 PASSWORD 环境变量
const SECRET_KEY = process.env.PASSWORD || 'default_secret_key_change_me';
const encodedKey = new TextEncoder().encode(SECRET_KEY);

export interface JWTPayload {
  username?: string;
  role: 'owner' | 'admin' | 'user';
  [key: string]: unknown;
}

/**
 * 生成 JWT
 * @param payload 载荷
 * @param expirationTime 过期时间，默认 7 天
 */
export async function signJWT(
  payload: JWTPayload,
  expirationTime = '7d'
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expirationTime)
    .sign(encodedKey);
}

/**
 * 生成 Access Token (短期有效，默认1小时)
 */
export async function signAccessToken(
  payload: JWTPayload,
  expirationTime = '1h'
): Promise<string> {
  return signJWT(payload, expirationTime);
}

/**
 * 生成 Refresh Token (长期有效，默认30天)
 */
export async function signRefreshToken(
  payload: JWTPayload,
  expirationTime = '30d'
): Promise<string> {
  return signJWT(payload, expirationTime);
}

/**
 * 验证 JWT (服务端使用)
 * @param token JWT 字符串
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ['HS256'],
    });
    return payload as JWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * 解析 JWT (不验证签名，仅获取 Payload，可用于客户端展示用户信息)
 * @param token JWT 字符串
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    return decodeJwt(token) as JWTPayload;
  } catch (error) {
    return null;
  }
}
