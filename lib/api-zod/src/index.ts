export * from "./generated/api";
// Re-export domain types from generated/types, excluding names that collide
// with Zod schemas already exported from generated/api above.
// FetchFileParams and WriteFileParams are the query-param TS interfaces — they
// clash with the same-named Zod path-param schemas in generated/api.
export type {
  AiResponse,
  ApiError,
  Branch,
  BranchSwitch,
  CommitInput,
  CommitResult,
  FileChange,
  FileChangeAction,
  FileContent,
  FileDiff,
  FileDiffStatus,
  FileNode,
  FileNodeType,
  FileWrite,
  HealthStatus,
  Message,
  MessageInput,
  MessageRole,
  Repo,
  RepoCreate,
  User,
  Workspace,
  WorkspaceOpen,
  WorkspaceStats,
  WorkspaceStatus,
} from "./generated/types";
export * from './generated/api';
export * from './generated/types';
