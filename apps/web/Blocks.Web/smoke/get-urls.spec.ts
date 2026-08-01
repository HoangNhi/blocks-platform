import { test } from "@playwright/test";

test.use({ ignoreHTTPSErrors: true });

test("get aspire resource urls", async ({ page }) => {
  await page.goto("https://localhost:17073/login?t=51aeb9e86268d1ba748410f4f2dacff0", { waitUntil: "networkidle" });
  console.log("Logged in to dashboard, current URL:", page.url());
  
  // Wait for the resources table or links to render
  await page.waitForTimeout(5000);
  
  // Let's dump all anchor hrefs and texts
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a")).map(a => ({
      text: a.textContent?.trim(),
      href: a.href
    }));
  });
  
  console.log("--- DASHBOARD LINKS ---");
  console.log(JSON.stringify(links, null, 2));
  console.log("-----------------------");
});
