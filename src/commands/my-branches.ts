import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import { GuildRuntimeConfig, GuildService } from '../services/guild-service';
import { buildMyBranchesEmbed } from '../interactions/dm-handler';

export const myBranchesCommand = {
  data: new SlashCommandBuilder()
    .setName('my-branches')
    .setDescription('View your saved working branches across configured repositories')
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
    guildConfig: GuildRuntimeConfig,
    guildService: GuildService
  ) {
    if (!interaction.guildId) return;

    const embed = await buildMyBranchesEmbed(interaction.guildId, interaction.user.id, guildConfig, guildService);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
