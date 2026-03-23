"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLalaClawServiceStatus = exports.resolveLaunchdLogDir = exports.resolveLaunchdPlistPath = exports.resolveConfigDir = exports.resolveLaunchdLabel = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const sourceHelperPath = node_path_1.default.resolve(__dirname, '..', '..', 'shared', 'lalaclaw-service-status.cjs');
const buildHelperPath = node_path_1.default.resolve(__dirname, '..', '..', '..', 'shared', 'lalaclaw-service-status.cjs');
const statusHelpers = require(node_fs_1.default.existsSync(sourceHelperPath) ? sourceHelperPath : buildHelperPath);
exports.resolveLaunchdLabel = statusHelpers.resolveLaunchdLabel;
exports.resolveConfigDir = statusHelpers.resolveConfigDir;
exports.resolveLaunchdPlistPath = statusHelpers.resolveLaunchdPlistPath;
exports.resolveLaunchdLogDir = statusHelpers.resolveLaunchdLogDir;
exports.getLalaClawServiceStatus = statusHelpers.getLalaClawServiceStatus;
