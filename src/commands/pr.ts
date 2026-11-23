import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import { AppConfig } from '../config';
import { StorageService } from '../services/storage';
import { buildPrConfirmationCard } from '../interactions/modal-handler';

export const prCommand = {
  data: new SlashCommandBuilder()
    .setName('pr')
    .setDescription('Create a Pull Request to the configured target branch')
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

  async autocomplete(interaction: AutocompleteInteraction, config: AppConfig) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'repo') {
      const query = focusedOption.value.toLowerCase();
      const filtered = config.repositories
        .filter(r => r.fullName.toLowerCase().includes(query))
        .slice(0, 25);

      await interaction.respond(
        filtered.map(r => ({ name: r.fullName, value: r.fullName }))
      );
    }
  },

  async execute(
    interaction: ChatInputCommandInteraction,
    config: AppConfig,
    storage: StorageService
  ) {
    const repoFullName = interaction.options.getString('repo', true);

    const repoConfig = config.repositories.find(
      r => r.fullName.toLowerCase() === repoFullName.toLowerCase()
    );

    if (!repoConfig) {
      await interaction.reply({
        content: `❌ Repository **${repoFullName}** is not recognized. Please pick one from autocomplete.`,
        ephemeral: true,
      });
      return;
    }

    const userFromBranch = storage.getUserBranch(interaction.user.id, repoConfig.fullName);

    if (!userFromBranch) {
      await interaction.reply({
        content: `⚠️ You haven't set your working branch for **${repoConfig.fullName}** yet.\n\nPlease run:\n\`/set-branch repo:${repoConfig.fullName} branch:<your-branch>\`\nbefore creating a pull request.`,
        ephemeral: true,
      });
      return;
    }

    const card = buildPrConfirmationCard(repoConfig, userFromBranch, config.notifierIds.length);

    await interaction.reply({
      embeds: [card.embed],
      components: card.components,
      ephemeral: true,
    });
  },
};
