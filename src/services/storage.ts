import fs from 'fs';
import path from 'path';

export interface UserBranchMap {
  [userId: string]: {
    [repoFullName: string]: string;
  };
}

export class StorageService {
  private filePath: string;
  private data: any = {};

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
      } else {
        this.data = {};
      }
    } catch (err) {
      console.error(`[StorageService] Failed to load data from ${this.filePath}:`, err);
      this.data = {};
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error(`[StorageService] Failed to save data to ${this.filePath}:`, err);
    }
  }

  public getUserBranch(userId: string, repoFullName: string): string | null {
    return this.data[userId]?.[repoFullName] || null;
  }

  public setUserBranch(userId: string, repoFullName: string, branch: string): void {
    if (!this.data[userId]) {
      this.data[userId] = {};
    }
    this.data[userId][repoFullName] = branch;
    this.save();
  }

  public removeUserBranch(userId: string, repoFullName: string): boolean {
    if (this.data[userId] && this.data[userId][repoFullName]) {
      delete this.data[userId][repoFullName];
      this.save();
      return true;
    }
    return false;
  }

  public getAllUserBranches(userId: string): { [repoFullName: string]: string } {
    if (!this.data[userId]) return {};
    const result: { [repoFullName: string]: string } = {};
    for (const [k, v] of Object.entries(this.data[userId])) {
      if (typeof v === 'string') {
        result[k] = v;
      }
    }
    return result;
  }

  public getUserNotifiers(userId: string, repoFullName: string): string[] {
    const list = this.data['__notifiers__']?.[userId]?.[repoFullName];
    return Array.isArray(list) ? list : [];
  }

  public setUserNotifiers(userId: string, repoFullName: string, notifierIds: string[]): void {
    if (!this.data['__notifiers__']) this.data['__notifiers__'] = {};
    if (!this.data['__notifiers__'][userId]) this.data['__notifiers__'][userId] = {};
    this.data['__notifiers__'][userId][repoFullName] = notifierIds;
    this.save();
  }
}
