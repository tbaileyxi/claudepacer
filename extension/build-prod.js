#!/usr/bin/env node

/**
 * Production Build Script
 * Obfuscates pro features and creates distributable package
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function encrypt(text) {
  const algorithm = 'aes-256-cbc';
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { encrypted, key: key.toString('hex'), iv: iv.toString('hex') };
}

function createProductionBuild() {
  console.log('🔒 Creating production build...');
  
  // Read current sidepanel.js
  const sidepanelPath = path.join(__dirname, 'sidepanel.js');
  let content = fs.readFileSync(sidepanelPath, 'utf8');
  
  // Simple obfuscation for pro features
  const obfuscatedContent = content
    // Obfuscate pro checks
    .replace(/data\.isPaid\s*===\s*true/g, '!(function(){try{var a=chrome.storage.local.getItem("cp_p");return a===JSON.stringify({v:1})}catch(e){return!1}})()')
    // Obfuscate payment URL
    .replace(/squarePaymentUrl\s*=\s*["']https:\/\/square\.link\/[^"']*["']/g, 'squarePaymentUrl:(function(){try{return atob(chrome.storage.local.getItem("cp_u")||"")}catch(e){return""}})()')
    // Add runtime check
    .replace(/chrome\.runtime\.onInstalled\.addListener\(/g, 'chrome.runtime.onInstalled.addListener((details)=>{if(details.reason==="install"){chrome.storage.local.set({cp_p:JSON.stringify({v:1}),cp_u:btoa("https://square.link/u/BrwlCxwH")})};');
  
  // Write production version
  fs.writeFileSync(sidepanelPath, obfuscatedContent);
  
  // Create zip for distribution
  const { execSync } = require('child_process');
  execSync('zip -r ../claudpacer-prod.zip . -x "*.DS_Store" "*.git*" "*.md" "test-*" "obfuscate-*" "build-*"', { stdio: 'inherit' });
  
  console.log('✅ Production build complete: claudpacer-prod.zip');
  console.log('🔒 Pro features obfuscated');
  console.log('📦 Ready for Chrome Web Store submission');
}

createProductionBuild();
