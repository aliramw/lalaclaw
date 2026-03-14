const fs = require('node:fs');
const path = require('node:path');

function getFileManagerLabel(platform = process.platform) {
  if (platform === 'darwin') {
    return 'Finder';
  }
  if (platform === 'win32') {
    return 'Explorer';
  }
  return 'Folder';
}

function createFileManagerHandler({
  execFileAsync,
  parseRequestBody,
  sendJson,
  platform = process.platform,
}) {
  function validateTargetPath(candidate) {
    const targetPath = String(candidate || '').trim();
    if (!targetPath || !path.isAbsolute(targetPath)) {
      return { error: 'Invalid file path' };
    }

    try {
      const stat = fs.statSync(targetPath);
      return { path: targetPath, stat };
    } catch {
      return { error: 'File not found' };
    }
  }

  async function revealInFileManager(targetPath) {
    if (platform === 'darwin') {
      await execFileAsync('open', ['-R', targetPath]);
      return;
    }

    if (platform === 'win32') {
      await execFileAsync('explorer.exe', ['/select,', targetPath]);
      return;
    }

    const openTarget = fs.statSync(targetPath).isDirectory() ? targetPath : path.dirname(targetPath);
    await execFileAsync('xdg-open', [openTarget]);
  }

  return async function handleFileManagerReveal(req, res) {
    try {
      const body = await parseRequestBody(req);
      const validated = validateTargetPath(body?.path);
      if (validated.error) {
        sendJson(res, 400, { ok: false, error: validated.error });
        return;
      }

      await revealInFileManager(validated.path);
      sendJson(res, 200, {
        ok: true,
        label: getFileManagerLabel(platform),
        path: validated.path,
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || 'Reveal in file manager failed' });
    }
  };
}

module.exports = {
  createFileManagerHandler,
  getFileManagerLabel,
};
