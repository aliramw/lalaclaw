import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

type WorkspaceTreeItem = {
  name: string;
  path: string;
  fullPath: string;
  kind: '目录' | '文件';
  hasChildren: boolean;
  children?: WorkspaceTreeItem[];
};

type JsonSender = (res: unknown, status: number, body: Record<string, unknown>) => void;

function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
  const normalizedRoot = path.resolve(String(rootPath || '').trim());
  const normalizedTarget = path.resolve(String(targetPath || '').trim());
  if (!normalizedRoot || !normalizedTarget) {
    return false;
  }
  if (normalizedRoot === normalizedTarget) {
    return true;
  }
  return normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

function directoryHasVisibleChildren(targetPath: string): boolean {
  try {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    return entries.some((entry) => entry?.name && !entry.name.startsWith('.') && entry.name !== '.git' && entry.name !== 'node_modules');
  } catch {
    return false;
  }
}

function escapeRegexCharacters(value = ''): string {
  return String(value || '').replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function buildWorkspaceFilterMatcher(rawFilter = '', workspaceRoot = '') {
  const filters = String(rawFilter || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!filters.length) {
    return null;
  }

  const normalizedRoot = path.resolve(String(workspaceRoot || '').trim());
  const compiledFilters = filters.map((filter) => {
    if (filter.includes('*') || filter.includes('?')) {
      const expression = `^${escapeRegexCharacters(filter).replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`;
      return { type: 'glob' as const, regex: new RegExp(expression, 'i') };
    }

    return { type: 'text' as const, value: filter.toLocaleLowerCase() };
  });

  return (targetPath: string) => {
    const resolvedPath = path.resolve(String(targetPath || '').trim());
    const relativePath =
      normalizedRoot && resolvedPath.startsWith(`${normalizedRoot}${path.sep}`)
        ? resolvedPath.slice(normalizedRoot.length + 1)
        : path.basename(resolvedPath);
    const fileName = path.basename(resolvedPath);
    const candidates = [fileName, relativePath].filter(Boolean);

    return compiledFilters.some((filter) => {
      if (filter.type === 'glob') {
        return candidates.some((candidate) => filter.regex.test(candidate));
      }
      return candidates.some((candidate) => candidate.toLocaleLowerCase().includes(filter.value));
    });
  };
}

function listDirectoryChildren(targetPath: string): WorkspaceTreeItem[] {
  return fs
    .readdirSync(targetPath, { withFileTypes: true })
    .filter((entry) => entry?.name && !entry.name.startsWith('.') && entry.name !== '.git' && entry.name !== 'node_modules')
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
    })
    .map((entry) => {
      const fullPath = path.join(targetPath, entry.name);
      return {
        name: entry.name,
        path: fullPath,
        fullPath,
        kind: entry.isDirectory() ? '目录' : '文件',
        hasChildren: entry.isDirectory() ? directoryHasVisibleChildren(fullPath) : false,
      };
    });
}

function listFilteredTree(targetPath: string, matcher: (targetPath: string) => boolean): WorkspaceTreeItem[] {
  let entries: fs.Dirent[] = [];

  try {
    entries = fs.readdirSync(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const visibleEntries = entries
    .filter((entry) => entry?.name && !entry.name.startsWith('.') && entry.name !== '.git' && entry.name !== 'node_modules')
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
    });

  return visibleEntries.reduce<WorkspaceTreeItem[]>((items, entry) => {
    const fullPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      const children = listFilteredTree(fullPath, matcher);
      if (children.length) {
        items.push({
          name: entry.name,
          path: fullPath,
          fullPath,
          kind: '目录',
          hasChildren: true,
          children,
        });
      }
      return items;
    }

    if (entry.isFile() && matcher(fullPath)) {
      items.push({
        name: entry.name,
        path: fullPath,
        fullPath,
        kind: '文件',
        hasChildren: false,
      });
    }

    return items;
  }, []);
}

export function createWorkspaceTreeHandler({
  normalizeSessionUser,
  resolveAgentWorkspace,
  resolveSessionAgentId,
  sendJson,
}: {
  normalizeSessionUser: (value: string) => string;
  resolveAgentWorkspace: (agentId: string) => string;
  resolveSessionAgentId: (sessionUser: string) => string;
  sendJson: JsonSender;
}) {
  return function handleWorkspaceTree(req: { url?: string; headers: { host?: string } }, res: unknown) {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const sessionUser = normalizeSessionUser(url.searchParams.get('sessionUser') || 'command-center');
      const requestedAgentId = String(url.searchParams.get('agentId') || '').trim();
      const agentId = requestedAgentId || resolveSessionAgentId(sessionUser);
      const workspaceRoot = resolveAgentWorkspace(agentId);
      const filter = String(url.searchParams.get('filter') || '').trim();
      const requestedPath = decodeURIComponent(url.searchParams.get('path') || workspaceRoot);
      const targetPath = path.resolve(String(requestedPath || '').trim() || workspaceRoot);

      if (!workspaceRoot || !path.isAbsolute(workspaceRoot)) {
        sendJson(res, 400, { ok: false, error: 'Workspace root unavailable' });
        return;
      }

      if (!isPathInsideRoot(workspaceRoot, targetPath)) {
        sendJson(res, 403, { ok: false, error: 'Path is outside the workspace root' });
        return;
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(targetPath);
      } catch {
        sendJson(res, 404, { ok: false, error: 'Workspace path not found' });
        return;
      }

      if (!stat.isDirectory()) {
        sendJson(res, 400, { ok: false, error: 'Workspace path must be a directory' });
        return;
      }

      if (filter) {
        const matcher = buildWorkspaceFilterMatcher(filter, workspaceRoot);
        sendJson(res, 200, {
          ok: true,
          workspaceRoot,
          path: targetPath,
          filter,
          items: matcher ? listFilteredTree(targetPath, matcher) : [],
        });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        workspaceRoot,
        path: targetPath,
        items: listDirectoryChildren(targetPath),
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: (error as { message?: string } | null)?.message || 'Workspace tree failed',
      });
    }
  };
}
