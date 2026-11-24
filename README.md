# Discord GitHub PR Bot (Multi-Tenant & User-Wise Edition) 🤖

A multi-tenant Discord bot built in **TypeScript**, **Node.js**, and **MySQL** that lets anyone invite the bot to their server and manage GitHub Pull Requests with per-server channel isolation and **per-user GitHub accounts**.

## Features

- 🌐 **Multi-Server / Multi-Tenant**: Anyone can invite the bot to their server via an OAuth2 link. Each server maintains its own isolated configuration in a MySQL database.
- 👤 **Per-User GitHub Tokens (`/set-token`)**: Every developer connects their own personal GitHub token. When a PR is created, it is opened directly under that developer's own GitHub account!
- 🌿 **Two Branches Configuration Per User**: Each user configures both their **Working (From) Branch** and **Target (To / Base) Branch** per repository (e.g. `feature/my-task` ➔ `QA`).
- ⚙️ **In-Discord Admin Setup (`/setup`)**: Server administrators configure the dedicated working channel and list of repositories directly in Discord.
- 🔗 **Shareable Bot Invite (`/invite`)**: Get a shareable invite link with all required permissions to add the bot to any Discord server.
- 📢 **Public PR Announcements**: PR creation posts a summary card directly in the designated channel so the whole team can see it.
- 🔍 **Pre-Flight Branch Check**: Automatically checks GitHub API commits ahead vs the user's target branch before allowing PR creation.
- ⚡ **In-Memory Server Cache `[user_id, cache]`**: Caches branch lookups and repository metadata per user to eliminate redundant GitHub API calls.

---

## Installation & Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables in `.env`:**
   ```env
   DISCORD_TOKEN=your_bot_token_here
   DISCORD_CLIENT_ID=your_client_id_here

   # MySQL Database Configuration
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=discord_pr_bot
   ```

3. **Deploy Slash Commands Globally:**
   ```bash
   npm run deploy-commands
   ```

4. **Start the Bot:**
   - Development mode:
     ```bash
     npm run dev
     ```
   - Production mode:
     ```bash
     npm run build
     npm start
     ```

---

## How It Works

### 1. Server Admin Setup (Server-Wise)
- An administrator invites the bot and runs `/setup`.
- Sets the **Working Channel** (where the bot operates).
- Enters the server's **Repositories** list.

### 2. Developer Setup (User-Wise)
- Run `/set-token` (or click **My GitHub Token** in `/menu`) to connect your personal GitHub token (`repo` scope).
- Run `/set-branch` (or click **Set Branch** in `/menu`) to configure both:
  1. **From (Head) Branch**: e.g. `feature/login-ui`
  2. **To (Base) Branch**: e.g. `QA` or `main`
- Run `/pr` (or click **Create PR**):
  - Checks if your branch has unmerged changes compared to your target branch.
  - Opens the Pull Request on GitHub **using your own GitHub account**.
  - Posts the PR announcement in the channel for the entire team to see!

---

## Commands

| Command | Permissions | Description |
|---|---|---|
| `/setup` | Administrator | Configure repositories and dedicated channel for the server. |
| `/set-token` | Everyone | Connect your personal GitHub token (so PRs open under your GitHub account). |
| `/set-branch repo:<name> from:<branch> to:<branch>` | Everyone | Configure your source (from) and target (to) branches for a repository. |
| `/my-branches` | Everyone | View your personal GitHub connection status and saved branches. |
| `/pr repo:<name>` | Everyone | Verifies branch changes and opens the PR under your GitHub account. |
| `/menu` | Everyone | Opens interactive control panel (Create PR, Set Branch, My Branches, My Token). |
| `/invite` | Everyone | Get the bot invite link to add it to other servers. |
