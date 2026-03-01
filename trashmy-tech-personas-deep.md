# trashmy.tech -- The 20 Personas
## Deep Profiles, Stories, and Use Cases

Each persona exists for a reason. They're not random configurations of viewport sizes and click delays. They represent real categories of people who use the internet every day and get failed by it. The report should make the reader feel something when they read about these people getting stuck.

---

## ACCESSIBILITY PERSONAS

### A1 -- Margaret Huang, 68
**Retired middle school English teacher. Tucson, Arizona.**

Margaret taught 7th grade English for 34 years before retiring in 2022. She has age-related macular degeneration, diagnosed four years ago, which has progressively eaten away at her central vision. She can still see -- peripheral vision is fine -- but anything directly in front of her is blurry, like looking through frosted glass. She uses browser zoom at 200% on her 27-inch iMac, and she's trained herself to move her eyes slightly off-center to read text.

She's not tech-illiterate. She ran a classroom blog for years. She orders groceries online, video-calls her grandchildren, files her taxes on TurboTax. But every year the internet gets a little harder. Buttons keep getting smaller. Text keeps getting lighter. Gray on white. She's watched the web slowly become a place that isn't designed for her anymore, and she's too proud to ask her daughter for help navigating a website.

When Margaret hits a wall on a site, she doesn't rage. She doesn't complain. She closes the tab and assumes the problem is her. "I'm just not good with technology anymore." That's the tragedy of bad accessibility -- it doesn't make people angry, it makes them blame themselves.

**What she tests:**
- Text readability at 200% zoom (does layout break? does text overlap?)
- Font sizes (anything under 14px is effectively invisible to her)
- Color contrast (light gray on white is her nemesis)
- Click target sizes (she needs big, obvious buttons)
- CTA discoverability (can she find the primary action within 30 seconds?)
- Whether the site provides enough visual hierarchy to guide a slow, careful reader

**Use case for the report:**
When Margaret fails on a site, the report should read like a case study about how accessible design failures silently exclude an entire generation. She represents the 12.6 million Americans over 40 with some form of vision impairment. She's not an edge case -- she's your grandmother, your neighbor, your retired teacher.

**OpenMoji:** `1F475` (old woman)
**Viewport:** 1920x1080 at 200% zoom (effective 960x540)
**Click delay:** 2000ms
**Misclick rate:** 0.12
**Patience:** 120s
**Reads everything:** true
**Skips text:** false

---

### A2 -- James Okafor, 74
**Retired postal worker. Detroit, Michigan.**

James delivered mail for the USPS for 38 years, walking 12 miles a day in every weather Detroit could throw at him. He retired at 70. Six months later, he had a stroke. He recovered most of his speech and cognition, but the fine motor control in his right hand never fully came back. His fingers tremble. He can hold a coffee mug, but he can't reliably control a mouse pointer.

His occupational therapist taught him to navigate his computer with the keyboard. Tab, Enter, Space, Arrow keys. It took him three months to get comfortable with it, and now he's genuinely fast -- he can fill out a form with keyboard navigation faster than most people can with a mouse. But only if the site supports it.

The sites that break him are the ones where Tab doesn't go where you expect it to. Where focus jumps from the navigation menu back to the address bar instead of continuing to the page content. Where you can't tell which element has focus because the developers removed the outline ("it looked ugly"). James has a phrase for these sites: "the door is locked and there's no handle."

He lives alone. His daughter is in Chicago. Most of his daily tasks -- banking, prescriptions, groceries -- happen online. Every site that breaks keyboard navigation is a site that requires him to call someone for help, and every time he has to call his daughter to do something for him on a computer, he loses a small piece of his independence.

**What he tests:**
- Complete keyboard navigability (can every interactive element be reached via Tab?)
- Focus order (does Tab proceed logically through the page?)
- Focus visibility (can you see where focus is at all times?)
- Focus traps (does focus get stuck in a loop?)
- Skip-navigation links (can keyboard users bypass the header?)
- Form completion via keyboard only (Tab between fields, Enter to submit)
- Modal/overlay dismissal via Escape key

**Use case for the report:**
James represents the 2.5 million Americans who cannot use a mouse. When a site traps his focus in the header navigation and he can never reach the signup form, the report should frame this as a locked door -- the functionality exists, but he physically cannot access it. This is the digital equivalent of a building with no wheelchair ramp.

**OpenMoji:** `2328` (keyboard)
**Viewport:** 1440x900
**Click delay:** N/A (keyboard only)
**Keyboard only:** true
**Patience:** 90s

---

### A3 -- Priya Sharma, 31
**UX researcher at a fintech startup. Bangalore, India.**

Priya was born blind. Not partially sighted, not low vision -- completely blind since birth. She has never seen a website. She experiences the internet through NVDA, a screen reader that speaks the page content aloud and lets her navigate by headings, landmarks, and form labels.

She has a master's degree in Human-Computer Interaction from IIT Bombay. She works full-time as a UX researcher, which is ironic -- she spends her career evaluating how well interfaces work, and most of them are broken for her. She's methodical about it. She doesn't get frustrated anymore. She just documents the failures.

The things that break the internet for Priya are invisible to sighted users. An image with no alt text is simply a gap in reality -- she doesn't know it exists. A button that says "Click Here" is meaningless without context. A form input with no label is a blank void she has to guess the purpose of. A heading hierarchy that skips from h1 to h4 is like a book with missing chapter titles.

She navigates by headings first to understand the page structure, then by landmarks (banner, navigation, main content, footer), then by individual elements. A well-structured page takes her 30 seconds to understand. A badly structured page can take her 5 minutes of trial-and-error, or she gives up entirely.

**What she tests:**
- All images: does every `<img>` have meaningful alt text? (not just `alt=""`)
- All form inputs: does every `<input>` have an associated `<label>` or `aria-label`?
- Heading hierarchy: h1 followed by h2 followed by h3, no skipping levels
- ARIA landmarks: are there `<nav>`, `<main>`, `<header>`, `<footer>` elements or roles?
- All buttons: do they have accessible names? (not empty, not just an icon)
- All links: do they have descriptive text? (flag "click here", "read more", "learn more")
- Skip-navigation link: is there a way to skip to main content?
- Dynamic content: are ARIA live regions used for updates?

**Use case for the report:**
Priya doesn't navigate the site visually. She audits the DOM. Her section of the report is a structured accessibility checklist, not a narrative about clicking things. When the report says "Priya found 47 accessibility violations," it carries weight because she represents someone who depends on these standards daily, not just someone running an automated scanner.

**OpenMoji:** `1F9D1-200D-1F9AF` (person with white cane)
**Viewport:** 1440x900 (irrelevant to her, but triggers layout)
**Keyboard only:** true
**Reads everything:** true (via screen reader)

---

### A4 -- Carlos Mendez, 45
**Senior accountant at a mid-size construction firm. Mexico City.**

Carlos was diagnosed with deuteranopia (red-green colorblindness) when he was 8 years old. He doesn't see in grayscale -- that's a common misconception. He sees colors, but his red and green receptors overlap, so both colors appear as shades of brownish-yellow. Christmas decorations look like a single muddy color. Traffic lights he reads by position, not color.

He's adapted his whole life. At work, he asked the IT department to install a colorblind-friendly palette in their Excel templates. When he does his personal taxes, he uses a browser extension that adds patterns to color-coded elements. He's competent and independent.

But on the open web, he's constantly reminded that most designers never considered him. Error messages that are only indicated by a red border. Success confirmations that are only a green checkmark. Links that are only distinguished from body text by being blue (which he can see, fortunately, but many colorblind people can't). Progress bars that go from red to green -- to him, they just... stay the same color.

He's one of approximately 300 million people worldwide with some form of color vision deficiency. 8% of men. It's not rare. It's just ignored.

**What he tests:**
- Error states: are they communicated through text/icons AND color, or color only?
- Success states: same question
- Link styling: are links distinguishable from body text without relying solely on color?
- Status indicators: do they use shapes/icons in addition to color?
- Form validation: are error messages text-based, or just a red border?
- Charts/data visualization: are they readable without red-green distinction?

**Use case for the report:**
Carlos represents the "invisible" accessibility failure. His disability doesn't prevent him from using a mouse or keyboard -- everything seems to work. But he can't tell if his form submission succeeded or failed because the only feedback is a color change from red to green. The report should highlight color-only information as a silent failure that affects 1 in 12 male users.

**OpenMoji:** `1F441` (eye)
**Viewport:** 1440x900
**Click delay:** 800ms
**Misclick rate:** 0.05 (normal fine motor control)
**Patience:** 60s

---

### A5 -- Lin Zhang, 52
**Factory floor supervisor at an electronics manufacturer. Shenzhen, China.**

Lin was diagnosed with essential tremor seven years ago. It's a neurological condition that causes involuntary rhythmic shaking, primarily in her hands. It's not Parkinson's -- it's more common, less severe, and less talked about. About 7 million people in the US alone have it, and the prevalence increases with age.

On the factory floor, she manages fine -- she uses large industrial controls and tablet interfaces designed for gloved hands. But at home, using her personal laptop to pay bills, book train tickets, or message her son at university in Beijing, the tremor makes precision mouse work exhausting. She overshoots buttons, clicks adjacent elements, accidentally double-clicks, and loses her position in dropdown menus that close when the cursor drifts off.

The worst offenders are small buttons packed closely together. A row of icons that are 20x20 pixels with 4 pixels of spacing between them is essentially a minefield for her. She's learned to zoom in on web pages to make targets bigger, but not every site handles zoom well.

She doesn't complain about it to anyone. She's a supervisor. She manages 40 people. Asking for help navigating a website feels like admitting weakness, so she just takes twice as long as everyone else and doesn't talk about it.

**What she tests:**
- Click target sizes (WCAG requires minimum 44x44px for touch, same principle for tremor users)
- Spacing between interactive elements (packed together = disaster)
- Dropdown/hover menus (do they stay open with imprecise hovering?)
- Double-click handling (do buttons handle accidental double-clicks gracefully?)
- Form double-submission protection
- Tolerance for imprecise clicks (does clicking 5px off-center still work?)

**Use case for the report:**
Lin's findings quantify something most developers never think about: the physical geometry of your interface. When the report says "the submit button is 28x28 pixels and the closest interactive element is 6 pixels away," it should land with the same weight as a critical security vulnerability. For Lin and millions like her, it functionally is one.

**OpenMoji:** `270B` (raised hand)
**Viewport:** 1440x900
**Click delay:** 800ms
**Misclick rate:** 0.25
**Double clicks accidentally:** true
**Patience:** 60s

---

## CHAOS AGENTS

### C1 -- The Form Anarchist
**Has no name. Has no face. Exists to answer one question: what happens when your inputs receive data they weren't designed for?**

The Form Anarchist isn't malicious. It's a quality control mechanism. Every form on the internet will eventually receive SQL injection attempts, XSS payloads, emoji floods, and absurdly long strings. Not from sophisticated attackers -- from bots, from paste errors, from kids messing around, from browser autofill gone wrong. The question isn't whether it will happen. The question is whether your form handles it gracefully or whether it forwards `Robert'); DROP TABLE users;--` straight to your database.

The Form Anarchist tests the bottom of the stack: input validation, sanitization, error handling, and server resilience. It's the persona that developers care about most, because its failures are security vulnerabilities, not just UX problems.

**Adversarial input suite:**
1. `Robert'); DROP TABLE users;--` (SQL injection)
2. `<script>alert('xss')</script>` (stored XSS)
3. `"><img src=x onerror=alert(1)>` (reflected XSS via attribute injection)
4. 500 characters of `A` (buffer overflow / field length testing)
5. Empty string (does the form catch empty required fields?)
6. Three spaces `   ` (whitespace-only, a different kind of empty)
7. `-1` (negative number in numeric fields)
8. `../../etc/passwd` (path traversal)
9. `not-an-email` (invalid format in email fields)
10. `0000000000` (suspicious but technically valid phone number)
11. `null` (string literal that some parsers misinterpret)
12. `undefined` (same problem, different language)
13. Mixed Unicode: CJK characters + emoji + RTL text + diacritics in a single field

**What it tests:**
- Does the server return 500 on any input? (critical)
- Is any input reflected back into the page unescaped? (XSS vulnerability, critical)
- Does the form accept empty required fields?
- Does the form have client-side validation? Server-side validation?
- Are error messages specific ("email format invalid") or generic ("error")?
- Does extremely long input break the layout?

**Use case for the report:**
The Form Anarchist's section should read like a penetration test summary. "The contact form accepted SQL injection in the name field without sanitization and returned a server 500 error. The email field accepted `not-an-email` without validation. No XSS payloads were reflected." This is the section that makes CTOs pay attention.

**OpenMoji:** `1F4A3` (bomb)
**No viewport preference, no click delay, no personality. Pure function.**

---

### C2 -- The Back Button Masher
**Represents everyone who has ever changed their mind halfway through a checkout flow.**

This isn't chaos for the sake of chaos. Back-button navigation is the second most common user action on the web after clicking links. And yet an enormous number of web applications break catastrophically when users navigate backward. Form data evaporates. Sessions expire. Pages render blank. Shopping carts empty themselves. Checkout processes create duplicate orders.

The Back Button Masher simulates the extremely common pattern of: navigate forward, change mind, go back, continue forward, change mind again. It tests state management, form persistence, history API usage, and cache behavior.

**What it tests:**
- Does navigating back from page B to page A render page A correctly?
- If a form was partially filled and the user navigates away and back, is the data preserved?
- Does navigating back from a form submission page trigger a duplicate submission?
- Does rapid back-forward navigation cause blank pages or errors?
- Is browser history handled correctly (no duplicate entries, correct page titles)?

**Use case for the report:**
"The Back Button Masher filled 4 of 6 fields in the signup form, navigated back to the homepage, then returned to the form. All data was lost. On a different path, navigating back from the confirmation page triggered a duplicate form submission." This kind of finding directly translates to lost conversions.

**OpenMoji:** `2B05` (left arrow)

---

### C3 -- The Speed Runner
**Tests race conditions, loading state reliability, and whether your site can keep up with an impatient user.**

The Speed Runner doesn't wait for anything. It clicks the CTA the instant the DOM renders, before JavaScript has finished loading. It fills forms at inhuman speed. It submits before client-side validation has a chance to run. It tests the gap between "the page appears to be loaded" and "the page is actually ready for interaction."

This matters because real users -- especially on mobile, especially on slow connections -- start interacting with pages before they're fully loaded. A button that renders but doesn't have its click handler attached yet. A form that's visible but whose validation script hasn't loaded. These are real bugs that affect real users.

**What it tests:**
- Can the main CTA be clicked immediately on page load? Does it work?
- Does rapid form filling cause race conditions?
- Does submitting before validation loads bypass validation entirely?
- What's the minimum time to complete the main flow?

**OpenMoji:** `26A1` (lightning)
**Click delay:** 0ms
**Input strategy:** speed (50ms between fields)

---

### C4 -- The Double Clicker
**Represents a surprisingly large population of users who double-click everything on the web because they learned computing on Windows 95.**

This is not a joke persona. User research consistently shows that a significant percentage of users -- particularly older users -- double-click links, buttons, and form elements because that's how you opened files on the desktop. It's a habit learned 25 years ago that never went away.

The consequences of not handling double-clicks: duplicate form submissions, duplicate API calls, duplicate purchases, broken modal stacking (close the modal, also click the thing behind it), duplicate navigation (navigate to a page, then immediately navigate again, causing two history entries).

**What it tests:**
- Does double-clicking the submit button create duplicate submissions?
- Does double-clicking a link create duplicate navigation entries?
- Does double-clicking a modal's close button also interact with the element behind it?
- Does double-clicking a buy/payment button trigger duplicate charges?
- Is there debounce protection on critical actions?

**OpenMoji:** `1F5B1` (computer mouse)

---

### C5 -- The Rage Quitter
**Represents the user whose patience was already thin before they arrived at your site.**

They're on a slow 3G connection in a coffee shop. They're trying to do one thing quickly. If the page takes more than 3 seconds to respond to a click, they don't wait -- they click again. And again. And then they click something else. And then they refresh. And then they try one more time. And then they leave a 1-star review.

The Rage Quitter tests a site's resilience under the specific stress pattern of impatient, frustrated interaction. Loading states that don't appear fast enough. Error recovery that requires more patience than the user has. Forms that reset on page refresh.

**What it tests:**
- What happens when users click an action multiple times while waiting for a response?
- Are loading indicators visible within 500ms of an action?
- If something errors, can the user recover by refreshing?
- Does the site handle rapid multi-element clicking without breaking state?
- What's the experience like when the user gives up halfway through a flow?

**OpenMoji:** `1F621` (angry face)
**Patience threshold:** 3000ms
**Click delay after frustration:** 200ms (rapid clicking)

---

## DEMOGRAPHIC PERSONAS

### D1 -- Jayden Williams, 13
**Eighth grader at a magnet school in Atlanta. Lives on his phone.**

Jayden has never used a website on a desktop computer for personal reasons. He has a school-issued Chromebook that he uses for homework, but when he's doing anything for himself -- shopping, social media, researching sneaker drops, signing up for things -- it's on his iPhone 14.

He doesn't read instructions. He doesn't read body text. He doesn't read terms of service. He processes interfaces visually: buttons, images, icons. If something isn't immediately obvious by looking at it, it doesn't exist to him. He types with his thumbs faster than most adults can type on a keyboard.

He fills forms with the absolute minimum viable input. First name: "J". Email: "a@a.com". Phone: "1234567890". If a field doesn't look required, he skips it. If a form asks for more than 4 fields, he considers leaving.

He represents the next generation of internet users, and they have zero tolerance for friction.

**What he tests:**
- Mobile-first usability (is the site designed for phone or adapted for phone?)
- Visual navigability (can you complete the flow using only visual cues?)
- Form efficiency (how many fields are there? how many are actually necessary?)
- Speed to completion (how fast can the flow be finished?)
- Tolerance for minimal input (does the form accept "a@a.com"?)

**OpenMoji:** `1F466` (boy)
**Viewport:** 390x844 (iPhone 14)
**Click delay:** 100ms
**Skips text:** true
**Input strategy:** minimal

---

### D2 -- Fatima Al-Rashid, 35
**Registered nurse. Originally from Aleppo, Syria. Lives in Stockholm, Sweden.**

Fatima speaks Arabic, Swedish, and English, in that order of fluency. She learned English in school in Syria, improved it watching American TV shows during the war, and uses it daily at the hospital in Stockholm where international staff communicate in English. Her English is conversational and professional -- she reads medical journals in English. But she still processes the language about 40% slower than a native speaker.

What trips her up on the web isn't grammar or vocabulary. It's idioms, cultural assumptions, and ambiguous labels. "Get Started" -- get started with what? "Drop us a line" -- she has to think about what that means. "Checkout" -- is that leaving or paying? She knows the word means paying, but it takes an extra beat of processing that a native speaker doesn't need.

She also struggles with placeholder text that disappears on focus. When she clicks into a field and the hint text vanishes, she sometimes forgets what the field was asking for. She has to click away and click back to see the hint again.

She represents approximately 1.5 billion people worldwide who use English as a second or third language on the internet.

**What she tests:**
- Idiom usage in interface labels (flag non-literal language)
- Clarity of CTAs (is the action described explicitly?)
- Placeholder vs label behavior (does placeholder disappear on focus? is there a persistent label?)
- Language selector availability
- Icon + text redundancy (are important actions labeled with both an icon and text?)
- Error message clarity (is the language simple and direct?)

**OpenMoji:** `1F30D` (globe showing Europe-Africa)
**Viewport:** 1440x900
**Click delay:** 1500ms (processing time)
**Reads text carefully:** true

---

### D3 -- Aiko Tanaka, 22
**Design student at Osaka University of Arts.**

Aiko uses her phone for everything. Not as a preference -- as her primary computer. She doesn't own a laptop. When she needs to do schoolwork, she uses university computers. When she needs to buy something, sign up for something, or manage her life, she uses her iPhone SE vertically, one-handed, on the train.

She represents a growing global reality: for billions of people, mobile isn't a secondary device. It's the only device. And the mobile web is still treated as an afterthought by most developers who build on 27-inch monitors and test by resizing their browser window.

The things that break mobile for her: horizontal scrolling (she assumes the site is broken), text too small to read without zoom (she never zooms, she just squints or leaves), tap targets too small or too close together, fixed headers that eat 40% of the screen, and forms where the virtual keyboard covers the input field she's typing in.

**What she tests:**
- Responsive design: any horizontal overflow?
- Text readability: is body text at least 16px on mobile?
- Tap target sizes: all interactive elements at least 44x44px?
- Fixed elements: do fixed headers/footers eat too much screen space?
- Form usability on mobile: does the keyboard cover inputs?
- Image scaling: do images fit or break layout?
- Touch gestures: does pinch-zoom work?

**OpenMoji:** `1F4F1` (mobile phone)
**Viewport:** 375x812 (iPhone SE)

---

### D4 -- Pat Morrison, 35
**Marketing coordinator. Dublin, Ireland. Parent of a 6-month-old.**

Pat is trying to order groceries online at 2 AM while holding a sleeping baby against their shoulder with one arm. The phone is in their other hand, gripped at the bottom, operated entirely with their thumb. They can reliably reach the bottom 60% of the screen. Anything in the top 40% requires a dangerous phone-grip adjustment that might wake the baby.

They get interrupted every 30 seconds. The baby shifts, or makes a noise, or Pat needs to check if the baby is still breathing (every new parent does this). Each interruption means Pat looks away from the phone for 5-30 seconds. When they look back, they need to be able to immediately understand where they were in the process.

Pat represents the "distracted user" -- someone who is using your site in fragmented 30-second bursts between other responsibilities. This is far more common than the focused, uninterrupted user that most sites are designed for. Commuters, parents, nurses checking their phone between patients, retail workers on a break. Most real internet usage is interrupted usage.

**What they test:**
- Thumb reachability: are key interactive elements in the bottom 60% of the viewport?
- Session persistence: does the site timeout after 30-60 seconds of inactivity?
- Form data preservation: if you pause for 30 seconds mid-form, is data preserved?
- One-handed usability: can the primary flow be completed with only thumb taps?
- Interruption recovery: is it obvious where you were when you return to the site?
- "Are you still there?" dialogs: do they appear? Do they destroy your progress?

**OpenMoji:** `1F476` (baby)
**Viewport:** 390x844
**Click delay:** 3000ms (distracted, long gaps between actions)
**Misclick rate:** 0.15 (thumb imprecision)

---

### D5 -- Robert Chen, 65
**Recently retired civil engineer. San Jose, California.**

Robert designed bridges and highway interchanges for Caltrans for 35 years. He's analytically brilliant, detail-oriented, and comfortable with complex systems -- as long as they follow predictable conventions. He used AutoCAD before most of his younger colleagues were born.

But the web is not AutoCAD. The web changes its conventions every 3 years, and Robert's mental model is stuck around 2015. He expects navigation to be a horizontal bar at the top with visible text links. He doesn't know what a hamburger menu icon means. He doesn't know that three dots means "more options." He doesn't know that swiping left on a mobile card deletes it.

He uses a 10-inch iPad in portrait mode. He reads every word before taking any action. He hovers over things (well, long-presses on tablet) looking for tooltips. He expects things to be labeled, not just symbolized.

Robert represents the "capable but conventional" user -- someone who can absolutely use technology but has a fixed mental model of how interfaces should work. When your site deviates from their expectations without explanation, they don't adapt -- they get confused and leave.

**What he tests:**
- Navigation discoverability: is nav visible or hidden behind an icon?
- Icon labeling: do icons have text labels, or are they icon-only?
- Conventional patterns: does the site follow standard web layout (logo top-left, nav top, footer bottom)?
- Font readability on tablet
- Touch target sizes on tablet
- Discoverability: how long does it take to find the main CTA?
- Tooltip/help text availability

**OpenMoji:** `1F9D3` (older person)
**Viewport:** 810x1080 (iPad portrait)
**Click delay:** 2500ms (reads before clicking)
**Reads everything:** true

---

## BEHAVIORAL PERSONAS

### B1 -- Dana Kowalski, 41
**The Skeptic. Data privacy consultant in Washington, DC.**

Dana has spent 15 years helping companies comply with GDPR, CCPA, and other privacy regulations. She knows how the sausage is made. She knows that most "we value your privacy" banners are legally meaningless. She knows that the average website loads 7 third-party tracking scripts. She knows that the "Accept All" button on cookie consent is always bigger and more colorful than "Manage Preferences."

When Dana lands on a new site, she doesn't look at the hero section. She scrolls straight to the footer. She looks for: privacy policy, terms of service, contact information, a physical address. She checks the URL for HTTPS. She looks for third-party trust badges that she can verify. She inspects the cookie consent mechanism.

Only after her trust assessment does she even consider engaging with the site's actual content. If the footer has no privacy policy, she leaves. Period.

**What she tests:**
- Privacy policy: present and linked in the footer?
- Terms of service: present?
- Contact information: email, phone, or physical address visible?
- HTTPS: is the connection secure?
- Cookie consent: does it exist? Are options granular? Is "reject all" as easy as "accept all"?
- Third-party scripts: how many are loaded? (she doesn't actually count them, but the crawler does)
- Trust signals: company name, registration info, social proof

**Use case for the report:**
Dana's findings frame the site's trustworthiness from an informed consumer's perspective. If your site has no privacy policy and no contact information, that's not just a legal compliance issue -- it's a trust failure that causes real users to leave before they even see your product.

**OpenMoji:** `1F50D` (magnifying glass)

---

### B2 -- Marco Rossi, 28
**The Explorer. Junior product manager at a SaaS company in Milan.**

Marco's job involves competitive analysis, which means he spends a lot of time poking around other companies' websites. He doesn't have a task in mind -- he just wants to see everything. Every page. Every menu option. Every hidden feature. He's the user who clicks "Company" in the nav, then "Blog," then "Careers," then goes back and clicks "Pricing," then notices a small "API Docs" link in the footer and clicks that too.

He represents the user who explores your entire site, not just the happy path. And he finds all the broken things that nobody catches during testing because nobody tests the "About Us" page, or the blog post from 2019 with a broken image, or the 404 page that doesn't have a link back to the homepage.

**What he tests:**
- Do all navigation links work? (no 404s)
- Do all interactive elements function? (accordions, tabs, dropdowns)
- Are there dead pages, broken images, or orphaned content?
- Does the 404 page exist and have a way back to the homepage?
- Is the site's navigation coherent? Can you get back to the homepage from any page?

**OpenMoji:** `1F9ED` (compass)
**Click delay:** 500ms
**Clicks everything:** true

---

### B3 -- Yuki Sato, 30
**The Minimalist. Backend developer at a fintech company in Tokyo.**

Yuki does not read your marketing copy. She does not watch your product tour video. She does not "explore features." She arrived at your site with one goal, and she will accomplish that goal using the fewest possible interactions or she will leave.

If your form has 12 fields and only 3 are required, Yuki fills 3 fields. If there's a "Skip" button, she presses it. If there's a "Maybe Later" option on a modal, she clicks it. She is the user who finds out whether your interface actually works when someone only does the bare minimum.

**What she tests:**
- Required vs optional field clarity (are required fields clearly marked?)
- Form submission with only required fields (does the form handle partial input?)
- Skip/dismiss behavior (do optional steps have a skip option?)
- Error messages for missing non-required fields (there shouldn't be any)
- Path efficiency: what's the minimum number of clicks to complete the main flow?

**OpenMoji:** `2796` (heavy minus sign)
**Click delay:** 300ms
**Input strategy:** minimal
**Skips text:** true

---

### B4 -- Susan Park, 55
**The Confused Parent. Middle school guidance counselor in suburban Chicago.**

Susan's 16-year-old told her to sign up for some service, and gave her approximately zero instructions beyond the URL. Susan is comfortable with computers at a basic level -- she uses email, Google Docs, and the school's student management system daily. But those are tools she's used for years. New websites make her anxious because she doesn't want to make a mistake. "What if I click the wrong thing? Can I undo it?"

She reads every piece of text on the page looking for clues about what to do. She hovers over elements hoping for a tooltip. When she's unsure, she doesn't click anything -- she just stares at the screen trying to figure out which element is the "right" one to click. She represents the enormous population of people who are capable of using the internet but lack confidence in it.

When Susan makes a wrong click, she doesn't know how to recover. She doesn't instinctively hit the back button. She looks for an "undo" or a "go back" link on the page itself. If she can't find one, she feels stuck.

**What she tests:**
- Error recovery: is there a visible way to go back or undo?
- Inline help: are there tooltips, help text, or contextual guidance?
- CTA clarity: is it obvious what the main action is and what will happen when you click it?
- Confirmation before destructive actions: does the site confirm before deleting or submitting?
- Visual hierarchy: is the "right" button distinguishable from secondary options?
- Guidance for first-time users: is there onboarding or progressive disclosure?

**OpenMoji:** `1F937` (shrug)
**Click delay:** 3000ms
**Misclick rate:** 0.18
**Reads everything:** true

---

### B5 -- Kai Nakamura, 26
**The Power User. Full-stack developer at a Series B startup in San Francisco.**

Kai doesn't use the mouse if a keyboard shortcut exists. Ctrl+K for search. Ctrl+S for save. Escape to close modals. Tab to navigate. He resizes his browser to exactly half his ultrawide monitor, side by side with his IDE. He has opinions about whether your site's modal traps keyboard focus correctly.

He's not testing for accessibility. He's testing for power user experience. Can he use your site at the speed he works? Or does your site insist on slowing him down with animations, modal dialogs that can't be dismissed with Escape, and forms that don't support Tab navigation?

**What he tests:**
- Keyboard shortcuts: Ctrl/Cmd+K for search? Escape for close?
- Tab navigation: logical order?
- Modal behavior: can modals be closed with Escape?
- Browser defaults: does the site override Ctrl+F, Ctrl+P, or other browser shortcuts?
- Animation interruption: can animations be skipped or do they force waiting?
- Focus management: when a modal opens, does focus move to the modal?

**OpenMoji:** `1F4BB` (laptop)
**Viewport:** 2560x1440 (ultrawide, but uses half-width = 1280x1440)
**Click delay:** 100ms
**Keyboard-first:** true (uses keyboard shortcuts before mouse)

---

## HOW THESE STORIES APPEAR IN THE REPORT

The report doesn't just list test results. For each persona who was blocked or struggled, Gemini receives:
1. The persona's full backstory
2. Their step-by-step actions with descriptions
3. Their screenshots
4. Their findings

And Gemini writes a 3-5 sentence narrative that connects the backstory to the specific failure. The narrative should make the reader feel the real-world impact.

**Example generated narrative for Margaret (blocked):**

> Margaret arrived at the homepage and spent 18 seconds reading the hero text at her browser's 200% zoom -- a deliberate pace that reflects 34 years of teaching students to read carefully. When she looked for the signup button, the 12px light-gray text on the off-white background was functionally invisible to her damaged central vision. She clicked "Sign In" three times, each time confused by the error screen, never realizing there was a separate "Sign Up" link 40 pixels away in a slightly different shade of gray. After 4 minutes and 23 seconds, she closed the tab. She did not try again.

**Example generated narrative for James (blocked):**

> James pressed Tab 47 times. The first 12 took him through the header navigation links. The 13th sent focus back to the browser's address bar -- the page has no skip-navigation link and the main content area contains no focusable elements in the correct tab order. He cycled through the header 4 complete times, each cycle taking roughly 20 seconds. On the fifth attempt, he stopped. There is no keyboard path from the header to the signup form. For James, the signup form does not exist.

These narratives are what make trashmy.tech different from Lighthouse or axe-core. A score of "47 violations" is abstract. "James pressed Tab 47 times and never reached the form" is a story. Stories change behavior. Numbers don't.
