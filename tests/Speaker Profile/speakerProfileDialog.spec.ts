import { test, expect } from '@playwright/test';

test('TC 17759: Save Speaker Profile', async ({ page }) => {
   await page.goto('https://cehub-dev.powerappsportals.com/');
  await page.getByRole('link', { name: 'Speaker' }).click();
  await page.getByRole('link', { name: 'Speaker profile' }).click();
  await page.getByRole('button', { name: 'Profile edit icon' }).click();
  await expect(page.getByLabel('Profile', { exact: true })).toMatchAriaSnapshot(`
    - text: Profile
    - button "Close"
    `);
  await page.getByRole('textbox', { name: 'Display title' }).click();
  await page.getByRole('textbox', { name: 'Display title' }).fill('Testing Automation');
  await page.getByRole('combobox', { name: 'Pronouns' }).click();
  await page.getByRole('option', { name: 'He/Him' }).click();
    await page.locator('.p-multiselect-dropdown').first().click();
  await page.getByRole('option', { name: 'Japanese' }).click();
  await page.getByRole('option', { name: 'Korean' }).click();
  await page.getByRole('option', { name: 'Polish' }).click();
  await page.getByRole('option', { name: 'Russian' }).click();
  await page.getByRole('option', { name: 'Spanish' }).click();
  await page.locator('.p-icon.p-multiselect-dropdown-icon').first().click();
  await page.getByRole('combobox', { name: 'Location able to support in-' }).click();
  await page.getByRole('option', { name: 'EC - ASIA' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('body')).toMatchAriaSnapshot(`- text: Speaker Profile saved successfully`);
});