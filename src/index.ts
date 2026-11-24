import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  Interaction,
  ActivityType,
  Message,
} from 'discord.js';
import { config, isChannelAllowed } from './config';
import { DatabaseService } from './services/database';
import { UserCacheService } from './services/cache';
import { GuildService } from './services/guild-service';
import { getBotInviteUrl, inviteCommand } from './commands/invite';
import { setupCommand } from './commands/setup';
import { setTokenCommand } from './commands/set-token';
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

// Initialize core services
const db = new DatabaseService(config.db);
const userCache = new UserCacheService();
const guildService = new GuildService(db, userCache);

// Create Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`🤖 Logged in as ${readyClient.user.tag}!`);

  try {
    // Initialize MySQL tables
    await db.initDatabase();

    // Seed default guild configuration if not already in DB
    await guildService.seedDefaultGuildIfEmpty({
      guildId: '1507441873860428038',
      channelId: '1507441877366870018',
      repositories:
        'https://github.com/irtechnocraft-pvt/cutting_module_backend_v2.0.git,https://github.com/irtechnocraft-pvt/cutting_module_frontend_v2.0.git,https://github.com/irtechnocraft-pvt/cutting_module_admin_control.git',
    });
  } catch (err) {
    console.error('⚠️ Database initialization error:', err);
  }

  const inviteUrl = getBotInviteUrl(config.discordClientId);
  console.log(`\n======================================================`);
  console.log(`🔗 SHAREABLE BOT INVITE LINK:`);
  console.log(`   ${inviteUrl}`);
  console.log(`======================================================\n`);

  readyClient.user.setActivity('GitHub PRs across servers', { type: ActivityType.Watching });
});

// Listen to text messages in configured working channels
client.on(Events.MessageCreate, async (message: Message) => {
  try {
    if (message.author.bot || !message.guildId) return;

    const guildConfig = await guildService.getGuildConfig(message.guildId);
    if (!guildConfig || !guildConfig.channelId) return;

    if (!isChannelAllowed(message.channelId, guildConfig.channelId)) {
      return;
    }

    await handleDirectMessage(message, guildConfig, guildService);
  } catch (error) {
    console.error('[Message Handler Error]:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    // 1. Handle /invite command (works anywhere, including DMs)
    if (interaction.isChatInputCommand() && interaction.commandName === 'invite') {
      await inviteCommand.execute(interaction, config);
      return;
    }

    // 2. Handle /set-token command (works anywhere, stores user's GitHub token)
    if (interaction.isChatInputCommand() && interaction.commandName === 'set-token') {
      await setTokenCommand.execute(interaction, guildService);
      return;
    }

    // Handle token modal submission
    if (interaction.isModalSubmit() && interaction.customId === 'user_modal_set_token') {
      await setTokenCommand.handleModal(interaction, guildService);
      return;
    }

    // Handle token button click
    if (interaction.isButton() && interaction.customId === 'dm_btn_set_token') {
      await setTokenCommand.handleButton(interaction, guildService);
      return;
    }

    // Require guild context for all operational commands
    if (!interaction.guildId) {
      if (interaction.isRepliable()) {
        const inviteUrl = getBotInviteUrl(config.discordClientId);
        await interaction.reply({
          content: `❌ This bot is designed to be used inside Discord servers.\n🔗 You can add it to your server using this link:\n${inviteUrl}`,
          ephemeral: true,
        }).catch(() => {});
      }
      return;
    }

    // 3. Handle /setup command (Admin configuration, runnable in any channel in the guild)
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
      await setupCommand.execute(interaction, guildService);
      return;
    }

    // Handle setup buttons
    if (interaction.isButton() && interaction.customId.startsWith('setup_btn_')) {
      await setupCommand.handleButton(interaction, guildService);
      return;
    }

    // Handle setup modal submit
    if (interaction.isModalSubmit() && interaction.customId === 'setup_modal_submit') {
      await setupCommand.handleModal(interaction, guildService);
      return;
    }

    // Retrieve per-guild configuration from MySQL
    const guildConfig = await guildService.getGuildConfig(interaction.guildId);

    // If guild is not configured yet (no channel or no repositories), prompt admin to run /setup
    if (!guildConfig || !guildConfig.channelId) {
      if (interaction.isAutocomplete()) {
        await interaction.respond([]);
        return;
      }
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: '⚠️ This server has not completed PR bot setup yet.\nA server administrator must run `/setup` to select a working channel and add repositories.',
          ephemeral: true,
        }).catch(() => {});
      }
      return;
    }

    // Enforce channel restriction: commands only run in configured working channel
    if (!isChannelAllowed(interaction.channelId, guildConfig.channelId)) {
      if (interaction.isAutocomplete()) {
        await interaction.respond([]);
        return;
      }
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: `⚠️ This bot is configured to only work in <#${guildConfig.channelId}> in this server.`,
          ephemeral: true,
        }).catch(() => {});
      }
      return;
    }

    // 4. Handle Autocomplete
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === 'set-branch') {
        await setBranchCommand.autocomplete(interaction, guildConfig, guildService);
      } else if (interaction.commandName === 'pr') {
        await prCommand.autocomplete(interaction, guildConfig);
      }
      return;
    }

    // 5. Handle Operational Slash Commands
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      if (commandName === 'menu') {
        await menuCommand.execute(interaction, guildConfig);
      } else if (commandName === 'set-branch') {
        await setBranchCommand.execute(interaction, guildConfig, guildService);
      } else if (commandName === 'my-branches') {
        await myBranchesCommand.execute(interaction, guildConfig, guildService);
      } else if (commandName === 'pr') {
        await prCommand.execute(interaction, guildConfig, guildService);
      }
      return;
    }

    // 6. Handle Select Menus (Repo Pickers)
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('dm_select_repo_')) {
        await handleDmSelectMenu(interaction, guildConfig, guildService);
        return;
      }
    }

    // 7. Handle Button Interactions
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('dm_btn_')) {
        await handleDmButton(interaction, guildConfig, guildService);
        return;
      }
      await handlePrButtonInteraction(interaction, guildConfig, guildService);
      return;
    }

    // 8. Handle Modal Submissions
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('dm_modal_set_branch:')) {
        await handleDmModalSubmit(interaction, guildConfig, guildService);
        return;
      }
      await handlePrModalSubmit(interaction, guildConfig, guildService);
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

// Graceful shutdown handler to immediately set bot presence to offline (invisible)
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 Received ${signal}. Shutting down bot gracefully...`);

  try {
    if (client.isReady() && client.user) {
      console.log('📡 Updating presence to offline (invisible)...');
      client.user.setPresence({
        status: 'invisible',
        activities: [],
      });

      // Small delay to ensure the Gateway WebSocket sends the presence packet
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('🔌 Disconnecting from Discord Gateway...');
      await client.destroy();
      console.log('✅ Discord client disconnected.');
    }

    console.log('🗄️ Closing database connection pool...');
    await db.close().catch(() => {});
    console.log('✅ Database connection closed.');
  } catch (err) {
    console.error('Error during shutdown:', err);
  } finally {
    console.log('👋 Bot is now completely offline. Exiting process.');
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGBREAK', () => gracefulShutdown('SIGBREAK'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

client.login(config.discordToken).catch(err => {
  console.error('❌ Discord login failed:', err);
  process.exit(1);
});
