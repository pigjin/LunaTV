'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getToken } from '@/lib/auth-client';

// 不需要鉴权的路径
const PUBLIC_PATHS = [
  '/login',
  '/warning',
  '/_next',
  '/favicon.ico',
];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // 检查是否是公共路径
    const isPublicPath = PUBLIC_PATHS.some(path => pathname.startsWith(path));

    if (isPublicPath) {
      Promise.resolve().then(() => {
        setAuthorized(true);
      });
      return;
    }

    // 检查是否有 Token
    const token = getToken();
    if (!token) {
      // 没有 Token，重定向到登录页
      const loginUrl = new URL('/login', window.location.origin);
      loginUrl.searchParams.set('redirect', pathname);
      router.replace(loginUrl.toString());
    } else {
      Promise.resolve().then(() => {
        setAuthorized(true);
      });
    }
  }, [pathname, router]);

  // 如果正在鉴权中，显示空白或 Loading
  // 对于公共路径，authorized 会很快变为 true
  // 对于受保护路径，如果没有 Token 会跳转，如果有 Token 会变为 true
  if (!authorized) {
    return null; // 或者 <div className="min-h-screen bg-black" /> 防止闪烁
  }

  return <>{children}</>;
}
