const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  if (!fs.existsSync("public/screenshots")) {
    fs.mkdirSync("public/screenshots", { recursive: true });
  }

  // Helper wait
  const wait = (ms) => new Promise(res => setTimeout(res, ms));

  try {
    console.log("Navigating to login...");
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: 'public/screenshots/login.png' });
    console.log("Took login.png");

    console.log("Typing credentials...");
    await page.type('input[type="email"]', 'yamada.admin@example.com');
    await page.type('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    console.log("Waiting for dashboard...");
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    await wait(2000);
    await page.screenshot({ path: 'public/screenshots/dashboard.png' });
    console.log("Took dashboard.png");

    console.log("Navigating to appointments...");
    const currentUrl = page.url();
    const tenantIdMatch = currentUrl.match(/\/([0-9a-fA-F-]+)\/dashboard/);
    if (tenantIdMatch && tenantIdMatch[1]) {
      const tenantId = tenantIdMatch[1];
      
      await page.goto(`http://localhost:3000/${tenantId}/appointments`, { waitUntil: 'networkidle0' });
      await wait(2000);
      await page.screenshot({ path: 'public/screenshots/appointments.png' });
      console.log("Took appointments.png");

      console.log("Navigating to patients...");
      await page.goto(`http://localhost:3000/${tenantId}/patients`, { waitUntil: 'networkidle0' });
      await wait(2000);
      await page.screenshot({ path: 'public/screenshots/patients.png' });
      console.log("Took patients.png");

      console.log("Navigating to kartes...");
      await page.goto(`http://localhost:3000/${tenantId}/kartes`, { waitUntil: 'networkidle0' });
      await wait(2000);
      await page.screenshot({ path: 'public/screenshots/kartes.png' });
      console.log("Took kartes.png");
    } else {
      console.log("Could not find tenantId in URL: " + currentUrl);
    }
  } catch (err) {
    console.error("Error during capture:", err);
  } finally {
    await browser.close();
  }
})();
