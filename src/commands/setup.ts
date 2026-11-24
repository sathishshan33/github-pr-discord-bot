import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { GuildService, GuildRuntimeConfig } from '../services/guild-service';

export function buildSetupEmbed(guildName: string, config: GuildRuntimeConfig | null) {
  const channelDisplay = config?.channelId ? `<#${config.channelId}>` : '⚠️ *Not set (Commands disabled until set)*';

  let reposDisplay = '❌ *No repositories configured*';
  if (config?.repositories && config.repositories.length > 0) {
    reposDisplay = config.repositories
      .map(r => `• **${r.fullName}**`)
      .join('\n');
  }

  const embed = new EmbedBuilder()
    .setTitle(`⚙️ Server Setup — ${guildName}`)
    .setDescription(
      'Configure the working channel and repositories for this server.\n\n' +
      '👤 **User-Wise Features:** Each developer connects their own personal GitHub token via `/set-token` and configures their own `branch_name` and `target_branch` via `/set-branch`.'
    )
    .setColor(0x5865f2)
    .addFields(
      { name: '💬 Dedicated Working Channel', value: channelDisplay, inline: false },
      { name: `📁 Configured Repositories (${config?.repositories?.length || 0})`, value: reposDisplay, inline: false }
    )
    .setFooter({ text: 'Use the buttons below to update server settings (Admin only)' })
    .setTimestamp();

  return embed;
}

export function buildSetupButtons() {
  const configBtn = new ButtonBuilder()
    .setCustomId('setup_btn_modal')
    .setLabel('Configure Repositories')
    .setEmoji('📁')
    .setStyle(ButtonStyle.Primary);

  const setChannelBtn = new ButtonBuilder()
    .setCustomId('setup_btn_set_current_channel')
    .setLabel('Set This Channel as Working Channel')
    .setEmoji('📌')
    .setStyle(ButtonStyle.Success);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(configBtn, setChannelBtn);
}

export const setupCommand = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure working channel and repositories for this server (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Select the dedicated working channel')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, guildService: GuildService) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: '❌ This command can only be run inside a Discord server.',
        ephemeral: true,
      });
      return;
    }

    const selectedChannel = interaction.options.getChannel('channel');

    if (selectedChannel) {
      await guildService.saveGuildConfig(interaction.guildId, {
        channelId: selectedChannel.id,
      });
    }

    const guildConfig = await guildService.getGuildConfig(interaction.guildId);
    const embed = buildSetupEmbed(interaction.guild.name, guildConfig);
    const buttons = buildSetupButtons();

    await interaction.reply({
      embeds: [embed],
      components: [buttons],
      ephemeral: true,
    });
  },

  async handleButton(interaction: ButtonInteraction, guildService: GuildService) {
    if (!interaction.guildId || !interaction.guild) return;

    if (interaction.customId === 'setup_btn_set_current_channel') {
      await guildService.saveGuildConfig(interaction.guildId, {
        channelId: interaction.channelId,
      });

      const updated = await guildService.getGuildConfig(interaction.guildId);
      const embed = buildSetupEmbed(interaction.guild.name, updated);
      const buttons = buildSetupButtons();

      await interaction.update({
        content: `✅ Working channel successfully updated to <#${interaction.channelId}>!`,
        embeds: [embed],
        components: [buttons],
      });
      return;
    }

    if (interaction.customId === 'setup_btn_modal') {
      const existing = await guildService.getGuildConfig(interaction.guildId);

      const modal = new ModalBuilder()
        .setCustomId('setup_modal_submit')
        .setTitle(`Configure Repositories`);

      const reposInput = new TextInputBuilder()
        .setCustomId('setup_input_repos')
        .setLabel('Repositories (comma-separated or URLs)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('e.g. owner/repo, https://github.com/owner/frontend.git')
        .setValue(existing?.repositoriesRaw || '')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(reposInput)
      );

      await interaction.showModal(modal);
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, guildService: GuildService) {
    if (!interaction.guildId || !interaction.guild) return;
    if (interaction.customId !== 'setup_modal_submit') return;

    const repos = interaction.fields.getTextInputValue('setup_input_repos').trim();

    await interaction.deferReply({ ephemeral: true });

    await guildService.saveGuildConfig(interaction.guildId, {
      repositories: repos,
    });

    const updated = await guildService.getGuildConfig(interaction.guildId);
    const embed = buildSetupEmbed(interaction.guild.name, updated);
    const buttons = buildSetupButtons();

    await interaction.editReply({
      content: '✅ Server repositories saved successfully in MySQL database!',
      embeds: [embed],
      components: [buttons],
    });
  },
};
