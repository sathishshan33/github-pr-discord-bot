import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import { AppConfig } from '../config';
import { buildDmDashboardEmbed, buildDmDashboardButtons } from '../interactions/dm-handler';

export const menuCommand = {
  data: new SlashCommandBuilder()
    .setName('menu')
    .setDescription('Open the GitHub PR interactive menu')
    .setContexts([
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes([
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ]),

  async execute(
    interaction: ChatInputCommandInteraction,
    config: AppConfig
  ) {
    const embed = buildDmDashboardEmbed(interaction.user.username, config);
    const actionRow = buildDmDashboardButtons();

    await interaction.reply({
      embeds: [embed],
      components: [actionRow],
    });
  },
};
