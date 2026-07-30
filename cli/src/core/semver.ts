/** semver 工具：仅支持 x.y.z 数字格式（无 pre-release/build），用于药典资产版本比较。 */

export const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

/** 缺省版本：未版本化资产 / 旧 lockfile（无 version 字段）一律视为 0.0.0 */
export const DEFAULT_VERSION = '0.0.0';

/** 归一化 version：空/缺省/非法格式 -> "0.0.0" */
export function normalizeVersion(v: string | undefined | null): string {
  return v && SEMVER_REGEX.test(v) ? v : DEFAULT_VERSION;
}

/** 比较：a < b -> -1，== -> 0，> -> 1。缺省视为 0.0.0。 */
export function compareSemver(a: string | undefined, b: string | undefined): number {
  const pa = normalizeVersion(a).split('.').map(Number);
  const pb = normalizeVersion(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/** 返回 versions 中 semver 最高的索引（version 缺省视为 0.0.0）。空数组返回 -1。 */
export function maxVersionIndex<T extends { version?: string }>(versions: T[]): number {
  if (versions.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < versions.length; i++) {
    if (compareSemver(versions[i].version, versions[best].version) > 0) best = i;
  }
  return best;
}
