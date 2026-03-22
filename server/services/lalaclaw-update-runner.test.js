import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseArgs,
  updateJob,
  waitForPortToClose,
} from './lalaclaw-update-runner.ts';

describe('parseArgs', () => {
  it('reads paired CLI flags into an option object', () => {
    expect(parseArgs([
      '--status-file', '/tmp/state.json',
      '--target-version', '2026.3.21-2',
      '--host', '127.0.0.1',
    ])).toEqual({
      'status-file': '/tmp/state.json',
      'target-version': '2026.3.21-2',
      host: '127.0.0.1',
    });
  });
});

describe('updateJob', () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length) {
      fs.rmSync(tempDirs.pop(), { force: true, recursive: true });
    }
  });

  it('normalizes and persists the update worker state file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lalaclaw-update-runner-'));
    tempDirs.push(tempDir);
    const statusFile = path.join(tempDir, 'lalaclaw-update-state.json');

    const job = updateJob(statusFile, {
      status: 'scheduled',
      targetVersion: '2026.3.21-2',
      currentVersionAtStart: '2026.3.21-1',
    });

    expect(job).toMatchObject({
      active: true,
      status: 'scheduled',
      targetVersion: '2026.3.21-2',
      currentVersionAtStart: '2026.3.21-1',
    });
    expect(JSON.parse(fs.readFileSync(statusFile, 'utf8'))).toMatchObject({
      active: true,
      status: 'scheduled',
      targetVersion: '2026.3.21-2',
      currentVersionAtStart: '2026.3.21-1',
    });
  });
});

describe('waitForPortToClose', () => {
  it('returns true immediately when no port is provided', async () => {
    await expect(waitForPortToClose('127.0.0.1', 0, 100)).resolves.toBe(true);
  });
});
