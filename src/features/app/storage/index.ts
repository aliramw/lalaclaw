// Compatibility-only barrel.
// Internal modules should import source modules directly and rely on
// storage-public-api-boundary.test.js to prevent regressions.
export {
  defaultInspectorPanelWidth,
  maxInspectorPanelWidth,
  minInspectorPanelWidth,
} from "@/features/app/state/app-preferences";
export {
  loadStoredTheme,
  themeStorageKey,
} from "@/features/theme/theme-storage";
export { useAppPersistence } from "@/features/app/storage/use-app-persistence";
