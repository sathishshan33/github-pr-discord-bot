import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import { AppConfig } from '../config';

export function getBotInviteUrl(clientId: string): string {
  // Permissions: Manage Roles, Manage Channels, Read Messages/View Channels, Send Messages,
  // Send Messages in Threads, Embed Links, Attach Files, Read Message History, Use External Emojis, Use Slash Commands
  const permissions = '2147551296';
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;
}

export const inviteCommand = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get the invite link to add this GitHub PR bot to any Discord server')
    .setContexts([
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes([
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ]),

  async execute(interaction: ChatInputCommandInteraction, config: AppConfig) {
    const inviteUrl = getBotInviteUrl(config.discordClientId);

    const embed = new EmbedBuilder()
      .setTitle('🤖 Invite GitHub PR Bot to Your Server')
      .setColor(0x5865f2)
      .setDescription(
        'Share this bot with other servers! Anyone with server management permissions can add the bot and configure their own GitHub token, working channel, and repositories.\n\n' +
        '**After adding the bot:**\n' +
        '1. Go to your server channel.\n' +
        '2. Run `/setup` to link your GitHub token and set the working channel.\n' +
        '3. Your team can start using `/pr`, `/set-branch`, and `/menu` immediately!'
      )
      .addFields({
        name: '🔗 Invite Link',
        value: `[Click here to invite the bot](${inviteUrl})`,
      })
      .setFooter({ text: 'Multi-Tenant GitHub PR Discord Bot' });

    const inviteBtn = new ButtonBuilder()
      .setLabel('Add Bot to Server')
      .setStyle(ButtonStyle.Link)
      .setURL(inviteUrl)
      .setEmoji('➕');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(inviteBtn);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  },
};
