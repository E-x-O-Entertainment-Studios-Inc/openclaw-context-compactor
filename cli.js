#!/usr/bin/env node
/**
 * Context Compactor CLI
 * Setup script with interactive token limit configuration
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const OPENCLAW_CONFIG = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const OPENCLAW_EXTENSIONS = path.join(os.homedir(), '.openclaw', 'extensions', 'context-compactor');

function log(msg) {
  console.log(`📦 ${msg}`);
}

function error(msg) {
  console.error(`❌ ${msg}`);
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function detectModelContextWindow(config) {
  // Try to detect from OpenClaw config
  const model = config?.agents?.defaults?.model?.primary;
  
  if (!model) return null;
  
  // Common context windows (conservative estimates)
  const knownContexts = {
    // Anthropic
    'anthropic/claude-opus': 200000,
    'anthropic/claude-sonnet': 200000,
    'anthropic/claude-haiku': 200000,
    // OpenAI
    'openai/gpt-4': 128000,
    'openai/gpt-4-turbo': 128000,
    'openai/gpt-3.5-turbo': 16000,
    // Local models (common sizes)
    'mlx': 8000,
    'ollama': 8000,
    'llama': 8000,
    'mistral': 32000,
    'qwen': 32000,
  };
  
  // Check for exact match first
  for (const [pattern, tokens] of Object.entries(knownContexts)) {
    if (model.toLowerCase().includes(pattern.toLowerCase())) {
      return { model, tokens, source: 'detected' };
    }
  }
  
  return { model, tokens: null, source: 'unknown' };
}

async function setup() {
  log('Context Compactor — Setup');
  console.log('='.repeat(50));
  
  // Check if OpenClaw is installed
  const openclawDir = path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(openclawDir)) {
    error('OpenClaw not detected (~/.openclaw not found)');
    console.log('Install OpenClaw first: https://docs.openclaw.ai');
    process.exit(1);
  }
  
  // Copy plugin files to extensions directory
  console.log('');
  log('Installing plugin files...');
  fs.mkdirSync(OPENCLAW_EXTENSIONS, { recursive: true });
  
  const pluginDir = path.dirname(__filename);
  const filesToCopy = ['index.ts', 'openclaw.plugin.json'];
  
  for (const file of filesToCopy) {
    const src = path.join(pluginDir, file);
    const dest = path.join(OPENCLAW_EXTENSIONS, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  ✓ Copied: ${file}`);
    }
  }
  
  // Load existing config
  let config = {};
  if (fs.existsSync(OPENCLAW_CONFIG)) {
    try {
      config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf8'));
    } catch (e) {
      error(`Could not parse openclaw.json: ${e.message}`);
      process.exit(1);
    }
  }
  
  // Determine token limit
  console.log('');
  log('Configuring token limits...');
  console.log('');
  console.log('  To set the right limit, I can check your OpenClaw config');
  console.log('  to see what model you\'re using.');
  console.log('');
  console.log('  🔒 Privacy: This runs 100% locally. Nothing is sent externally.');
  console.log('');
  
  const checkConfig = await prompt('  Check your config for model info? (y/n): ');
  
  let maxTokens = 8000; // Default
  let detectedInfo = null;
  
  if (checkConfig.toLowerCase() === 'y' || checkConfig.toLowerCase() === 'yes') {
    detectedInfo = await detectModelContextWindow(config);
    
    if (detectedInfo && detectedInfo.tokens) {
      console.log('');
      console.log(`  ✓ Detected model: ${detectedInfo.model}`);
      console.log(`  ✓ Context window: ~${detectedInfo.tokens.toLocaleString()} tokens`);
      
      // Suggest a safe limit (leave 20% headroom)
      const suggested = Math.floor(detectedInfo.tokens * 0.8);
      console.log(`  → Suggested maxTokens: ${suggested.toLocaleString()} (80% of context)`);
      console.log('');
      
      const useDetected = await prompt(`  Use ${suggested.toLocaleString()} tokens? (y/n, or enter custom): `);
      
      if (useDetected.toLowerCase() === 'y' || useDetected.toLowerCase() === 'yes') {
        maxTokens = suggested;
      } else if (/^\d+$/.test(useDetected)) {
        maxTokens = parseInt(useDetected, 10);
      }
    } else if (detectedInfo && detectedInfo.model) {
      console.log('');
      console.log(`  ⚠ Found model: ${detectedInfo.model}`);
      console.log('  ⚠ Could not determine context window automatically.');
    }
  }
  
  // If we still don't have a good value, ask manually
  if (maxTokens === 8000 && (!detectedInfo || !detectedInfo.tokens)) {
    console.log('');
    console.log('  Common context windows:');
    console.log('    • MLX / llama.cpp (small): 4,000 - 8,000');
    console.log('    • Mistral / Qwen (medium): 32,000');
    console.log('    • Claude / GPT-4 (large):  128,000+');
    console.log('');
    console.log('  Check your model\'s docs or LM Studio/Ollama settings.');
    console.log('  Config location: ~/.openclaw/openclaw.json');
    console.log('');
    
    const customTokens = await prompt('  Enter maxTokens (default 8000): ');
    if (/^\d+$/.test(customTokens)) {
      maxTokens = parseInt(customTokens, 10);
    }
  }
  
  // Calculate keepRecentTokens (25% of max)
  const keepRecentTokens = Math.floor(maxTokens * 0.25);
  const summaryMaxTokens = Math.floor(maxTokens * 0.125);
  
  console.log('');
  console.log(`  Configuration:`);
  console.log(`    maxTokens:        ${maxTokens.toLocaleString()}`);
  console.log(`    keepRecentTokens: ${keepRecentTokens.toLocaleString()} (25%)`);
  console.log(`    summaryMaxTokens: ${summaryMaxTokens.toLocaleString()} (12.5%)`);
  
  // Update openclaw.json
  console.log('');
  log('Updating OpenClaw config...');
  
  // Initialize plugins structure if needed
  if (!config.plugins) config.plugins = {};
  if (!config.plugins.entries) config.plugins.entries = {};
  
  // Add/update plugin config
  config.plugins.entries['context-compactor'] = {
    enabled: true,
    config: {
      maxTokens,
      keepRecentTokens,
      summaryMaxTokens,
      charsPerToken: 4
    }
  };
  
  // Write back with nice formatting
  fs.writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2) + '\n');
  console.log('  ✓ Saved to openclaw.json');
  
  console.log('');
  console.log('='.repeat(50));
  log('Setup complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Restart OpenClaw: openclaw gateway restart');
  console.log('  2. Check status in chat: /context-stats');
  console.log('');
  console.log('To adjust later, edit ~/.openclaw/openclaw.json');
  console.log('under plugins.entries["context-compactor"].config');
}

function showHelp() {
  console.log(`
Context Compactor
Token-based context compaction for local models

USAGE:
  npx openclaw-context-compactor setup    Install and configure plugin
  npx openclaw-context-compactor help     Show this help

WHAT IT DOES:
  - Copies plugin files to ~/.openclaw/extensions/context-compactor/
  - Detects your model's context window (with permission)
  - Configures appropriate token limits
  - Enables automatic context compaction for local models

CONFIGURATION:
  After setup, adjust in openclaw.json:
  
  "context-compactor": {
    "enabled": true,
    "config": {
      "maxTokens": 8000,       // Your model's context limit minus buffer
      "keepRecentTokens": 2000 // Recent context to preserve
    }
  }

COMMANDS (in chat):
  /context-stats    Show current token usage
  /compact-now      Force fresh compaction
`);
}

// Main
const command = process.argv[2];

switch (command) {
  case 'setup':
  case 'install':
    setup().catch(err => {
      error(err.message);
      process.exit(1);
    });
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    showHelp();
    break;
  default:
    error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
