import { useCallback, useEffect } from "react";

/**
 * 封装浏览器 Notification API，处理权限请求与降级。
 * 若用户拒绝权限，静默降级，不抛出错误。
 */
export function useNotification() {
  // 组件挂载时请求通知权限
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission().then((perm) => {
        if (perm === "denied") {
          console.warn("[useNotification] 用户拒绝了通知权限，浏览器通知已禁用");
        }
      });
    }
  }, []);

  const notify = useCallback((title: string, body: string) => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    new Notification(title, { body });
  }, []);

  return { notify };
}
