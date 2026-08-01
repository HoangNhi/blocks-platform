import { test } from "@playwright/test";

test.use({ ignoreHTTPSErrors: true });

test("Get tradelabservice console logs", async ({ page }) => {
  await page.goto("https://localhost:17073/login?t=75353f6a5b767b8e22e672925ba80a81", { waitUntil: "networkidle" });
  await page.goto("https://localhost:17073/consolelogs", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  
  // Find resource select element/combobox and select tradelabservice
  // Let's print all comboboxes first or click the resource dropdown
  const combobox = page.getByRole("combobox").first();
  if (await combobox.isVisible()) {
    await combobox.click();
    await page.waitForTimeout(500);
    // Find the option containing 'tradelabservice' and click it
    await page.getByRole("option", { name: "tradelabservice" }).first().click();
    await page.waitForTimeout(3000);
  }

  const logs = await page.evaluate(() => {
    return document.body.innerText;
  });
  console.log("--- TRADELABSERVICE LOGS ---");
  console.log(logs.slice(0, 8000));
  console.log("----------------------------");
});
