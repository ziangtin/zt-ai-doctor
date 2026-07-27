import type { AgentRenderer } from '../core/types.js';
import { claudeRenderer } from './claude.js';
import { cursorRenderer } from './cursor.js';

/** 已实现的 renderer 列表（Phase 2：Claude + Cursor） */
export const renderers: AgentRenderer[] = [claudeRenderer, cursorRenderer];
