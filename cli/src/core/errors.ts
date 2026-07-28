/**
 * 错误语义（退出码）：
 * - UsageError：参数、schema 或配置错误 -> exit(2)
 * - 其他 Error：运行或同步失败 -> exit(1)
 *
 * 见 index.ts handle()。
 */
export class UsageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UsageError';
  }
}
