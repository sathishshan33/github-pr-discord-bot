import dotenv from 'dotenv';

dotenv.config();

export interface RepoConfig {
  owner: string;
  repo: string;
  fullName: string; // e.g. "facebook/react"
  targetBranch: string; // e.g. "main" or "develop"
}

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
}

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  db: DbConfig;
}

export function parseRepositories(repoStr: string | undefined, defaultTarget: string = 'QA'): RepoConfig[] {
  if (!repoStr || repoStr.trim() === '') {
    return [];
  }

  const items = repoStr.split(',').map(s => s.trim()).filter(Boolean);
  const result: RepoConfig[] = [];

  for (const rawItem of items) {
    let item = rawItem.trim();
    let targetBranch = defaultTarget;

    // Check if target branch is appended at the end after the repo (e.g. repo:branch)
    // Avoid splitting the "https:" protocol if a URL was provided
    if (item.includes('://')) {
      const parts = item.split('://');
      const protocol = parts[0];
      const rest = parts.slice(1).join('://');
      if (rest.includes(':')) {
        const [urlPart, branchPart] = rest.split(':');
        item = `${protocol}://${urlPart}`;
        if (branchPart && branchPart.trim()) {
          targetBranch = branchPart.trim();
        }
      }
    } else if (item.includes(':')) {
      const [repoPart, branchPart] = item.split(':');
      item = repoPart.trim();
      if (branchPart && branchPart.trim()) {
        targetBranch = branchPart.trim();
      }
    }

    // Strip https://github.com/ or git@github.com: if present
    item = item.replace(/^https?:\/\/github\.com\//i, '');
    item = item.replace(/^git@github\.com:/i, '');
    // Strip trailing .git
    item = item.replace(/\.git$/i, '');
    // Strip leading/trailing slashes
    item = item.replace(/^\/+|\/+$/g, '');

    const [owner, repo] = item.split('/');

    if (!owner || !repo) {
      console.warn(`[Config] Invalid repository format: "${rawItem}". Expected format: "owner/repo" or "https://github.com/owner/repo.git"`);
      continue;
    }

    result.push({
      owner: owner.trim(),
      repo: repo.trim(),
      fullName: `${owner.trim()}/${repo.trim()}`,
      targetBranch,
    });
  }

  return result;
}

export function loadConfig(): AppConfig {
  const discordToken = process.env.DISCORD_TOKEN || '';
  const discordClientId = process.env.DISCORD_CLIENT_ID || '';

  const db: DbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'discord_pr_bot',
  };

  return {
    discordToken,
    discordClientId,
    db,
  };
}

export function isChannelAllowed(
  targetChannelId: string | null | undefined,
  configuredChannelId: string | null | undefined
): boolean {
  if (!configuredChannelId) return true;
  return targetChannelId === configuredChannelId;
}

export const config = loadConfig();
