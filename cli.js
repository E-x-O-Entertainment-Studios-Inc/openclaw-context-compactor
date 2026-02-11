#!/usr/bin/env node
/**
 * Jasper Context Compactor CLI
 * Setup script with interactive token limit configuration
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const OPENCLAW_CONFIG = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const OPENCLAW_BACKUPS = path.join(os.homedir(), '.openclaw', 'backups');
const OPENCLAW_EXTENSIONS = path.join(os.homedir(), '.openclaw', 'extensions', 'context-compactor');
const OLD_EXTENSIONS = path.join(os.homedir(), '.openclaw', 'extensions', 'openclaw-context-compactor');

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

function backupConfig() {
  if (!fs.existsSync(OPENCLAW_CONFIG)) return null;
  
  fs.mkdirSync(OPENCLAW_BACKUPS, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(OPENCLAW_BACKUPS, `openclaw-${timestamp}.json`);
  
  fs.copyFileSync(OPENCLAW_CONFIG, backupPath);
  return backupPath;
}

async function detectModelContextWindow(config) {
  const model = config?.agents?.defaults?.model?.primary;
  if (!model) return null;
  
  const knownContexts = {
    'anthropic/claude-opus': 200000,
    'anthropic/claude-sonnet': 200000,
    'anthropic/claude-haiku': 200000,
    'openai/gpt-4': 128000,
    'openai/gpt-4-turbo': 128000,
    'openai/gpt-3.5-turbo': 16000,
    'mlx': 32000,        // Most MLX models support 32K+
    'ollama': 32000,     // Most Ollama models support 32K+
    'llama': 32000,
    'mistral': 32000,
    'qwen': 32000,
  };
  
  for (const [pattern, tokens] of Object.entries(knownContexts)) {
    if (model.toLowerCase().includes(pattern.toLowerCase())) {
      return { model, tokens, source: 'detected' };
    }
  }
  
  return { model, tokens: null, source: 'unknown' };
}

async function setup() {
  console.log('');
  log('Jasper Context Compactor — Setup');
  console.log('='.repeat(55));
  
  // Explain what we're going to do
  console.log('');
  console.log('  This setup will:');
  console.log('');
  console.log('  1. Copy plugin files to ~/.openclaw/extensions/');
  console.log('  2. Add plugin config to your openclaw.json');
  console.log('  3. Help you configure token limits for your model');
  console.log('');
  console.log('  🔒 Privacy: Everything runs locally. Nothing is sent externally.');
  console.log('  📁 Your config will be backed up before any changes.');
  console.log('');
  
  const proceed = await prompt('  Continue? (y/n): ');
  if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
    console.log('\n  Setup cancelled.\n');
    process.exit(0);
  }
  
  // Check if OpenClaw is installed
  const openclawDir = path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(openclawDir)) {
    console.log('');
    error('OpenClaw not detected (~/.openclaw not found)');
    console.log('  Install OpenClaw first: https://docs.openclaw.ai');
    process.exit(1);
  }
  
  // Backup config FIRST
  console.log('');
  log('Backing up config...');
  const backupPath = backupConfig();
  if (backupPath) {
    console.log(`  ✓ Backup saved: ${backupPath}`);
    console.log('  → Restore with: cp "' + backupPath + '" ~/.openclaw/openclaw.json');
  } else {
    console.log('  ⚠ No existing config to backup');
  }
  
  // Copy plugin files
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
  
  // Clean up old package name
  if (fs.existsSync(OLD_EXTENSIONS)) {
    try {
      fs.rmSync(OLD_EXTENSIONS, { recursive: true });
      console.log('  ✓ Removed old openclaw-context-compactor extension');
    } catch (e) {
      console.log(`  ⚠ Could not remove old extension: ${e.message}`);
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
  
  const checkConfig = await prompt('  Check your config for model info? (y/n): ');
  
  let maxTokens = 16000;  // OpenClaw minimum
  let detectedInfo = null;
  
  if (checkConfig.toLowerCase() === 'y' || checkConfig.toLowerCase() === 'yes') {
    detectedInfo = await detectModelContextWindow(config);
    
    if (detectedInfo && detectedInfo.tokens) {
      console.log('');
      console.log(`  ✓ Detected model: ${detectedInfo.model}`);
      console.log(`  ✓ Context window: ~${detectedInfo.tokens.toLocaleString()} tokens`);
      
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
  
  // Manual entry if needed
  if (maxTokens === 8000 && (!detectedInfo || !detectedInfo.tokens)) {
    console.log('');
    console.log('  Common context windows:');
    console.log('    • MLX / llama.cpp (small):  4,000 - 8,000');
    console.log('    • Mistral / Qwen (medium):  32,000');
    console.log('    • Claude / GPT-4 (large):   128,000+');
    console.log('');
    console.log('  ⚠️  Minimum recommended: 16,000 tokens (OpenClaw requirement)');
    console.log('');
    console.log('  Check your model\'s docs or LM Studio/Ollama settings.');
    console.log('  Config location: ~/.openclaw/openclaw.json');
    console.log('');
    
    const customTokens = await prompt('  Enter maxTokens (default 16000, minimum 16000): ');
    if (/^\d+$/.test(customTokens)) {
      maxTokens = parseInt(customTokens, 10);
    } else {
      maxTokens = 16000;
    }
  }
  
  // Enforce minimum
  const MIN_TOKENS = 16000;
  if (maxTokens < MIN_TOKENS) {
    console.log('');
    console.log(`  ⚠️  Warning: ${maxTokens} tokens is below OpenClaw's minimum of ${MIN_TOKENS}.`);
    console.log(`     Increasing to ${MIN_TOKENS} to prevent agent failures.`);
    console.log('');
    console.log('  If your model truly has a smaller context window, consider:');
    console.log('    • Using a larger model (Qwen 7B+ or Mistral 7B+)');
    console.log('    • Using the cloud fallback for complex tasks');
    console.log('');
    maxTokens = MIN_TOKENS;
  }
  
  // Calculate derived values
  const keepRecentTokens = Math.floor(maxTokens * 0.25);
  const summaryMaxTokens = Math.floor(maxTokens * 0.125);
  
  console.log('');
  console.log('  Final configuration:');
  console.log(`    maxTokens:        ${maxTokens.toLocaleString()}`);
  console.log(`    keepRecentTokens: ${keepRecentTokens.toLocaleString()} (25%)`);
  console.log(`    summaryMaxTokens: ${summaryMaxTokens.toLocaleString()} (12.5%)`);
  
  // Update openclaw.json
  console.log('');
  log('Updating OpenClaw config...');
  
  if (!config.plugins) config.plugins = {};
  if (!config.plugins.entries) config.plugins.entries = {};
  
  config.plugins.entries['context-compactor'] = {
    enabled: true,
    config: {
      maxTokens,
      keepRecentTokens,
      summaryMaxTokens,
      charsPerToken: 4
    }
  };
  
  fs.writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2) + '\n');
  console.log('  ✓ Saved to openclaw.json');
  
  // Done!
  console.log('');
  console.log('='.repeat(55));
  log('Setup complete!');
  console.log('');
  console.log('  Next steps:');
  console.log('    1. Restart OpenClaw: openclaw gateway restart');
  console.log('    2. Check status in chat: /context-stats');
  console.log('');
  console.log('  To adjust later:');
  console.log('    Edit ~/.openclaw/openclaw.json');
  console.log('    Look for plugins.entries["context-compactor"].config');
  console.log('');
  if (backupPath) {
    console.log('  To restore original config:');
    console.log(`    cp "${backupPath}" ~/.openclaw/openclaw.json`);
    console.log('');
  }
}

function showHelp() {
  console.log(`
Jasper Context Compactor
Token-based context compaction for local models (MLX, llama.cpp, Ollama)

USAGE:
  npx jasper-context-compactor setup    Install and configure plugin
  npx jasper-context-compactor help     Show this help

WHAT IT DOES:
  Local LLMs don't report context overflow errors like cloud APIs.
  This plugin estimates tokens client-side and proactively summarizes
  older messages before hitting your model's context limit.

SETUP PROCESS:
  1. Backs up your openclaw.json (with restore instructions)
  2. Copies plugin files to ~/.openclaw/extensions/
  3. Asks permission before reading your config
  4. Detects your model and suggests appropriate token limits
  5. Lets you customize or enter values manually
  6. Updates openclaw.json with the plugin config

PRIVACY:
  Everything runs 100% locally. Nothing is sent to external servers.
  We only read your local config file (with your permission).

COMMANDS (in chat after setup):
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
