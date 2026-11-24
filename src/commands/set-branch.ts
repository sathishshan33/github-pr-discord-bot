import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import { GuildRuntimeConfig, GuildService } from '../services/guild-service';

export const setBranchCommand = {
  data: new SlashCommandBuilder()
    .setName('set-branch')
    .setDescription('Configure your working branch (branch_name) and target branch (target_branch) for a repo')
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
    )
    .addStringOption(option =>
      option
        .setName('branch')
        .setDescription('Your working branch name (branch_name)')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('target_branch')
        .setDescription('Target branch to merge into (target_branch, e.g. QA or main)')
        .setRequired(false)
        .setAutocomplete(true)
    ),

  async autocomplete(
    interaction: AutocompleteInteraction,
    guildConfig: GuildRuntimeConfig,
    guildService: GuildService
  ) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'repo') {
      const query = focusedOption.value.toLowerCase();
      const filtered = guildConfig.repositories
        .filter(r => r.fullName.toLowerCase().includes(query))
        .slice(0, 25);

      await interaction.respond(
        filtered.map(r => ({ name: r.fullName, value: r.fullName }))
      );
      return;
    }

    if (focusedOption.name === 'branch' || focusedOption.name === 'target_branch') {
      const selectedRepoName = interaction.options.getString('repo');
      const query = focusedOption.value.toLowerCase();

      if (!selectedRepoName) {
        if (query) {
          await interaction.respond([{ name: query, value: query }]);
        } else {
          await interaction.respond([]);
        }
        return;
      }

      const repoConfig = guildConfig.repositories.find(
        r => r.fullName.toLowerCase() === selectedRepoName.toLowerCase()
      );

      if (!repoConfig) {
        if (query) {
          await interaction.respond([{ name: query, value: query }]);
        } else {
          await interaction.respond([]);
        }
        return;
      }

      // Use user's personal GitHub token if available
      const gitHubService = await guildService.getUserGitHubService(interaction.user.id);
      if (!gitHubService) {
        if (query) {
          await interaction.respond([{ name: query, value: query }]);
        } else {
          await interaction.respond([]);
        }
        return;
      }

      const remoteBranches = await gitHubService.listBranches(
        repoConfig.owner,
        repoConfig.repo,
        interaction.user.id
      );
      const filtered = remoteBranches
        .filter(b => b.toLowerCase().includes(query))
        .slice(0, 24);

      const suggestions = filtered.map(b => ({ name: b, value: b }));

      if (query && !filtered.some(b => b.toLowerCase() === query)) {
        suggestions.unshift({ name: `Custom: "${query}"`, value: focusedOption.value });
      }

      await interaction.respond(suggestions.slice(0, 25));
    }
  },

  async execute(
    interaction: ChatInputCommandInteraction,
    guildConfig: GuildRuntimeConfig,
    guildService: GuildService
  ) {
    if (!interaction.guildId) return;

    const repoFullName = interaction.options.getString('repo', true);
    const branchName = interaction.options.getString('branch', true).trim();
    const existing = await guildService.getUserBranchConfig(interaction.guildId, interaction.user.id, repoFullName);

    const repoConfig = guildConfig.repositories.find(
      r => r.fullName.toLowerCase() === repoFullName.toLowerCase()
    );

    if (!repoConfig) {
      await interaction.reply({
        content: `❌ Unknown repository **${repoFullName}**. Please pick one of the repositories configured in this server.`,
        ephemeral: true,
      });
      return;
    }

    const targetBranch = (
      interaction.options.getString('target_branch') ||
      existing?.targetBranch ||
      repoConfig.targetBranch ||
      'QA'
    ).trim();

    await guildService.setUserBranchConfig(
      interaction.guildId,
      interaction.user.id,
      repoConfig.fullName,
      branchName,
      targetBranch
    );

    await interaction.reply({
      content: `✅ Saved your branches in MySQL for **${repoConfig.fullName}**!\n• **Working Branch (branch_name):** \`${branchName}\`\n• **Target Branch (target_branch):** \`${targetBranch}\`\nWhen you run \`/pr repo:${repoConfig.fullName}\`, PR will be created from \`${branchName}\` into \`${targetBranch}\`.`,
      ephemeral: true,
    });
  },
};
