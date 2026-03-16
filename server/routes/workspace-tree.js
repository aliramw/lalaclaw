const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

function isPathInsideRoot(rootPath, targetPath) {
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

function directoryHasVisibleChildren(targetPath) {
  try {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    return entries.some((entry) => entry?.name && !entry.name.startsWith('.') && entry.name !== '.git' && entry.name !== 'node_modules');
  } catch {
    return false;
  }
}

function escapeRegexCharacters(value = '') {
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
      return { type: 'glob', regex: new RegExp(expression, 'i') };
    }

    return { type: 'text', value: filter.toLocaleLowerCase() };
  });

  return (targetPath) => {
    const resolvedPath = path.resolve(String(targetPath || '').trim());
    const relativePath = normalizedRoot && resolvedPath.startsWith(`${normalizedRoot}${path.sep}`)
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

function listDirectoryChildren(targetPath) {
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

function listFilteredTree(targetPath, workspaceRoot, matcher) {
  let entries = [];

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

  return visibleEntries.reduce((items, entry) => {
    const fullPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      const children = listFilteredTree(fullPath, workspaceRoot, matcher);
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

function createWorkspaceTreeHandler({
  normalizeSessionUser,
  resolveAgentWorkspace,
  resolveSessionAgentId,
  sendJson,
}) {
  return function handleWorkspaceTree(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
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

      let stat;
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
        sendJson(res, 200, {
          ok: true,
          workspaceRoot,
          path: targetPath,
          filter,
          items: listFilteredTree(targetPath, workspaceRoot, buildWorkspaceFilterMatcher(filter, workspaceRoot)),
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
      sendJson(res, 500, { ok: false, error: error.message || 'Workspace tree failed' });
    }
  };
}

module.exports = {
  createWorkspaceTreeHandler,
};
