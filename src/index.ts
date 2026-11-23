import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  Interaction,
  ActivityType,
  Message,
} from 'discord.js';
import { config } from './config';
import { StorageService } from './services/storage';
import { GitHubService } from './services/github';
import { menuCommand } from './commands/menu';
import { setBranchCommand } from './commands/set-branch';
import { myBranchesCommand } from './commands/my-branches';
import { prCommand } from './commands/pr';
import {
  handlePrButtonInteraction,
  handlePrModalSubmit,
} from './interactions/modal-handler';
import {
  handleDirectMessage,
  handleDmButton,
  handleDmSelectMenu,
  handleDmModalSubmit,
} from './interactions/dm-handler';

// Initialize services
const storage = new StorageService(config.dataPath);
const gitHubService = new GitHubService(config.githubToken);

// Create Discord Client (DM-only, no server needed)
const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`🤖 Logged in as ${readyClient.user.tag}! (Direct Message Mode)`);
  console.log(`📁 Loaded ${config.repositories.length} configured repositories:`);
  for (const repo of config.repositories) {
    console.log(`   - ${repo.fullName} (Target: ${repo.targetBranch})`);
  }

  readyClient.user.setActivity('GitHub PRs via DM', { type: ActivityType.Watching });
});

// Listen to Direct Messages: responds to commands "menu", "pr", "set-branch", "my-branches"
client.on(Events.MessageCreate, async (message: Message) => {
  try {
    await handleDirectMessage(message, config, storage);
  } catch (error) {
    console.error('[DM Message Handler Error]:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    // 1. Handle Autocomplete
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === 'set-branch') {
        await setBranchCommand.autocomplete(interaction, config, gitHubService);
      } else if (interaction.commandName === 'pr') {
        await prCommand.autocomplete(interaction, config);
      }
      return;
    }

    // 2. Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      if (commandName === 'menu') {
        await menuCommand.execute(interaction, config);
      } else if (commandName === 'set-branch') {
        await setBranchCommand.execute(interaction, config, storage);
      } else if (commandName === 'my-branches') {
        await myBranchesCommand.execute(interaction, config, storage);
      } else if (commandName === 'pr') {
        await prCommand.execute(interaction, config, storage);
      }
      return;
    }

    // 3. Handle Select Menus (DM Repo Pickers)
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('dm_select_repo_')) {
        await handleDmSelectMenu(interaction, config, storage);
        return;
      }
    }

    // 4. Handle Button Interactions
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('dm_btn_')) {
        await handleDmButton(interaction, config, storage);
        return;
      }
      await handlePrButtonInteraction(interaction, config, storage);
      return;
    }

    // 5. Handle Modal Submissions
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('dm_modal_set_branch:')) {
        await handleDmModalSubmit(interaction, config, storage);
        return;
      }
      await handlePrModalSubmit(interaction, config, storage, gitHubService);
      return;
    }
  } catch (error) {
    console.error('[Interaction Handler Error]:', error);

    const errorMessage = '❌ An error occurred while processing this request.';
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
      }
    }
  }
});

if (!config.discordToken) {
  console.error('❌ DISCORD_TOKEN is missing in .env! Please configure .env before starting.');
  process.exit(1);
}

client.login(config.discordToken).catch(err => {
  console.error('❌ Discord login failed:', err);
  process.exit(1);
});
