import fs from 'node:fs';
import path from 'node:path';

const sourceHelperPath = path.resolve(__dirname, '..', '..', 'shared', 'lalaclaw-service-status.cjs');
const buildHelperPath = path.resolve(__dirname, '..', '..', '..', 'shared', 'lalaclaw-service-status.cjs');
const statusHelpers = require(fs.existsSync(sourceHelperPath) ? sourceHelperPath : buildHelperPath);

export type LaunchAgentStatus =
  | {
      kind: 'launchd';
      platform: 'darwin';
      label: string;
      installed: boolean;
      running: boolean;
      plistPath: string;
      logDir: string;
      serviceVersion: string;
      comment: string;
      details: string;
    }
  | {
      kind: 'unsupported';
      platform: NodeJS.Platform;
      installed: false;
      running: false;
      label: string;
      plistPath: string;
      logDir: string;
      serviceVersion: string;
      comment: string;
      details: string;
    };

export const resolveLaunchdLabel = statusHelpers.resolveLaunchdLabel as () => string;
export const resolveConfigDir = statusHelpers.resolveConfigDir as () => string;
export const resolveLaunchdPlistPath = statusHelpers.resolveLaunchdPlistPath as (homeDir?: string) => string;
export const resolveLaunchdLogDir = statusHelpers.resolveLaunchdLogDir as () => string;
export const getLalaClawServiceStatus = statusHelpers.getLalaClawServiceStatus as () => LaunchAgentStatus;
