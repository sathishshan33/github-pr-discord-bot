import { REST, Routes } from 'discord.js';
import { loadConfig } from './config';
import { setupCommand } from './commands/setup';
import { inviteCommand } from './commands/invite';
import { setTokenCommand } from './commands/set-token';
import { menuCommand } from './commands/menu';
import { setBranchCommand } from './commands/set-branch';
import { myBranchesCommand } from './commands/my-branches';
import { prCommand } from './commands/pr';

const config = loadConfig();

if (!config.discordToken || !config.discordClientId) {
  console.error('❌ Error: DISCORD_TOKEN and DISCORD_CLIENT_ID must be set in your .env file to register commands.');
  process.exit(1);
}

const commands = [
  setupCommand.data.toJSON(),
  inviteCommand.data.toJSON(),
  setTokenCommand.data.toJSON(),
  menuCommand.data.toJSON(),
  setBranchCommand.data.toJSON(),
  myBranchesCommand.data.toJSON(),
  prCommand.data.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(config.discordToken);

async function deploy() {
  try {
    console.log(`Started registering ${commands.length} application (/) commands globally...`);

    await rest.put(
      Routes.applicationCommands(config.discordClientId),
      { body: commands }
    );
    console.log(`✅ Successfully registered ${commands.length} application commands globally!`);
  } catch (error) {
    console.error('❌ Error registering slash commands:', error);
    process.exit(1);
  }
}

deploy();
