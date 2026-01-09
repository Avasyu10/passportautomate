const { chromium } = require('playwright');

(async () => {
    // --- CONFIGURATION ---
    // --- CONFIGURATION ---
    const LOGIN_ID = "yash.hooda@unifyapps.com";
    const PASSWORD = "Hooda@3784";

    // Launch the browser
    // headless: false so you can see the automation in action
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // --- LOGIN FLOW ---
    console.log("Starting Login Flow...");
    try {
        const loginUrl = "https://services1.passportindia.gov.in/forms/PreLogin";
        console.log(`Navigating to Login Page: ${loginUrl}...`);
        await page.goto(loginUrl, { timeout: 60000 });

        // Step 1: Login ID
        console.log("Entering Login ID...");
        const loginInput = page.locator('input[data-testid="text-input-outlined"]');
        await loginInput.waitFor({ state: 'visible', timeout: 30000 });
        await loginInput.fill(LOGIN_ID);

        console.log("Clicking Continue...");
        await page.locator('div[data-focusable="true"]').filter({ hasText: 'Continue' }).click();

        // Step 2: Password
        console.log("Waiting for Password Step...");
        const passwordInput = page.locator('input[type="password"]');
        await passwordInput.waitFor({ state: 'visible', timeout: 10000 });

        console.log("Entering Password...");
        await passwordInput.fill(PASSWORD);

        console.log("Clicking Sign In...");
        await page.locator('text=Sign In').last().click();

        console.log("Login submitted. Verifying successful login...");

        // Wait for either the Dashboard (Logout button) OR a Login Failure message/return to login
        // We look for 'Logout' or 'Services' which indicate we are inside.
        try {
            await Promise.race([
                page.waitForSelector('text=Logout', { timeout: 15000 }),
                page.waitForSelector('text=Services', { timeout: 15000 }),
                page.waitForSelector('text=User ID', { timeout: 15000 }) // Back at login?
            ]);
        } catch (e) {
            console.log("Timed out waiting for login transition.");
        }

        // Check where we are
        if (await page.locator('text=Logout').isVisible() || await page.locator('text=Services').first().isVisible()) {
            console.log(">>> LOGIN SUCCESSFUL <<<");
        } else {
            console.error(">>> LOGIN FAILED or CAPTCHA REQUIRED <<<");
            console.log("Taking screenshot of login failure...");
            await page.screenshot({ path: 'login_failure_debug.png' });
            console.log("Calculated failure. PAUSING for 30 seconds to allow manual login...");
            // Allow user to manually fix the login (e.g. enter captcha)
            await page.waitForTimeout(30000);

            // Re-check
            if (await page.locator('text=Logout').isVisible()) {
                console.log("Manual recover successful. Proceeding...");
            } else {
                throw new Error("Could not log in even after pause.");
            }
        }

        await page.waitForLoadState('networkidle');

    } catch (e) {
        console.error("Login failed:", e);
        throw e;
    }

    // --- Post-Login Navigation ---
    console.log("Navigating via Dashboard Links...");

    try {
        // CHECK FOR ADVISORY MODAL
        console.log("Checking for Advisor/Overlay...");
        const closeSelectors = [
            '.close',
            'button[aria-label="Close"]',
            'button:has-text("Close")',
            'span:has-text("X")',
            'div[class*="modal"] button'
        ];

        for (const selector of closeSelectors) {
            if (await page.locator(selector).first().isVisible()) {
                console.log(`Creating/Closing overlay with selector: ${selector}`);
                await page.locator(selector).first().click();
                await page.waitForTimeout(500);
                break;
            }
        }

        // 1. Navigate directly to Services (Bypassing Sidebar click)
        console.log("Navigating directly to Services page to skip sidebar issues...");
        // Using the URL from the user's screenshot directly
        await page.goto('https://services1.passportindia.gov.in/forms/Home/Services');
        await page.waitForLoadState('networkidle');

        // 2. Click 'Apply for Fresh Passport/Re-Issue of Passport'
        console.log("Selecting 'Apply for Fresh Passport'...");

        const applyText = page.getByText('Fresh Passport/Re-Issue of Passport');
        await applyText.first().waitFor({ state: 'visible', timeout: 30000 });
        await applyText.first().click();

        // 3. Handle AutoPopulate (Skip)
        console.log("Checking for AutoPopulate/Skip step...");
        try {
            const skipButton = page.locator('text=Skip For Now');
            await skipButton.waitFor({ state: 'visible', timeout: 5000 });
            if (await skipButton.isVisible()) {
                console.log("Clicking 'Skip For Now'...");
                await skipButton.click();
            }
        } catch (e) {
            console.log("AutoPopulate step skipped (not found).");
        }

        // 3. RPO Selection
        console.log("Waiting for RPO Selection...");
        await page.waitForSelector('select', { timeout: 30000 });

        console.log("Selecting RPO...");
        const rpoSelect = page.locator('select').first();

        // List options to debug if it fails
        // const options = await rpoSelect.innerText();
        // console.log("Available RPOs:", options);

        try {
            await rpoSelect.selectOption({ label: 'Delhi' });
            console.log("Selected 'Delhi'");
        } catch (e) {
            console.log("Could not select 'Delhi', selecting index 1...");
            await rpoSelect.selectOption({ index: 1 });
        }

        console.log("Clicking Next...");
        await page.locator('text=Next').click();

        // 4. Passport Type Selection
        console.log("Waiting for Passport Type Selection...");
        await page.waitForSelector('text=Fresh Passport', { visible: true, timeout: 30000 });

        console.log("Selecting Passport Details...");
        // Use partial text clicks which are robust for radio labels
        await page.getByText('Fresh Passport').first().click();
        await page.getByText('Normal', { exact: true }).first().click(); // 'Normal' might be common, exact ensures we don't hit 'Tatkaal' desc
        await page.getByText('36 Pages').first().click();

        console.log("Clicking 'Save and Next'...");
        await page.locator('text=Save and Next').click();

    } catch (e) {
        console.error("Error during Post-Login Navigation:", e);
        console.log("Taking failure screenshot...");
        await page.screenshot({ path: 'post_login_failure.png' });
        console.log("Screenshot saved to post_login_failure.png");
    }

    // --- Applicant Details ---
    console.log("Waiting for Applicant Details form...");
    try {
        await page.waitForLoadState("networkidle");
        // Verify we are on the form
        await page.waitForSelector('text=Applicant Details', { timeout: 30000 });
    } catch (e) {
        console.log("Wait for Applicant Details failed or timed out.");
    }

    // --- Applicant Details ---

    try {
        // Given Name
        console.log("Filling Given Name...");
        await page.getByLabel("Given Name").fill("Rahul");

        // Surname
        console.log("Filling Surname...");
        await page.getByLabel("Surname").fill("Garg");

        // Gender
        // Assuming labels or values. Using text locator for label as fallback.
        console.log("Selecting Gender...");
        // Strategy: Look for the label text "Gender" and finding 'Male' near it, or just generic 'Male' label if unique enough
        const maleRadio = page.getByLabel("Male", { exact: true });
        if (await maleRadio.isVisible()) {
            await maleRadio.check();
        } else {
            // Fallback: try to find by value or ID if we could guess, but let's try a visual layout relative locator
            // If standard labels don't work, might need to click the label element itself
            await page.locator('label:has-text("Male")').click();
        }

        // Have you ever been known by other names (aliases)?
        console.log("Answering Aliases question...");
        await page.locator("tr", { hasText: "Have you ever been known by other names" }).getByLabel("No").check();

        // Have you ever changed your name?
        console.log("Answering Name Change question...");
        await page.locator("tr", { hasText: "Have you ever changed your name" }).getByLabel("No").check();

        // Date of Birth (DD/MM/YYYY)
        console.log("Filling Date of Birth...");
        await page.getByLabel("Date of Birth").click();
        await page.getByLabel("Date of Birth").fill("01/01/1990");
        await page.getByLabel("Date of Birth").press("Tab");

        // Place of Birth (Village/Town/City)
        console.log("Filling Place of Birth...");
        await page.getByLabel("Place of Birth").first().fill("New Delhi"); // .first() in case of duplicates

        // Is your Place of Birth out of India?
        console.log("Answering Place of Birth out of India...");
        await page.locator("tr", { hasText: "Is your Place of Birth out of India" }).getByLabel("No").check();

        // Marital Status
        console.log("Selecting Marital Status...");
        await page.getByLabel("Marital Status").selectOption({ label: "Single" });

        // Citizenship of India by
        console.log("Selecting Citizenship...");
        await page.getByLabel("Citizenship of India by").selectOption({ label: "Birth" });

        // PAN (if available)
        console.log("Filling PAN...");
        await page.getByLabel("PAN").fill("ABCDE1234F");

        // Voter Id (if available)
        console.log("Filling Voter Id...");
        await page.getByLabel("Voter Id").fill("XYZ1234567");

        // Employment Type
        console.log("Selecting Employment Type...");
        await page.getByLabel("Employment Type").selectOption({ label: "Private" });

        // Is either of your parent... government servant?
        console.log("Answering Parent Government Servant...");
        // Note: The text might be slightly different or split, using a substring
        await page.locator("tr", { hasText: "government servant" }).getByLabel("No").check();

        // Educational Qualification
        console.log("Selecting Educational Qualification...");
        await page.getByLabel("Educational Qualification").selectOption({ label: "Graduate" });

        // Is applicant eligible for Non-ECR category?
        console.log("Answering Non-ECR...");
        await page.locator("tr", { hasText: "Is applicant eligible for Non-ECR" }).getByLabel("Yes").check();

        // Visible distinguishing mark
        console.log("Filling Visible distinguishing mark...");
        await page.getByLabel("Visible distinguishing mark").fill("None");

        // Aadhaar Number
        console.log("Filling Aadhaar Number...");
        await page.getByLabel("Aadhaar Number").fill("123456789012");

        // Consent Agreement
        console.log("Checking Consent Agreement...");
        // "I Agree" might be in a label or associated with "Yes"
        // Finding the section with the long consent text
        const consentSection = page.locator("div, td", { hasText: "I, the holder of above mentioned Aadhaar Number" }).first();
        // Assuming there is a "Yes" radio or check button inside/near it
        // Or sometimes it's just "I Agree" -> Yes
        if (await consentSection.isVisible()) {
            await consentSection.getByLabel("Yes").check();
        } else {
            // Fallback: look for generic "I Agree" section options
            await page.locator('label:has-text("Yes")').last().check();
        }

        console.log("Forms filled. Keeping browser open for 10 seconds...");
        await page.waitForTimeout(10000);

        // Uncomment to click save
        console.log("Saving Applicant Details and moving to Family Details...");
        await page.getByRole("button", { name: "Save and Next" }).click();

        // --- Family Details ---
        console.log("Waiting for Family Details page...");
        // Wait for the URL to change or a specific element on the new page
        try {
            await page.waitForURL(/.*FamilyDetails.*/, { timeout: 30000 });
        } catch (e) {
            console.log("URL didn't change as expected or timed out, checking for 'Family Details' text presence...");
        }

        // Ensure we are on the right page
        await page.waitForSelector("text=Family Details", { timeout: 10000 });

        console.log("Filling Father's/Legal Guardian's Details...");
        // Father's Given Name
        await page.getByLabel("Father's/Legal Guardian's Given Name").fill("FatherName");
        // Father's Surname (Using nth(0) assuming it's the first Surname field on this page)
        // Alternatively, locate by visual proximity if structure allows
        await page.getByLabel("Surname").nth(0).fill("FatherSurname");

        console.log("Filling Mother's Details...");
        // Mother's Given Name
        await page.getByLabel("Mother's Given Name").fill("MotherName");
        // Mother's Surname (Using nth(1))
        await page.getByLabel("Surname").nth(1).fill("MotherSurname");

        console.log("Filling Legal Guardian's Details (if applicable)...");
        // Legal Guardian's Given Name
        await page.getByLabel("Legal Guardian's Given Name").fill(""); // Leaving empty or "GuardianName"
        // Legal Guardian's Surname (Using nth(2))
        await page.getByLabel("Surname").nth(2).fill("");

        console.log("Family Details filled. Keeping browser open for 10 seconds...");
        await page.waitForTimeout(10000);

        // Uncomment to click save for this page too
        console.log("Saving Family Details and moving to Address Details...");
        await page.getByRole("button", { name: "Save and Next" }).click();

        // --- Address Details ---
        console.log("Waiting for Address Details page...");
        // Wait for the URL to change or a specific element on the new page
        try {
            await page.waitForURL(/.*AddressDetails.*/, { timeout: 30000 });
        } catch (e) {
            console.log("URL didn't change as expected or timed out, checking for 'Address Details' text presence...");
        }

        // Ensure we are on the right page
        await page.waitForSelector("text=Address Details", { timeout: 10000 });

        console.log("Filling Address Details...");

        // Is your present address out of India?
        // Assuming "No" for typical application, modify logic if "Yes" needed
        await page.locator("tr", { hasText: "Is your present address out of India" }).getByLabel("No").check();

        // House No. and Street Name
        await page.getByLabel("House No. and Street Name").fill("123, Some Street");

        // Village/Town/City
        await page.getByLabel("Village/Town/City").fill("Some City");

        // PIN Code
        await page.getByLabel("PIN Code").fill("110001");

        // Mobile Number (Without Country Code)
        await page.getByLabel("Mobile Number").fill("9999999999");
        // Sometimes it's labelled slightly vaguely, let's try visual if generic text
        // await page.getByRole('textbox', { name: "Mobile Number" }).fill("9876543210");

        // Telephone Number
        await page.getByLabel("Telephone Number").fill("0112345678");

        // E-mail Id
        await page.getByLabel("E-mail Id").fill("example@email.com");

        // Is permanent address available?
        // Let's say "Yes"
        await page.locator("tr", { hasText: "Is Permanent Address available" }).getByLabel("Yes").check();

        // If Yes, it might ask "Is your permanent address same as present address?"
        // We'll wait a brief moment for that to appear if it's dynamic
        // await page.waitForTimeout(1000); // optional pause
        // Checking "Yes" for same address to avoid filling it again
        const sameAddressQuestion = page.locator("tr", { hasText: "Is your permanent address same as present address" });
        if (await sameAddressQuestion.isVisible()) {
            await sameAddressQuestion.getByLabel("Yes").check();
        }

        console.log("Address Details filled. Keeping browser open for 10 seconds...");
        await page.waitForTimeout(10000);

        // Uncomment to click save for this page too
        console.log("Saving Address Details and moving to Emergency Contact...");
        await page.getByRole("button", { name: "Save and Next" }).click();

        // --- Emergency Contact ---
        console.log("Waiting for Emergency Contact page...");
        try {
            await page.waitForURL(/.*EmergencyContact.*/, { timeout: 30000 });
        } catch (e) {
            console.log("URL didn't change as expected or timed out, checking for 'Emergency Contact' text presence...");
        }

        // Ensure we are on the right page
        // "Emergency Contact" usually appears in the header or step indicator
        await page.waitForSelector("text=Emergency Contact", { timeout: 10000 });

        console.log("Filling Emergency Contact Details...");

        // Name and Address
        await page.getByLabel("Name and Address").fill("Emergency Person Name, 456 Another St, City");

        // Mobile Number (Without Country Code)
        await page.getByLabel("Mobile Number").first().fill("9876543210");
        // using .first() because sometimes "Mobile Number" might match the previous step header or similar if visible, 
        // though on a clean page it should be unique.

        // Telephone Number
        await page.getByLabel("Telephone Number").fill("0118765432");

        // E-mail Id
        await page.getByLabel("E-mail Id").fill("emergency@email.com");

        console.log("Emergency Contact filled. Keeping browser open for 10 seconds...");
        await page.waitForTimeout(10000);

        // Uncomment to click save
        // await page.getByRole("button", { name: "Save and Next" }).click();

    } catch (error) {
        console.error("An error occurred during the script execution:", error);
    } finally {
        await browser.close();
    }
})();
