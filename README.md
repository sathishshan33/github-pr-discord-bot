# Discord GitHub PR Bot (Direct Message Edition) 🤖

A private Discord bot built in **TypeScript** and **Node.js** designed to manage GitHub Pull Requests entirely through private **Direct Messages (DMs)**—no server or guild required.

## Features

- 💬 **100% Direct Message (DM) Based**: Runs entirely in private DMs without needing any Discord server.
- 🎯 **Clean Interaction Model**:
  - Send `menu` or `start` in DM, or run `/menu` to pop up the interactive dashboard.
  - Native slash commands directly inside DMs (`/pr`, `/set-branch`, `/my-branches`, `/menu`).
- 🌿 **Working Branch Management (`/set-branch`)**: Configure your personal working branch per repository with live GitHub branch autocomplete.
- 📋 **Branch Overview (`/my-branches`)**: Check your configured working branch for each repository at a glance.
- 🚀 **Pull Request Command (`/pr`)**: Confirms source and target branches, presents a modal for PR title & description, and opens the PR on GitHub.
- 👥 **Configured Notifier DMs**: Configure user IDs in `.env` (`NOTIFIER_IDS=id1,id2`). Whenever any PR is created, the bot automatically sends direct messages containing the PR link and embed to all those users!
- 📢 **Flexible Link Sharing**: Replies directly with the PR link in your DM, or optionally forwards announcements to a specified `PR_NOTIFICATION_CHANNEL_ID`.

---

## Installation & Setup

1. **Clone or navigate to the repository:**
   ```bash
   cd github-pr-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env
   ```
   Fill in your `.env` values:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   DISCORD_CLIENT_ID=your_client_id_here

   # (Optional) Destination Channel or DM ID for PR announcements
   PR_NOTIFICATION_CHANNEL_ID=

   GITHUB_TOKEN=your_github_personal_access_token_here

   # Configured Repositories (comma-separated owner/repo or full URLs):
   REPOSITORIES=octocat/Hello-World,my-org/my-project:develop

   DEFAULT_TARGET_BRANCH=main
   ```

4. **Register DM Slash Commands:**
   ```bash
   npm run deploy-commands
   ```

5. **Start the Bot:**
   - **Development mode:**
     ```bash
     npm run dev
     ```
   - **Production build:**
     ```bash
     npm run build
     npm start
     ```

---

## Commands

| Command | Description |
|---|---|
| `/menu` (or message `menu`) | Opens the interactive dashboard with buttons (`Create PR`, `Set Branch`, `My Branches`). |
| `/set-branch repo:<name> branch:<name>` | Sets your working branch for a repository (with GitHub branch autocomplete). |
| `/my-branches` | Lists all repositories and your saved working branches. |
| `/pr repo:<name>` | Opens the PR creation dialog for the chosen repository. |

