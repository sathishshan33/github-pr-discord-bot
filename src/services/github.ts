import { Octokit } from '@octokit/rest';

interface CacheEntry {
  branches: string[];
  expiresAt: number;
}

export interface CreatePRParams {
  owner: string;
  repo: string;
  head: string;
  base: string;
  title: string;
  body?: string;
}

export interface PRResult {
  htmlUrl: string;
  number: number;
  title: string;
  state: string;
}

export class GitHubService {
  private octokit: Octokit;
  // In-memory cache for remote branches: repoFullName -> CacheEntry (5 minutes TTL)
  private branchCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(token: string) {
    this.octokit = new Octokit({
      auth: token || undefined,
    });
  }

  public async listBranches(owner: string, repo: string): Promise<string[]> {
    const key = `${owner}/${repo}`.toLowerCase();
    const now = Date.now();
    const cached = this.branchCache.get(key);

    if (cached && cached.expiresAt > now) {
      return cached.branches;
    }

    try {
      const branches: string[] = [];
      let page = 1;
      const perPage = 100;

      // Fetch first 2 pages (up to 200 branches) for responsive autocomplete
      while (page <= 2) {
        const res = await this.octokit.rest.repos.listBranches({
          owner,
          repo,
          per_page: perPage,
          page,
        });

        if (!res.data || res.data.length === 0) break;
        for (const b of res.data) {
          branches.push(b.name);
        }

        if (res.data.length < perPage) break;
        page++;
      }

      this.branchCache.set(key, {
        branches,
        expiresAt: now + this.CACHE_TTL_MS,
      });

      return branches;
    } catch (err: any) {
      console.error(`[GitHubService] Error fetching branches for ${owner}/${repo}:`, err.message || err);
      return [];
    }
  }

  public async createPullRequest(params: CreatePRParams): Promise<PRResult> {
    try {
      const res = await this.octokit.rest.pulls.create({
        owner: params.owner,
        repo: params.repo,
        head: params.head,
        base: params.base,
        title: params.title,
        body: params.body || '',
      });

      return {
        htmlUrl: res.data.html_url,
        number: res.data.number,
        title: res.data.title,
        state: res.data.state,
      };
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Unknown GitHub API error';
      const errors = err.response?.data?.errors;
      let detailedMsg = errorMsg;

      if (Array.isArray(errors) && errors.length > 0) {
        detailedMsg += ': ' + errors.map((e: any) => e.message || JSON.stringify(e)).join(', ');
      }

      throw new Error(detailedMsg);
    }
  }
}
