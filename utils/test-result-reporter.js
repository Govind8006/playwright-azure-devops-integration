const AzureDevOpsIntegration = require('./azure-devops');

class TestResultReporter {
    constructor() {
        this.azureDevOps = null;
        this.testRun = null;
        this.testResults = [];
        this.testCaseMapping = {}; // Dynamic mapping from Azure DevOps
        this.config = this.loadConfig();
    }

    loadConfig() {
        // Load configuration from environment variables or config file
        return {
            organization: process.env.AZURE_DEVOPS_ORG,
            project: process.env.AZURE_DEVOPS_PROJECT,
            personalAccessToken: process.env.AZURE_DEVOPS_PAT,
            testPlanId: process.env.AZURE_DEVOPS_TEST_PLAN_ID,
            testSuiteId: process.env.AZURE_DEVOPS_TEST_SUITE_ID,
            enabled: process.env.AZURE_DEVOPS_INTEGRATION_ENABLED === 'true'
        };
    }

    async initialize(testTitles = []) {
        if (!this.config.enabled) {
            console.log('Azure DevOps integration is disabled');
            return;
        }

        if (!this.config.organization || !this.config.project || !this.config.personalAccessToken) {
            console.warn('Azure DevOps configuration is incomplete. Integration will be skipped.');
            return;
        }

        this.azureDevOps = new AzureDevOpsIntegration(
            this.config.organization,
            this.config.project,
            this.config.personalAccessToken
        );

        try {
            // Get test points for the suite and build dynamic mapping
            const testPoints = await this.azureDevOps.getTestPointsForSuite(
                this.config.testPlanId,
                this.config.testSuiteId
            );

            // Build dynamic test case mapping
            this.buildTestCaseMapping(testPoints.value);

            // Filter test points to only include tests that will be executed
            let testPointsToRun = testPoints.value;
            if (testTitles && testTitles.length > 0) {
                // Extract test case IDs from test titles
                const testCaseIdsToRun = testTitles
                    .map(title => {
                        const match = title.match(/TC\s*(\d+)/i);
                        return match ? match[1] : null;
                    })
                    .filter(id => id !== null);
                
                console.log(`Test case IDs to run: ${testCaseIdsToRun.join(', ')}`);
                
                // Filter test points to only those being executed
                testPointsToRun = testPoints.value.filter(point => 
                    testCaseIdsToRun.includes(point.testCase.id.toString())
                );
                
                console.log(`Filtered to ${testPointsToRun.length} test points (from ${testPoints.value.length} total)`);
            }

            // Create a test run with only the tests that will be executed
            this.testRun = await this.azureDevOps.createTestRun(
                this.config.testPlanId,
                this.config.testSuiteId,
                testPointsToRun
            );

            console.log(`Created Azure DevOps test run: ${this.testRun.id}`);
            console.log(`Dynamic test case mapping built with ${Object.keys(this.testCaseMapping).length} test cases`);
        } catch (error) {
            console.error('Failed to initialize Azure DevOps integration:', error);
            this.azureDevOps = null;
        }
    }

    buildTestCaseMapping(testPoints) {
        this.testCaseMapping = {};
        
        if (testPoints && testPoints.length > 0) {
            testPoints.forEach(point => {
                if (point.testCase && point.testCase.id) {
                    const testCaseId = `TC ${point.testCase.id}`;
                    this.testCaseMapping[testCaseId] = point.id.toString();
                    console.log(`Mapped ${testCaseId} -> Test Point ${point.id} (${point.testCase.name})`);
                }
            });
        }
    }

    mapTestCaseIdToTestPoint(testCaseId) {
        // Use dynamic mapping built from Azure DevOps test points
        if (this.testCaseMapping && this.testCaseMapping[testCaseId]) {
            return this.testCaseMapping[testCaseId];
        }

        console.warn(`No test point mapping found for: ${testCaseId}`);
        console.log('Available mappings:', Object.keys(this.testCaseMapping || {}));
        
        return null;
    }

    async reportTestResult(testTitle, outcome, error = null, testInfo = null) {
        if (!this.azureDevOps || !this.testRun) {
            return;
        }

        try {
            // Extract test case ID from test title
            const testCaseMatch = testTitle.match(/TC\s*(\d+)/i);
            if (!testCaseMatch) {
                console.warn(`No test case ID found in title: ${testTitle}`);
                return;
            }

            const testCaseId = `TC ${testCaseMatch[1]}`;
            const testPointId = this.mapTestCaseIdToTestPoint(testCaseId);

            if (!testPointId) {
                console.warn(`No test point mapping found for: ${testCaseId}`);
                return;
            }

            // Create detailed comment based on test outcome
            let comment = this.generateDetailedComment(testTitle, outcome, error, testInfo);
            const azureOutcome = this.mapPlaywrightOutcomeToAzure(outcome);

            const updateResult = await this.azureDevOps.updateTestResult(
                this.testRun.id,
                testPointId,
                azureOutcome,
                comment
            );

            // Store test result ID for potential screenshot attachment
            if (updateResult && updateResult.testResultId) {
                this.lastTestResultId = updateResult.testResultId;
                this.lastTestCaseId = testCaseId;
                console.log(`Stored test result ID ${this.lastTestResultId} for attachments`);
            } else {
                console.warn('No test result ID returned from update operation');
            }

            console.log(`Updated test result for ${testCaseId}: ${azureOutcome}`);
        } catch (error) {
            console.error('Failed to report test result to Azure DevOps:', error);
        }
    }

    generateDetailedComment(testTitle, outcome, error, testInfo) {
        const timestamp = new Date().toISOString();
        let comment = `Test executed via Playwright automation\n`;
        comment += `Execution Time: ${timestamp}\n`;
        comment += `Test Title: ${testTitle}\n`;
        comment += `Status: ${outcome.toUpperCase()}\n`;

        if (testInfo) {
            comment += `Duration: ${testInfo.duration}ms\n`;
            if (testInfo.retry > 0) {
                comment += `Retries: ${testInfo.retry}\n`;
            }
        }

        if (outcome === 'passed') {
            comment += `\n✅ Test passed successfully`;
            comment += `\nAll assertions and validations completed without errors.`;
        } else if (outcome === 'failed') {
            comment += `\n❌ Test failed`;
            if (error) {
                comment += `\nError: ${error.message}`;
                if (error.stack) {
                    comment += `\nStack Trace:\n${error.stack.substring(0, 500)}...`;
                }
            }
        } else if (outcome === 'skipped') {
            comment += `\n⏭️ Test was skipped`;
        } else if (outcome === 'timedOut') {
            comment += `\n⏰ Test timed out`;
            if (error) {
                comment += `\nTimeout Error: ${error.message}`;
            }
        }

        comment += `\n\nExecuted by: Playwright Test Runner`;
        comment += `\nEnvironment: ${process.env.NODE_ENV || 'development'}`;
        
        return comment;
    }

    mapPlaywrightOutcomeToAzure(outcome) {
        const outcomeMapping = {
            'passed': 'Passed',
            'failed': 'Failed',
            'skipped': 'NotExecuted',
            'timedOut': 'Failed'
        };

        return outcomeMapping[outcome] || 'NotExecuted';
    }

    async finalize() {
        if (!this.azureDevOps || !this.testRun) {
            return;
        }

        try {
            await this.azureDevOps.completeTestRun(this.testRun.id);
            console.log(`Completed Azure DevOps test run: ${this.testRun.id}`);
        } catch (error) {
            console.error('Failed to complete Azure DevOps test run:', error);
        }
    }

    async attachScreenshot(screenshotPath, testTitle) {
        console.log(`Attempting to attach screenshot for: ${testTitle}`);
        console.log(`Screenshot path: ${screenshotPath}`);
        console.log(`Azure DevOps available: ${!!this.azureDevOps}`);
        console.log(`Test run available: ${!!this.testRun}`);
        console.log(`Test result ID available: ${this.lastTestResultId}`);
        
        if (!this.azureDevOps || !this.testRun) {
            console.log('Cannot attach screenshot - missing Azure DevOps integration or test run');
            return;
        }

        try {
            const fs = require('fs');
            
            // Check if screenshot file exists
            if (!fs.existsSync(screenshotPath)) {
                console.warn(`Screenshot file not found: ${screenshotPath}`);
                return;
            }

            console.log(`Screenshot file exists, size: ${fs.statSync(screenshotPath).size} bytes`);
            const fileName = `${this.lastTestCaseId || 'test'}-screenshot-${Date.now()}.png`;
            
            console.log(`Attaching screenshot as: ${fileName}`);
            
            // Always attach to test run (simpler and more reliable)
            if (this.lastTestResultId) {
                // Attach to specific test result
                await this.azureDevOps.attachTestRunResults(
                    this.testRun.id,
                    this.lastTestResultId,
                    screenshotPath,
                    fileName
                );
            } else {
                // Attach to test run directly if no specific test result ID
                await this.azureDevOps.attachTestRunResults(
                    this.testRun.id,
                    null,
                    screenshotPath,
                    fileName
                );
            }
            
            console.log(`✅ Successfully attached screenshot for: ${testTitle}`);
        } catch (error) {
            console.error('❌ Failed to attach screenshot:', error.message);
        }
    }

    async attachVideo(videoPath, testTitle) {
        console.log(`Attempting to attach video for: ${testTitle}`);
        console.log(`Video path: ${videoPath}`);
        console.log(`Azure DevOps available: ${!!this.azureDevOps}`);
        console.log(`Test run available: ${!!this.testRun}`);
        console.log(`Test result ID available: ${this.lastTestResultId}`);
        
        if (!this.azureDevOps || !this.testRun) {
            console.log('Cannot attach video - missing Azure DevOps integration or test run');
            return;
        }

        try {
            const fs = require('fs');
            
            // Check if video file exists
            if (!fs.existsSync(videoPath)) {
                console.warn(`Video file not found: ${videoPath}`);
                return;
            }

            console.log(`Video file exists, size: ${fs.statSync(videoPath).size} bytes`);
            const fileName = `${this.lastTestCaseId || 'test'}-video-${Date.now()}.webm`;
            
            console.log(`Attaching video as: ${fileName}`);
            
            // Always attach to test run
            if (this.lastTestResultId) {
                // Attach to specific test result
                await this.azureDevOps.attachTestRunResults(
                    this.testRun.id,
                    this.lastTestResultId,
                    videoPath,
                    fileName
                );
            } else {
                // Attach to test run directly if no specific test result ID
                await this.azureDevOps.attachTestRunResults(
                    this.testRun.id,
                    null,
                    videoPath,
                    fileName
                );
            }
            
            console.log(`✅ Successfully attached video for: ${testTitle}`);
        } catch (error) {
            console.error('❌ Failed to attach video:', error.message);
        }
    }

    async attachScreenshotBuffer(buffer, testTitle) {
        console.log(`Attempting to attach in-memory screenshot for: ${testTitle}`);
        console.log(`Buffer size: ${buffer.length} bytes`);
        
        if (!this.azureDevOps || !this.testRun) {
            console.log('Cannot attach screenshot - missing Azure DevOps integration or test run');
            return;
        }

        try {
            const fs = require('fs');
            const path = require('path');
            
            // Create temp file for the buffer
            const tempDir = 'test-results';
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const fileName = `${this.lastTestCaseId || 'test'}-screenshot-${Date.now()}.png`;
            const tempPath = path.join(tempDir, fileName);
            
            // Write buffer to temp file
            fs.writeFileSync(tempPath, buffer);
            console.log(`Temporary screenshot saved to: ${tempPath}`);
            
            // Now attach the file
            await this.attachScreenshot(tempPath, testTitle);
            
            // Clean up temp file
            fs.unlinkSync(tempPath);
            console.log(`Cleaned up temporary file: ${tempPath}`);
        } catch (error) {
            console.error('❌ Failed to attach in-memory screenshot:', error.message);
        }
    }
}

module.exports = TestResultReporter;