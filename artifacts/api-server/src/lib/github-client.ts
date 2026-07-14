import { Octokit } from "@octokit/rest";

export function getOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  url: string;
  updatedAt: string | null;
}

export async function listUserRepos(accessToken: string): Promise<GitHubRepo[]> {
  const octokit = getOctokit(accessToken);
  const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    sort: "updated",
    per_page: 100,
    affiliation: "owner,collaborator,organization_member",
  });

  return repos.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    description: r.description ?? null,
    private: r.private,
    defaultBranch: r.default_branch,
    url: r.html_url,
    updatedAt: r.updated_at ?? null,
  }));
}

export async function createRepo(
  accessToken: string,
  name: string,
  description?: string,
  isPrivate?: boolean,
  autoInit?: boolean,
): Promise<GitHubRepo> {
  const octokit = getOctokit(accessToken);
  const { data: r } = await octokit.repos.createForAuthenticatedUser({
    name,
    description,
    private: isPrivate ?? false,
    auto_init: autoInit ?? true,
  });

  return {
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    description: r.description ?? null,
    private: r.private,
    defaultBranch: r.default_branch,
    url: r.html_url,
    updatedAt: r.updated_at ?? null,
  };
}
