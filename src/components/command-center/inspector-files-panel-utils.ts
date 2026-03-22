type InspectorFileKind = "目录" | "文件" | string;

export type InspectorFileItem = {
  key?: string;
  path?: string;
  fullPath?: string;
  name?: string;
  kind?: InspectorFileKind;
  hasChildren?: boolean;
  loaded?: boolean;
  loading?: boolean;
  expanded?: boolean;
  error?: string;
  primaryAction?: string;
  children?: InspectorFileNode[];
  [key: string]: unknown;
};

export type InspectorFileNode = InspectorFileItem & {
  key: string;
  path: string;
  fullPath: string;
  name: string;
  kind: InspectorFileKind;
  loaded: boolean;
  loading: boolean;
  expanded?: boolean;
  error: string;
  children: InspectorFileNode[];
};

const homePrefix = "/Users/marila";
const previewableExtensions = new Set([
  "txt", "text", "log", "md", "markdown", "json", "csv", "xls", "xlsx", "xlsm", "pdf", "doc", "docx", "ppt", "pptx",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "heif",
  "mp4", "webm", "mov", "mp3", "wav", "ogg", "m4a",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java",
  "c", "cc", "cpp", "cxx", "h", "hpp", "cs", "php", "swift", "kt", "kts",
  "lua", "m", "mm", "scala", "dart", "ex", "exs", "pl", "pm", "r",
  "sh", "bash", "zsh", "fish", "ps1", "sql", "css", "scss", "sass", "less",
  "html", "xml", "yml", "yaml", "toml", "ini", "conf", "env",
]);
const editableExtensions = new Set([
  "txt", "text", "log", "md", "markdown", "json",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java",
  "c", "cc", "cpp", "cxx", "h", "hpp", "cs", "php", "swift", "kt", "kts",
  "lua", "m", "mm", "scala", "dart", "ex", "exs", "pl", "pm", "r",
  "sh", "bash", "zsh", "fish", "ps1", "sql", "css", "scss", "sass", "less",
  "html", "xml", "yml", "yaml", "toml", "ini", "conf", "env",
]);

export function compactHomePath(filePath = "") {
  if (!filePath) {
    return "";
  }
  return filePath.startsWith(homePrefix) ? `~${filePath.slice(homePrefix.length)}` : filePath;
}

export function formatDisplayPath(item: InspectorFileItem, currentWorkspaceRoot = "") {
  const sourcePath = String(item.fullPath || item.path || "");
  const workspaceRoot = String(currentWorkspaceRoot || "").trim().replace(/\/+$/, "");
  if (!sourcePath) {
    return "";
  }
  if (workspaceRoot && (sourcePath === workspaceRoot || sourcePath.startsWith(`${workspaceRoot}/`))) {
    const relativePath = sourcePath.slice(workspaceRoot.length).replace(/^\/+/, "");
    return relativePath || sourcePath.split("/").pop() || "";
  }
  return compactHomePath(sourcePath);
}

export function compareFileItemsByPath(left: InspectorFileItem, right: InspectorFileItem, currentWorkspaceRoot = "") {
  return formatDisplayPath(left, currentWorkspaceRoot).localeCompare(
    formatDisplayPath(right, currentWorkspaceRoot),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}

export function resolveItemPath(item?: InspectorFileItem | null) {
  return String(item?.fullPath || item?.path || "").trim();
}

export function canPreviewFileItem(item?: InspectorFileItem | null) {
  if (!item || item.kind === "目录") {
    return false;
  }

  const targetPath = resolveItemPath(item).toLowerCase();
  if (!targetPath) {
    return false;
  }

  const fileName = targetPath.split("/").pop() || "";
  if (fileName === "dockerfile" || fileName === "makefile") {
    return true;
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  return Boolean(extension) && previewableExtensions.has(extension);
}

export function canEditFileItem(item?: InspectorFileItem | null) {
  if (!item || item.kind === "目录") {
    return false;
  }

  const targetPath = resolveItemPath(item).toLowerCase();
  if (!targetPath) {
    return false;
  }

  const fileName = targetPath.split("/").pop() || "";
  if (fileName === "dockerfile" || fileName === "makefile") {
    return true;
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  return Boolean(extension) && editableExtensions.has(extension);
}

export function getVsCodeHref(filePath = "") {
  if (!filePath) {
    return "";
  }
  return `vscode://file/${encodeURIComponent(filePath)}`;
}

export function getPathName(filePath = "") {
  const normalizedPath = String(filePath || "").replace(/\/+$/, "");
  if (!normalizedPath) {
    return "";
  }
  return normalizedPath.split("/").filter(Boolean).pop() || "";
}

export function getPathExtension(fileName = "") {
  const normalizedName = String(fileName || "").trim();
  if (!normalizedName) {
    return "";
  }
  const dotIndex = normalizedName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === normalizedName.length - 1) {
    return dotIndex === normalizedName.length - 1 ? "." : "";
  }
  return normalizedName.slice(dotIndex).toLowerCase();
}

export function doesFileExtensionChange(item?: InspectorFileItem | null, nextName = "") {
  if (!item || item.kind === "目录") {
    return false;
  }

  const currentName = String(item.name || getPathName(resolveItemPath(item)) || "").trim();
  return getPathExtension(currentName) !== getPathExtension(nextName);
}

export function replacePathPrefix(sourcePath = "", previousPath = "", nextPath = "") {
  const normalizedSource = String(sourcePath || "");
  const normalizedPrevious = String(previousPath || "");
  const normalizedNext = String(nextPath || "");

  if (!normalizedSource || !normalizedPrevious || normalizedSource === normalizedPrevious) {
    return normalizedSource === normalizedPrevious ? normalizedNext : normalizedSource;
  }

  if (!normalizedSource.startsWith(`${normalizedPrevious}/`)) {
    return normalizedSource;
  }

  return `${normalizedNext}${normalizedSource.slice(normalizedPrevious.length)}`;
}

function renameWorkspaceNodePaths(node: InspectorFileNode, previousPath: string, nextPath: string): InspectorFileNode {
  const currentPath = resolveItemPath(node);
  const renamedPath = replacePathPrefix(currentPath, previousPath, nextPath);
  const nextName = getPathName(renamedPath) || node.name;
  const nextChildren = Array.isArray(node.children)
    ? node.children.map((child) => renameWorkspaceNodePaths(child, previousPath, nextPath))
    : [];

  return {
    ...node,
    key: renamedPath || node.key,
    path: renamedPath || node.path,
    fullPath: renamedPath || node.fullPath,
    name: nextName,
    children: nextChildren,
  };
}

export function renameWorkspaceNodes(nodes: InspectorFileNode[] = [], previousPath = "", nextPath = "") {
  return nodes.map((node) => {
    const currentPath = resolveItemPath(node);
    if (currentPath === previousPath || currentPath.startsWith(`${previousPath}/`)) {
      return renameWorkspaceNodePaths(node, previousPath, nextPath);
    }
    if (node.kind === "目录" && node.children?.length) {
      return {
        ...node,
        children: renameWorkspaceNodes(node.children, previousPath, nextPath),
      };
    }
    return node;
  });
}

export function renameSessionItems(items: InspectorFileItem[] = [], previousPath = "", nextPath = "") {
  return items.map((item) => {
    const currentPath = resolveItemPath(item);
    if (currentPath !== previousPath && !currentPath.startsWith(`${previousPath}/`)) {
      return item;
    }
    const renamedPath = replacePathPrefix(currentPath, previousPath, nextPath);
    return {
      ...item,
      path: renamedPath || item.path,
      fullPath: renamedPath || item.fullPath,
      name: getPathName(renamedPath) || item.name,
    };
  });
}

export function countWorkspaceFiles(nodes: InspectorFileNode[] = []): number {
  return nodes.reduce((total, node) => {
    if (node.kind === "目录") {
      return total + countWorkspaceFiles(node.children || []);
    }
    return total + 1;
  }, 0);
}

function escapeRegexCharacters(value = "") {
  return String(value || "").replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

export function buildFileFilterMatcher(rawFilter = "") {
  const filters = String(rawFilter || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!filters.length) {
    return null;
  }

  const compiledFilters = filters.map((filter) => {
    if (filter.includes("*") || filter.includes("?")) {
      const expression = `^${escapeRegexCharacters(filter).replace(/\\\*/g, ".*").replace(/\\\?/g, ".")}$`;
      return { type: "glob" as const, regex: new RegExp(expression, "i") };
    }

    return { type: "text" as const, value: filter.toLocaleLowerCase() };
  });

  return (item: InspectorFileItem, currentWorkspaceRoot = "") => {
    const resolvedPath = resolveItemPath(item).replace(/\\/g, "/");
    const displayPath = String(formatDisplayPath(item, currentWorkspaceRoot) || item?.path || "").replace(/\\/g, "/").replace(/^~\//, "");
    const fileName = displayPath.split("/").filter(Boolean).pop() || resolvedPath.split("/").filter(Boolean).pop() || "";
    const candidates = [fileName, displayPath].filter(Boolean);

    return compiledFilters.some((filter) => {
      if (filter.type === "glob") {
        return candidates.some((candidate) => filter.regex.test(candidate));
      }
      return candidates.some((candidate) => candidate.toLocaleLowerCase().includes(filter.value));
    });
  };
}

export function normalizeWorkspaceNodes(items: InspectorFileItem[] = [], currentWorkspaceRoot = ""): InspectorFileNode[] {
  return items.map((item) => {
    const resolvedPath = resolveItemPath(item);
    const displayPath = formatDisplayPath(item, currentWorkspaceRoot);
    const normalizedChildren = Array.isArray(item?.children)
      ? normalizeWorkspaceNodes(item.children, currentWorkspaceRoot)
      : [];
    const fallbackName =
      item?.name
      || displayPath.split("/").filter(Boolean).pop()
      || resolvedPath.split("/").filter(Boolean).pop()
      || "";

    return {
      ...item,
      key: resolvedPath || `${item.kind || "item"}:${fallbackName}`,
      name: fallbackName,
      path: item?.path || resolvedPath,
      fullPath: item?.fullPath || resolvedPath,
      kind: item?.kind || "文件",
      hasChildren: Boolean(item?.hasChildren) || normalizedChildren.length > 0,
      loaded: item?.kind !== "目录" || item?.hasChildren === false || normalizedChildren.length > 0,
      loading: false,
      expanded: Boolean(item?.expanded) || normalizedChildren.length > 0,
      error: "",
      children: normalizedChildren,
    };
  });
}

export function joinPathSegments(basePath = "", segments: string[] = []) {
  if (!segments.length) {
    return basePath || "";
  }

  if (basePath === "/") {
    return `/${segments.join("/")}`;
  }

  const normalizedBase = String(basePath || "").replace(/\/+$/, "");
  return normalizedBase ? `${normalizedBase}/${segments.join("/")}` : segments.join("/");
}

function getSessionTreeLocation(item: InspectorFileItem, currentWorkspaceRoot = "") {
  const sourcePath = resolveItemPath(item).replace(/\\/g, "/");
  const workspaceRoot = String(currentWorkspaceRoot || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");

  if (!sourcePath) {
    return { basePath: "", segments: [] as string[] };
  }

  if (workspaceRoot && (sourcePath === workspaceRoot || sourcePath.startsWith(`${workspaceRoot}/`))) {
    const relativePath = sourcePath.slice(workspaceRoot.length).replace(/^\/+/, "");
    return {
      basePath: workspaceRoot,
      segments: relativePath.split("/").filter(Boolean),
    };
  }

  if (sourcePath.startsWith(`${homePrefix}/`)) {
    return {
      basePath: homePrefix,
      segments: sourcePath.slice(homePrefix.length).replace(/^\/+/, "").split("/").filter(Boolean),
    };
  }

  return {
    basePath: sourcePath.startsWith("/") ? "/" : "",
    segments: sourcePath.replace(/^\/+/, "").split("/").filter(Boolean),
  };
}

function sortTreeNodes(nodes: InspectorFileNode[] = []): InspectorFileNode[] {
  return [...nodes]
    .map((node) => (
      node.kind === "目录"
        ? { ...node, children: sortTreeNodes(node.children || []) }
        : node
    ))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "目录" ? -1 : 1;
      }
      return String(left.name || "").localeCompare(String(right.name || ""), undefined, { numeric: true, sensitivity: "base" });
    });
}

export function buildSessionTreeNodes(items: InspectorFileItem[] = [], currentWorkspaceRoot = "") {
  const rootNodes: InspectorFileNode[] = [];

  [...items]
    .sort((left, right) => compareFileItemsByPath(left, right, currentWorkspaceRoot))
    .forEach((item) => {
      const sourcePath = resolveItemPath(item);
      const { basePath, segments } = getSessionTreeLocation(item, currentWorkspaceRoot);
      if (!sourcePath || !segments.length) {
        return;
      }

      let currentLevel = rootNodes;
      for (let index = 0; index < segments.length - 1; index += 1) {
        const name = segments[index];
        const fullPath = joinPathSegments(basePath, segments.slice(0, index + 1));
        let node = currentLevel.find((candidate) => candidate.kind === "目录" && candidate.fullPath === fullPath);
        if (!node) {
          node = {
            key: `session-dir:${fullPath}`,
            name,
            path: fullPath,
            fullPath,
            kind: "目录",
            loaded: true,
            loading: false,
            error: "",
            children: [],
          };
          currentLevel.push(node);
        }
        currentLevel = node.children;
      }

      currentLevel.push({
        ...item,
        key: sourcePath,
        name: segments.at(-1) || sourcePath.split("/").pop() || "",
        path: sourcePath,
        fullPath: sourcePath,
        kind: "文件",
        loaded: true,
        loading: false,
        error: "",
        children: [],
      });
    });

  return sortTreeNodes(rootNodes);
}

export function getCompactDirectoryChain(node?: InspectorFileNode | null): InspectorFileNode[] {
  if (!node) {
    return [];
  }

  const chain = [node];
  let currentNode = node;

  while (
    currentNode?.kind === "目录"
    && currentNode.loaded
    && !currentNode.loading
    && !currentNode.error
    && Array.isArray(currentNode.children)
    && currentNode.children.length === 1
    && currentNode.children[0]?.kind === "目录"
  ) {
    currentNode = currentNode.children[0];
    chain.push(currentNode);
  }

  return chain;
}

export function formatCompactDirectoryLabel(chain: InspectorFileNode[] = []) {
  return chain.map((node) => node.name).filter(Boolean).join(" / ");
}

export function mergeWorkspaceNodes(previousNodes: InspectorFileNode[] = [], nextNodes: InspectorFileNode[] = []) {
  const previousByPath = new Map(
    previousNodes
      .map((node) => [resolveItemPath(node), node] as const)
      .filter(([nodePath]) => Boolean(nodePath)),
  );

  return nextNodes.map((node) => {
    const nodePath = resolveItemPath(node);
    const previousNode = previousByPath.get(nodePath);

    if (!previousNode || node.kind !== "目录") {
      return previousNode && node.kind !== "目录"
        ? { ...node, expanded: previousNode.expanded, loaded: previousNode.loaded, loading: previousNode.loading, error: previousNode.error }
        : node;
    }

    return {
      ...node,
      expanded: previousNode.expanded,
      loaded: previousNode.loaded || node.loaded,
      loading: previousNode.loading,
      error: previousNode.error,
      children: previousNode.children || [],
      hasChildren: previousNode.hasChildren || node.hasChildren,
    };
  });
}

export function updateWorkspaceNode(
  nodes: InspectorFileNode[] = [],
  targetPath = "",
  updater: (node: InspectorFileNode) => InspectorFileNode,
) {
  return nodes.map((node) => {
    const nodePath = resolveItemPath(node);
    if (nodePath === targetPath) {
      return updater(node);
    }
    if (node.kind === "目录" && node.children?.length) {
      return {
        ...node,
        children: updateWorkspaceNode(node.children, targetPath, updater),
      };
    }
    return node;
  });
}
