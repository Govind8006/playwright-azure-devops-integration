import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export default defineConfig({
  timeout: 120000,
  retries: 1, // retry once on failure
  
  // Run authentication setup before all tests
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      timeout: 60000, // Longer timeout for authentication
      retries: 2, // Retry twice authentication if it fails
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
      },
    },
    {
      name: 'msedge',
      use: { 
        ...devices['Desktop Edge'],
        channel: 'msedge',
        // Use authenticated state from setup
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  reporter: [
    ['list'],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    // Add Azure Test Plans reporter
    ['./utils/azure-test-plans-reporter.js']
  ],

  use: {
    baseURL: process.env.BASE_URL || 'https://cehub-dev.powerappsportals.com/',
    // Take screenshots for all tests for Azure DevOps attachments
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure'
  }
});
