import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import { GuildRuntimeConfig } from '../services/guild-service';
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
    guildConfig: GuildRuntimeConfig
  ) {
    const embed = buildDmDashboardEmbed(interaction.user.username, guildConfig);
    const actionRow = buildDmDashboardButtons();

    await interaction.reply({
      embeds: [embed],
      components: [actionRow],
    });
  },
};
