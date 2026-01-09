const { chromium } = require('playwright');

(async () => {
    // --- CONFIGURATION ---
    const LOGIN_ID = "yash.hooda@unifyapps.com";
    const PASSWORD = "Hooda@3784";

    // Launch the browser
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // --- LOGIN FLOW ---
    console.log("Starting Login Flow...");
    try {
        const loginUrl = "https://services1.passportindia.gov.in/forms/PreLogin";
        console.log(`Navigating to Login Page: ${loginUrl}...`);
        await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 60000 });

        // Step 1: Login ID
        console.log("Entering Login ID...");
        const loginInput = page.locator('input[data-testid="text-input-outlined"]');
        await loginInput.waitFor({ state: 'visible', timeout: 30000 });
        await loginInput.fill(LOGIN_ID);

        console.log("Clicking Continue...");

        // Setup wait for preLogin API response BEFORE clicking
        const preLoginPromise = page.waitForResponse(response =>
            response.url().includes('/preLogin') && response.request().method() === 'POST'
            , { timeout: 20000 }).catch(e => {
                console.log(`preLogin API response timeout: ${e.message}`);
                return null;
            });

        await page.locator('div[data-focusable="true"]').filter({ hasText: 'Continue' }).click();

        console.log("Waiting for preLogin API response...");
        try {
            const preLoginResponse = await preLoginPromise;
            if (preLoginResponse) {
                console.log(`preLogin Response Status: ${preLoginResponse.status()}`);
            }
        } catch (e) {
            console.log(`Error waiting for preLogin: ${e.message}`);
        }

        // Allow UI to update after API response
        await page.waitForTimeout(2000);

        // Step 2: Handle Second Page Transition - Dynamic Detection
        console.log("Waiting for second page load (Login ID or Password field)...");

        try {
            const loginIdSelector = 'input[type="text"]';
            const passwordSelector = 'input[type="password"]';

            // Wait for *either* field to appear
            const firstFound = await Promise.race([
                page.waitForSelector(loginIdSelector, { state: 'visible', timeout: 20000 }).then(() => 'loginId'),
                page.waitForSelector(passwordSelector, { state: 'visible', timeout: 20000 }).then(() => 'password')
            ]);

            console.log(`Second page loaded. Found element: ${firstFound}`);

            if (firstFound === 'loginId') {
                // Check if it's empty
                const loginInputField = page.locator(loginIdSelector).first();
                const val = await loginInputField.inputValue();
                if (!val) {
                    console.log("Login ID field is empty. Re-entering...");
                    await loginInputField.fill(LOGIN_ID);
                } else {
                    console.log("Login ID preserved.");
                }

                // If we found Login ID, Password might not be visible yet
                if (!await page.locator(passwordSelector).isVisible()) {
                    await page.waitForSelector(passwordSelector, { timeout: 10000 });
                }
            }

        } catch (e) {
            console.error(`Timeout waiting for second page elements: ${e.message}`);
            throw e;
        }

        // Step 2: Enter Password
        console.log("Entering Password...");
        const passwordInput = page.locator('input[type="password"]');
        await passwordInput.fill(PASSWORD);

        console.log("Clicking Sign In...");
        const signInButton = page.locator('div[data-focusable="true"]').filter({ hasText: 'Sign In' }).first();
        await signInButton.waitFor({ state: 'visible', timeout: 10000 });
        await signInButton.click();

        // --- LOGIN VERIFICATION & TIMEOUT HANDLING ---
        console.log("Login submitted. Waiting for login to process...");

        // Wait for navigation to complete after Sign In
        console.log("Waiting for navigation after Sign In...");
        try {
            await page.waitForURL(url =>
                url.includes('homeScreen') ||
                url.includes('Services') ||
                url.includes('applicantHome') ||
                url.includes('dashboard'),
                { timeout: 40000 } // Increased from 20s to 40s - login takes time
            );
        } catch (e) {
            console.log("URL wait timed out, checking current URL...");
        }

        // Additional wait to ensure page is stable
        await page.waitForTimeout(5000); // Increased from 3s to 5s

        const currentUrl = page.url();
        console.log(`Current URL after login attempt: ${currentUrl}`);

        // Check for success indicators
        if (currentUrl.includes('applicantHome') || currentUrl.includes('dashboard') || currentUrl.includes('Services') || currentUrl.includes('homeScreen')) {
            console.log(">>> LOGIN SUCCESSFUL (Automated) <<<");
        } else {
            // Fallback: try to detect success elements
            try {
                await Promise.race([
                    page.waitForSelector('text=Logout', { timeout: 10000 }),
                    page.waitForSelector('text=Services', { timeout: 10000 })
                ]);
                console.log(">>> LOGIN SUCCESSFUL (Automated) <<<");
            } catch (e) {
                console.error(">>> LOGIN AUTO-CHECK FAILED <<<");
                console.log("PAUSING for 60 seconds to allow manual login/CAPTCHA fix...");
                console.log("Please interact with the browser window to complete login.");

                // Wait for user to manually reach the dashboard
                try {
                    await page.waitForSelector('text=Logout', { timeout: 60000 });
                    console.log(">>> MANUAL LOGIN DETECTED. Proceeding... <<<");
                } catch (manualError) {
                    console.error("Manual login timed out. Script might fail from here.");
                }
            }
        }

        // Add visualization delay after successful login
        console.log("Login successful. Pausing for visualization...");
        await page.waitForTimeout(2000);

        // Ensure page is fully loaded
        await page.waitForLoadState('networkidle');
        console.log("Page fully loaded after login.");

    } catch (e) {
        console.error("Login failed:", e);
        // We continue anyway because the user might have fixed it or wants to see the failure
    }

    // --- Post-Login Navigation ---
    console.log("Navigating to 'Apply for Fresh Passport'...");

    try {
        const currentUrl = page.url();
        console.log(`Current page: ${currentUrl}`);

        // If we're on homeScreen, click the Services tab instead of navigating
        if (currentUrl.includes('homeScreen')) {
            console.log("On homeScreen, clicking Services tab...");
            try {
                const servicesTab = page.getByText('Services', { exact: true }).first();
                await servicesTab.waitFor({ state: 'visible', timeout: 5000 });
                await servicesTab.click();
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(2000);
                console.log("Services tab clicked successfully.");
            } catch (e) {
                console.log("Services tab not found, trying direct navigation...");
                // Only use goto as last resort, and use waitUntil to prevent page closure
                await page.goto('https://services1.passportindia.gov.in/forms/Home/Services', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(2000);
            }
        }

        // Now look for the Fresh Passport link
        const linkSelector = 'a:has-text("Fresh Passport/Re-Issue of Passport")';
        console.log("Looking for Fresh Passport link...");

        // Close any advisory modal if it pops up *now*
        const closeButton = page.locator('.close, button[aria-label="Close"], button:has-text("Close"), span:has-text("X")');
        if (await closeButton.count() > 0 && await closeButton.first().isVisible()) {
            await closeButton.first().click();
            await page.waitForTimeout(1000);
        }

        console.log("Clicking 'Apply for Fresh Passport/Re-Issue of Passport'...");
        await page.locator(linkSelector).first().click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Visualization delay

        // 2. Handle AutoPopulate (Skip) if it appears
        try {
            // Quick check for Skip button
            const skipButton = page.locator('text=Skip For Now');
            await skipButton.waitFor({ state: 'visible', timeout: 3000 });
            if (await skipButton.isVisible()) {
                await skipButton.click();
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(1000);
            }
        } catch (e) { /* Ignore if not present */ }

        // 3. RPO Selection
        console.log("Handling RPO Selection...");
        // It might be skipped if already selected? Check presence.
        try {
            const rpoSelect = page.locator('select');
            if (await rpoSelect.first().isVisible()) {
                try {
                    await rpoSelect.first().selectOption({ label: 'Delhi' });
                } catch (e) {
                    await rpoSelect.first().selectOption({ index: 1 });
                }
                await page.locator('text=Next').click();
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(2000);
            }
        } catch (e) { }

        // 4. Passport Type Selection
        console.log("Handling 'Passport Type' form...");
        await page.waitForSelector('text=Fresh Passport', { timeout: 30000 });
        await page.waitForTimeout(1000); // Allow form to render

        // Radio buttons often don't have standard IDs here, using text approximation
        await page.getByText('Fresh Passport').first().click();
        await page.getByText('Normal', { exact: true }).first().click();
        await page.getByText('36 Pages').first().click();

        console.log("Clicking 'Save and Next'...");
        await page.locator('text=Save and Next').click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Visualization delay

    } catch (e) {
        console.error("Navigation error:", e);
    }

    // --- APPLICANT DETAILS ---
    console.log("Waiting for 'Applicant Details' form...");
    try {
        await page.waitForSelector("text=Applicant Details", { timeout: 30000 });
        await page.waitForTimeout(1500); // Allow form to fully load
        console.log("In 'Applicant Details' form.");

        // 1. Given Name & Surname
        console.log("Filling Name...");
        // Attempts generic label first, then specific inputs if common
        await page.getByLabel("Given Name").first().fill("Rahul");
        await page.getByLabel("Surname").first().fill("Garg");

        // 2. Gender
        console.log("Selecting Gender (Male)...");
        // Using visible text for Radio Label
        await page.locator('label:has-text("Male")').first().click();

        // 3. Have you ever been known by other names (aliases)? -> No
        console.log("Aliases -> No");
        await page.locator('tr:has-text("known by other names")').locator('label:has-text("No")').click();

        // 4. Have you ever changed your name? -> No
        console.log("Name Change -> No");
        await page.locator('tr:has-text("changed your name")').locator('label:has-text("No")').click();

        // 5. Date of Birth
        console.log("Filling DOB...");
        // Try filling directly first
        try {
            await page.getByLabel("Date of Birth").fill("01/01/1990");
        } catch (e) {
            // Fallback to click and type
            await page.getByLabel("Date of Birth").click();
            await page.keyboard.type("01/01/1990");
        }
        await page.keyboard.press("Tab");

        // 6. Place of Birth
        console.log("Filling Place of Birth...");
        await page.getByLabel("Place of Birth").first().fill("New Delhi");

        // 7. Is Place of Birth out of India? -> No
        console.log("Place of Birth out of India -> No");
        await page.locator('tr:has-text("Place of Birth out of India")').locator('label:has-text("No")').click();

        // 8. Marital Status
        console.log("Selecting Marital Status -> Single");
        await page.getByLabel("Marital Status").selectOption({ label: "Single" });

        // 9. Citizenship of India by -> Birth
        console.log("Selecting Citizenship -> Birth");
        await page.getByLabel("Citizenship of India by").selectOption({ label: "Birth" });

        // 10. PAN & Voter ID
        console.log("Filling PAN/Voter Optional...");
        await page.getByLabel("PAN").fill("ABCDE1234F");
        await page.getByLabel("Voter Id").fill("XYZ1234567");

        // 11. Employment Type -> Private
        console.log("Employment Type -> Private");
        await page.getByLabel("Employment Type").selectOption({ label: "Private" });

        // 12. Parent/Spouse Gov Servant? -> No
        console.log("Gov Servant -> No");
        // Text is "Is either of your parent (in case of minor)/spouse, a government servant?"
        await page.locator('tr:has-text("government servant")').locator('label:has-text("No")').click();

        // 13. Educational Qualification -> Graduate
        console.log("Education -> Graduate");
        await page.getByLabel("Educational Qualification").selectOption({ label: "Graduate" });

        // 14. Non-ECR -> Yes
        console.log("Non-ECR -> Yes");
        // "Is applicant eligible for Non-ECR category?"
        await page.locator('tr:has-text("Non-ECR")').locator('label:has-text("Yes")').click();

        // 15. Visible Distinguishing Mark
        console.log("Visible Mark -> None");
        await page.getByLabel("Visible distinguishing mark").fill("None");

        // 16. Aadhaar Number
        console.log("Aadhaar -> ...");
        await page.getByLabel("Aadhaar Number").fill("123456789012");

        // 17. Consent -> Yes
        console.log("Consent -> Yes");
        // Often 'I Agree' -> Yes. Searching for the consent box section
        const consentBox = page.locator('text=I Agree').first();
        if (await consentBox.isVisible()) {
            // Look for a radio/checkbox near it
            await page.locator('label:has-text("Yes")').last().click();
        } else {
            await page.locator('label:has-text("Yes")').last().click();
        }

        console.log("Saving 'Applicant Details'...");
        await page.locator('text=Save and Next').click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Visualization delay

    } catch (e) {
        console.error("Error in Applicant Details:", e);
    }

    // --- FAMILY DETAILS ---
    console.log("Waiting for 'Family Details' form...");
    try {
        await page.waitForSelector("text=Family Details", { timeout: 30000 });
        await page.waitForTimeout(1500); // Allow form to fully load

        // 1. Father's Name
        console.log("Filling Father details...");
        await page.getByLabel("Father's/Legal Guardian's Given Name").fill("FatherName");
        await page.getByLabel("Surname").nth(0).fill("FatherSurname");

        // 2. Mother's Name
        console.log("Filling Mother details...");
        await page.getByLabel("Mother's Given Name").fill("MotherName");
        await page.getByLabel("Surname").nth(1).fill("MotherSurname");

        // 3. Legal Guardian (Optional)
        // console.log("Filling Legal Guardian...");
        // await page.getByLabel("Legal Guardian's Given Name").fill("");

        console.log("Saving 'Family Details'...");
        await page.locator('text=Save and Next').click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Visualization delay

    } catch (e) {
        console.error("Error in Family Details:", e);
    }

    // Pause to let user see
    console.log("Script finished family details. Pausing...");
    await page.waitForTimeout(60000);

    await browser.close();
})();
