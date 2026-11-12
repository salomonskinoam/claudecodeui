import os from 'node:os';
import path from 'node:path';
import { open, readFile } from 'node:fs/promises';

import { sessionsDb } from '@/modules/database/index.js';
import {
  buildLookupMap,
  extractFirstValidJsonlData,
  findFilesRecursivelyCreatedAfter,
  normalizeSessionName,
  readFileTimestamps,
} from '@/shared/utils.js';
import type { IProviderSessionSynchronizer } from '@/shared/interfaces.js';
import { isSideChat } from '@/modules/about/index.js';

type ParsedSession = {
  sessionId: string;
  projectPath: string;
  sessionName?: string;
  /** quests: the transcript's own title (a /rename, else Claude's title); it replaces a stored name, see `storeName`. */
  renamed?: string;
};

/**
 * Session indexer for Claude transcript artifacts.
 */
/** quests: per transcript, how far the title scan has read and the last titles it saw. */
const titleScans = new Map<string, { size: number; custom: string | undefined; ai: string | undefined }>();
const TITLE_EVENTS: Array<[Buffer, string, string]> = [
  [Buffer.from('"type":"custom-title"'), 'custom-title', 'customTitle'],
  [Buffer.from('"type":"ai-title"'), 'ai-title', 'aiTitle'],
];

export class ClaudeSessionSynchronizer implements IProviderSessionSynchronizer {
  private readonly provider = 'claude' as const;
  private readonly claudeHome = path.join(os.homedir(), '.claude');

  /**
   * Returns true when a JSONL file is a subagent transcript or tool result
   * rather than a top-level session.
   *
   * Claude stores subagent transcripts under a `subagents/` directory and
   * tool results under a `tool-results/` directory, e.g.
   * `~/.claude/projects/<encoded-cwd>/<session-id>/subagents/agent-<id>.jsonl`.
   * Those files repeat the parent session's `sessionId`, so indexing them as
   * standalone sessions overwrites the parent row's `jsonl_path` and corrupts
   * the main session record. The recursive scan in `synchronize()` reaches
   * them, so both entry points must skip them.
   */
  private isSubagentTranscript(filePath: string): boolean {
    const pathParts = path.normalize(filePath).split(path.sep);
    return pathParts.includes('subagents') || pathParts.includes('tool-results');
  }

  /**
   * Scans ~/.claude/projects and upserts discovered sessions into DB.
   */
  async synchronize(since?: Date): Promise<number> {
    const nameMap = await buildLookupMap(path.join(this.claudeHome, 'history.jsonl'), 'sessionId', 'display');
    const files = await findFilesRecursivelyCreatedAfter(
      path.join(this.claudeHome, 'projects'),
      '.jsonl',
      since ?? null
    );

    let processed = 0;
    for (const filePath of files) {
      if (this.isSubagentTranscript(filePath)) {
        continue;
      }

      const parsed = await this.processSessionFile(filePath, nameMap);
      if (!parsed) {
        continue;
      }

      await this.store(parsed, filePath);
      processed += 1;
    }

    return processed;
  }

  /**
   * Parses and upserts one Claude session JSONL file.
   */
  async synchronizeFile(filePath: string): Promise<string | null> {
    if (!filePath.endsWith('.jsonl')) {
      return null;
    }
    if (this.isSubagentTranscript(filePath)) {
      return null;
    }

    const nameMap = await buildLookupMap(path.join(this.claudeHome, 'history.jsonl'), 'sessionId', 'display');
    const parsed = await this.processSessionFile(filePath, nameMap);
    if (!parsed) {
      return null;
    }

    return this.store(parsed, filePath);
  }

  /**
   * Upserts the session row. The upsert keeps a stored name on a session the page created (its id differs from
   * Claude's), so the first message's head, which the page stores at creation, would stand forever. quests: a
   * title in the transcript (a /rename, else Claude's title) is the chat's name everywhere and replaces it.
   */
  private async store(parsed: ParsedSession, filePath: string): Promise<string> {
    const timestamps = await readFileTimestamps(filePath);
    const sessionId = sessionsDb.createSession(
      parsed.sessionId,
      this.provider,
      parsed.projectPath,
      parsed.sessionName,
      timestamps.createdAt,
      timestamps.updatedAt,
      filePath
    );
    if (parsed.renamed && sessionsDb.getSessionById(sessionId)?.custom_name !== parsed.renamed) {
      sessionsDb.updateSessionCustomName(sessionId, parsed.renamed);
    }
    return sessionId;
  }

  /**
   * Extracts session metadata from one Claude JSONL session file.
   */
  private async processSessionFile(
    filePath: string,
    nameMap: Map<string, string>
  ): Promise<ParsedSession | null> {
    const parsed = await extractFirstValidJsonlData(filePath, (rawData) => {
      const data = rawData as Record<string, unknown>;
      const sessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;
      const projectPath = typeof data.cwd === 'string' ? data.cwd : undefined;

      if (!sessionId || !projectPath) {
        return null;
      }

      return {
        sessionId,
        projectPath,
      };
    });

    // quests: an About side chat of the Summary drawer is a copy of a chat, not a chat.
    if (!parsed || isSideChat(parsed.sessionId)) {
      return null;
    }

    // quests: the name set with /rename (in an IDE or the CLI) wins over every other name.
    const renamed = await this.extractCustomTitle(filePath);
    if (renamed) {
      const sessionName = normalizeSessionName(renamed, 'Untitled Claude Session');
      return { ...parsed, sessionName, renamed: sessionName };
    }

    // App-created sessions are keyed by an app id, so disk-discovered provider
    // ids must be resolved through the provider-id mapping first.
    const existingSession = sessionsDb.getSessionByProviderSessionId(parsed.sessionId)
      ?? sessionsDb.getSessionById(parsed.sessionId);
    const existingSessionName = existingSession?.custom_name;
    if (existingSessionName && existingSessionName !== 'Untitled Claude Session') {
      return {
        ...parsed,
        sessionName: normalizeSessionName(existingSessionName, 'Untitled Claude Session'),
      };
    }

    let sessionName = await this.extractSessionTitle(filePath, parsed.sessionId);
    if (!sessionName) {
      sessionName = nameMap.get(parsed.sessionId);
    }

    return {
      ...parsed,
      sessionName: normalizeSessionName(sessionName, 'Untitled Claude Session'),
    };
  }

  /** quests: the last /rename title in a transcript, if any. */
  /**
   * quests: the title Cursor shows, from the transcript: the last /rename title, else the last title Claude Code
   * generated (ai-title). Either wins over a stored name, so the page and the IDE show the same name; a chat
   * with neither keeps its stored name (the first prompt).
   */
  private async extractCustomTitle(filePath: string): Promise<string | undefined> {
    // A transcript only grows: each sync reads only the bytes added since the last one, in 1 MB pieces, and keeps
    // the last titles seen. Reading the whole file on every write (a 200 MB transcript, about 9 writes a minute)
    // ran the server out of memory (12 Nov). A file that shrank (an edit) is read again from the start.
    const handle = await open(filePath, 'r');
    try {
      const { size } = await handle.stat();
      const known = titleScans.get(filePath);
      const scan = known && known.size <= size ? known : { size: 0, custom: undefined, ai: undefined };
      let at = scan.size;
      let carry = Buffer.alloc(0);
      while (at < size) {
        const piece = Buffer.alloc(Math.min(1 << 20, size - at));
        const { bytesRead } = await handle.read(piece, 0, piece.length, at);
        if (bytesRead === 0) break;
        at += bytesRead;
        // ponytail: a line longer than 1 MB is joined piece by piece; rare (a pasted image), fine.
        const data = carry.length ? Buffer.concat([carry, piece.subarray(0, bytesRead)]) : piece.subarray(0, bytesRead);
        const lastLineEnd = data.lastIndexOf(10);
        if (lastLineEnd < 0) {
          carry = data;
          continue;
        }
        for (const [needle, type, field] of TITLE_EVENTS) {
          for (let hit = data.indexOf(needle); hit >= 0 && hit <= lastLineEnd; hit = data.indexOf(needle, hit + 1)) {
            const lineStart = data.lastIndexOf(10, hit) + 1;
            const lineEnd = data.indexOf(10, hit);
            try {
              const event = JSON.parse(data.toString('utf8', lineStart, lineEnd)) as Record<string, unknown>;
              const title = event.type === type ? event[field] : undefined;
              if (typeof title === 'string' && title.trim()) scan[type === 'custom-title' ? 'custom' : 'ai'] = title;
            } catch {
              // a line that is not JSON holds no title
            }
          }
        }
        carry = Buffer.from(data.subarray(lastLineEnd + 1));
      }
      scan.size = at - carry.length;
      titleScans.set(filePath, scan);
      return scan.custom ?? scan.ai;
    } finally {
      await handle.close();
    }
  }

  /**
   * Returns the best available title for one session from its transcript.
   *
   * Scans forward keeping the last match of each event type, then prefers
   * `custom-title` (a manual `/rename`) over `ai-title` over `last-prompt`.
   * Claude writes `custom-title` immediately before `ai-title`, so a reverse
   * scan that returns its first hit would always lose the manual rename.
   *
   * Returns undefined on a missing or unreadable file so sync can continue.
   */
  private async extractSessionTitle(
    filePath: string,
    sessionId: string
  ): Promise<string | undefined> {
    try {
      const content = await readFile(filePath, 'utf8');
      const lines = content.split(/\r?\n/);

      let foundCustomTitle: string | undefined;
      let foundAiTitle: string | undefined;
      let foundLastPrompt: string | undefined;

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]?.trim();
        if (!line) {
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }

        const data = parsed as Record<string, unknown>;
        const eventType = typeof data.type === 'string' ? data.type : undefined;
        const eventSessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;

        if (eventSessionId !== sessionId) {
          continue;
        }

        if (eventType === 'custom-title') {
          const title = typeof data.customTitle === 'string' ? data.customTitle : undefined;
          if (title?.trim()) {
            foundCustomTitle = title;
          }
        } else if (eventType === 'ai-title') {
          const title = typeof data.aiTitle === 'string' ? data.aiTitle : undefined;
          if (title?.trim()) {
            foundAiTitle = title;
          }
        } else if (eventType === 'last-prompt') {
          const prompt = typeof data.lastPrompt === 'string' ? data.lastPrompt : undefined;
          if (prompt?.trim()) {
            foundLastPrompt = prompt;
          }
        }
      }

      return foundCustomTitle || foundAiTitle || foundLastPrompt;
    } catch {
      // Ignore missing/unreadable files so sync can continue.
    }

    return undefined;
  }
}
