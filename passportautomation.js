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
        const loginUrl = "https://services2.passportindia.gov.in/forms/PreLogin";
        console.log(`Navigating to Login Page: ${loginUrl}...`);
        await page.goto(loginUrl, { timeout: 60000 });

        // Step 1: Login ID
        console.log("Entering Login ID...");
        const loginInput = page.locator('input[data-testid="text-input-outlined"]');
        await loginInput.waitFor({ state: 'visible', timeout: 30000 });
        await loginInput.fill(LOGIN_ID);

        console.log("Clicking Continue...");

        // Setup wait for response BEFORE clicking
        const preLoginPromise = page.waitForResponse(response =>
            response.url().includes('/preLogin') && response.request().method() === 'POST'
            , { timeout: 20000 }).catch(e => {
                console.error(`preLogin API response timeout: ${e.message}`);
                return null;
            });

        await page.locator('div[data-focusable="true"]').filter({ hasText: 'Continue' }).click();

        console.log('Waiting for preLogin API response...');
        const preLoginResponse = await preLoginPromise;
        if (preLoginResponse) {
            console.log(`preLogin Response Status: ${preLoginResponse.status()}`);
        }

        // Allow UI to update after API response
        await page.waitForTimeout(2000);

        // Step 2: Handle Second Page Transition
        console.log('Waiting for second page load (Login ID or Password field)...');
        const loginIdSelector = 'input[type="text"]';
        const passwordSelector = 'input[type="password"]';

        const firstFound = await Promise.race([
            page.waitForSelector(loginIdSelector, { state: 'visible', timeout: 20000 }).then(() => 'loginId'),
            page.waitForSelector(passwordSelector, { state: 'visible', timeout: 20000 }).then(() => 'password')
        ]);

        console.log(`Second page loaded. Found element: ${firstFound}`);

        if (firstFound === 'loginId') {
            // Check if Login ID needs re-entry
            const loginInput = page.locator(loginIdSelector).first();
            const val = await loginInput.inputValue();
            if (!val) {
                console.log('Login ID field is empty. Re-entering...');
                await loginInput.fill(LOGIN_ID);
            } else {
                console.log('Login ID preserved.');
            }

            // Wait for password field if not visible yet
            if (!await page.locator(passwordSelector).isVisible()) {
                await page.waitForSelector(passwordSelector, { timeout: 10000 });
            }
        }

        console.log("Entering Password...");
        await page.locator(passwordSelector).fill(PASSWORD);

        console.log("Clicking Sign In...");
        const signInButton = page.locator('div[data-focusable="true"]').filter({ hasText: 'Sign In' }).first();
        await signInButton.waitFor({ state: 'visible', timeout: 10000 });
        await signInButton.click();

        // --- LOGIN VERIFICATION & TIMEOUT HANDLING ---
        // User requested manual intervention support.
        console.log("Login submitted. Verifying successful login...");

        // We wait for a clear sign of being logged in.
        // If it fails, we pause indefinitely (well, long enough) for manual user action.
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

    } catch (e) {
        console.error("Login failed:", e);
        // We continue anyway because the user might have fixed it or wants to see the failure
    }

    // --- Post-Login Navigation ---
    console.log("Navigating to 'Apply for Fresh Passport'...");

    try {
        // Go directly to Home to ensure clean state
        // Attempting to find the link directly on the Dashboard Home
        const linkSelector = 'a:has-text("Fresh Passport/Re-Issue of Passport")';

        // If we are not on Home, goto Home/Services to find it
        if (!await page.locator(linkSelector).first().isVisible()) {
            console.log("Link not visible, ensuring we are on Services page...");
            await page.goto('https://services2.passportindia.gov.in/forms/Home/Services');
            await page.waitForLoadState('networkidle');
        }

        // Close any advisory modal if it pops up *now*
        const closeButton = page.locator('.close, button[aria-label="Close"], button:has-text("Close"), span:has-text("X")');
        if (await closeButton.count() > 0 && await closeButton.first().isVisible()) {
            await closeButton.first().click();
        }

        console.log("Clicking 'Apply for Fresh Passport/Re-Issue of Passport'...");
        await page.locator(linkSelector).first().click();

        // 2. Handle AutoPopulate (Skip) if it appears
        try {
            // Quick check for Skip button
            const skipButton = page.locator('text=Skip For Now');
            await skipButton.waitFor({ state: 'visible', timeout: 3000 });
            if (await skipButton.isVisible()) {
                await skipButton.click();
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
            }
        } catch (e) { }

        // 4. Passport Type Selection
        console.log("Handling 'Passport Type' form...");
        await page.waitForSelector('text=Fresh Passport', { timeout: 30000 });

        // Radio buttons often don't have standard IDs here, using text approximation
        await page.getByText('Fresh Passport').first().click();
        await page.getByText('Normal', { exact: true }).first().click();
        await page.getByText('36 Pages').first().click();

        console.log("Clicking 'Save and Next'...");
        await page.locator('text=Save and Next').click();

    } catch (e) {
        console.error("Navigation error:", e);
    }

    // --- APPLICANT DETAILS ---
    console.log("Waiting for 'Applicant Details' form...");
    try {
        await page.waitForSelector("text=Applicant Details", { timeout: 30000 });
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

    } catch (e) {
        console.error("Error in Applicant Details:", e);
    }

    // --- FAMILY DETAILS ---
    console.log("Waiting for 'Family Details' form...");
    try {
        await page.waitForSelector("text=Family Details", { timeout: 30000 });

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

    } catch (e) {
        console.error("Error in Family Details:", e);
    }

    // Pause to let user see
    console.log("Script finished family details. Pausing...");
    await page.waitForTimeout(60000);

    await browser.close();
})();
