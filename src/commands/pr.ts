import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import { GuildRuntimeConfig, GuildService } from '../services/guild-service';
import { buildPrConfirmationCard } from '../interactions/modal-handler';

export const prCommand = {
  data: new SlashCommandBuilder()
    .setName('pr')
    .setDescription('Create a Pull Request using your branch_name, target_branch, and personal GitHub token')
    .setContexts([
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes([
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ])
    .addStringOption(option =>
      option
        .setName('repo')
        .setDescription('Select the repository')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction: AutocompleteInteraction, guildConfig: GuildRuntimeConfig) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'repo') {
      const query = focusedOption.value.toLowerCase();
      const filtered = guildConfig.repositories
        .filter(r => r.fullName.toLowerCase().includes(query))
        .slice(0, 25);

      await interaction.respond(
        filtered.map(r => ({ name: r.fullName, value: r.fullName }))
      );
    }
  },

  async execute(
    interaction: ChatInputCommandInteraction,
    guildConfig: GuildRuntimeConfig,
    guildService: GuildService
  ) {
    if (!interaction.guildId) return;

    const repoFullName = interaction.options.getString('repo', true);

    const repoConfig = guildConfig.repositories.find(
      r => r.fullName.toLowerCase() === repoFullName.toLowerCase()
    );

    if (!repoConfig) {
      await interaction.reply({
        content: `❌ Repository **${repoFullName}** is not recognized in this server. Please pick one from autocomplete or run \`/setup\` to add it.`,
        ephemeral: true,
      });
      return;
    }

    // 1. Verify user's personal GitHub token
    const userToken = await guildService.getUserToken(interaction.user.id);
    if (!userToken) {
      const setTokenBtn = new ButtonBuilder()
        .setCustomId('dm_btn_set_token')
        .setLabel('Connect GitHub Token')
        .setEmoji('🔑')
        .setStyle(ButtonStyle.Primary);
      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(setTokenBtn);

      await interaction.reply({
        content: `⚠️ You must connect your personal GitHub token first so the PR is opened under your GitHub account.`,
        components: [actionRow],
        ephemeral: true,
      });
      return;
    }

    // 2. Verify user's branches setup (branch_name and target_branch)
    const branchConfig = await guildService.getUserBranchConfig(interaction.guildId, interaction.user.id, repoConfig.fullName);

    if (!branchConfig || !branchConfig.branchName) {
      await interaction.reply({
        content: `⚠️ You haven't configured your branches for **${repoConfig.fullName}** yet.\n\nPlease run:\n\`/set-branch repo:${repoConfig.fullName} branch:<your-branch>\`\nbefore creating a pull request.`,
        ephemeral: true,
      });
      return;
    }

    const gitHubService = await guildService.getUserGitHubService(interaction.user.id);

    // 3. Pre-flight check: verify branch has changes compared to target branch
    if (gitHubService) {
      const check = await gitHubService.compareBranchWithBase(
        repoConfig.owner,
        repoConfig.repo,
        branchConfig.branchName,
        branchConfig.targetBranch
      );

      if (!check.hasChanges) {
        const reason =
          check.errorMessage ||
          `Branch \`${branchConfig.branchName}\` has 0 commits ahead of target branch \`${branchConfig.targetBranch}\` (no file changes).`;
        await interaction.reply({
          content: `⚠️ **Cannot create Pull Request:**\n${reason}\n\nPlease commit and push changes before creating a PR.`,
          ephemeral: true,
        });
        return;
      }
    }

    const card = buildPrConfirmationCard(
      {
        ...repoConfig,
        targetBranch: branchConfig.targetBranch,
      },
      branchConfig.branchName,
      guildConfig.channelId
    );

    await interaction.reply({
      embeds: [card.embed],
      components: card.components,
      ephemeral: true,
    });
  },
};
