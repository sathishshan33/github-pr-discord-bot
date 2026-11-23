import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import { AppConfig } from '../config';
import { StorageService } from '../services/storage';
import { GitHubService } from '../services/github';

export const setBranchCommand = {
  data: new SlashCommandBuilder()
    .setName('set-branch')
    .setDescription('Set your working (source) branch for a repository')
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
        .setDescription('Your working branch name')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(
    interaction: AutocompleteInteraction,
    config: AppConfig,
    gitHubService: GitHubService
  ) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'repo') {
      const query = focusedOption.value.toLowerCase();
      const filtered = config.repositories
        .filter(r => r.fullName.toLowerCase().includes(query))
        .slice(0, 25);

      await interaction.respond(
        filtered.map(r => ({ name: r.fullName, value: r.fullName }))
      );
      return;
    }

    if (focusedOption.name === 'branch') {
      const selectedRepoName = interaction.options.getString('repo');
      const query = focusedOption.value.toLowerCase();

      if (!selectedRepoName) {
        // Can't suggest branches without repo selected
        if (query) {
          await interaction.respond([{ name: query, value: query }]);
        } else {
          await interaction.respond([]);
        }
        return;
      }

      const repoConfig = config.repositories.find(
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

      const remoteBranches = await gitHubService.listBranches(repoConfig.owner, repoConfig.repo);
      const filtered = remoteBranches
        .filter(b => b.toLowerCase().includes(query))
        .slice(0, 24);

      const suggestions = filtered.map(b => ({ name: b, value: b }));

      // Allow typing a custom/new branch name if it's not already in suggestions
      if (query && !filtered.some(b => b.toLowerCase() === query)) {
        suggestions.unshift({ name: `Custom: "${query}"`, value: focusedOption.value });
      }

      await interaction.respond(suggestions.slice(0, 25));
    }
  },

  async execute(
    interaction: ChatInputCommandInteraction,
    config: AppConfig,
    storage: StorageService
  ) {
    const repoFullName = interaction.options.getString('repo', true);
    const branch = interaction.options.getString('branch', true).trim();

    const repoConfig = config.repositories.find(
      r => r.fullName.toLowerCase() === repoFullName.toLowerCase()
    );

    if (!repoConfig) {
      await interaction.reply({
        content: `❌ Unknown repository **${repoFullName}**. Please pick one of the repositories configured in the bot.`,
        ephemeral: true,
      });
      return;
    }

    storage.setUserBranch(interaction.user.id, repoConfig.fullName, branch);

    await interaction.reply({
      content: `✅ Saved your working branch for **${repoConfig.fullName}** as \`${branch}\`.\nWhen you run \`/pr repo:${repoConfig.fullName}\`, this branch will be used as the source branch.`,
      ephemeral: true,
    });
  },
};
