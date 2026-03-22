import { describe, expect, it } from 'vitest';
import { createDevWorkspaceRestartService } from './dev-workspace-restart.ts';

describe('createDevWorkspaceRestartService', () => {
  it('returns current branch metadata, switchable branches, and worktrees in restart state', () => {
    const service = createDevWorkspaceRestartService({
      backendHost: '127.0.0.1',
      backendPort: 3000,
      fileExists: () => true,
      processEnv: {},
      processExecPath: '/usr/local/bin/node',
      processPid: 123,
      projectRoot: '/tmp/lalaclaw',
      readJsonIfExists: () => ({
        restartId: 'restart-1',
        status: 'idle',
      }),
      spawnSyncImpl: (_command, args) => {
        if (args[0] === 'symbolic-ref') {
          return { status: 0, stdout: 'feature/demo\n', stderr: '' };
        }
        if (args[0] === 'for-each-ref') {
          if (args[3] === 'refs/heads') {
            return { status: 0, stdout: 'feature/demo\nmain\n', stderr: '' };
          }
          return { status: 0, stdout: 'HEAD\ncodex/update-tailwind\nmain\n', stderr: '' };
        }
        if (args[0] === 'worktree') {
          return {
            status: 0,
            stdout: [
              'worktree /tmp/lalaclaw',
              'HEAD 1111111',
              'branch refs/heads/feature/demo',
              '',
              'worktree /tmp/lalaclaw-c11c',
              'HEAD 2222222',
              'detached',
              '',
            ].join('\n'),
            stderr: '',
          };
        }
        return { status: 1, stdout: '', stderr: '' };
      },
      stateDir: '/tmp/lalaclaw-state',
    });

    expect(service.getDevWorkspaceRestartState()).toEqual(expect.objectContaining({
      ok: true,
      available: true,
      currentBranch: 'feature/demo',
      branches: ['codex/update-tailwind', 'feature/demo', 'main'],
      currentWorktreePath: '/tmp/lalaclaw',
      worktrees: [
        { path: '/tmp/lalaclaw', name: 'lalaclaw', branch: 'feature/demo', detached: false },
        { path: '/tmp/lalaclaw-c11c', name: 'lalaclaw-c11c', branch: '', detached: true },
      ],
    }));
  });

  it('passes the selected target branch through to the helper process', () => {
    let spawnedArgs = null;
    const service = createDevWorkspaceRestartService({
      backendHost: '127.0.0.1',
      backendPort: 3000,
      fileExists: () => true,
      processEnv: {},
      processExecPath: '/usr/local/bin/node',
      processPid: 123,
      projectRoot: '/tmp/lalaclaw',
      readJsonIfExists: () => null,
      spawnImpl: (_command, args) => {
        spawnedArgs = args;
        return { unref() {} };
      },
      spawnSyncImpl: (_command, args) => {
        if (args[0] === 'symbolic-ref') {
          return { status: 0, stdout: 'main\n', stderr: '' };
        }
        if (args[0] === 'for-each-ref') {
          if (args[3] === 'refs/heads') {
            return { status: 0, stdout: 'main\n', stderr: '' };
          }
          return { status: 0, stdout: 'feature/demo\nmain\n', stderr: '' };
        }
        if (args[0] === 'worktree') {
          return {
            status: 0,
            stdout: [
              'worktree /tmp/lalaclaw',
              'HEAD 1111111',
              'branch refs/heads/main',
              '',
              'worktree /tmp/lalaclaw-c11c',
              'HEAD 2222222',
              'detached',
              '',
            ].join('\n'),
            stderr: '',
          };
        }
        return { status: 1, stdout: '', stderr: '' };
      },
      stateDir: '/tmp/lalaclaw-state',
      writeFileSyncImpl: () => {},
    });

    const result = service.scheduleDevWorkspaceRestart({
      frontendHost: '127.0.0.1',
      frontendPort: 5173,
      targetBranch: 'feature/demo',
      targetWorktreePath: '/tmp/lalaclaw-c11c',
    });

    expect(result).toEqual(expect.objectContaining({
      accepted: true,
      targetBranch: 'feature/demo',
      currentBranch: 'main',
    }));
    expect(spawnedArgs).toContain('--target-branch');
    expect(spawnedArgs).toContain('feature/demo');
    expect(spawnedArgs).toContain('--project-root');
    expect(spawnedArgs).toContain('/tmp/lalaclaw-c11c');
  });

  it('rejects unknown target branches before scheduling a restart', () => {
    const service = createDevWorkspaceRestartService({
      backendHost: '127.0.0.1',
      backendPort: 3000,
      fileExists: () => true,
      processEnv: {},
      processExecPath: '/usr/local/bin/node',
      processPid: 123,
      projectRoot: '/tmp/lalaclaw',
      readJsonIfExists: () => null,
      spawnSyncImpl: (_command, args) => {
        if (args[0] === 'symbolic-ref') {
          return { status: 0, stdout: 'main\n', stderr: '' };
        }
        if (args[0] === 'for-each-ref') {
          if (args[3] === 'refs/heads') {
            return { status: 0, stdout: 'main\nrelease\n', stderr: '' };
          }
          return { status: 0, stdout: 'main\nrelease\n', stderr: '' };
        }
        if (args[0] === 'worktree') {
          return {
            status: 0,
            stdout: [
              'worktree /tmp/lalaclaw',
              'HEAD 1111111',
              'branch refs/heads/main',
              '',
            ].join('\n'),
            stderr: '',
          };
        }
        return { status: 1, stdout: '', stderr: '' };
      },
      stateDir: '/tmp/lalaclaw-state',
      writeFileSyncImpl: () => {},
    });

    expect(() => {
      service.scheduleDevWorkspaceRestart({
        frontendHost: '127.0.0.1',
        frontendPort: 5173,
        targetBranch: 'feature/demo',
      });
    }).toThrow(/Target branch is not available/);
  });

  it('rejects unknown target worktrees before scheduling a restart', () => {
    const service = createDevWorkspaceRestartService({
      backendHost: '127.0.0.1',
      backendPort: 3000,
      fileExists: () => true,
      processEnv: {},
      processExecPath: '/usr/local/bin/node',
      processPid: 123,
      projectRoot: '/tmp/lalaclaw',
      readJsonIfExists: () => null,
      spawnSyncImpl: (_command, args) => {
        if (args[0] === 'symbolic-ref') {
          return { status: 0, stdout: 'main\n', stderr: '' };
        }
        if (args[0] === 'for-each-ref') {
          if (args[3] === 'refs/heads') {
            return { status: 0, stdout: 'main\n', stderr: '' };
          }
          return { status: 0, stdout: 'main\n', stderr: '' };
        }
        if (args[0] === 'worktree') {
          return {
            status: 0,
            stdout: [
              'worktree /tmp/lalaclaw',
              'HEAD 1111111',
              'branch refs/heads/main',
              '',
            ].join('\n'),
            stderr: '',
          };
        }
        return { status: 1, stdout: '', stderr: '' };
      },
      stateDir: '/tmp/lalaclaw-state',
      writeFileSyncImpl: () => {},
    });

    expect(() => {
      service.scheduleDevWorkspaceRestart({
        frontendHost: '127.0.0.1',
        frontendPort: 5173,
        targetWorktreePath: '/tmp/unknown-worktree',
      });
    }).toThrow(/Target worktree is not available/);
  });
});
