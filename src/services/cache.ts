import { RepoConfig } from '../config';

export interface BranchCacheEntry {
  branches: string[];
  expiresAt: number;
}

export interface RepoCacheEntry {
  repositories: RepoConfig[];
  expiresAt: number;
}

export interface UserCache {
  repositories?: RepoCacheEntry;
  branches: Map<string, BranchCacheEntry>;
  lastAccessed: number;
}

export class UserCacheService {
  // Server-side [user_id, cache] map
  private userCaches = new Map<string, UserCache>();

  // Default TTL for cached entries (10 minutes)
  private readonly DEFAULT_TTL_MS = 10 * 60 * 1000;

  constructor(defaultTtlMs?: number) {
    if (defaultTtlMs) {
      this.DEFAULT_TTL_MS = defaultTtlMs;
    }
  }

  /**
   * Retrieves or initializes the cache object for a user
   */
  public getUserCache(userId: string): UserCache {
    let cache = this.userCaches.get(userId);
    if (!cache) {
      cache = {
        branches: new Map<string, BranchCacheEntry>(),
        lastAccessed: Date.now(),
      };
      this.userCaches.set(userId, cache);
    } else {
      cache.lastAccessed = Date.now();
    }
    return cache;
  }

  /**
   * Get cached repositories for a user
   */
  public getCachedRepositories(userId: string): RepoConfig[] | null {
    const cache = this.userCaches.get(userId);
    if (!cache || !cache.repositories) return null;

    if (Date.now() > cache.repositories.expiresAt) {
      delete cache.repositories;
      return null;
    }

    return cache.repositories.repositories;
  }

  /**
   * Set cached repositories for a user
   */
  public setCachedRepositories(
    userId: string,
    repositories: RepoConfig[],
    ttlMs: number = this.DEFAULT_TTL_MS
  ): void {
    const cache = this.getUserCache(userId);
    cache.repositories = {
      repositories,
      expiresAt: Date.now() + ttlMs,
    };
  }

  /**
   * Get cached branches for a specific repository and user
   */
  public getCachedBranches(userId: string, repoFullName: string): string[] | null {
    const cache = this.userCaches.get(userId);
    if (!cache) return null;

    const key = repoFullName.toLowerCase();
    const entry = cache.branches.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      cache.branches.delete(key);
      return null;
    }

    return entry.branches;
  }

  /**
   * Set cached branches for a specific repository and user
   */
  public setCachedBranches(
    userId: string,
    repoFullName: string,
    branches: string[],
    ttlMs: number = this.DEFAULT_TTL_MS
  ): void {
    const cache = this.getUserCache(userId);
    const key = repoFullName.toLowerCase();
    cache.branches.set(key, {
      branches,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Clear cache for a specific user
   */
  public clearUserCache(userId: string): boolean {
    return this.userCaches.delete(userId);
  }

  /**
   * Clear all user caches
   */
  public clearAll(): void {
    this.userCaches.clear();
  }

  /**
   * Get total number of active user caches
   */
  public size(): number {
    return this.userCaches.size;
  }
}
