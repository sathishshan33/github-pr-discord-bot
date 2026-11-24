import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import { GuildService } from '../services/guild-service';

export function buildSetTokenModal(currentMaskedToken?: string) {
  const modal = new ModalBuilder()
    .setCustomId('user_modal_set_token')
    .setTitle('Connect Personal GitHub Token');

  const tokenInput = new TextInputBuilder()
    .setCustomId('user_github_token_input')
    .setLabel('GitHub Personal Access Token (PAT)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('ghp_xxxx or github_pat_xxxx (requires repo scope)')
    .setRequired(true)
    .setMaxLength(256);

  if (currentMaskedToken) {
    tokenInput.setPlaceholder(`Current: ${currentMaskedToken}`);
  }

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(tokenInput);
  modal.addComponents(row);

  return modal;
}

export const setTokenCommand = {
  data: new SlashCommandBuilder()
    .setName('set-token')
    .setDescription('Connect your personal GitHub token so PRs are opened under your GitHub account')
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
        .setName('token')
        .setDescription('Your GitHub Personal Access Token (PAT)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, guildService: GuildService) {
    const directToken = interaction.options.getString('token');

    if (directToken) {
      await guildService.setUserToken(interaction.user.id, directToken.trim());
      await interaction.reply({
        content: '✅ Your personal GitHub token has been securely connected!\nPRs will now be created on GitHub using your personal account.',
        ephemeral: true,
      });
      return;
    }

    // Otherwise show interactive modal
    const existing = await guildService.getUserToken(interaction.user.id);
    let masked: string | undefined;
    if (existing) {
      masked = existing.length > 8 ? `${existing.slice(0, 4)}••••${existing.slice(-4)}` : '••••••••';
    }

    const modal = buildSetTokenModal(masked);
    await interaction.showModal(modal);
  },

  async handleButton(interaction: ButtonInteraction, guildService: GuildService) {
    const existing = await guildService.getUserToken(interaction.user.id);
    let masked: string | undefined;
    if (existing) {
      masked = existing.length > 8 ? `${existing.slice(0, 4)}••••${existing.slice(-4)}` : '••••••••';
    }

    const modal = buildSetTokenModal(masked);
    await interaction.showModal(modal);
  },

  async handleModal(interaction: ModalSubmitInteraction, guildService: GuildService) {
    if (interaction.customId !== 'user_modal_set_token') return;

    const token = interaction.fields.getTextInputValue('user_github_token_input').trim();
    await guildService.setUserToken(interaction.user.id, token);

    await interaction.reply({
      content: '✅ Your personal GitHub token has been securely connected!\nWhen you create PRs in any repository, they will now be opened directly by your personal GitHub account.',
      ephemeral: true,
    });
  },
};
