import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { parseRepositories, parseNotifierIds } from '../src/config';
import { StorageService } from '../src/services/storage';
import { menuCommand } from '../src/commands/menu';
import { setBranchCommand } from '../src/commands/set-branch';
import { myBranchesCommand } from '../src/commands/my-branches';
import { prCommand } from '../src/commands/pr';

async function runTests() {
  console.log('🧪 Starting Discord GitHub PR Bot Test Suite...\n');

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
    assert.deepStrictEqual(parsed[2], {
      owner: 'thingsfake86-ux',
      repo: 'prbot-test-001',
      fullName: 'thingsfake86-ux/prbot-test-001',
      targetBranch: 'main',
    });
    assert.deepStrictEqual(parsed[3], {
      owner: 'thingsfake86-ux',
      repo: 'prbot-test-002',
      fullName: 'thingsfake86-ux/prbot-test-002',
      targetBranch: 'release',
    });
    console.log('  ✅ Successfully parsed repository formats, full GitHub URLs, and custom target branches.');
  }

  // Test 2: StorageService
  console.log('\nTest 2: StorageService operations');
  {
    const testDataPath = path.resolve(__dirname, 'test-storage.json');
    if (fs.existsSync(testDataPath)) {
      fs.unlinkSync(testDataPath);
    }

    const storage = new StorageService(testDataPath);

    // Initial state check
    assert.strictEqual(storage.getUserBranch('user123', 'owner/repo'), null);

    // Set user branch
    storage.setUserBranch('user123', 'owner/repo', 'feature/login');
    assert.strictEqual(storage.getUserBranch('user123', 'owner/repo'), 'feature/login');

    // Multiple repos per user
    storage.setUserBranch('user123', 'owner/other-repo', 'fix/bug-42');
    const allBranches = storage.getAllUserBranches('user123');
    assert.strictEqual(allBranches['owner/repo'], 'feature/login');
    assert.strictEqual(allBranches['owner/other-repo'], 'fix/bug-42');

    // Reload from file to ensure persistence
    const reloadedStorage = new StorageService(testDataPath);
    assert.strictEqual(reloadedStorage.getUserBranch('user123', 'owner/repo'), 'feature/login');
    assert.strictEqual(reloadedStorage.getUserBranch('user123', 'owner/other-repo'), 'fix/bug-42');

    // Remove user branch
    const removed = reloadedStorage.removeUserBranch('user123', 'owner/repo');
    assert.strictEqual(removed, true);
    assert.strictEqual(reloadedStorage.getUserBranch('user123', 'owner/repo'), null);

    // Test user notifiers persistence
    storage.setUserNotifiers('user123', 'owner/repo', ['111222333444555666', '777888999000111222']);
    const notifiers = storage.getUserNotifiers('user123', 'owner/repo');
    assert.deepStrictEqual(notifiers, ['111222333444555666', '777888999000111222']);

    // Clean up test file
    if (fs.existsSync(testDataPath)) {
      fs.unlinkSync(testDataPath);
    }
    console.log('  ✅ Storage persistence and user branch mapping passed.');
  }

  // Test 3: Notifier IDs parsing from .env
  console.log('\nTest 3: parseNotifierIds()');
  {
    const ids = parseNotifierIds('123456789012345678, <@987654321098765432>, 112233445566778899');
    assert.strictEqual(ids.length, 3);
    assert.strictEqual(ids[0], '123456789012345678');
    assert.strictEqual(ids[1], '987654321098765432');
    assert.strictEqual(ids[2], '112233445566778899');
    console.log('  ✅ Successfully parsed NOTIFIER_IDS from .env formats.');
  }

  // Test 4: Slash Command JSON specifications & DM Contexts
  console.log('\nTest 4: Slash Commands Definitions & DM Contexts');
  {
    const menuJson = menuCommand.data.toJSON();
    assert.strictEqual(menuJson.name, 'menu');
    assert.deepStrictEqual(menuJson.contexts, [0, 1, 2]);

    const setBranchJson = setBranchCommand.data.toJSON();
    assert.strictEqual(setBranchJson.name, 'set-branch');
    assert.strictEqual(setBranchJson.options?.length, 2);
    assert.deepStrictEqual(setBranchJson.contexts, [0, 1, 2]);

    const myBranchesJson = myBranchesCommand.data.toJSON();
    assert.strictEqual(myBranchesJson.name, 'my-branches');
    assert.deepStrictEqual(myBranchesJson.contexts, [0, 1, 2]);

    const prJson = prCommand.data.toJSON();
    assert.strictEqual(prJson.name, 'pr');
    assert.strictEqual(prJson.options?.length, 1);
    assert.deepStrictEqual(prJson.contexts, [0, 1, 2]);

    console.log('  ✅ All Slash Commands schema & DM contexts validated.');
  }

  console.log('\n🎉 All tests passed successfully!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
