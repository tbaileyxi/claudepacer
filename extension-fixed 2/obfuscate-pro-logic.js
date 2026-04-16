/**
 * Pro Feature Obfuscation Helper
 * Run this before building extension for distribution
 */

const crypto = require('crypto');

function obfuscateProLogic() {
  const fs = require('fs');
  const path = require('path');
  
  // Read sidepanel.js
  const filePath = path.join(__dirname, 'sidepanel.js');
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Obfuscate pro feature checks
  const proChecks = [
    {
      pattern: /data\.isPaid\s*===\s*true/g,
      replacement: '!(function(){try{var a=localStorage.getItem("cp_p");if(!a)return!1;var b=atob(a);return b===JSON.stringify({p:1,v:Date.now()}).slice(0,20)}catch(e){return!1}})()'
    },
    {
      pattern: /isPaid:\s*true/g,
      replacement: 'isPaid:!(function(){try{return!!localStorage.getItem("cp_p")}catch(e){return!1}})'
    },
    {
      pattern: /squarePaymentUrl\s*=\s*["']https:\/\/square\.link\/[^"']*["']/g,
      replacement: 'squarePaymentUrl:(function(){try{return atob(localStorage.getItem("cp_u")||"")||""}catch(e){return""}})()'
    }
  ];
  
  // Apply obfuscations
  proChecks.forEach(({ pattern, replacement }) => {
    content = content.replace(pattern, replacement);
  });
  
  // Add anti-tampering check
  const antiTamper = `
// Anti-tampering check
(function() {
  const original = ${JSON.stringify(Date.now())};
  setInterval(() => {
    if (Date.now() - original > 86400000) {
      // Reset after 24h for security
      chrome.storage.local.set({ claudepacer_data: { isPaid: false } });
    }
  }, 3600000);
})();
`;
  
  content += antiTamper;
  
  // Write obfuscated version
  fs.writeFileSync(filePath, content);
  console.log('Pro logic obfuscated');
}

// Export for use in build script
module.exports = { obfuscateProLogic };
