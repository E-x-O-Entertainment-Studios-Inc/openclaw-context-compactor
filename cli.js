#!/usr/bin/env node
/**
 * Context Compactor CLI
 * Simple setup script to configure the OpenClaw plugin
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const OPENCLAW_CONFIG = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const OPENCLAW_EXTENSIONS = path.join(os.homedir(), '.openclaw', 'extensions', 'context-compactor');

function log(msg) {
  console.log(`📦 ${msg}`);
}

function error(msg) {
  console.error(`❌ ${msg}`);
}

function setup() {
  log('Context Compactor — Setup');
  console.log('='.repeat(40));
  
  // Check if OpenClaw is installed
  const openclawDir = path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(openclawDir)) {
    error('OpenClaw not detected (~/.openclaw not found)');
    console.log('Install OpenClaw first: https://docs.openclaw.ai');
    process.exit(1);
  }
  
  // Copy plugin files to extensions directory
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
  
  // Update openclaw.json with plugin config
  log('Configuring OpenClaw...');
  
  if (fs.existsSync(OPENCLAW_CONFIG)) {
    try {
      const configRaw = fs.readFileSync(OPENCLAW_CONFIG, 'utf8');
      const config = JSON.parse(configRaw);
      
      // Initialize plugins structure if needed
      if (!config.plugins) config.plugins = {};
      if (!config.plugins.entries) config.plugins.entries = {};
      
      // Check if already configured
      if (config.plugins.entries['context-compactor']) {
        console.log('  ✓ Plugin already configured in openclaw.json');
      } else {
        // Add plugin config with sensible defaults
        config.plugins.entries['context-compactor'] = {
          enabled: true,
          config: {
            maxTokens: 8000,
            keepRecentTokens: 2000,
            summaryMaxTokens: 1000,
            charsPerToken: 4
          }
        };
        
        // Write back with nice formatting
        fs.writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2) + '\n');
        console.log('  ✓ Added context-compactor plugin to openclaw.json');
      }
    } catch (e) {
      error(`Could not update openclaw.json: ${e.message}`);
      console.log('  → Manually add plugin config (see docs)');
    }
  } else {
    console.log('  ⚠ openclaw.json not found');
    console.log('  → Create config or manually add context-compactor plugin');
  }
  
  console.log('');
  console.log('='.repeat(40));
  log('Setup complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Restart OpenClaw: openclaw gateway restart');
  console.log('  2. Check status: /context-stats');
  console.log('');
  console.log('Configuration (in openclaw.json):');
  console.log('  maxTokens: 8000        # Trigger compaction above this');
  console.log('  keepRecentTokens: 2000 # Keep this many recent tokens');
  console.log('');
  console.log('Adjust maxTokens based on your model\'s context window.');
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
  - Adds plugin config to openclaw.json
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
    setup();
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
