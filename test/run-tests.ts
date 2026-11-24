import assert from 'assert';
import { parseRepositories, isChannelAllowed } from '../src/config';
import { UserCacheService } from '../src/services/cache';
import { GitHubService } from '../src/services/github';
import { DatabaseService } from '../src/services/database';
import { GuildService } from '../src/services/guild-service';
import { buildPrConfirmationCard } from '../src/interactions/modal-handler';
import { getBotInviteUrl, inviteCommand } from '../src/commands/invite';
import { setupCommand } from '../src/commands/setup';
import { setTokenCommand } from '../src/commands/set-token';
import { menuCommand } from '../src/commands/menu';
import { setBranchCommand } from '../src/commands/set-branch';
import { myBranchesCommand } from '../src/commands/my-branches';
import { prCommand } from '../src/commands/pr';

async function runTests() {
  console.log('🧪 Starting Discord GitHub PR Bot Multi-Tenant & User-Wise Test Suite...\n');

  // Test 1: Repository configuration parsing
  console.log('Test 1: parseRepositories()');
  {
    const parsed = parseRepositories(
      'octocat/Hello-World,facebook/react:develop,https://github.com/thingsfake86-ux/prbot-test-001.git,https://github.com/thingsfake86-ux/prbot-test-002.git:release',
      'main'
    );
    assert.strictEqual(parsed.length, 4);
    assert.deepStrictEqual(parsed[0], {
      owner: 'octocat',
      repo: 'Hello-World',
      fullName: 'octocat/Hello-World',
      targetBranch: 'main',
    });
    assert.deepStrictEqual(parsed[1], {
      owner: 'facebook',
      repo: 'react',
      fullName: 'facebook/react',
      targetBranch: 'develop',
    });
    console.log('  ✅ Successfully parsed repository formats, full GitHub URLs, and custom target branches.');
  }

  // Test 2: Channel Guard (isChannelAllowed)
  console.log('\nTest 2: Channel Guard (isChannelAllowed)');
  {
    assert.strictEqual(isChannelAllowed('channel_200', 'channel_200'), true);
    assert.strictEqual(isChannelAllowed('channel_999', 'channel_200'), false);
    assert.strictEqual(isChannelAllowed('channel_any', undefined), true);
    console.log('  ✅ Channel restriction correctly enforced.');
  }

  // Test 3: In-Memory Server UserCacheService [user_id, cache]
  console.log('\nTest 3: UserCacheService [user_id, cache] operations');
  {
    const cacheService = new UserCacheService(1000);

    const repos = [
      { owner: 'irtechnocraft', repo: 'backend', fullName: 'irtechnocraft/backend', targetBranch: 'QA' },
    ];

    cacheService.setCachedRepositories('user_1', repos);
    assert.deepStrictEqual(cacheService.getCachedRepositories('user_1'), repos);
    assert.strictEqual(cacheService.getCachedRepositories('user_2'), null);

    cacheService.setCachedBranches('user_1', 'irtechnocraft/backend', ['main', 'QA', 'feature/task-1']);
    assert.deepStrictEqual(
      cacheService.getCachedBranches('user_1', 'irtechnocraft/backend'),
      ['main', 'QA', 'feature/task-1']
    );

    cacheService.clearUserCache('user_1');
    assert.strictEqual(cacheService.getCachedRepositories('user_1'), null);
    assert.strictEqual(cacheService.getCachedBranches('user_1', 'irtechnocraft/backend'), null);

    console.log('  ✅ UserCacheService mapping [user_id, cache], isolation, and operations validated.');
  }

  // Test 4: GitHubService Branch Comparison simulation
  console.log('\nTest 4: GitHubService compareBranchWithBase simulation');
  {
    const cacheService = new UserCacheService();
    const gitHubService = new GitHubService('', cacheService);

    const octokitAny = (gitHubService as any).octokit;

    octokitAny.rest.repos.compareCommits = async (params: any) => {
      if (params.head === 'feature/with-changes') {
        return {
          data: {
            ahead_by: 3,
            behind_by: 0,
            status: 'ahead',
            total_commits: 3,
            files: [{ filename: 'src/index.ts' }],
          },
        };
      }
      if (params.head === 'feature/no-changes') {
        return {
          data: {
            ahead_by: 0,
            behind_by: 0,
            status: 'identical',
            total_commits: 0,
            files: [],
          },
        };
      }
      const notFoundErr: any = new Error('Not Found');
      notFoundErr.status = 404;
      throw notFoundErr;
    };

    const hasChangesResult = await gitHubService.compareBranchWithBase(
      'owner',
      'repo',
      'feature/with-changes',
      'QA'
    );
    assert.strictEqual(hasChangesResult.hasChanges, true);
    assert.strictEqual(hasChangesResult.aheadBy, 3);

    const noChangesResult = await gitHubService.compareBranchWithBase(
      'owner',
      'repo',
      'feature/no-changes',
      'QA'
    );
    assert.strictEqual(noChangesResult.hasChanges, false);
    assert.strictEqual(noChangesResult.aheadBy, 0);

    console.log('  ✅ Branch diff comparison correctly detects changes ahead of target branch.');
  }

  // Test 5: Public Channel Announcement Embed Card
  console.log('\nTest 5: buildPrConfirmationCard channel announcement');
  {
    const card = buildPrConfirmationCard(
      { owner: 'irtechnocraft', repo: 'backend', fullName: 'irtechnocraft/backend', targetBranch: 'QA' },
      'feature/task-1',
      '1480460560612069406'
    );
    assert.ok(card.embed.data.fields?.some(f => f.name.includes('Public Announcement')));
    assert.ok(card.embed.data.fields?.some(f => f.value.includes('<#1480460560612069406>')));
    console.log('  ✅ PR confirmation card displays public announcement channel info.');
  }

  // Test 6: DatabaseService & GuildService Multi-Tenant & User-Wise operations
  console.log('\nTest 6: DatabaseService & GuildService (User tokens & Two Branches)');
  {
    const db = new DatabaseService({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'discord_pr_bot',
    });

    await db.initDatabase();
    const userCache = new UserCacheService();
    const guildService = new GuildService(db, userCache);

    const testGuildId = 'test_guild_userwise_1';
    await guildService.saveGuildConfig(testGuildId, {
      channelId: 'channel_userwise',
      repositories: 'org/frontend,org/backend',
    });

    // 1. User Personal GitHub Token isolation
    await guildService.setUserToken('dev_alice', 'fake_test_token_alice_123');
    await guildService.setUserToken('dev_bob', 'fake_test_token_bob_456');

    const aliceToken = await guildService.getUserToken('dev_alice');
    const bobToken = await guildService.getUserToken('dev_bob');
    assert.strictEqual(aliceToken, 'fake_test_token_alice_123');
    assert.strictEqual(bobToken, 'fake_test_token_bob_456');

    // 2. User Two Branches Setup: branch_name and target_branch in user_branches
    await guildService.setUserBranchConfig(testGuildId, 'dev_alice', 'org/frontend', 'feature/login-ui', 'QA');
    await guildService.setUserBranchConfig(testGuildId, 'dev_bob', 'org/frontend', 'feature/auth-backend', 'develop');

    const aliceBranches = await guildService.getUserBranchConfig(testGuildId, 'dev_alice', 'org/frontend');
    assert.deepStrictEqual(aliceBranches, {
      branchName: 'feature/login-ui',
      targetBranch: 'QA',
    });

    const bobBranches = await guildService.getUserBranchConfig(testGuildId, 'dev_bob', 'org/frontend');
    assert.deepStrictEqual(bobBranches, {
      branchName: 'feature/auth-backend',
      targetBranch: 'develop',
    });

    // 3. User-Specific GitHubService resolution
    const aliceService = await guildService.getUserGitHubService('dev_alice');
    assert.ok(aliceService !== null);

    await db.close();
    console.log('  ✅ User-wise GitHub tokens and two-branch configuration verified in MySQL.');
  }

  // Test 7: Slash Command JSON specifications & Permissions
  console.log('\nTest 7: Slash Commands Definitions');
  {
    const setupJson = setupCommand.data.toJSON();
    assert.strictEqual(setupJson.name, 'setup');

    const setTokenJson = setTokenCommand.data.toJSON();
    assert.strictEqual(setTokenJson.name, 'set-token');

    const inviteJson = inviteCommand.data.toJSON();
    assert.strictEqual(inviteJson.name, 'invite');

    const menuJson = menuCommand.data.toJSON();
    assert.strictEqual(menuJson.name, 'menu');

    const setBranchJson = setBranchCommand.data.toJSON();
    assert.strictEqual(setBranchJson.name, 'set-branch');
    assert.strictEqual(setBranchJson.options?.length, 3); // repo, from, to

    const myBranchesJson = myBranchesCommand.data.toJSON();
    assert.strictEqual(myBranchesJson.name, 'my-branches');

    const prJson = prCommand.data.toJSON();
    assert.strictEqual(prJson.name, 'pr');

    console.log('  ✅ All 7 Slash Commands schema and options validated.');
  }

  // Test 8: Bot Invite URL Generator
  console.log('\nTest 8: Bot Invite URL Generator');
  {
    const url = getBotInviteUrl('1573761771955687576');
    assert.ok(url.includes('client_id=1573761771955687576'));
    assert.ok(url.includes('permissions=2147551296'));
    console.log('  ✅ Bot OAuth2 Invite Link format validated.');
  }

  console.log('\n🎉 All tests passed successfully!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
