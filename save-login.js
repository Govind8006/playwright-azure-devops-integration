const { chromium } = require('playwright');
const path = require('path');

const sites = [
  {
    name: 'Portal',
    url: 'https://cehub-dev.powerappsportals.com/',
    authFile: 'auth/auth-portal.json'
  },
  {
    name: 'CRM',
    url: 'https://cehub-dev.crm.dynamics.com/',
    authFile: 'auth/auth-crm.json'
  }
];

async function saveLoginForSite(siteConfig) {
  const userDataDir = path.join(__dirname, 'edge-user-data');

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'msedge',
  });

  const page = await browser.newPage();
  
  console.log(`\n🌐 Opening ${siteConfig.name} site: ${siteConfig.url}`);
  
  await page.goto(siteConfig.url, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });

  console.log(`🧠 Please complete login for ${siteConfig.name} manually. Do NOT close the browser!`);
  console.log(`🛑 When login is complete and you see the ${siteConfig.name} homepage, press Enter to save session.`);

  return new Promise((resolve) => {
    const listener = async () => {
      process.stdin.removeListener('data', listener);
      await browser.storageState({ path: siteConfig.authFile });
      console.log(`✅ ${siteConfig.name} login state saved to ${siteConfig.authFile}`);
      await browser.close();
      resolve();
    };
    
    process.stdin.resume();
    process.stdin.on('data', listener);
  });
}

(async () => {
  try {
    for (const site of sites) {
      await saveLoginForSite(site);
    }
    
    console.log('\n🎉 All login sessions saved successfully!');
    console.log('📄 Available auth files:');
    console.log('   - auth-portal.json (for Portal tests)');
    console.log('   - auth-crm.json (for CRM/Dynamics tests)');
    console.log('\n💡 To use in tests:');
    console.log('   test.use({ storageState: "auth-portal.json" }); // For Portal');
    console.log('   test.use({ storageState: "auth-crm.json" });    // For CRM');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error saving login sessions:', error);
    process.exit(1);
  }
})();
