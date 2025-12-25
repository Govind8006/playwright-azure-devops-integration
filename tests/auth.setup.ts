import { test as setup, expect } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  console.log('Starting authentication process...');
  console.log('Environment check:');
  console.log('- BASE_URL:', process.env.BASE_URL || 'not set');
  console.log('- USER_EMAIL:', process.env.USER_EMAIL ? 'set' : 'NOT SET');
  console.log('- USER_PASSWORD:', process.env.USER_PASSWORD ? 'set' : 'NOT SET');
  
  if (!process.env.USER_EMAIL || !process.env.USER_PASSWORD) {
    throw new Error('USER_EMAIL or USER_PASSWORD environment variables are not set!');
  }
  
  try {
    // Navigate to the portal
    await page.goto(process.env.BASE_URL || 'https://cehub-dev.powerappsportals.com/', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Navigated to portal');
    
    // Wait for Microsoft login redirect
    await page.waitForURL(/login\.microsoftonline\.com/, { timeout: 15000 });
    console.log('Redirected to Microsoft login');
    
    // Fill in email
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', process.env.USER_EMAIL!);
    console.log('Email filled');
    
    await page.click('input[type="submit"]');
    await page.waitForLoadState('networkidle');
    console.log('Email submitted');
    
    // Wait for password page
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    await page.fill('input[type="password"]', process.env.USER_PASSWORD!);
    console.log('Password filled');
    
    await page.click('input[type="submit"]');
    await page.waitForLoadState('networkidle');
    console.log('Password submitted');
    
    // Handle "Stay signed in?" prompt - might not always appear
    try {
      const staySignedInButton = page.locator('input[type="submit"][value="Yes"]');
      await staySignedInButton.waitFor({ timeout: 5000 });
      await staySignedInButton.click();
      console.log('Clicked "Stay signed in"');
      await page.waitForLoadState('networkidle');
    } catch (e) {
      console.log('Stay signed in prompt not found, continuing...');
    }
    
    // Wait for navigation back to portal
    await page.waitForURL(/cehub-dev\.powerappsportals\.com/, { timeout: 30000 });
    console.log('Redirected back to portal');
    
    // Verify login success
    const welcome = page.locator('h4.newRequestWelcomeTitle');
    await expect(welcome).toHaveText(/Welcome to CEHub/, { timeout: 15000 });
    console.log('Login verified');
    
    // Save authentication state
    await page.context().storageState({ path: authFile });
    
    console.log('✓ Authentication successful and saved to', authFile);
  } catch (error) {
    console.error('Authentication failed with error:', error);
    console.error('Current URL:', page.url());
    console.error('Page title:', await page.title());
    throw error;
  }
});
