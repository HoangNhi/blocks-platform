import { test } from "@playwright/test";

test.use({ ignoreHTTPSErrors: true });

test("get aspire resource details", async ({ page }) => {
  await page.goto("https://localhost:17073/login?t=75353f6a5b767b8e22e672925ba80a81", { waitUntil: "networkidle" });
  console.log("Logged in to dashboard, current URL:", page.url());
  
  await page.waitForTimeout(5000);
  
  // Let's scrape the resource grid
  const resources = await page.evaluate(() => {
    // In Aspire v9/10/13, resources are rendered in a table/grid. Let's find rows.
    const rows = Array.from(document.querySelectorAll("tr"));
    return rows.map(row => {
      const cells = Array.from(row.querySelectorAll("td, th")).map(c => c.textContent?.trim());
      const links = Array.from(row.querySelectorAll("a")).map(a => a.href);
      return { cells, links };
    });
  });
  
  console.log("--- DASHBOARD RESOURCES ---");
  console.log(JSON.stringify(resources, null, 2));
  console.log("---------------------------");
});
