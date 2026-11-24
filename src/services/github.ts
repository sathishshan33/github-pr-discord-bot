import { Octokit } from '@octokit/rest';
import { UserCacheService } from './cache';

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

export interface BranchCompareResult {
  hasChanges: boolean;
  aheadBy: number;
  behindBy: number;
  status: string; // 'ahead' | 'behind' | 'identical' | 'diverged'
  totalCommits: number;
  filesCount: number;
  errorMessage?: string;
}

export class GitHubService {
  private octokit: Octokit;
  private userCache?: UserCacheService;

  constructor(token: string, userCache?: UserCacheService) {
    this.octokit = new Octokit({
      auth: token || undefined,
    });
    this.userCache = userCache;
  }

  public setUserCacheService(userCache: UserCacheService): void {
    this.userCache = userCache;
  }

  /**
   * List remote branches with server-side [user_id, cache] support
   */
  public async listBranches(owner: string, repo: string, userId?: string): Promise<string[]> {
    const repoFullName = `${owner}/${repo}`.toLowerCase();

    // Check user cache first if userId provided
    if (userId && this.userCache) {
      const cached = this.userCache.getCachedBranches(userId, repoFullName);
      if (cached) {
        return cached;
      }
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

      if (userId && this.userCache) {
        this.userCache.setCachedBranches(userId, repoFullName, branches);
      }

      return branches;
    } catch (err: any) {
      console.error(`[GitHubService] Error fetching branches for ${owner}/${repo}:`, err.message || err);
      return [];
    }
  }

  /**
   * Compare branch (head) against base branch to verify whether changes exist
   */
  public async compareBranchWithBase(
    owner: string,
    repo: string,
    head: string,
    base: string
  ): Promise<BranchCompareResult> {
    try {
      const res = await this.octokit.rest.repos.compareCommits({
        owner,
        repo,
        base,
        head,
      });

      const aheadBy = res.data.ahead_by ?? 0;
      const behindBy = res.data.behind_by ?? 0;
      const status = res.data.status ?? 'unknown';
      const totalCommits = res.data.total_commits ?? 0;
      const filesCount = res.data.files ? res.data.files.length : 0;

      // If head is ahead of base by >= 1 commit or has changed files
      const hasChanges = aheadBy > 0 || filesCount > 0;

      return {
        hasChanges,
        aheadBy,
        behindBy,
        status,
        totalCommits,
        filesCount,
      };
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Error comparing branch with base';
      const status = err.status || err.response?.status;

      let userFriendlyMsg = errorMsg;
      if (status === 404) {
        userFriendlyMsg = `Branch \`${head}\` or target branch \`${base}\` was not found on remote GitHub. Please check that your branch is pushed.`;
      }

      return {
        hasChanges: false,
        aheadBy: 0,
        behindBy: 0,
        status: 'error',
        totalCommits: 0,
        filesCount: 0,
        errorMessage: userFriendlyMsg,
      };
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
