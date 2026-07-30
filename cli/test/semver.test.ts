import { describe, it, expect } from 'vitest';
import {
  SEMVER_REGEX,
  DEFAULT_VERSION,
  normalizeVersion,
  compareSemver,
  maxVersionIndex,
} from '../src/core/semver.js';

describe('normalizeVersion', () => {
  it('合法 semver 原样返回', () => {
    expect(normalizeVersion('1.0.0')).toBe('1.0.0');
    expect(normalizeVersion('0.10.99')).toBe('0.10.99');
  });
  it('空/缺省 -> 0.0.0', () => {
    expect(normalizeVersion(undefined)).toBe(DEFAULT_VERSION);
    expect(normalizeVersion(null)).toBe(DEFAULT_VERSION);
    expect(normalizeVersion('')).toBe(DEFAULT_VERSION);
  });
  it('非法格式 -> 0.0.0', () => {
    expect(normalizeVersion('1.0')).toBe(DEFAULT_VERSION);
    expect(normalizeVersion('1.0.0-beta')).toBe(DEFAULT_VERSION);
    expect(normalizeVersion('v1.0.0')).toBe(DEFAULT_VERSION);
  });
});

describe('compareSemver', () => {
  it('相等 -> 0', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });
  it('patch 比较', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
    expect(compareSemver('1.0.2', '1.0.1')).toBe(1);
  });
  it('minor 比较', () => {
    expect(compareSemver('1.1.0', '1.0.9')).toBe(1);
    expect(compareSemver('1.0.9', '1.1.0')).toBe(-1);
  });
  it('major 比较', () => {
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1);
    expect(compareSemver('1.99.99', '2.0.0')).toBe(-1);
  });
  it('缺省视为 0.0.0', () => {
    expect(compareSemver(undefined, '0.0.0')).toBe(0);
    expect(compareSemver('1.0.0', undefined)).toBe(1);
    expect(compareSemver(undefined, undefined)).toBe(0);
  });
});

describe('maxVersionIndex', () => {
  it('返回最高版本索引', () => {
    const vs = [{ version: '1.0.0' }, { version: '1.2.0' }, { version: '1.1.0' }];
    expect(maxVersionIndex(vs)).toBe(1);
  });
  it('单元素返回 0', () => {
    expect(maxVersionIndex([{ version: '1.0.0' }])).toBe(0);
  });
  it('空数组返回 -1', () => {
    expect(maxVersionIndex([])).toBe(-1);
  });
  it('version 缺省视为 0.0.0 参与比较', () => {
    expect(maxVersionIndex([{ version: undefined }, { version: '1.0.0' }])).toBe(1);
    expect(maxVersionIndex([{ version: '1.0.0' }, { version: undefined }])).toBe(0);
  });
});

describe('SEMVER_REGEX', () => {
  it('合法格式', () => {
    expect(SEMVER_REGEX.test('1.0.0')).toBe(true);
    expect(SEMVER_REGEX.test('0.0.0')).toBe(true);
  });
  it('拒绝非法格式', () => {
    expect(SEMVER_REGEX.test('1.0')).toBe(false);
    expect(SEMVER_REGEX.test('1.0.0-beta')).toBe(false);
    expect(SEMVER_REGEX.test('v1.0.0')).toBe(false);
  });
});
