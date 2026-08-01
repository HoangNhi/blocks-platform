import { test } from "@playwright/test";

test.use({ ignoreHTTPSErrors: true });

test("extract mapped endpoints from Aspire dashboard", async ({ page }) => {
  await page.goto("https://localhost:17073/login?t=59b9d91f690be9532b941e27d94a9093");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(5000);
  
  const resources = await page.evaluate(() => {
    // Select all rows or grid items. In Aspire 8/9, resources are listed in a table or grid.
    // Let's print the visible text of the page to find where resources are
    const rows = Array.from(document.querySelectorAll("tr, [role='row']")).map(row => {
      const cells = Array.from(row.querySelectorAll("td, [role='gridcell'], th, [role='columnheader']")).map(c => c.textContent?.trim());
      const links = Array.from(row.querySelectorAll("a")).map(a => a.href);
      return { cells, links };
    });
    return rows;
  });
  
  console.log("Resources Table:", JSON.stringify(resources, null, 2));
});
