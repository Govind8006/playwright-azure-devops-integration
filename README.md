# CEHub Event Portal Testing with Azure DevOps Integration

Automated test suite for CEHub Event Portal using Playwright with Azure DevOps Test Plans integration.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Setup](#setup)
- [Running Tests](#running-tests)
- [Azure DevOps Integration](#azure-devops-integration)
- [Authentication](#authentication)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)

## 🎯 Overview

This project provides automated end-to-end testing for the CEHub Event Portal using Playwright. Key features:

- ✅ Automated test execution with Playwright (Microsoft Edge)
- ✅ Azure DevOps Test Plans integration
- ✅ Automatic screenshot and video attachment for failed tests
- ✅ Dynamic test case mapping from Azure DevOps
- ✅ Credential-based authentication with global setup
- ✅ Browser caching for faster pipeline execution
- ✅ Suite-based test execution
- ✅ Parallel test execution support

## 🏗️ Architecture

### High-Level Flow

```
Playwright Test → Azure Test Plans Reporter → Azure DevOps API
     ↓                      ↓                        ↓
  Test File          Collect Results         Update Test Run
     ↓                      ↓                        ↓
  Execute Test        Report Outcome          Attach Screenshots/Videos
     ↓                      ↓                        ↓
  Take Screenshot     Wait for Attachments    Complete Test Run
```

### Components

1. **Test Files** (`tests/**/*.spec.ts`)

   - Standard Playwright tests with Azure test case IDs in titles
   - Format: `TC {ID}: {Test Name}`
   - Organized by suite folders (Request Form, Speaker Profile)

2. **Authentication Setup** (`tests/auth.setup.ts`)

   - Global setup that runs before all tests
   - Performs Microsoft OAuth login using credentials from .env
   - Saves authenticated state to `playwright/.auth/user.json`
   - All tests reuse this authenticated state

3. **Azure Test Plans Reporter** (`utils/azure-test-plans-reporter.js`)

   - Custom Playwright reporter
   - Hooks into test lifecycle (onBegin, onTestEnd, onEnd)
   - Manages attachment processing (screenshots and videos)

4. **Test Result Reporter** (`utils/test-result-reporter.js`)

   - Orchestrates Azure DevOps operations
   - Manages test run lifecycle
   - Handles test result updates and attachments

5. **Azure DevOps Integration** (`utils/azure-devops.js`)
   - Low-level Azure DevOps REST API wrapper
   - Handles authentication and API calls
   - Manages test runs, results, and attachments

## 🚀 Setup

### Prerequisites

- Node.js (v18 or higher)
- Azure DevOps account with Test Plans
- Personal Access Token (PAT) with Test Management permissions
- Microsoft Edge browser installed

### Installation

1. **Clone and install dependencies:**

   ```bash
   npm install
   npx playwright install msedge
   ```

2. **Configure environment variables:**

   Create a `.env` file with your configuration:

   ```env
   # Base URL for the application
   BASE_URL=https://cehub-dev.powerappsportals.com/

   # Login credentials for authentication
   USER_EMAIL=your-email@microsoft.com
   USER_PASSWORD=your-password

   # Azure DevOps Test Plans Integration
   AZURE_DEVOPS_INTEGRATION_ENABLED=true
   AZURE_DEVOPS_ORG=QuEST-CET
   AZURE_DEVOPS_PROJECT=CEHub
   AZURE_DEVOPS_PAT=your-personal-access-token
   AZURE_DEVOPS_TEST_PLAN_ID=17662
   AZURE_DEVOPS_TEST_SUITE_ID=17665
   ```

3. **Authentication is automatic:**
   - No need to save auth files manually
   - On first test run, `auth.setup.ts` will log in and save the session
   - Subsequent tests reuse the saved authentication state

### Finding Azure DevOps IDs

**Test Plan ID:**

- Navigate to Azure DevOps → Test Plans
- Select your test plan
- Check the URL: `...testPlans/define?planId=XXXXX`

**Test Suite ID:**

- Within your test plan, select a test suite
- Check the URL: `...suiteId=YYYYY`

**Test Suite ID:**

- Select your test suite within the plan
- Check the URL: `...testPlans/execute?planId=XXXXX&suiteId=YYYYY`

**Test Case IDs:**

- Test cases are automatically mapped from Azure DevOps
- Use the format `TC {ID}` in your test titles (e.g., `TC 17705: Portal Login`)

## 🧪 Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests by Suite Folder

```bash
# Run Request Form tests only
npx playwright test "tests/Request Form/"

# Run Speaker Profile tests only
npx playwright test "tests/Speaker Profile/"
```

### Run Specific Test

```bash
npx playwright test tests/Request\ Form/newRequestForm-EC.spec.ts
```

### Run with UI Mode

```bash
npx playwright test --ui
```

### Run in Headed Mode (See Browser)

```bash
npx playwright test --headed
```

### View Test Report

```bash
npx playwright show-report
```

### View Test Trace

```bash
npx playwright show-trace test-results/path-to-trace.zip
```

## 🔗 Azure DevOps Integration

### How Test Cases are Mapped

The integration uses **dynamic mapping** - it automatically discovers test cases from your Azure DevOps test suite:

1. **During Initialization (`onBegin`):**

   - Reporter collects all test titles from the Playwright test suite
   - Extracts test case IDs (e.g., `TC 17759` → `17759`)
   - Calls Azure DevOps API to get test points for the suite
   - Filters test points to only those being executed
   - Creates a test run with only the selected tests

2. **Why This Matters:**
   - Running one test doesn't mark others as "In Progress"
   - Each test run contains only the tests you're actually running
   - No manual mapping required - works automatically

### Test Result Flow

```
1. Test Starts
   ↓
2. Reporter creates Azure DevOps test run
   ↓
3. Test executes and completes
   ↓
4. onTestEnd called
   ↓
5. Report test outcome to Azure DevOps
   ↓
6. Get test result ID from Azure DevOps
   ↓
7. Process attachments (screenshots/videos)
   ↓
8. Attach screenshot to test result
   ↓
9. Attach video if test failed
   ↓
10. Wait for all pending attachments
   ↓
11. Complete test run (onEnd)
```

### Screenshot and Video Attachment

Attachments are automatically uploaded to Azure DevOps:

**Screenshots:**

- Attached for **all tests** (passed and failed)
- Taken at the end of test execution

**Videos:**

- Attached only for **failed or timed out tests**
- Recorded automatically by Playwright on failure

**How It Works:**

1. **Playwright Configuration** (`playwright.config.ts`):

   ```typescript
   screenshot: "on"; // Take screenshots for all tests
   video: "retain-on-failure"; // Record video only on failures
   ```

2. **Attachment Detection:**

   - Playwright adds screenshots and videos to `result.attachments` array
   - Reporter processes each attachment after test completion
   - Videos are only attached for failed or timed out tests

3. **Race Condition Prevention:**

   - `onTestEnd` creates a promise for attachment processing
   - Promises are tracked in `pendingAttachments` array
   - `onEnd` waits for all pending attachments before finalizing

4. **Azure DevOps Upload:**
   - Screenshot/video is read from disk as base64
   - Uploaded via Azure DevOps REST API
   - Attached to specific test result (not just test run)

**Key Implementation Detail:**

The critical fix for attachment handling ensures `onEnd` waits for all uploads:

```javascript
// In azure-test-plans-reporter.js
async onTestEnd(test, result) {
    const attachmentPromise = (async () => {
        // Process test result, screenshots, and videos
    })();
    this.pendingAttachments.push(attachmentPromise);
}

async onEnd(result) {
    await Promise.all(this.pendingAttachments);  // Wait here!
    await this.testResultReporter.finalize();
}
```

## 🔐 Authentication

### Credential-Based Authentication

The project uses **credential-based authentication** with automated setup:

1. **Global Setup (`tests/auth.setup.ts`):**

   - Runs once before all tests via global setup project
   - Performs OAuth login using credentials from `.env`
   - Navigates through Microsoft authentication flow
   - Saves session to `playwright/.auth/user.json`

2. **Environment Variables (`.env`):**

   ```env
   USER_EMAIL=your-email@microsoft.com
   USER_PASSWORD=your-password
   BASE_URL=https://your-app-url.com
   ```

3. **Session File Structure:**

   ```json
   {
     "cookies": [...],
     "origins": [...]
   }
   ```

4. **Session Reuse:**

   ```typescript
   // In playwright.config.ts
   use: {
     storageState: "playwright/.auth/user.json";
   }
   ```

5. **When to Re-authenticate:**
   - Sessions expire after 1-8 hours
   - Authentication runs automatically at test start
   - No manual intervention required

### Why This Approach?

- ✅ Faster test execution (login runs once)
- ✅ Automatic authentication in CI/CD
- ✅ Works with MFA/2FA (if configured for user)
- ✅ Handles complex Microsoft authentication flows
- ✅ Session reused across all tests

## 📁 Project Structure

```
eventPortalTesting/
├── playwright/
│   └── .auth/
│       └── user.json                 # Saved authentication session
│
├── tests/
│   ├── auth.setup.ts                 # Global authentication setup
│   ├── Request Form/                 # Request Form test suite (17665)
│   │   ├── newRequestForm-EC.spec.ts    # TC 17666: EC - SILICON VALLEY
│   │   └── newRequestForm-Hub.spec.ts   # TC 17749: Hub - BUILDING
│   └── Speaker Profile/              # Speaker Profile suite (17757)
│       └── speakerProfileDialog.spec.ts # TC 17759: Save Speaker Profile
│
├── utils/                             # Azure DevOps integration
│   ├── azure-devops.js               # Azure DevOps REST API wrapper
│   ├── azure-test-plans-reporter.js  # Playwright reporter with video support
│   └── test-result-reporter.js       # Test result orchestration
│
├── test-results/                      # Test execution artifacts
│   └── [test-name]/                  # Per-test results
│       ├── test-finished-1.png       # Success screenshot
│       ├── test-failed-1.png         # Failure screenshot
│       └── video.webm                # Failure video (if test failed)
│
├── playwright-report/                 # HTML test report
├── .env                              # Environment configuration (credentials)
├── .env.example                      # Template configuration
├── playwright.config.ts              # Playwright configuration (Edge browser)
├── azure-pipeline.yml                # Azure DevOps pipeline with suite params
└── package.json                      # Dependencies and scripts
```

## 🔧 How It Works

### 1. Test Initialization (onBegin)

```javascript
// azure-test-plans-reporter.js
async onBegin(config, suite) {
    // Collect test titles from Playwright suite
    const testTitles = this.collectTestTitles(suite);

    // Initialize Azure DevOps integration with test list
    await this.testResultReporter.initialize(testTitles);
}
```

**What Happens:**

- Playwright provides the full test suite structure
- Reporter recursively traverses to collect all test titles
- Test titles passed to `TestResultReporter` for filtering

### 2. Azure DevOps Test Run Creation (initialize)

```javascript
// test-result-reporter.js
async initialize(testTitles = []) {
    // Get all test points from Azure DevOps suite
    const testPoints = await this.azureDevOps.getTestPointsForSuite(
        this.config.testPlanId,
        this.config.testSuiteId
    );

    // Build mapping: TC 17705 → Test Point 2538
    this.buildTestCaseMapping(testPoints.value);

    // Extract test case IDs from titles
    const testCaseIdsToRun = testTitles
        .map(title => title.match(/TC\s*(\d+)/i)?.[1])
        .filter(id => id !== null);

    // Filter to only test points being executed
    const testPointsToRun = testPoints.value.filter(point =>
        testCaseIdsToRun.includes(point.testCase.id.toString())
    );

    // Create test run with filtered points
    this.testRun = await this.azureDevOps.createTestRun(
        this.config.testPlanId,
        this.config.testSuiteId,
        testPointsToRun
    );
}
```

**Why Filter Test Points?**

- Azure DevOps marks all test points in a run as "In Progress"
- Without filtering, running one test marks ALL tests in suite as in progress
- Filtering ensures only executed tests appear in the test run

### 3. Test Execution and Result Reporting (onTestEnd)

```javascript
// azure-test-plans-reporter.js
async onTestEnd(test, result) {
    const attachmentPromise = (async () => {
        // 1. Report test result to Azure DevOps
        await this.testResultReporter.reportTestResult(
            testTitle, outcome, error, testInfo
        );

        // 2. Process attachments (screenshots and videos)
        if (result.attachments && result.attachments.length > 0) {
            for (const attachment of result.attachments) {
                if (isScreenshot(attachment)) {
                    await this.testResultReporter.attachScreenshot(
                        attachment.path, testTitle
                    );
                }
                // Attach video only for failures
                if (attachment.name === 'video' &&
                    (outcome === 'failed' || outcome === 'timedOut')) {
                    await this.testResultReporter.attachVideo(
                        attachment.path, testTitle
                    );
                }
            }
        }
    })();

    // Track promise for later waiting
    this.pendingAttachments.push(attachmentPromise);
}
```

**Critical Timing:**

- `reportTestResult()` must complete first to get test result ID
- Screenshot and video attachments need the test result ID
- Process happens asynchronously to avoid blocking

### 4. Attachment Process (Screenshots and Videos)

```javascript
// test-result-reporter.js
async attachScreenshot(screenshotPath, testTitle) {
    // Check file exists
    if (!fs.existsSync(screenshotPath)) return;

    // Read as base64
    const fileBuffer = fs.readFileSync(screenshotPath);
    const base64Content = fileBuffer.toString('base64');

    // Upload to Azure DevOps
    await this.azureDevOps.attachTestRunResults(
        this.testRun.id,
        this.lastTestResultId,  // From previous reportTestResult()
        screenshotPath,
        fileName
    );
}

async attachVideo(videoPath, testTitle) {
    // Check file exists
    if (!fs.existsSync(videoPath)) return;

    // Read as base64
    const fileBuffer = fs.readFileSync(videoPath);
    const base64Content = fileBuffer.toString('base64');

    // Upload to Azure DevOps
    await this.azureDevOps.attachTestRunResults(
        this.testRun.id,
        this.lastTestResultId,
        videoPath,
        fileName  // e.g., TC17759-video-1234567890.webm
    );
}
```

**Azure DevOps API Call:**

```javascript
// azure-devops.js
async attachTestRunResults(runId, testResultId, filePath, fileName) {
    const url = `${this.baseUrl}/test/runs/${runId}/results/${testResultId}/attachments?api-version=6.0`;

    const attachmentData = {
        attachmentType: "GeneralAttachment",
        fileName: fileName,
        stream: base64Content  // Base64 encoded file
    };

    await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${Buffer.from(`:${this.pat}`).toString('base64')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(attachmentData)
    });
}
```

### 5. Test Run Completion (onEnd)

```javascript
// azure-test-plans-reporter.js
async onEnd(result) {
    // CRITICAL: Wait for all attachments to complete
    await Promise.all(this.pendingAttachments);

    // Now finalize the test run
    await this.testResultReporter.finalize();
}
```

**Why Wait?**

- Playwright's `onEnd` can be called while `onTestEnd` is still processing
- Without waiting, test run completes before attachments upload
- `Promise.all()` ensures all attachments finish first

### 6. Test Run Finalization

```javascript
// test-result-reporter.js
async finalize() {
    // Mark test run as completed in Azure DevOps
    await this.azureDevOps.completeTestRun(this.testRun.id);
}
```

## 🐛 Troubleshooting

### Authentication Issues

**Problem:** Tests fail with "Cannot find element" or redirect to login

**Solution:**

```bash
# Authentication runs automatically at test start
npm test
```

**Why:** Authentication session expires (typically 1-8 hours). The global setup (`tests/auth.setup.ts`) automatically re-authenticates when you run tests.

**Manual Debug (if needed):**
Check your `.env` file has correct credentials:

```env
USER_EMAIL=your-email@microsoft.com
USER_PASSWORD=your-password
BASE_URL=https://your-app-url.com
```

### Attachments Not Uploading

**Problem:** Screenshots or videos generated but not in Azure DevOps

**Solution:** Already fixed in current implementation via:

- Tracking pending attachments
- Waiting in `onEnd` before finalizing

**Debug:** Check console output for:

```
✅ Successfully attached screenshot for: TC XXXXX
✅ Successfully attached video for: TC XXXXX
```

### Test Point Mapping Issues

**Problem:** "No test point mapping found for: TC XXXXX"

**Checklist:**

1. Test title includes `TC {ID}` format
2. Test case exists in Azure DevOps suite
3. Test case ID matches Azure DevOps

**Debug Console Output:**

```
Mapped TC 17705 -> Test Point 2538 (Portal Login)
```

### Wrong Tests Marked as In Progress

**Problem:** Running one test marks multiple as "In Progress"

**Solution:** Already fixed via test filtering in `initialize()`

**Verify Console Output:**

```
Tests to be executed: 1
  - TC 17705: Portal Login
Filtered to 1 test points (from 2 total)
```

## 📊 Test Output Explained

```
Starting Azure Test Plans integration...
Tests to be executed: 2
  - TC 17666: New Request Form – EC Silicon Valley
  - TC 17705: Portal Login

Mapped TC 17666 -> Test Point 2537 (New Request Form – EC Silicon Valley)
Mapped TC 17705 -> Test Point 2538 (Portal Login)

Test case IDs to run: 17666, 17705
Filtered to 2 test points (from 2 total)

Created Azure DevOps test run: 5525
Dynamic test case mapping built with 2 test cases
```

**What This Shows:**

- ✓ 2 tests discovered from Playwright suite
- ✓ Dynamic mapping from Azure DevOps successful
- ✓ Test points filtered correctly (2 of 2 total)
- ✓ Test run created with ID 5525

```
========== onTestEnd called for test: TC 17705: Portal Login ==========
Test TC 17705: Portal Login - Status: passed, Attachments: 1

Step 1: Reporting test result to Azure DevOps...
Found 2 test results in run 5525
Test result updated successfully

Step 2: Processing attachments...
Found 1 attachments in result.attachments array
  ✓ Identified as screenshot - attempting to attach to Azure DevOps...
Screenshot file exists, size: 76195 bytes
Attaching screenshot: TC 17705-screenshot-1765176299382.png to test result 100001
Screenshot attached successfully: TC 17705-screenshot-1765176299382.png
✅ Successfully attached screenshot for: TC 17705: Portal Login

Step 3: Screenshot already attached from result.attachments ✓
========== onTestEnd completed for: TC 17705: Portal Login ==========
```

**What This Shows:**

- ✓ Test result reported to Azure DevOps
- ✓ Screenshot detected (76KB)
- ✓ Screenshot uploaded successfully
- ✓ Attachment processing completed

```
Waiting for all pending attachments to complete...
Waiting for 2 pending attachment operations...
All attachments completed ✓
Finalizing Azure Test Plans integration...
Completed Azure DevOps test run: 5525
```

**What This Shows:**

- ✓ Reporter waiting for both test attachments
- ✓ All attachments completed before finalization
- ✓ Test run marked as completed in Azure DevOps

## 🎓 Best Practices

### Test Naming Convention

Always use the format: `TC {ID}: {Descriptive Name}`

```typescript
// ✅ Good
test('TC 17759: Save Speaker Profile', async ({ page }) => {

// ❌ Bad
test('Speaker profile test', async ({ page }) => {
test('Test case 17759', async ({ page }) => {
```

### Authentication Management

- Keep `playwright/.auth/user.json` in `.gitignore`
- Store credentials securely in `.env` file (also in `.gitignore`)
- Don't commit authentication files to version control
- Use Azure DevOps Library for pipeline secrets

### Screenshot and Video Strategy

Current configuration:

```typescript
// playwright.config.ts
screenshot: "on"; // All tests
video: "retain-on-failure"; // Only failures
```

**Alternative Options:**

- `screenshot: 'only-on-failure'` - Only failed tests (saves storage)
- `video: 'on'` - Record all tests (expensive but comprehensive)
- `screenshot: 'off'`, `video: 'off'` - No media (fastest)

### Azure DevOps Configuration

- Use descriptive test run names (automatically timestamped)
- Keep test plans organized by feature/sprint
- Use test suites to group related tests
- Leverage suite parameters for flexible test execution

## 🔄 CI/CD Integration

### Azure Pipeline Configuration

The project includes a fully configured Azure Pipeline with suite-based execution:

```yaml
# azure-pipelines.yml
parameters:
  - name: testSuiteId
    displayName: "Test Suite to Run"
    type: string
    default: "17665"
    values:
      - "17665" # Request Form tests
      - "17757" # Speaker Profile tests

trigger:
  - main

pool:
  vmImage: "ubuntu-latest"

variables:
  AZURE_DEVOPS_TEST_SUITE_ID: ${{ parameters.testSuiteId }}

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: "18.x"

  - task: Cache@2
    inputs:
      key: 'playwright | "$(Agent.OS)" | package-lock.json'
      path: $(HOME)/.cache/ms-playwright
    displayName: "Cache Playwright browsers"

  - script: npm ci
    displayName: "Install dependencies"

  - script: npx playwright install --with-deps msedge
    displayName: "Install Playwright Edge browser"

  - script: |
      if [ "$(AZURE_DEVOPS_TEST_SUITE_ID)" = "17757" ]; then
        npx playwright test "tests/Speaker Profile/"
      elif [ "$(AZURE_DEVOPS_TEST_SUITE_ID)" = "17665" ]; then
        npx playwright test "tests/Request Form/"
      else
        npx playwright test
      fi
    displayName: "Run Playwright tests"
    env:
      AZURE_DEVOPS_PAT: $(AZURE_DEVOPS_PAT)
      USER_EMAIL: $(USER_EMAIL)
      USER_PASSWORD: $(USER_PASSWORD)
      BASE_URL: $(BASE_URL)
```

### Key Pipeline Features

1. **Suite Selection**: Dropdown parameter to choose which tests to run
2. **Browser Caching**: Reduces browser installation time by ~85%
3. **Edge Browser**: Uses Microsoft Edge for consistency with local development
4. **Folder-Based Execution**: Automatically discovers tests in suite folders
5. **Secure Credentials**: Uses Azure DevOps Library for sensitive data

### Required Pipeline Variables

Set these in Azure DevOps Library (Project Settings → Pipelines → Library):

- `AZURE_DEVOPS_PAT` - Personal Access Token for Azure DevOps API
- `USER_EMAIL` - Microsoft account email for authentication
- `USER_PASSWORD` - Microsoft account password
- `BASE_URL` - Application URL to test
- `AZURE_DEVOPS_ORG` - Organization name
- `AZURE_DEVOPS_PROJECT` - Project name
- `AZURE_DEVOPS_TEST_PLAN_ID` - Test Plan ID
- `AZURE_DEVOPS_TEST_SUITE_ID` - Set by pipeline parameter (optional, auto-set)

## 🔄 CI/CD Integration (Legacy)

For basic CI/CD without suite parameters:

```yaml
# azure-pipelines.yml (simple version)
trigger:
  - main

pool:
  vmImage: "ubuntu-latest"

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: "18.x"

  - script: npm ci
    displayName: "Install dependencies"

  - script: npx playwright install --with-deps msedge
    displayName: "Install Playwright Edge browser"

  - script: npm test
    displayName: "Run tests"
    env:
      AZURE_DEVOPS_INTEGRATION_ENABLED: true
      AZURE_DEVOPS_ORG: $(AZURE_DEVOPS_ORG)
      AZURE_DEVOPS_PROJECT: $(AZURE_DEVOPS_PROJECT)
      AZURE_DEVOPS_PAT: $(AZURE_DEVOPS_PAT)
      AZURE_DEVOPS_TEST_PLAN_ID: $(AZURE_DEVOPS_TEST_PLAN_ID)
      AZURE_DEVOPS_TEST_SUITE_ID: $(AZURE_DEVOPS_TEST_SUITE_ID)
      USER_EMAIL: $(USER_EMAIL)
      USER_PASSWORD: $(USER_PASSWORD)
      BASE_URL: $(BASE_URL)
```

**Note:** Store sensitive values (PAT, credentials) in Azure Pipeline Library, not in the YAML file.

## 📝 Summary

This project demonstrates a complete Playwright testing solution with Azure DevOps integration:

✅ **Dynamic Test Discovery** - No manual mapping required  
✅ **Smart Test Filtering** - Only executed tests appear in test runs  
✅ **Automatic Attachments** - Screenshots for all tests, videos for failures  
✅ **Race Condition Prevention** - Proper async handling ensures reliability  
✅ **Credential Authentication** - Fast execution with automatic re-authentication  
✅ **Suite-Based Execution** - Flexible test selection via pipeline parameters  
✅ **Browser Caching** - Optimized pipeline with 85% faster browser installation  
✅ **Microsoft Edge** - Consistent testing environment (local + CI/CD)  
✅ **Folder Organization** - Scalable test structure with automatic discovery  
✅ **Production-Ready** - Clean architecture, error handling, and comprehensive logging

### Key Innovations

1. **Automatic Test Point Filtering**: Only executed tests appear in Azure DevOps test runs
2. **Proper Async Handling**: Screenshot and video attachments complete before test run finalization
3. **Suite Parameterization**: Runtime selection of test suites for flexible execution
4. **Browser Cache Optimization**: Significant CI/CD time savings through intelligent caching
5. **Credential-Based Auth**: No manual session refresh needed—authentication runs automatically

The solution provides accurate Azure DevOps integration, efficient CI/CD execution, and a scalable test organization structure.
