import { REST, Routes } from 'discord.js';
import { loadConfig } from './config';
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
  menuCommand.data.toJSON(),
  setBranchCommand.data.toJSON(),
  myBranchesCommand.data.toJSON(),
  prCommand.data.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(config.discordToken);

async function deploy() {
  try {
    console.log(`Started registering ${commands.length} application (/) commands for Direct Messages...`);

    // Register globally with BotDM / User contexts (no server / guild needed)
    await rest.put(
      Routes.applicationCommands(config.discordClientId),
      { body: commands }
    );
    console.log('✅ Successfully registered application commands for Direct Messages!');
  } catch (error) {
    console.error('❌ Error registering slash commands:', error);
    process.exit(1);
  }
}

deploy();
