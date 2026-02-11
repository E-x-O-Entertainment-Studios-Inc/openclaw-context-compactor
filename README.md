# Context Compactor

> Token-based context compaction for OpenClaw with local models (MLX, llama.cpp, Ollama)

## Why?

Local LLM servers don't report context overflow errors like cloud APIs do. OpenClaw's built-in compaction relies on these errors to trigger. This plugin estimates tokens client-side and proactively summarizes older messages before hitting the model's limit.

## Quick Start

```bash
# One command setup (installs + configures)
npx openclaw-context-compactor setup

# Restart gateway
openclaw gateway restart
```

That's it! The setup command:
- Copies plugin files to `~/.openclaw/extensions/context-compactor/`
- Adds plugin config to `openclaw.json` with sensible defaults

## Configuration

```json
{
  "plugins": {
    "entries": {
      "context-compactor": {
        "enabled": true,
        "config": {
          "maxTokens": 8000,
          "keepRecentTokens": 2000,
          "summaryMaxTokens": 1000,
          "charsPerToken": 4
        }
      }
    }
  }
}
```

## Commands

- `/context-stats` — Show current token usage
- `/compact-now` — Force fresh compaction on next message

## How It Works

1. Before each agent turn, estimates total context tokens
2. If over `maxTokens`, splits messages into "old" and "recent"
3. Summarizes old messages using the session model
4. Injects summary + recent messages as context

## License

MIT
