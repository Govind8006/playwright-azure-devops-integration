const { Reporter } = require('@playwright/test/reporter');
const TestResultReporter = require('./test-result-reporter');

class AzureTestPlansReporter {
    constructor(options = {}) {
        console.log('AzureTestPlansReporter initialized');
        this.testResultReporter = new TestResultReporter();
        this.pendingAttachments = []; // Track pending async attachment operations
    }

    async onBegin(config, suite) {
        console.log('Starting Azure Test Plans integration...');
        
        // Collect all test titles that will be executed
        const testTitles = this.collectTestTitles(suite);
        console.log(`Tests to be executed: ${testTitles.length}`);
        testTitles.forEach(title => console.log(`  - ${title}`));
        
        await this.testResultReporter.initialize(testTitles);
    }
    
    collectTestTitles(suite) {
        const titles = [];
        
        const traverse = (suiteOrTest) => {
            if (suiteOrTest.type === 'test') {
                titles.push(suiteOrTest.title);
            } else if (suiteOrTest.suites) {
                suiteOrTest.suites.forEach(traverse);
            }
            if (suiteOrTest.tests) {
                suiteOrTest.tests.forEach(traverse);
            }
        };
        
        traverse(suite);
        return titles;
    }

    async onTestEnd(test, result) {
        // Create a promise to track this test's attachment processing
        const attachmentPromise = (async () => {
            console.log(`\n========== onTestEnd called for test: ${test.title} ==========`);
            const testTitle = test.title;
            const outcome = result.status;
            const error = result.error;
            
            // Debug: Always log attachment info
            console.log(`Test ${testTitle} - Status: ${result.status}, Attachments: ${result.attachments ? result.attachments.length : 0}`);
            console.log(`Output directory: ${result.outputDir || 'not set'}`);
            
            // Gather additional test information
            const testInfo = {
                duration: result.duration,
                retry: result.retry,
                startTime: result.startTime,
                workerIndex: result.workerIndex
            };

            // IMPORTANT: Report test result FIRST to get the test result ID
            console.log(`Step 1: Reporting test result to Azure DevOps...`);
            await this.testResultReporter.reportTestResult(testTitle, outcome, error, testInfo);
            console.log(`Step 1: Test result reported ✓`);
            
            // NOW process attachments after we have the test result ID
            console.log(`Step 2: Processing attachments...`);
            let screenshotAttached = false;
            let videoAttached = false;
            
            // If test has attachments (screenshots, videos), attach them for all test outcomes
            if (result.attachments && result.attachments.length > 0) {
                console.log(`Found ${result.attachments.length} attachments in result.attachments array`);
                for (let i = 0; i < result.attachments.length; i++) {
                    const attachment = result.attachments[i];
                    console.log(`\n--- Processing Attachment ${i + 1} ---`);
                    console.log(`  Name: ${attachment.name}`);
                    console.log(`  Path: ${attachment.path || 'NO PATH'}`);
                    console.log(`  Content Type: ${attachment.contentType}`);
                    console.log(`  Body: ${attachment.body ? `${attachment.body.length} bytes` : 'NO BODY'}`);
                    
                    // Handle screenshot attachments - look for screenshot name or .png files
                    if ((attachment.name === 'screenshot' || 
                         attachment.name.includes('test-finished') || 
                         attachment.name.includes('test-failed') ||
                         (attachment.contentType === 'image/png' && attachment.path)) && 
                        (attachment.path || attachment.body)) {
                        console.log(`  ✓ Identified as screenshot - attempting to attach to Azure DevOps...`);
                        if (attachment.path) {
                            await this.testResultReporter.attachScreenshot(attachment.path, testTitle);
                            screenshotAttached = true;
                            console.log(`  ✓ Screenshot attached from path`);
                        } else if (attachment.body) {
                            await this.testResultReporter.attachScreenshotBuffer(attachment.body, testTitle);
                            screenshotAttached = true;
                            console.log(`  ✓ Screenshot attached from buffer`);
                        }
                    }
                    // Handle video attachments for failed tests
                    else if (attachment.name === 'video' && 
                             (outcome === 'failed' || outcome === 'timedOut') && 
                             attachment.path) {
                        console.log(`  ✓ Identified as video - attempting to attach to Azure DevOps...`);
                        await this.testResultReporter.attachVideo(attachment.path, testTitle);
                        videoAttached = true;
                        console.log(`  ✓ Video attached from path`);
                    } else {
                        console.log(`  ✗ Not a screenshot/video attachment (skipping)`);
                    }
                }
            } else {
                console.log(`No attachments found in result.attachments array`);
            }
            
            // For passed tests without attachments in result.attachments, look in test-results directory
            // Playwright generates screenshots for passed tests but doesn't add them to attachments array
            if (!screenshotAttached) {
                console.log(`\nStep 3: No screenshot attached from result.attachments`);
                console.log(`Looking for screenshot files in test-results directory...`);
                await this.tryAttachTestResultScreenshots(testTitle, result);
            } else {
                console.log(`\nStep 3: Screenshot already attached from result.attachments ✓`);
            }
            
            console.log(`========== onTestEnd completed for: ${test.title} ==========\n`);
        })();
        
        // Track this promise so onEnd can wait for it
        this.pendingAttachments.push(attachmentPromise);
    }
    
    async tryAttachTestResultScreenshots(testTitle, result) {
        try {
            const fs = require('fs');
            const path = require('path');
            
            // For passed tests, look in the standard test-results directory
            const testSlug = testTitle.replace(/[^a-zA-Z0-9]/g, '-');
            const possiblePaths = [
                `test-results/tests-${testSlug}`,
                `test-results/tests-${testSlug.toLowerCase()}`,
                result.outputDir
            ];
            
            // Also try to find directories that match the test name pattern
            const testResultsDir = 'test-results';
            if (fs.existsSync(testResultsDir)) {
                const allDirs = fs.readdirSync(testResultsDir);
                console.log(`All test result directories: ${allDirs.join(', ')}`);
                
                // Look for directories that contain the test case ID or name
                const testCaseId = testTitle.match(/TC \d+/)?.[0];
                if (testCaseId) {
                    const matchingDirs = allDirs.filter(dir => 
                        dir.includes(testCaseId.replace(' ', '-')) || 
                        dir.includes(testTitle.replace(/[^a-zA-Z0-9]/g, '-'))
                    );
                    console.log(`Matching directories for ${testCaseId}: ${matchingDirs.join(', ')}`);
                    possiblePaths.push(...matchingDirs.map(dir => path.join(testResultsDir, dir)));
                }
            }
            
            for (const dirPath of possiblePaths) {
                if (dirPath && fs.existsSync(dirPath)) {
                    console.log(`Checking directory: ${dirPath}`);
                    const files = fs.readdirSync(dirPath);
                    console.log(`Found files in ${dirPath}: ${files.join(', ')}`);
                    
                    for (const file of files) {
                        if (file.endsWith('.png') && (file.includes('test-finished') || file.includes('screenshot'))) {
                            const filePath = path.join(dirPath, file);
                            console.log(`Found screenshot file for passed test: ${filePath}`);
                            await this.testResultReporter.attachScreenshot(filePath, testTitle);
                            return; // Only attach the first screenshot found
                        }
                    }
                }
            }
            
            console.log(`No screenshot files found for passed test: ${testTitle}`);
        } catch (error) {
            console.log(`Error trying to attach screenshots: ${error.message}`);
        }
    }

    async onEnd(result) {
        console.log('Waiting for all pending attachments to complete...');
        
        // Wait for all pending attachment operations to complete
        if (this.pendingAttachments.length > 0) {
            console.log(`Waiting for ${this.pendingAttachments.length} pending attachment operations...`);
            await Promise.all(this.pendingAttachments);
            console.log('All attachments completed ✓');
        }
        
        console.log('Finalizing Azure Test Plans integration...');
        await this.testResultReporter.finalize();
    }
}

module.exports = AzureTestPlansReporter;