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
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".mp4",
  ".mp3",
  ".wav",
  ".zip",
  ".tar",
  ".gz",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".lock",
]);

const LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  cpp: "cpp",
  c: "c",
  h: "cpp",
  cs: "csharp",
  php: "php",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  mdx: "markdown",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  xml: "xml",
  dockerfile: "dockerfile",
};

export function getWorkspaceDir(workspaceId: string): string {
  return path.join(WORKSPACE_BASE, workspaceId);
}

export function detectLanguage(filePath: string): string {
  const filename = path.basename(filePath).toLowerCase();
  if (filename === "dockerfile" || filename.startsWith("dockerfile.")) {
    return "dockerfile";
  }
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return LANGUAGE_MAP[ext] ?? "plaintext";
}

export async function ensureWorkspaceBase(): Promise<void> {
  await fs.mkdir(WORKSPACE_BASE, { recursive: true });
}

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
    await git.clone(cloneUrl, dir, [
      "--branch",
      branch,
      "--depth",
      "100",
      "--single-branch",
    ]);
  } catch (err) {
    // Clean up on failure
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  return workspaceId;
}

export interface FileNode {
  path: string;
  name: string;
  type: "file" | "dir";
  children?: FileNode[];
}

async function buildFileTree(
  dirPath: string,
  relativePath: string = "",
): Promise<FileNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const children = await buildFileTree(
        path.join(dirPath, entry.name),
        relPath,
      );
      nodes.push({ path: relPath, name: entry.name, type: "dir", children });
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IGNORED_EXTENSIONS.has(ext)) continue;
      nodes.push({ path: relPath, name: entry.name, type: "file" });
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function getFileTree(workspaceId: string): Promise<FileNode[]> {
  const dir = getWorkspaceDir(workspaceId);
  return buildFileTree(dir);
}

export async function readFile(
  workspaceId: string,
  filePath: string,
): Promise<string> {
  const dir = getWorkspaceDir(workspaceId);
  const fullPath = path.join(dir, filePath);

  // Prevent path traversal
  if (!fullPath.startsWith(dir)) {
    throw new Error("Path traversal detected");
  }

  return fs.readFile(fullPath, "utf-8");
}

export async function writeFile(
  workspaceId: string,
  filePath: string,
  content: string,
): Promise<void> {
  const dir = getWorkspaceDir(workspaceId);
  const fullPath = path.join(dir, filePath);

  // Prevent path traversal
  if (!fullPath.startsWith(dir)) {
    throw new Error("Path traversal detected");
  }

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

export interface FileDiff {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  diff: string | null;
  additions: number;
  deletions: number;
  oldPath: string | null;
}

export async function getDiff(workspaceId: string): Promise<FileDiff[]> {
  const dir = getWorkspaceDir(workspaceId);
  const git = simpleGit(dir);

  const status = await git.status();
  const diffs: FileDiff[] = [];

  for (const file of [
    ...status.modified,
    ...status.not_added,
    ...status.created,
  ]) {
    let diffText: string | null = null;
    let additions = 0;
    let deletions = 0;

    try {
      if (status.modified.includes(file)) {
        const d = await git.diff(["HEAD", "--", file]);
        diffText = d;
        additions = (d.match(/^\+[^+]/gm) ?? []).length;
        deletions = (d.match(/^-[^-]/gm) ?? []).length;
      } else {
        const content = await readFile(workspaceId, file);
        const lines = content.split("\n");
        additions = lines.length;
        diffText = lines.map((l) => `+${l}`).join("\n");
      }
    } catch {
      // ignore diff errors for individual files
    }

    diffs.push({
      path: file,
      status: status.created.includes(file) || status.not_added.includes(file)
        ? "added"
        : "modified",
      diff: diffText,
      additions,
      deletions,
      oldPath: null,
    });
  }

  for (const file of status.deleted) {
    diffs.push({
      path: file,
      status: "deleted",
      diff: null,
      additions: 0,
      deletions: 0,
      oldPath: null,
    });
  }

  for (const renamed of status.renamed) {
    diffs.push({
      path: renamed.to,
      status: "renamed",
      diff: null,
      additions: 0,
      deletions: 0,
      oldPath: renamed.from,
    });
  }

  return diffs;
}

export interface Branch {
  name: string;
  current: boolean;
  lastCommit: string | null;
}

export async function listBranches(workspaceId: string): Promise<Branch[]> {
  const dir = getWorkspaceDir(workspaceId);
  const git = simpleGit(dir);
  const branches = await git.branch(["-a"]);

  return Object.values(branches.branches)
    .filter((b) => !b.name.startsWith("remotes/origin/HEAD"))
    .map((b) => ({
      name: b.name.replace(/^remotes\/origin\//, ""),
      current: b.current,
      lastCommit: b.commit || null,
    }))
    .filter(
      (b, i, arr) => arr.findIndex((x) => x.name === b.name) === i,
    );
}

export async function switchBranch(
  workspaceId: string,
  branch: string,
): Promise<void> {
  const dir = getWorkspaceDir(workspaceId);
  const git = simpleGit(dir);
  await git.checkout(branch);
}

export interface CommitResult {
  sha: string;
  message: string;
  branch: string;
  filesChanged: number;
}

export async function commitAndPush(
  accessToken: string,
  workspaceId: string,
  commitMessage: string,
  repoFullName: string,
): Promise<CommitResult> {
  const dir = getWorkspaceDir(workspaceId);
  const git = simpleGit(dir);

  // Configure git user
  await git.addConfig("user.name", "CodeVault");
  await git.addConfig("user.email", "codevault@replit.app");

  // Stage all changes
  await git.add(["-A"]);

  const status = await git.status();
  const filesChanged = status.staged.length;

  // Commit
  const commit = await git.commit(commitMessage);

  // Push with authenticated URL
  const remoteUrl = `https://oauth2:${accessToken}@github.com/${repoFullName}.git`;
  const currentBranch = (await git.branch()).current;

  await git.push(remoteUrl, `${currentBranch}:${currentBranch}`);

  logger.info({ workspaceId, sha: commit.commit, filesChanged }, "Committed and pushed");

  return {
    sha: commit.commit,
    message: commitMessage,
    branch: currentBranch,
    filesChanged,
  };
}

export async function getWorkspaceStats(workspaceId: string): Promise<{
  totalFiles: number;
  currentBranch: string;
  lastCommitMessage: string | null;
  lastCommitDate: string | null;
  uncommittedChanges: number;
}> {
  const dir = getWorkspaceDir(workspaceId);
  const git = simpleGit(dir);

  const [status, log, branches] = await Promise.all([
    git.status(),
    git.log(["-1"]).catch(() => ({ latest: null })),
    git.branch(),
  ]);

  // Count all non-ignored files
  const tree = await getFileTree(workspaceId);
  const countFiles = (nodes: FileNode[]): number =>
    nodes.reduce(
      (acc, n) =>
        acc + (n.type === "file" ? 1 : countFiles(n.children ?? [])),
      0,
    );

  return {
    totalFiles: countFiles(tree),
    currentBranch: branches.current,
    lastCommitMessage: log.latest?.message ?? null,
    lastCommitDate: log.latest?.date ?? null,
    uncommittedChanges:
      status.modified.length +
      status.not_added.length +
      status.created.length +
      status.deleted.length,
  };
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

export async function deleteWorkspaceDir(workspaceId: string): Promise<void> {
  const dir = getWorkspaceDir(workspaceId);
  await fs.rm(dir, { recursive: true, force: true });
}
