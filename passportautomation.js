const { chromium } = require('playwright');

(async () => {
    // --- CONFIGURATION ---
    const LOGIN_ID = "yash.hooda@unifyapps.com";
    const PASSWORD = "Hooda@3784";

    // --- APPLICATION DATA ---
    const APPLICATION_DATA = {
        // Step 1: Passport Type
        isTatkal: false,              // false = Normal, true = Tatkal
        bookletLength: "36",          // "36" or "60"

        // Step 2: Applicant Details
        name: "Rahul",
        surname: "Garg",
        gender: "Male",               // "Male" or "Female"
        dob: "01/01/1990",           // DD/MM/YYYY
        placeOfBirth: "New Delhi",
        maritalStatus: "Single",      // "Single", "Married", etc.
        state: "Delhi",
        district: "Central Delhi",
        pan: "ABCDE1234F",
        voterId: "XYZ1234567",
        employmentType: "Private",
        is_parent_govt_servant: false,
        education: "Graduate",
        is_non_ecr: true,
        visible_distinguishing_mark: "None",
        aadhar_number: "123456789012",

        // Step 3: Family Details
        fathers_name: "FatherName",
        fathers_surname: "FatherSurname",
        mother_name: "MotherName",
        mother_surname: "MotherSurname",

        // Step 4: Address Details - Present
        house_no_street_name: "123 Main Street",
        village_town_city: "New Delhi",
        pincode: "110001",
        address_state: "Delhi",
        address_district: "Central Delhi",
        address_police_station: "Connaught Place",
        mobile_no: "9876543210",
        email: "rahul.garg@example.com",

        // Step 4: Address Details - Permanent (same as present)
        perm_house_no_street_name: "123 Main Street",
        perm_village_town_city: "New Delhi",
        perm_pincode: "110001",
        perm_address_state: "Delhi",
        perm_address_district: "Central Delhi",
        perm_address_police_station: "Connaught Place",

        // Step 5: Emergency Contact
        emergency_name_address: "Emergency Contact Name, Address",
        emergency_mobile_number: "9876543211",
        emergency_email: "emergency@example.com",

        // Final Step Details
        proof_of_birth: "Aadhaar Card/E-Aadhaar", // Typical option
        proof_of_address: "Aadhaar Card/E-Aadhaar", // Typical option
        application_place: "NEW DELHI"
    };

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
        await page.waitForTimeout(1500); // Allow form to render

        // Select Fresh Passport (assuming fresh passport for now)
        console.log("Selecting 'Fresh Passport'...");
        await page.getByText('Fresh Passport').first().click();

        // Select Normal or Tatkal based on configuration
        const applicationType = APPLICATION_DATA.isTatkal ? 'Tatkal' : 'Normal';
        console.log(`Selecting application type: ${applicationType}...`);
        await page.getByText(applicationType, { exact: true }).first().click();

        // Select booklet length
        const bookletText = APPLICATION_DATA.bookletLength === "60" ? '60 Pages' : '36 Pages';
        console.log(`Selecting booklet: ${bookletText}...`);
        await page.getByText(bookletText).first().click();

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
        await page.getByLabel("Given Name").first().fill(APPLICATION_DATA.name);
        await page.getByLabel("Surname").first().fill(APPLICATION_DATA.surname);

        // 2. Gender
        console.log(`Selecting Gender (${APPLICATION_DATA.gender})...`);
        await page.locator(`label:has-text("${APPLICATION_DATA.gender}")`).first().click();

        // 3. Have you ever been known by other names (aliases)? -> No
        console.log("Aliases -> No");
        await page.locator('tr:has-text("known by other names")').locator('label:has-text("No")').click();

        // 4. Have you ever changed your name? -> No
        console.log("Name Change -> No");
        await page.locator('tr:has-text("changed your name")').locator('label:has-text("No")').click();

        // 5. Date of Birth
        console.log("Filling DOB...");
        try {
            await page.getByLabel("Date of Birth").fill(APPLICATION_DATA.dob);
        } catch (e) {
            await page.getByLabel("Date of Birth").click();
            await page.keyboard.type(APPLICATION_DATA.dob);
        }
        await page.keyboard.press("Tab");

        // 6. Place of Birth
        console.log("Filling Place of Birth...");
        await page.getByLabel("Place of Birth").first().fill(APPLICATION_DATA.placeOfBirth);

        // 7. Is Place of Birth out of India? -> No
        console.log("Place of Birth out of India -> No");
        await page.locator('tr:has-text("Place of Birth out of India")').locator('label:has-text("No")').click();

        // 8. Marital Status
        console.log(`Selecting Marital Status -> ${APPLICATION_DATA.maritalStatus}`);
        await page.getByLabel("Marital Status").selectOption({ label: APPLICATION_DATA.maritalStatus });

        // 9. Citizenship of India by -> Birth
        console.log("Selecting Citizenship -> Birth");
        await page.getByLabel("Citizenship of India by").selectOption({ label: "Birth" });

        // 10. PAN & Voter ID
        console.log("Filling PAN/Voter Optional...");
        await page.getByLabel("PAN").fill(APPLICATION_DATA.pan);
        await page.getByLabel("Voter Id").fill(APPLICATION_DATA.voterId);

        // 11. Employment Type
        console.log(`Employment Type -> ${APPLICATION_DATA.employmentType}`);
        await page.getByLabel("Employment Type").selectOption({ label: APPLICATION_DATA.employmentType });

        // 12. Parent/Spouse Gov Servant?
        const govServantAnswer = APPLICATION_DATA.is_parent_govt_servant ? 'Yes' : 'No';
        console.log(`Gov Servant -> ${govServantAnswer}`);
        await page.locator('tr:has-text("government servant")').locator(`label:has-text("${govServantAnswer}")`).click();

        // 13. Educational Qualification -> Graduate
        console.log("Education -> Graduate");
        await page.getByLabel("Educational Qualification").selectOption({ label: "Graduate" });

        // 14. Non-ECR
        const nonEcrAnswer = APPLICATION_DATA.is_non_ecr ? 'Yes' : 'No';
        console.log(`Non-ECR -> ${nonEcrAnswer}`);
        await page.locator('tr:has-text("Non-ECR")').locator(`label:has-text("${nonEcrAnswer}")`).click();

        // 15. Visible Distinguishing Mark
        console.log(`Visible Mark -> ${APPLICATION_DATA.visible_distinguishing_mark}`);
        await page.getByLabel("Visible distinguishing mark").fill(APPLICATION_DATA.visible_distinguishing_mark);

        // 16. Aadhaar Number
        console.log(`Aadhaar -> ${APPLICATION_DATA.aadhar_number}`);
        await page.getByLabel("Aadhaar Number").fill(APPLICATION_DATA.aadhar_number);

        // 17. Aadhaar Consent -> Yes
        console.log("Aadhaar Consent -> Yes");
        // The consent text: "I, the holder of above mentioned Aadhaar Number, hereby give my consent..."
        // Look for "I Agree" section and click Yes
        try {
            // Find the consent section by looking for the text containing "I Agree"
            const consentSection = page.locator('text=I Agree').first();
            await consentSection.waitFor({ state: 'visible', timeout: 5000 });

            // Click the Yes radio button in the consent section
            // It's typically the last Yes/No pair on the page
            await page.locator('label:has-text("Yes")').last().click();
            console.log("Aadhaar consent given successfully");
        } catch (e) {
            console.log("Consent section not found or different format, trying alternative...");
            // Fallback: just click the last Yes button
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
        await page.getByLabel("Father's/Legal Guardian's Given Name").fill(APPLICATION_DATA.fathers_name);
        await page.getByLabel("Surname").nth(0).fill(APPLICATION_DATA.fathers_surname);

        // 2. Mother's Name
        console.log("Filling Mother details...");
        await page.getByLabel("Mother's Given Name").fill(APPLICATION_DATA.mother_name);
        await page.getByLabel("Surname").nth(1).fill(APPLICATION_DATA.mother_surname);

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

    // --- ADDRESS DETAILS ---
    console.log("Waiting for 'Address Details' form...");
    try {
        await page.waitForSelector("text=Address Details", { timeout: 30000 });
        await page.waitForTimeout(1500); // Allow form to fully load
        console.log("In 'Address Details' form.");

        // New field from screenshot: "Is your present address out of India?"
        console.log("Setting 'Present address out of India' -> No");
        try {
            await page.locator('label:has-text("No")').first().click();
        } catch (e) {
            console.log("Address out of India question not found");
        }

        // Present Address
        console.log("Filling Present Address...");
        await page.getByLabel("House No. and Street Name").first().fill(APPLICATION_DATA.house_no_street_name);
        await page.getByLabel("Village/Town/City").first().fill(APPLICATION_DATA.village_town_city);

        // PIN Code - might trigger auto-fill of state/district
        await page.getByLabel("PIN Code").first().fill(APPLICATION_DATA.pincode);
        await page.waitForTimeout(1000); // Wait for auto-fill

        // State and District (might be auto-filled)
        try {
            await page.getByLabel("State/UT").first().selectOption({ label: APPLICATION_DATA.address_state });
        } catch (e) {
            console.log("State might be auto-filled");
        }

        try {
            await page.getByLabel("District").first().selectOption({ label: APPLICATION_DATA.address_district });
        } catch (e) {
            console.log("District might be auto-filled");
        }

        await page.getByLabel("Police Station").first().selectOption({ label: APPLICATION_DATA.address_police_station });

        // Contact details
        console.log("Filling Contact Details...");
        await page.getByLabel("Mobile Number (Without Country Code)").first().fill(APPLICATION_DATA.mobile_no);
        await page.getByLabel("E-mail Id").first().fill(APPLICATION_DATA.email);

        // Check if permanent address is same as present
        const isSameAddress = (
            APPLICATION_DATA.perm_house_no_street_name === APPLICATION_DATA.house_no_street_name &&
            APPLICATION_DATA.perm_pincode === APPLICATION_DATA.pincode
        );

        if (isSameAddress) {
            console.log("Permanent address same as present - checking checkbox...");
            // Look for "Is your present address same as permanent address?" checkbox
            try {
                await page.locator('input[type="checkbox"]').filter({ hasText: /same.*permanent/i }).check();
            } catch (e) {
                console.log("Checkbox not found or different selector needed");
            }
        } else {
            console.log("Filling Permanent Address...");
            await page.getByLabel("House No. and Street Name").nth(1).fill(APPLICATION_DATA.perm_house_no_street_name);
            await page.getByLabel("Village/Town/City").nth(1).fill(APPLICATION_DATA.perm_village_town_city);
            await page.getByLabel("PIN Code").nth(1).fill(APPLICATION_DATA.perm_pincode);
            await page.waitForTimeout(1000);

            try {
                await page.getByLabel("State/UT").nth(1).selectOption({ label: APPLICATION_DATA.perm_address_state });
                await page.getByLabel("District").nth(1).selectOption({ label: APPLICATION_DATA.perm_address_district });
            } catch (e) {
                console.log("Permanent address state/district might be auto-filled");
            }

            await page.getByLabel("Police Station").nth(1).selectOption({ label: APPLICATION_DATA.perm_address_police_station });
        }

        console.log("Saving 'Address Details'...");
        await page.locator('text=Save and Next').click();

        // Handle potential confirmation popup ("OK" button)
        try {
            console.log("Waiting for Address confirmation popup...");
            const okButton = page.locator('button:has-text("OK"), input[type="button"][value="OK"]').first();
            await okButton.waitFor({ state: 'visible', timeout: 5000 });
            await okButton.click();
            console.log("Clicked 'OK' on Address confirmation popup");
        } catch (e) {
            console.log("No Address confirmation popup appeared or it was dismissed automatically");
        }

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Visualization delay

    } catch (e) {
        console.error("Error in Address Details:", e);
    }

    // --- EMERGENCY CONTACT ---
    console.log("Waiting for 'Emergency Contact' form...");
    try {
        await page.waitForSelector("text=Emergency Contact", { timeout: 30000 });
        await page.waitForTimeout(1500); // Allow form to fully load
        console.log("In 'Emergency Contact' form.");

        await page.getByLabel("Name and Address").fill(APPLICATION_DATA.emergency_name_address);
        await page.getByLabel("Mobile Number (Without Country Code)").last().fill(APPLICATION_DATA.emergency_mobile_number);
        await page.getByLabel("E-mail Id").last().fill(APPLICATION_DATA.emergency_email);

        console.log("Saving 'Emergency Contact'...");
        await page.locator('text=Save and Next').click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Visualization delay

    } catch (e) {
        console.error("Error in Emergency Contact:", e);
    }

    // --- PREVIOUS PASSPORT (Step 6) ---
    console.log("Waiting for 'Previous Passport' form...");
    try {
        await page.waitForSelector("text=Previous Passport", { timeout: 30000 });
        await page.waitForTimeout(1500);
        console.log("In 'Previous Passport' form.");

        // For fresh passport, user requested hardcoding all to 'No'
        console.log("Hardcoding 'No' equivalents for previous passport questions...");
        try {
            // Q1 and Q3 use "No"
            const noRadios = await page.locator('label:has-text("No")').all();
            for (const radio of noRadios) {
                await radio.click();
                await page.waitForTimeout(300);
            }

            // Q2 uses specific text: "Details Not Available / Never Held Diplomatic/Official Passport"
            const diploNo = page.locator('label:has-text("Details Not Available")').first();
            if (await diploNo.isVisible()) {
                await diploNo.click();
                console.log("Selected: Details Not Available for Diplomatic Passport");
            }
        } catch (e) {
            console.log("Error clicking radios in previous passport section");
        }

        console.log("Saving 'Previous Passport'...");
        await page.locator('text=Save and Next').click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

    } catch (e) {
        console.error("Error in Previous Passport:", e);
        // Continue anyway - might not be required for fresh passport
    }

    // --- OTHER DETAILS (Step 7) ---
    console.log("Waiting for 'Other Details' form...");
    try {
        await page.waitForSelector("text=Other Details", { timeout: 30000 });
        await page.waitForTimeout(1500);
        console.log("In 'Other Details' form.");

        // User requested hardcoding all to 'No'
        console.log("Hardcoding all 'No' for Other Details questions...");

        try {
            const noButtons = await page.locator('label:has-text("No")').all();
            console.log(`Found ${noButtons.length} 'No' options`);

            for (let i = 0; i < noButtons.length; i++) {
                try {
                    await noButtons[i].click();
                    await page.waitForTimeout(300);
                } catch (e) {
                    console.log(`Could not click 'No' button ${i}`);
                }
            }
        } catch (e) {
            console.log("Error handling Other Details radios");
        }

        console.log("Saving 'Other Details'...");
        await page.locator('text=Save and Next').click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

    } catch (e) {
        console.error("Error in Other Details:", e);
    }

    // --- PASSPORT PREVIEW (Step 8) ---
    console.log("Waiting for 'Preview' page...");
    try {
        await page.waitForSelector("text=Preview", { timeout: 30000 });
        await page.waitForTimeout(2000);
        console.log("On Preview page.");

        // Check the consent checkbox on preview page (Image 0)
        console.log("Checking confirmation checkbox...");
        try {
            await page.locator('input[type="checkbox"]').check();
        } catch (e) {
            console.log("Could not find preview agreement checkbox");
        }

        // Take screenshot of preview
        await page.screenshot({ path: 'application_preview.png', fullPage: true });
        console.log("Screenshot saved: application_preview.png");

        console.log("Saving 'Preview'...");
        await page.locator('text=Save and Next').click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

    } catch (e) {
        console.error("Error in Preview:", e);
    }

    // --- DETAILS VERIFICATION (Step 9) ---
    console.log("Waiting for 'Details Verification' form...");
    try {
        await page.waitForSelector("text=Details Verification", { timeout: 30000 });
        await page.waitForTimeout(1500);
        console.log("In 'Details Verification' form.");

        // 1. Proof of Birth
        console.log(`Selecting Proof of Birth: ${APPLICATION_DATA.proof_of_birth}`);
        await page.getByLabel("Proof of Birth").selectOption({ label: APPLICATION_DATA.proof_of_birth });

        // 2. Proof of Residential Address
        console.log(`Selecting Proof of Address: ${APPLICATION_DATA.proof_of_address}`);
        await page.getByLabel("Proof of Present Residential Address").selectOption({ label: APPLICATION_DATA.proof_of_address });

        // 3. Declaration I Agree
        console.log("Checking Declaration agreement...");
        await page.locator('label:has-text("I Agree")').click();

        // 4. Place
        console.log(`Filling Place: ${APPLICATION_DATA.application_place}`);
        await page.getByLabel("Place").fill(APPLICATION_DATA.application_place);

        // Take final screenshot before submission
        await page.screenshot({ path: 'final_verification_page.png', fullPage: true });

        console.log("Clicking 'Submit'...");
        await page.locator('text=Submit').click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(5000);

    } catch (e) {
        console.error("Error in Details Verification:", e);
    }

    // --- EXTRACT APPLICATION REFERENCE NUMBER ---
    console.log("Looking for Application Reference Number...");
    try {
        await page.waitForTimeout(3000);

        // Take screenshot of final page
        await page.screenshot({ path: 'application_submitted.png', fullPage: true });
        console.log("Screenshot saved: application_submitted.png");

        // Try to find application reference number
        // Common patterns: "Application Reference Number", "ARN", "Reference Number"
        const pageContent = await page.content();

        // Try multiple patterns
        const patterns = [
            /Application Reference Number[:\s]+([A-Z0-9]+)/i,
            /Reference Number[:\s]+([A-Z0-9]+)/i,
            /ARN[:\s]+([A-Z0-9]+)/i,
            /Application ID[:\s]+([A-Z0-9]+)/i,
            /Application No[.:\s]+([A-Z0-9]+)/i
        ];

        let applicationNumber = null;
        for (const pattern of patterns) {
            const match = pageContent.match(pattern);
            if (match && match[1]) {
                applicationNumber = match[1];
                console.log(`Found Application Number: ${applicationNumber}`);
                break;
            }
        }

        if (!applicationNumber) {
            // Try to find it in visible text
            const allText = await page.locator('body').textContent();
            console.log("Could not find application number with patterns. Checking page text...");

            // Look for any alphanumeric string that looks like a reference number
            const possibleRef = allText.match(/[A-Z]{2,}\d{10,}/);
            if (possibleRef) {
                applicationNumber = possibleRef[0];
                console.log(`Possible Application Number: ${applicationNumber}`);
            }
        }

        // Save to file
        if (applicationNumber) {
            const fs = require('fs');
            const result = {
                applicationNumber: applicationNumber,
                timestamp: new Date().toISOString(),
                applicantName: `${APPLICATION_DATA.name} ${APPLICATION_DATA.surname}`,
                email: APPLICATION_DATA.email
            };

            fs.writeFileSync('application_result.json', JSON.stringify(result, null, 2));
            console.log("\n" + "=".repeat(60));
            console.log("APPLICATION SUBMITTED SUCCESSFULLY!");
            console.log("=".repeat(60));
            console.log(`Application Reference Number: ${applicationNumber}`);
            console.log(`Saved to: application_result.json`);
            console.log("=".repeat(60) + "\n");
        } else {
            console.log("WARNING: Could not extract application reference number automatically.");
            console.log("Please check the screenshots: application_submitted.png");
        }

    } catch (e) {
        console.error("Error extracting application number:", e);
    }

    // Final pause to review
    console.log("Application process completed. Pausing for review...");
    await page.waitForTimeout(30000);

    await browser.close();
})();
