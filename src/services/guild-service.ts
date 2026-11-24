import { DatabaseService, GuildDbConfig, UserBranchConfig } from './database';
import { RepoConfig, parseRepositories } from '../config';
import { GitHubService } from './github';
import { UserCacheService } from './cache';

export interface GuildRuntimeConfig {
  guildId: string;
  channelId?: string;
  repositoriesRaw?: string;
  repositories: RepoConfig[];
}

interface CachedGuildEntry {
  config: GuildRuntimeConfig;
  expiresAt: number;
}

export class GuildService {
  private db: DatabaseService;
  private userCache: UserCacheService;

  // In-memory cache for guild configs: guildId -> CachedGuildEntry
  private guildCache = new Map<string, CachedGuildEntry>();
  // Cached GitHubService instances: token -> GitHubService
  private gitHubServices = new Map<string, GitHubService>();

  private readonly GUILD_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(db: DatabaseService, userCache: UserCacheService) {
    this.db = db;
    this.userCache = userCache;
  }

  /* ================= Guild Config (Server-level: Channel & Repositories) ================= */

  public async getGuildConfig(guildId: string): Promise<GuildRuntimeConfig | null> {
    const now = Date.now();
    const cached = this.guildCache.get(guildId);
    if (cached && cached.expiresAt > now) {
      return cached.config;
    }

    const dbConfig = await this.db.getGuildConfig(guildId);
    if (!dbConfig) return null;

    const repositories = parseRepositories(dbConfig.repositories);

    const runtimeConfig: GuildRuntimeConfig = {
      guildId: dbConfig.guildId,
      channelId: dbConfig.channelId,
      repositoriesRaw: dbConfig.repositories,
      repositories,
    };

    this.guildCache.set(guildId, {
      config: runtimeConfig,
      expiresAt: now + this.GUILD_CACHE_TTL_MS,
    });

    return runtimeConfig;
  }

  public async saveGuildConfig(
    guildId: string,
    updates: Partial<GuildDbConfig>
  ): Promise<GuildRuntimeConfig> {
    const existing = await this.db.getGuildConfig(guildId);

    const merged: GuildDbConfig = {
      guildId,
      channelId: updates.channelId !== undefined ? updates.channelId : existing?.channelId,
      repositories: updates.repositories !== undefined ? updates.repositories : existing?.repositories,
    };

    await this.db.saveGuildConfig(merged);

    // Invalidate cache
    this.guildCache.delete(guildId);

    const updated = await this.getGuildConfig(guildId);
    return updated!;
  }

  /* ================= User GitHub Tokens ================= */

  public async getUserToken(userId: string): Promise<string | null> {
    return this.db.getUserToken(userId);
  }

  public async setUserToken(userId: string, token: string): Promise<void> {
    await this.db.setUserToken(userId, token);
    this.gitHubServices.delete(`user_${userId}`);
  }

  public async removeUserToken(userId: string): Promise<boolean> {
    this.gitHubServices.delete(`user_${userId}`);
    return this.db.removeUserToken(userId);
  }

  /**
   * Get GitHubService using the user's personal GitHub token
   */
  public async getUserGitHubService(userId: string): Promise<GitHubService | null> {
    const userToken = await this.getUserToken(userId);
    if (!userToken) return null;

    const cacheKey = `user_${userId}`;
    let service = this.gitHubServices.get(cacheKey);
    if (!service) {
      service = new GitHubService(userToken, this.userCache);
      this.gitHubServices.set(cacheKey, service);
    }
    return service;
  }

  /* ================= User Branches (branch_name and target_branch) ================= */

  public async getUserBranchConfig(
    guildId: string,
    userId: string,
    repoFullName: string
  ): Promise<UserBranchConfig | null> {
    return this.db.getUserBranchConfig(guildId, userId, repoFullName);
  }

  public async setUserBranchConfig(
    guildId: string,
    userId: string,
    repoFullName: string,
    branchName: string,
    targetBranch: string
  ): Promise<void> {
    return this.db.setUserBranchConfig(guildId, userId, repoFullName, branchName, targetBranch);
  }

  public async getAllUserBranchConfigs(
    guildId: string,
    userId: string
  ): Promise<Record<string, UserBranchConfig>> {
    return this.db.getAllUserBranchConfigs(guildId, userId);
  }

  public async seedDefaultGuildIfEmpty(seed: {
    guildId: string;
    channelId: string;
    repositories: string;
  }): Promise<void> {
    const existing = await this.db.getGuildConfig(seed.guildId);
    if (!existing) {
      await this.db.saveGuildConfig({
        guildId: seed.guildId,
        channelId: seed.channelId,
        repositories: seed.repositories,
      });
      console.log(`🌱 Seeded initial database configuration for Guild ${seed.guildId}.`);
    }
  }
}
