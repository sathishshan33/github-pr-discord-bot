import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface RepoConfig {
  owner: string;
  repo: string;
  fullName: string; // e.g. "facebook/react"
  targetBranch: string; // e.g. "main" or "develop"
}

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  prNotificationChannelId?: string;
  notifierIds: string[];
  githubToken: string;
  defaultTargetBranch: string;
  repositories: RepoConfig[];
  dataPath: string;
}

export function parseNotifierIds(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '') return [];
  const matches = [...raw.matchAll(/<@!?(\d+)>|\b(\d{17,20})\b/g)];
  if (matches.length > 0) {
    return Array.from(new Set(matches.map(m => m[1] || m[2])));
  }
  return raw.split(',').map(s => s.trim().replace(/^<@!?/, '').replace(/>$/, '')).filter(Boolean);
}

export function parseRepositories(repoStr: string | undefined, defaultTarget: string): RepoConfig[] {
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
  const prNotificationChannelId = (process.env.PR_NOTIFICATION_CHANNEL_ID || process.env.NOTIFICATION_CHANNEL_ID || '').trim() || undefined;
  const notifierIds = parseNotifierIds(process.env.NOTIFIER_IDS || process.env.NOTIFIERS || '');
  const githubToken = process.env.GITHUB_TOKEN || '';
  const defaultTargetBranch = process.env.DEFAULT_TARGET_BRANCH || 'main';
  const repositoriesRaw = process.env.REPOSITORIES || '';

  const repositories = parseRepositories(repositoriesRaw, defaultTargetBranch);
  const dataPath = path.resolve(process.cwd(), 'data', 'user-branches.json');

  return {
    discordToken,
    discordClientId,
    prNotificationChannelId,
    notifierIds,
    githubToken,
    defaultTargetBranch,
    repositories,
    dataPath,
  };
}

export const config = loadConfig();
