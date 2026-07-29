import type { AgentRenderer } from '../core/types.js';
import { claudeRenderer } from './claude.js';
import { cursorRenderer } from './cursor.js';
import { copilotRenderer } from './copilot.js';
import { codexRenderer } from './codex.js';
import { clineRenderer } from './cline.js';
import { windsurfRenderer } from './windsurf.js';

/** 已实现的 renderer 列表（Phase 2：Claude + Cursor；Phase 7：Copilot/Codex/Cline/Windsurf） */
export const renderers: AgentRenderer[] = [
  claudeRenderer,
  cursorRenderer,
  copilotRenderer,
  codexRenderer,
  clineRenderer,
  windsurfRenderer,
];
