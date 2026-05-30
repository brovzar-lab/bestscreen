/**
 * Capture current app state screenshots for design audit.
 * Captures: dashboard, editor (light), editor (dark), sidebar, menubar
 */
import { chromium } from 'playwright';
const BASE = 'http://localhost:5174';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const outDir = '/Users/quantumcode/.gemini/antigravity/brain/c34760ed-9c1c-410f-93bc-8aeffee6bc50';

  try {
    // 1. Dashboard view
    await page.goto(BASE);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${outDir}/audit_dashboard.png`, fullPage: false });
    console.log('📸 Dashboard captured');

    // 2. Create/open a project and load sample content
    const sampleFountain = `Title: Design Audit Sample
Credit: Written by
Author: Test Author

INT. DETECTIVE'S OFFICE - NIGHT

A single desk lamp casts harsh shadows across stacks of files. Rain streaks down the window.

DETECTIVE MORA (45), weathered face, sits behind the desk. She hasn't slept in days.

DETECTIVE MORA
(to herself)
Three witnesses. Three different stories.

She opens a file folder. Crime scene photos spill across the desk.

DETECTIVE MORA (CONT'D)
But the evidence doesn't lie.

EXT. CRIME SCENE - ALLEY - NIGHT (FLASHBACK)

Yellow tape. Flashing red and blue lights. A body under a white sheet.

FORENSICS TECH
Time of death, approximately midnight. No signs of struggle.

DETECTIVE MORA
That's what worries me.

CUT TO:

INT. INTERROGATION ROOM - DAY

Bare walls. A metal table. Two chairs.

SUSPECT (30s), nervous, fidgets with a coffee cup.

DETECTIVE MORA
Let's start from the beginning. Where were you Tuesday night?

SUSPECT
(avoiding eye contact)
I was at home. Alone.

DETECTIVE MORA
Funny. Your neighbor says otherwise.

The suspect's hand trembles. Coffee spills.

FADE OUT.
`;

    await page.evaluate((fountain) => {
      if (typeof loadFountain === 'function') loadFountain(fountain);
    }, sampleFountain);
    await page.waitForTimeout(1500);

    // 3. Editor view - light theme
    await page.screenshot({ path: `${outDir}/audit_editor_light.png`, fullPage: false });
    console.log('📸 Editor (light) captured');

    // 4. Switch to dark theme
    await page.evaluate(() => {
      document.body.dataset.theme = 'midnight';
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/audit_editor_dark.png`, fullPage: false });
    console.log('📸 Editor (dark) captured');

    // 5. Enable page view
    await page.evaluate(() => {
      if (typeof togglePageView === 'function') togglePageView(true);
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/audit_pageview_dark.png`, fullPage: false });
    console.log('📸 Page view (dark) captured');

    // 6. Switch back to light for page view
    await page.evaluate(() => {
      document.body.dataset.theme = 'court';
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/audit_pageview_light.png`, fullPage: false });
    console.log('📸 Page view (light) captured');

    console.log('\n✅ All audit screenshots captured');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

main();
