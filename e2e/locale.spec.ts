import { expect, test } from "@playwright/test";
import { watchErrors } from "./helpers.ts";

test.describe("a German browser", () => {
  test.use({ locale: "de-DE" });

  test("opens in German the first time and keeps the language picked in the settings", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto("/?seed=1");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/?seed=1");
    await expect(page.getByRole("button", { name: "Neues Spiel" })).toBeVisible(
      { timeout: 30_000 },
    );

    await page.getByRole("button", { name: "Einstellungen" }).click();
    await page.getByRole("combobox").first().selectOption("es");
    await page.goto("/?seed=1");
    await expect(
      page.getByRole("button", { name: "Nueva partida" }),
    ).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });
});

test("?lang= picks any of the five languages", async ({ page }) => {
  await page.goto("/?seed=1&lang=fr");
  await expect(
    page.getByRole("button", { name: "Nouvelle partie" }),
  ).toBeVisible({ timeout: 30_000 });
});
