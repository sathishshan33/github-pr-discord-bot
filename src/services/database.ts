import mysql, { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export interface GuildDbConfig {
  guildId: string;
  channelId?: string;
  repositories?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserBranchConfig {
  branchName: string;
  targetBranch: string;
}

export interface DbConnectionOptions {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}

export class DatabaseService {
  private pool: Pool;

  constructor(options: DbConnectionOptions) {
    this.pool = mysql.createPool({
      host: options.host || 'localhost',
      port: options.port || 3306,
      user: options.user || 'root',
      password: options.password || '',
      database: options.database || 'discord_pr_bot',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
    });
  }

  public async initDatabase(): Promise<void> {
    // 1. Create guild_configs table (server level: only guild, channel, and repositories)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS guild_configs (
        guild_id VARCHAR(32) PRIMARY KEY,
        channel_id VARCHAR(32) NULL,
        repositories TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Create user_tokens table (per-user GitHub PAT)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_tokens (
        user_id VARCHAR(32) PRIMARY KEY,
        github_token TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. Create user_branches table with target_branch right next to branch_name
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_branches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        repo_full_name VARCHAR(255) NOT NULL,
        branch_name VARCHAR(255) NOT NULL,
        target_branch VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_guild_user_repo (guild_id, user_id, repo_full_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Migration safe check: ensure target_branch exists in user_branches
    try {
      await this.pool.query(`ALTER TABLE user_branches ADD COLUMN IF NOT EXISTS target_branch VARCHAR(255) AFTER branch_name;`);
    } catch (_) {}

    console.log('✅ MySQL tables initialized (guild_configs, user_tokens, user_branches).');
  }

  /* ================= Guild Configs ================= */

  public async getGuildConfig(guildId: string): Promise<GuildDbConfig | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT guild_id, channel_id, repositories, created_at, updated_at FROM guild_configs WHERE guild_id = ?',
      [guildId]
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      guildId: row.guild_id,
      channelId: row.channel_id || undefined,
      repositories: row.repositories || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async saveGuildConfig(config: GuildDbConfig): Promise<void> {
    await this.pool.query(
      `INSERT INTO guild_configs (guild_id, channel_id, repositories)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         channel_id = COALESCE(VALUES(channel_id), channel_id),
         repositories = COALESCE(VALUES(repositories), repositories),
         updated_at = CURRENT_TIMESTAMP`,
      [
        config.guildId,
        config.channelId || null,
        config.repositories || null,
      ]
    );
  }

  /* ================= User GitHub Tokens ================= */

  public async getUserToken(userId: string): Promise<string | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT github_token FROM user_tokens WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0) return null;
    return rows[0].github_token;
  }

  public async setUserToken(userId: string, token: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_tokens (user_id, github_token)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
         github_token = VALUES(github_token),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, token]
    );
  }

  public async removeUserToken(userId: string): Promise<boolean> {
    const [res] = await this.pool.query<ResultSetHeader>(
      'DELETE FROM user_tokens WHERE user_id = ?',
      [userId]
    );
    return res.affectedRows > 0;
  }

  /* ================= User Branches (branch_name and target_branch) ================= */

  public async getUserBranchConfig(
    guildId: string,
    userId: string,
    repoFullName: string
  ): Promise<UserBranchConfig | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT branch_name, target_branch FROM user_branches WHERE guild_id = ? AND user_id = ? AND repo_full_name = ?',
      [guildId, userId, repoFullName.toLowerCase()]
    );

    if (rows.length === 0) return null;
    const row = rows[0];

    if (!row.branch_name) return null;

    return {
      branchName: row.branch_name,
      targetBranch: row.target_branch || 'QA',
    };
  }

  public async setUserBranchConfig(
    guildId: string,
    userId: string,
    repoFullName: string,
    branchName: string,
    targetBranch: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_branches (guild_id, user_id, repo_full_name, branch_name, target_branch)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         branch_name = VALUES(branch_name),
         target_branch = VALUES(target_branch),
         updated_at = CURRENT_TIMESTAMP`,
      [guildId, userId, repoFullName.toLowerCase(), branchName, targetBranch]
    );
  }

  public async getAllUserBranchConfigs(
    guildId: string,
    userId: string
  ): Promise<Record<string, UserBranchConfig>> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT repo_full_name, branch_name, target_branch FROM user_branches WHERE guild_id = ? AND user_id = ?',
      [guildId, userId]
    );

    const result: Record<string, UserBranchConfig> = {};
    for (const row of rows) {
      result[row.repo_full_name] = {
        branchName: row.branch_name,
        targetBranch: row.target_branch || 'QA',
      };
    }
    return result;
  }

  public async removeUserBranch(guildId: string, userId: string, repoFullName: string): Promise<boolean> {
    const [res] = await this.pool.query<ResultSetHeader>(
      'DELETE FROM user_branches WHERE guild_id = ? AND user_id = ? AND repo_full_name = ?',
      [guildId, userId, repoFullName.toLowerCase()]
    );
    return res.affectedRows > 0;
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
