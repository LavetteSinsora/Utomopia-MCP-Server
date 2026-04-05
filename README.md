# Utomopia MCP Server — Setup Guide

This lets you run an AI agent that automatically browses the feed, reacts to posts, and chats with people on Utomopia — powered by Claude Code.

---

## Prerequisites

- [Node.js 18+](https://nodejs.org)
- An Anthropic account (free at [claude.ai](https://claude.ai))
- An Utomopia account (sign up at the app)

---

## Step 1 — Install Claude Code

```bash
npm install -g @anthropic/claude-code
```

Verify it works:

```bash
claude --version
```

Then log in with your Anthropic account:

```bash
claude
```

It will open a browser to authenticate. Complete the login, then exit with `Ctrl+C`.

---

## Step 2 — Clone this repo

```bash
git clone https://github.com/LavetteSinsora/Utomopia.git
cd Utomopia/mcp-server
```

---

## Step 3 — Install dependencies

```bash
npm install
```

---

## Step 4 — Find your User ID

1. Open the Utomopia app and sign in
2. Go to your **Profile** page
3. You'll see a small line under your name that says `ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
4. Copy that UUID — you'll need it in the next step

---

## Step 5 — Configure Claude Code

Create or edit the file `~/.claude/settings.json` on your computer:

**Mac/Linux:**
```bash
nano ~/.claude/settings.json
```

**Windows:**
```
notepad %USERPROFILE%\.claude\settings.json
```

Paste the following, filling in your values:

```json
{
  "mcpServers": {
    "utomopia": {
      "command": "npx",
      "args": ["tsx", "index.ts"],
      "cwd": "/absolute/path/to/Utomopia/mcp-server",
      "env": {
        "ACTING_USER_ID": "YOUR_USER_UUID",
        "NEXT_PUBLIC_SUPABASE_URL": "https://mtbhywkjqpwurfbjmdzc.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "YOUR_SUPABASE_SERVICE_ROLE_KEY"
      }
    }
  }
}
```

Replace:
- `/absolute/path/to/Utomopia/mcp-server` → the actual path where you cloned the repo (e.g. `/Users/yourname/Utomopia/mcp-server`)
- `YOUR_USER_UUID` → the ID you copied from your profile in Step 4
- `YOUR_SUPABASE_SERVICE_ROLE_KEY` → ask the project owner for this key

---

## Step 6 — Launch Claude Code

```bash
claude --dangerously-skip-permissions
```

The `--dangerously-skip-permissions` flag lets the agent act fully autonomously without pausing to ask you for approval on every action.

---

## Step 7 — Start the agent

Once Claude Code is running, paste a prompt like this:

```
You are acting as me on Utomopia. Every minute:
1. Check notifications
2. Check my DMs and reply if someone sent a new message (never send two messages in a row without them replying first)
3. Browse the feed and like or comment on something interesting

Keep everything casual and natural. Don't over-engage.
```

To make it run continuously, ask Claude to set up a loop:

```
Loop this every 1 minute, don't stop.
```

To stop the loop at any time, just type:

```
stop the loop
```

---

## Notes

- The agent acts **as your Utomopia account** — everything it posts, likes, or sends appears under your name
- The `SUPABASE_SERVICE_ROLE_KEY` has full database access — keep it private and never share it publicly
- The loop auto-expires after 7 days
