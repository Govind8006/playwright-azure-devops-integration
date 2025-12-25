const fetch = require('node-fetch');

class AzureDevOpsIntegration {
    constructor(organization, project, personalAccessToken) {
        this.organization = organization;
        this.project = project;
        this.pat = personalAccessToken;
        this.baseUrl = `https://dev.azure.com/${organization}/${project}/_apis`;
    }

    async createTestRun(planId, suiteId, testPoints) {
        const url = `${this.baseUrl}/test/runs?api-version=6.0`;
        
        const testRun = {
            name: `Playwright Test Run - ${new Date().toISOString()}`,
            plan: { id: planId },
            pointIds: testPoints.map(tp => tp.id || tp.pointId),
            automated: true,
            isAutomated: true
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${this.pat}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testRun)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create test run: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json();
    }

    async updateTestResult(runId, testPointId, outcome, comment = '') {
        console.log(`Attempting to update test result for run ${runId}, test point ${testPointId}`);
        
        // First get the test results for the run to find the correct result ID
        const getResultsUrl = `${this.baseUrl}/test/runs/${runId}/results?api-version=6.0`;
        
        const getResponse = await fetch(getResultsUrl, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${this.pat}`).toString('base64')}`,
                'Content-Type': 'application/json'
            }
        });

        if (!getResponse.ok) {
            const errorText = await getResponse.text();
            throw new Error(`Failed to get test results: ${getResponse.status} ${getResponse.statusText} - ${errorText}`);
        }

        const results = await getResponse.json();
        console.log(`Found ${results.value.length} test results in run ${runId}`);
        
        // Debug: log all results to understand the structure
        results.value.forEach((result, index) => {
            console.log(`Result ${index + 1}: ID=${result.id}, TestPoint=${result.testPoint?.id}, TestCase=${result.testCase?.id}`);
        });

        // Try to find by test point ID first, then by test case ID
        let testResult = results.value.find(result => 
            result.testPoint && result.testPoint.id == testPointId
        );

        if (!testResult) {
            // Try to find by test case ID or use first result
            testResult = results.value[0]; // Use first result if we can't find specific match
            console.log(`Using first available test result: ID=${testResult?.id}`);
        }

        if (!testResult) {
            console.warn(`No test result found for test point ID: ${testPointId}`);
            return null;
        }

        console.log(`Found test result to update: ID=${testResult.id}`);

        // Update the test result
        const url = `${this.baseUrl}/test/runs/${runId}/results/${testResult.id}?api-version=6.0`;
        
        const updateData = {
            id: testResult.id,
            outcome: outcome, // "Passed", "Failed", "Blocked", "NotExecuted"
            comment: comment,
            completedDate: new Date().toISOString(),
            state: "Completed"
        };

        console.log(`Sending update request to: ${url}`);
        console.log(`Update data:`, JSON.stringify(updateData, null, 2));

        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${this.pat}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([updateData])
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Update failed: ${response.status} ${response.statusText}`);
            console.error(`Error details: ${errorText}`);
            throw new Error(`Failed to update test result: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        console.log(`Test result updated successfully:`, result);
        
        // Return both the result and the test result ID for attachments
        return {
            result: result,
            testResultId: testResult.id
        };
    }

    async completeTestRun(runId) {
        const url = `${this.baseUrl}/test/runs/${runId}?api-version=6.0`;
        
        const testRun = {
            state: 'Completed'
        };

        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${this.pat}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testRun)
        });

        if (!response.ok) {
            throw new Error(`Failed to complete test run: ${response.statusText}`);
        }

        return await response.json();
    }

    async getTestPointsForSuite(planId, suiteId) {
        const url = `${this.baseUrl}/test/plans/${planId}/suites/${suiteId}/points?api-version=6.0`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${this.pat}`).toString('base64')}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get test points: ${response.statusText}`);
        }

        return await response.json();
    }

    async attachTestRunResults(runId, testResultId, filePath, fileName) {
        const fs = require('fs');
        
        try {
            // Choose the correct API endpoint based on whether we're attaching to a specific test result or the test run
            let url;
            if (testResultId) {
                // Attach to specific test result
                url = `${this.baseUrl}/test/runs/${runId}/results/${testResultId}/attachments?api-version=6.0`;
                console.log(`Attaching screenshot: ${fileName} to test result ${testResultId}`);
            } else {
                // Attach to test run
                url = `${this.baseUrl}/test/runs/${runId}/attachments?api-version=6.0`;
                console.log(`Attaching screenshot: ${fileName} to test run ${runId}`);
            }
            
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                throw new Error(`Screenshot file not found: ${filePath}`);
            }
            
            // Read file as base64
            const fileBuffer = fs.readFileSync(filePath);
            const base64Content = fileBuffer.toString('base64');
            
            const attachmentData = {
                attachmentType: "GeneralAttachment",
                fileName: fileName,
                stream: base64Content
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${Buffer.from(`:${this.pat}`).toString('base64')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(attachmentData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to attach file: ${response.status} ${response.statusText}`);
                console.error(`Error details: ${errorText}`);
                throw new Error(`Failed to attach file: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();
            console.log(`Screenshot attached successfully: ${fileName}`);
            return result;

        } catch (error) {
            console.error(`Error attaching screenshot: ${error.message}`);
            throw error;
        }
    }
}

module.exports = AzureDevOpsIntegration;