import simpleGit from "simple-git";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger";

const WORKSPACE_BASE =
  process.env.WORKSPACE_DIR ?? "/tmp/codevault-workspaces";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".cache",
  "vendor",
  ".venv",
  "venv",
  "coverage",
  ".nyc_output",
]);

const IGNORED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
  ".mp4", ".mp3", ".wav", ".zip", ".tar", ".gz", ".pdf",
  ".woff", ".woff2", ".ttf", ".eot", ".lock",
]);

const LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python", rb: "ruby", go: "go", rs: "rust",
  java: "java", kt: "kotlin", swift: "swift",
  cpp: "cpp", c: "c", h: "cpp", cs: "csharp",
  php: "php", html: "html", htm: "html",
  css: "css", scss: "scss", sass: "sass", less: "less",
  json: "json", yaml: "yaml", yml: "yaml",
  toml: "toml", md: "markdown", mdx: "markdown",
  sh: "shell", bash: "shell", zsh: "shell", fish: "shell",
  sql: "sql", graphql: "graphql", gql: "graphql",
  xml: "xml", dockerfile: "dockerfile",
};

export function getWorkspaceDir(workspaceId: string): string {
  return path.join(WORKSPACE_BASE, workspaceId);
}

export function detectLanguage(filePath: string): string {
  const filename = path.basename(filePath).toLowerCase();
  if (filename === "dockerfile" || filename.startsWith("dockerfile.")) return "dockerfile";
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return LANGUAGE_MAP[ext] ?? "plaintext";
}

export async function ensureWorkspaceBase(): Promise<void> {
  await fs.mkdir(WORKSPACE_BASE, { recursive: true });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
const TEMPLATES: Record<string, Record<string, string>> = {
  node: {
    "package.json": JSON.stringify({
      name: "my-project",
      version: "1.0.0",
      description: "",
      main: "index.js",
      scripts: { start: "node index.js" },
    }, null, 2),
    "index.js": `console.log("Hello, world!");\n`,
    ".gitignore": `node_modules/\n.env\ndist/\n`,
    "README.md": `# My Project\n\nA Node.js project.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnode index.js\n\`\`\`\n`,
  },
  python: {
    "main.py": `def main():\n    print("Hello, world!")\n\nif __name__ == "__main__":\n    main()\n`,
    "requirements.txt": `# Add dependencies here\n`,
    ".gitignore": `__pycache__/\n*.pyc\n.env\nvenv/\n.venv/\n`,
    "README.md": `# My Project\n\nA Python project.\n\n## Getting started\n\n\`\`\`bash\npython main.py\n\`\`\`\n`,
  },
  react: {
    "package.json": JSON.stringify({
      name: "my-react-app",
      version: "0.0.0",
      type: "module",
      scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
      dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
      devDependencies: { "@vitejs/plugin-react": "^4.3.4", vite: "^6.0.0" },
    }, null, 2),
    "index.html": `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>My App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`,
    "src/main.jsx": `import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport App from './App.jsx'\n\ncreateRoot(document.getElementById('root')).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n)\n`,
    "src/App.jsx": `export default function App() {\n  return (\n    <div>\n      <h1>Hello, React!</h1>\n    </div>\n  )\n}\n`,
    ".gitignore": `node_modules/\ndist/\n.env\n`,
    "README.md": `# My React App\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`,
    "vite.config.js": `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n})\n`,
  },
  express: {
    "package.json": JSON.stringify({
      name: "my-server",
      version: "1.0.0",
      type: "module",
      scripts: { start: "node server.js", dev: "node --watch server.js" },
      dependencies: { express: "^5.0.0" },
    }, null, 2),
    "server.js": `import express from 'express';\n\nconst app = express();\nconst port = process.env.PORT ?? 3000;\n\napp.use(express.json());\n\napp.get('/', (req, res) => {\n  res.json({ message: 'Hello, World!' });\n});\n\napp.listen(port, () => {\n  console.log(\`Server running on port \${port}\`);\n});\n`,
    ".gitignore": `node_modules/\n.env\n`,
    "README.md": `# My Express Server\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n`,
  },
};

async function initGit(dir: string, projectName: string): Promise<void> {
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.email", "codevault@local", false, "local");
  await git.addConfig("user.name", "CodeVault", false, "local");
  await git.add(".");
  await git.commit(`Initial commit: ${projectName}`);
}

// Create a new local project (blank or from template)
export async function createProject(
  workspaceId: string,
  name: string,
  type: "blank" | "template",
  template: string | null,
): Promise<void> {
  await ensureWorkspaceBase();
  const dir = getWorkspaceDir(workspaceId);
  await fs.mkdir(dir, { recursive: true });

  if (type === "blank") {
    await fs.writeFile(path.join(dir, "README.md"), `# ${name}\n`);
  } else if (type === "template" && template && TEMPLATES[template]) {
    const files = TEMPLATES[template];
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(dir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }
  } else {
    await fs.writeFile(path.join(dir, "README.md"), `# ${name}\n`);
  }

  await initGit(dir, name);
  logger.info({ workspaceId, type, template }, "Project created");
}

// Clone a GitHub repo (kept for future GitHub integration)
export async function cloneRepo(
  accessToken: string,
  repoFullName: string,
  branch: string,
): Promise<string> {
  await ensureWorkspaceBase();
  const workspaceId = uuidv4();
  const dir = getWorkspaceDir(workspaceId);
  await fs.mkdir(dir, { recursive: true });

  const cloneUrl = `https://oauth2:${accessToken}@github.com/${repoFullName}.git`;
  const git = simpleGit();

  try {
    await git.clone(cloneUrl, dir, ["--branch", branch, "--depth", "100", "--single-branch"]);
  } catch (err) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  return workspaceId;
}

// ---------------------------------------------------------------------------
// File tree
// ---------------------------------------------------------------------------
export interface FileNode {
  path: string;
  name: string;
  type: "file" | "dir";
  children?: FileNode[];
}

async function buildFileTree(dirPath: string, relativePath: string = ""): Promise<FileNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const children = await buildFileTree(path.join(dirPath, entry.name), entryRelativePath);
      nodes.push({ path: entryRelativePath, name: entry.name, type: "dir", children });
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (IGNORED_EXTENSIONS.has(ext)) continue;
      nodes.push({ path: entryRelativePath, name: entry.name, type: "file" });
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function getFileTree(workspaceId: string): Promise<FileNode[]> {
  const dir = getWorkspaceDir(workspaceId);
  try {
    return await buildFileTree(dir);
  } catch (err: any) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

export async function getFileTreeAsString(workspaceId: string): Promise<string> {
  const tree = await getFileTree(workspaceId);
  const lines: string[] = [];
  function walk(nodes: FileNode[], depth: number): void {
    for (const node of nodes) {
      lines.push("  ".repeat(depth) + (node.type === "dir" ? `${node.name}/` : node.name));
      if (node.children) walk(node.children, depth + 1);
    }
  }
  walk(tree, 0);
  return lines.join("\n");
}

// Recreate a workspace dir on disk if /tmp was wiped between server restarts
export async function ensureWorkspaceDir(
  workspaceId: string,
  name: string,
  type: "blank" | "template",
  template: string | null,
): Promise<void> {
  const dir = getWorkspaceDir(workspaceId);
  try {
    await fs.access(dir);
    // Dir exists — nothing to do
  } catch {
    logger.warn({ workspaceId }, "Workspace dir missing — recreating");
    await createProject(workspaceId, name, type as "blank" | "template", template);
  }
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------
export async function readFile(workspaceId: string, filePath: string): Promise<string> {
  const dir = getWorkspaceDir(workspaceId);
  const fullPath = path.resolve(dir, filePath);
  if (!fullPath.startsWith(dir)) throw new Error("Path traversal detected");
  return fs.readFile(fullPath, "utf-8");
}

export async function writeFile(workspaceId: string, filePath: string, content: string): Promise<void> {
  const dir = getWorkspaceDir(workspaceId);
  const fullPath = path.resolve(dir, filePath);
  if (!fullPath.startsWith(dir)) throw new Error("Path traversal detected");
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Git operations
// ---------------------------------------------------------------------------
export async function getDiff(workspaceId: string): Promise<Array<{ path: string; diff: string; status: string }>> {
  const dir = getWorkspaceDir(workspaceId);
  const git = simpleGit(dir);
  const status = await git.status();
  const diffs: Array<{ path: string; diff: string; status: string }> = [];

  for (const f of [...status.modified, ...status.not_added, ...status.created]) {
    const diff = await git.diff(["HEAD", "--", f]).catch(() =>
      git.diff(["--", f]).catch(() => ""),
    );
    diffs.push({ path: f, diff, status: status.modified.includes(f) ? "modified" : "added" });
  }
  for (const f of status.deleted) {
    diffs.push({ path: f, diff: "", status: "deleted" });
  }

  return diffs;
}

export async function listBranches(workspaceId: string): Promise<{ current: string; all: string[] }> {
  const dir = getWorkspaceDir(workspaceId);
  const git = simpleGit(dir);
  const result = await git.branch();
  return { current: result.current, all: result.all };
}

export async function switchBranch(workspaceId: string, branch: string): Promise<void> {
  const dir = getWorkspaceDir(workspaceId);
  const git = simpleGit(dir);
  await git.checkout(branch);
}

// Commit locally; push only if a remote is configured
export async function commitChanges(
  workspaceId: string,
  message: string,
): Promise<{ commitHash: string; pushed: boolean }> {
  const dir = getWorkspaceDir(workspaceId);
  const git = simpleGit(dir);
  await git.add(".");
  const result = await git.commit(message);

  let pushed = false;
  try {
    const remotes = await git.getRemotes();
    if (remotes.length > 0) {
      await git.push();
      pushed = true;
    }
  } catch (err) {
    logger.warn({ err }, "Push failed (no remote or push error)");
  }

  return { commitHash: result.commit, pushed };
}

// ---------------------------------------------------------------------------
// Workspace stats
// ---------------------------------------------------------------------------
export async function getWorkspaceStats(workspaceId: string) {
  const dir = getWorkspaceDir(workspaceId);
  const git = simpleGit(dir);

  const [status, log, branches] = await Promise.all([
    git.status(),
    git.log(["-1"]).catch(() => ({ latest: null })),
    git.branch(),
  ]);

  const tree = await getFileTree(workspaceId);
  const countFiles = (nodes: FileNode[]): number =>
    nodes.reduce((acc, n) => acc + (n.type === "file" ? 1 : countFiles(n.children ?? [])), 0);

  return {
    totalFiles: countFiles(tree),
    currentBranch: branches.current,
    lastCommitMessage: log.latest?.message ?? null,
    lastCommitDate: log.latest?.date ?? null,
    uncommittedChanges:
      status.modified.length + status.not_added.length + status.created.length + status.deleted.length,
  };
}

export async function deleteWorkspaceDir(workspaceId: string): Promise<void> {
  const dir = getWorkspaceDir(workspaceId);
  await fs.rm(dir, { recursive: true, force: true });
}
