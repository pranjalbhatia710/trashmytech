/**
 * Hardcoded demo data for showcasing the full report UI.
 * Used when testId === "demo"
 */

export const DEMO_URL = "https://acme-store.vercel.app";

export const DEMO_AGENTS = [
  {
    id: "margaret-68", name: "Margaret, 68", age: 68, category: "accessibility",
    description: "Low-vision user with 200% zoom, relies on large targets",
    status: "complete" as const, outcome: "struggled", taskCompleted: false,
    timeMs: 18200, issuesFound: 4,
    steps: [
      { step: 1, action: "navigate", target: "homepage", result: "success" },
      { step: 2, action: "click", target: "Shop All button", result: "success" },
      { step: 3, action: "click", target: "product card", result: "fail" },
      { step: 4, action: "scroll", target: "page down", result: "success" },
      { step: 5, action: "click", target: "Add to Cart", result: "fail" },
    ],
    findings: [
      { type: "bug", category: "accessibility", title: "Add to Cart button too small at 200% zoom", detail: "Button is 28×20px, needs 44×44px minimum", measured_value: "28x20px", expected_value: "44x44px" },
      { type: "bug", category: "accessibility", title: "Product images missing alt text", detail: "6 of 12 product images have empty alt attributes" },
      { type: "bug", category: "usability", title: "Color filter relies on color alone", detail: "No text labels on color swatches, inaccessible to color blind users" },
      { type: "bug", category: "accessibility", title: "Focus indicator invisible on dark background", detail: "Default outline is too thin and blends with the dark theme" },
    ],
  },
  {
    id: "james-74", name: "James, 74", age: 74, category: "accessibility",
    description: "Keyboard-only user, post-stroke, no mouse",
    status: "blocked" as const, outcome: "blocked", taskCompleted: false,
    timeMs: 12400, issuesFound: 3,
    steps: [
      { step: 1, action: "navigate", target: "homepage", result: "success" },
      { step: 2, action: "tab", target: "navigation", result: "success" },
      { step: 3, action: "tab", target: "search field", result: "fail" },
      { step: 4, action: "tab", target: "product grid", result: "fail" },
    ],
    findings: [
      { type: "bug", category: "accessibility", title: "Keyboard trap in mobile menu overlay", detail: "Tab key cycles within the hamburger menu even on desktop, cannot reach main content" },
      { type: "bug", category: "accessibility", title: "Skip to content link missing", detail: "No skip navigation link, must tab through 18 nav items to reach products" },
      { type: "bug", category: "accessibility", title: "Cart button not keyboard accessible", detail: "Cart icon uses div with onClick, not a button element" },
    ],
  },
  {
    id: "priya-31", name: "Priya, 31", age: 31, category: "accessibility",
    description: "Screen reader user, completely blind",
    status: "complete" as const, outcome: "struggled", taskCompleted: false,
    timeMs: 22100, issuesFound: 5,
    steps: [
      { step: 1, action: "navigate", target: "homepage", result: "success" },
      { step: 2, action: "screen_read", target: "headings", result: "success" },
      { step: 3, action: "screen_read", target: "product list", result: "fail" },
      { step: 4, action: "click", target: "product link", result: "success" },
      { step: 5, action: "screen_read", target: "product details", result: "fail" },
      { step: 6, action: "click", target: "Add to Cart", result: "fail" },
    ],
    findings: [
      { type: "bug", category: "accessibility", title: "Product grid uses div soup", detail: "Products are not in a list element, screen reader cannot enumerate items" },
      { type: "bug", category: "accessibility", title: "Price announced without currency", detail: "Screen reader says '29 99' instead of '$29.99'" },
      { type: "bug", category: "accessibility", title: "Size selector has no ARIA labels", detail: "Radio buttons for S/M/L/XL have no accessible names" },
      { type: "bug", category: "accessibility", title: "Modal dialog traps focus incorrectly", detail: "Quick view modal doesn't return focus to trigger element on close" },
      { type: "bug", category: "accessibility", title: "Live region missing for cart updates", detail: "Adding to cart provides no screen reader announcement" },
    ],
  },
  {
    id: "form-anarchist", name: "FormAnarchist", age: null, category: "chaos",
    description: "Injects SQL, XSS payloads into every input",
    status: "complete" as const, outcome: "completed", taskCompleted: true,
    timeMs: 8900, issuesFound: 2,
    steps: [
      { step: 1, action: "navigate", target: "homepage", result: "success" },
      { step: 2, action: "type", target: "search: <script>alert(1)</script>", result: "success" },
      { step: 3, action: "type", target: "email: ' OR 1=1 --", result: "success" },
      { step: 4, action: "click", target: "Subscribe button", result: "success" },
    ],
    findings: [
      { type: "bug", category: "security", title: "XSS reflected in search results", detail: "Search query rendered unescaped in 'Results for:' heading, script tag executes" },
      { type: "bug", category: "security", title: "Newsletter accepts malformed emails", detail: "Form accepts 'test@' and SQL injection strings without validation" },
    ],
  },
  {
    id: "rage-quitter", name: "RageQuitter", age: null, category: "chaos",
    description: "3-second patience limit, rapid clicks",
    status: "complete" as const, outcome: "completed", taskCompleted: true,
    timeMs: 5200, issuesFound: 1,
    steps: [
      { step: 1, action: "navigate", target: "homepage", result: "success" },
      { step: 2, action: "rapid_click", target: "Add to Cart x5", result: "success" },
      { step: 3, action: "click", target: "Checkout", result: "success" },
    ],
    findings: [
      { type: "bug", category: "usability", title: "Double-click adds item twice to cart", detail: "No debounce on Add to Cart, rapid clicks create duplicate items" },
    ],
  },
  {
    id: "aiko-22", name: "Aiko, 22", age: 22, category: "mobile",
    description: "iPhone SE user, one-handed browsing",
    status: "complete" as const, outcome: "struggled", taskCompleted: false,
    timeMs: 14600, issuesFound: 3,
    steps: [
      { step: 1, action: "navigate", target: "homepage (375px)", result: "success" },
      { step: 2, action: "scroll", target: "product grid", result: "success" },
      { step: 3, action: "tap", target: "filter dropdown", result: "fail" },
      { step: 4, action: "tap", target: "product card", result: "success" },
      { step: 5, action: "tap", target: "size selector", result: "fail" },
    ],
    findings: [
      { type: "bug", category: "mobile", title: "Filter dropdown unreachable on small screens", detail: "Filter bar horizontally overflows, can't scroll to 'Price' filter on 375px viewport" },
      { type: "bug", category: "mobile", title: "Touch targets overlap in product grid", detail: "Wishlist heart icon overlaps product image link on narrow screens" },
      { type: "bug", category: "mobile", title: "Bottom nav obscures Add to Cart", detail: "Fixed bottom bar covers the Add to Cart button, no scroll padding" },
    ],
  },
  {
    id: "dana-41", name: "Dana, 41", age: 41, category: "usability",
    description: "Privacy-conscious, reads all policies before buying",
    status: "complete" as const, outcome: "completed", taskCompleted: true,
    timeMs: 19800, issuesFound: 2,
    steps: [
      { step: 1, action: "navigate", target: "homepage", result: "success" },
      { step: 2, action: "click", target: "Privacy Policy link", result: "success" },
      { step: 3, action: "scroll", target: "policy page", result: "success" },
      { step: 4, action: "click", target: "Return to shop", result: "success" },
      { step: 5, action: "click", target: "product", result: "success" },
      { step: 6, action: "click", target: "Add to Cart", result: "success" },
    ],
    findings: [
      { type: "bug", category: "usability", title: "Privacy policy is a 404 page", detail: "Footer link to /privacy returns 404 Not Found" },
      { type: "bug", category: "usability", title: "No cookie consent banner", detail: "Site sets tracking cookies without user consent, GDPR non-compliant" },
    ],
  },
  {
    id: "marco-28", name: "Marco, 28", age: 28, category: "usability",
    description: "Explorer, clicks everything, tries edge cases",
    status: "complete" as const, outcome: "completed", taskCompleted: true,
    timeMs: 16300, issuesFound: 2,
    steps: [
      { step: 1, action: "navigate", target: "homepage", result: "success" },
      { step: 2, action: "click", target: "category nav", result: "success" },
      { step: 3, action: "click", target: "product", result: "success" },
      { step: 4, action: "type", target: "quantity: 99999", result: "success" },
      { step: 5, action: "click", target: "Add to Cart", result: "success" },
      { step: 6, action: "click", target: "Checkout", result: "success" },
    ],
    findings: [
      { type: "bug", category: "usability", title: "No max quantity validation", detail: "Can add 99999 items to cart, checkout shows $2.9M total with no warning" },
      { type: "bug", category: "usability", title: "Back button loses cart state", detail: "Browser back from checkout empties the cart, no state persistence" },
    ],
  },
  {
    id: "speed-runner", name: "SpeedRunner", age: null, category: "performance",
    description: "Performance tester, measures everything",
    status: "complete" as const, outcome: "completed", taskCompleted: true,
    timeMs: 7200, issuesFound: 2,
    steps: [
      { step: 1, action: "navigate", target: "homepage", result: "success" },
      { step: 2, action: "measure", target: "LCP", result: "success" },
      { step: 3, action: "scroll", target: "full page", result: "success" },
      { step: 4, action: "measure", target: "CLS", result: "success" },
    ],
    findings: [
      { type: "bug", category: "performance", title: "Hero image causes 3.2s LCP", detail: "Unoptized 4MB hero banner, no lazy loading or WebP format" },
      { type: "bug", category: "performance", title: "Layout shift on font load", detail: "CLS of 0.28 when custom fonts swap in, needs font-display: swap and size-adjust" },
    ],
  },
  {
    id: "kai-26", name: "Kai, 26", age: 26, category: "performance",
    description: "Power user, uses keyboard shortcuts",
    status: "complete" as const, outcome: "completed", taskCompleted: true,
    timeMs: 9100, issuesFound: 1,
    steps: [
      { step: 1, action: "navigate", target: "homepage", result: "success" },
      { step: 2, action: "keyboard", target: "/ to search", result: "fail" },
      { step: 3, action: "keyboard", target: "Cmd+K", result: "fail" },
      { step: 4, action: "click", target: "search icon", result: "success" },
    ],
    findings: [
      { type: "bug", category: "usability", title: "No keyboard shortcuts for search", detail: "Neither / nor Cmd+K opens search, power users must click the tiny icon" },
    ],
  },
];

export const DEMO_REPORT = {
  score: {
    overall: 34,
    reasoning: "Severe accessibility barriers block keyboard and screen reader users entirely. Critical XSS vulnerability in search. Mobile layout broken on small screens. Multiple usability issues compound to create a frustrating experience for most user types.",
    confidence: 0.85,
  },
  stats: {
    total: 10,
    completed: 7,
    blocked: 1,
    struggled: 3,
    blocked_names: ["James, 74"],
    struggled_names: ["Margaret, 68", "Priya, 31", "Aiko, 22"],
    fine_names: ["FormAnarchist", "RageQuitter", "Dana, 41", "Marco, 28", "SpeedRunner", "Kai, 26"],
  },
  category_scores: {
    accessibility: { score: 18, reasoning: "Keyboard trap, missing skip nav, no ARIA labels, broken focus indicators. Two of three accessibility personas were blocked or struggled.", key_evidence: ["keyboard trap", "no skip nav", "missing alt text"] },
    security: { score: 25, reasoning: "Reflected XSS in search is a critical vulnerability. Newsletter form has no input validation.", key_evidence: ["XSS in search", "no email validation"] },
    usability: { score: 48, reasoning: "Core flows work but edge cases fail. No quantity validation, broken privacy policy, cart state lost on back navigation.", key_evidence: ["no max quantity", "404 privacy policy", "cart state lost"] },
    mobile: { score: 30, reasoning: "Filter bar overflows, touch targets overlap, bottom nav covers CTA. iPhone SE experience is significantly degraded.", key_evidence: ["filter overflow", "overlapping targets", "CTA obscured"] },
    performance: { score: 42, reasoning: "Hero image bloats LCP to 3.2s. Significant layout shift on font load. No image optimization.", key_evidence: ["3.2s LCP", "CLS 0.28", "unoptimized images"] },
  },
  narrative: {
    executive_summary: "This e-commerce store has critical accessibility and security issues that must be addressed immediately. A keyboard-only user cannot navigate past the menu. A reflected XSS vulnerability in search could compromise customer data. Mobile users on small screens cannot complete purchases due to overlapping UI elements. While the core shopping flow works for mouse-using, sighted desktop users, the site fails to serve a significant portion of its potential audience.",
    persona_verdicts: [
      { persona_id: "margaret-68", persona_name: "Margaret, 68", name: "Margaret", would_recommend: false, narrative: "Could not complete a purchase. The Add to Cart button was invisible at her zoom level, and color-only filters were useless.", outcome: "struggled", category: "accessibility", primary_barrier: "Touch targets too small at 200% zoom" },
      { persona_id: "james-74", persona_name: "James, 74", name: "James", would_recommend: false, narrative: "Completely blocked. Could not get past the navigation menu using keyboard alone. The site is unusable without a mouse.", outcome: "blocked", category: "accessibility", primary_barrier: "Keyboard trap in navigation" },
      { persona_id: "priya-31", persona_name: "Priya, 31", name: "Priya", would_recommend: false, narrative: "Screen reader experience is broken. Products aren't in lists, prices are read incorrectly, and modals trap focus.", outcome: "struggled", category: "accessibility", primary_barrier: "No semantic HTML structure" },
      { persona_id: "form-anarchist", persona_name: "FormAnarchist", would_recommend: false, narrative: "Found a reflected XSS in search and broken email validation. Basic security hygiene is missing.", outcome: "completed", category: "chaos", primary_barrier: null },
      { persona_id: "rage-quitter", persona_name: "RageQuitter", would_recommend: false, narrative: "Double-clicking adds duplicate items. No rate limiting on cart actions.", outcome: "completed", category: "chaos", primary_barrier: null },
      { persona_id: "aiko-22", persona_name: "Aiko, 22", name: "Aiko", would_recommend: false, narrative: "Filter bar is broken on her phone. Touch targets overlap. Bottom bar covers the buy button.", outcome: "struggled", category: "mobile", primary_barrier: "Layout broken on 375px viewport" },
      { persona_id: "dana-41", persona_name: "Dana, 41", name: "Dana", would_recommend: false, narrative: "Found the privacy policy is a 404 and there's no cookie consent. She would not buy from this store.", outcome: "completed", category: "usability", primary_barrier: "Missing privacy policy" },
      { persona_id: "marco-28", persona_name: "Marco, 28", name: "Marco", would_recommend: false, narrative: "Created a $2.9M cart with no warning. Cart state disappears on back navigation.", outcome: "completed", category: "usability", primary_barrier: null },
      { persona_id: "speed-runner", persona_name: "SpeedRunner", would_recommend: false, narrative: "3.2s LCP and 0.28 CLS. The 4MB hero image is not optimized. Font loading causes visible layout shifts.", outcome: "completed", category: "performance", primary_barrier: "Slow LCP from unoptimized hero" },
      { persona_id: "kai-26", persona_name: "Kai, 26", name: "Kai", would_recommend: true, narrative: "Site works fine with mouse but has no keyboard shortcuts. Search requires clicking a small icon.", outcome: "completed", category: "performance", primary_barrier: null },
    ],
    top_issues: [
      { rank: 1, title: "Reflected XSS in Search", severity: "critical", category: "security", description: "User input in search is rendered unescaped in the results heading. An attacker could craft a URL that executes arbitrary JavaScript when clicked.", affected_personas: ["FormAnarchist"], fix: "Sanitize all user input before rendering. Use textContent instead of innerHTML.", impact_estimate: "All users at risk of session hijacking" },
      { rank: 2, title: "Keyboard Navigation Trap", severity: "critical", category: "accessibility", description: "The mobile menu overlay creates a keyboard trap. Tab key cycles within the menu and cannot reach the main content area.", affected_personas: ["James, 74"], fix: "Add proper focus management to the menu. Implement inert attribute on background content when menu is open.", impact_estimate: "15% of users rely on keyboard navigation" },
      { rank: 3, title: "Missing Alt Text on Product Images", severity: "major", category: "accessibility", description: "6 of 12 product images have empty alt attributes. Screen reader users cannot identify products.", affected_personas: ["Priya, 31", "Margaret, 68"], fix: "Add descriptive alt text to all product images. Use the product name and key visual details.", impact_estimate: "Affects all assistive technology users" },
      { rank: 4, title: "Mobile Layout Overflow on Small Screens", severity: "major", category: "mobile", description: "Filter bar, product grid, and CTA buttons are broken on viewports under 400px. iPhone SE users cannot complete purchases.", affected_personas: ["Aiko, 22"], fix: "Add responsive breakpoints for small screens. Use flex-wrap on filter bar. Add scroll padding for fixed bottom nav.", impact_estimate: "~20% of mobile users on small devices" },
      { rank: 5, title: "3.2 Second Largest Contentful Paint", severity: "major", category: "performance", description: "Unoptimized 4MB hero banner image causes slow initial paint. No lazy loading, no modern image formats.", affected_personas: ["SpeedRunner"], fix: "Convert hero to WebP/AVIF, add srcset for responsive sizes, use loading='lazy' for below-fold images.", impact_estimate: "Poor Core Web Vitals, hurts SEO ranking" },
    ],
    what_works: [
      { title: "Clean Visual Design", detail: "The overall aesthetic is modern and appealing. Typography is readable and the color palette works well.", personas_who_benefited: ["Marco, 28", "Dana, 41"] },
      { title: "Core Shopping Flow (Desktop)", detail: "Mouse users on desktop can browse, select, and add products to cart without issues.", personas_who_benefited: ["Marco, 28", "Kai, 26"] },
      { title: "Fast Server Response", detail: "TTFB is under 200ms. Server-side rendering provides fast initial content.", personas_who_benefited: ["SpeedRunner"] },
    ],
    what_doesnt_work: [
      { title: "Entire Keyboard Navigation", detail: "Keyboard-only users are trapped in the navigation menu. Skip links, focus management, and ARIA landmarks are all missing.", personas_who_suffered: ["James, 74", "Priya, 31"] },
      { title: "Small Screen Experience", detail: "The layout completely breaks on phones under 400px wide. Filters overflow, buttons overlap, and the bottom nav covers the CTA.", personas_who_suffered: ["Aiko, 22"] },
      { title: "Input Security", detail: "Both search and newsletter forms accept and execute malicious input. No CSP headers, no input sanitization.", personas_who_suffered: ["FormAnarchist"] },
      { title: "Cart State Management", detail: "No debounce on add-to-cart, no quantity limits, state lost on back navigation.", personas_who_suffered: ["RageQuitter", "Marco, 28"] },
    ],
    accessibility_audit: {
      total_violations: 24,
      critical: 3,
      serious: 8,
      moderate: 9,
      minor_count: 4,
      images_missing_alt: 6,
      details: [
        "3 keyboard traps in overlays and modals",
        "6 images missing alt text",
        "8 interactive elements missing ARIA labels",
        "Color contrast fails on 4 text elements",
        "No skip navigation link",
        "Heading hierarchy skips from h1 to h4",
      ],
    },
    chaos_test_summary: {
      inputs_tested: 8,
      inputs_rejected: 3,
      inputs_accepted_incorrectly: 4,
      server_errors: 1,
      worst_finding: "Reflected XSS in search — script tags execute in results page heading",
    },
    recommendations: [
      { rank: 1, action: "Fix the reflected XSS in search immediately", impact: "Critical security vulnerability — customer data at risk" },
      { rank: 2, action: "Add keyboard focus management and skip navigation", impact: "Unblocks 100% of keyboard-only users" },
      { rank: 3, action: "Add alt text to all product images", impact: "Makes products accessible to screen reader users" },
      { rank: 4, action: "Fix mobile layout for viewports under 400px", impact: "Enables ~20% of mobile users to complete purchases" },
      { rank: 5, action: "Optimize hero image and add font-display: swap", impact: "Improves LCP from 3.2s to under 1.5s" },
      { rank: 6, action: "Add input validation and CSP headers", impact: "Prevents XSS, SQL injection, and malformed data" },
      { rank: 7, action: "Add cookie consent banner and fix privacy policy 404", impact: "GDPR compliance, builds trust" },
      { rank: 8, action: "Add debounce to cart actions and quantity limits", impact: "Prevents accidental duplicate orders" },
    ],
  },
  fix_prompt: `You are an expert web developer. I ran an automated accessibility, security, and usability audit on my e-commerce site (https://acme-store.vercel.app) and found these critical issues. Please provide specific code fixes for each one.

## Critical Issues

### 1. Reflected XSS in Search (CRITICAL)
The search query is rendered unescaped in the "Results for: {query}" heading. Script tags execute.
- Current: innerHTML or dangerouslySetInnerHTML with unsanitized input
- Fix needed: Use textContent or proper React escaping

### 2. Keyboard Trap in Navigation Menu (CRITICAL)
The mobile hamburger menu overlay traps keyboard focus. Tab cycles within the menu and can't reach main content.
- Need: Focus trap that releases on Escape, inert attribute on background, skip-to-content link

### 3. Missing Alt Text on 6 Product Images
Product images have empty alt="" attributes. Screen readers can't identify products.
- Need: Dynamic alt text from product name + key details

### 4. Mobile Layout Broken on iPhone SE (375px)
- Filter bar overflows horizontally
- Wishlist icon overlaps product image link
- Fixed bottom nav covers Add to Cart button
- Need: flex-wrap on filters, z-index fixes, scroll-padding-bottom

### 5. Performance: 3.2s LCP from Hero Image
- 4MB unoptimized PNG hero banner
- No lazy loading, no WebP/AVIF
- Font swap causes CLS of 0.28
- Need: next/image with priority, WebP format, font-display: swap with size-adjust

### 6. No Input Validation
- Newsletter accepts "test@" and SQL strings
- No server-side validation
- No CSP headers
- Need: Zod/yup validation, CSP meta tag, rate limiting

Please provide the specific code changes for a Next.js / React application using Tailwind CSS. Focus on the most impactful fixes first.`,
  annotated_screenshot_url: undefined,
};

export const DEMO_CRAWL_DATA = {
  page_title: "Acme Store — Premium Products",
  links_count: 47,
  forms_count: 3,
  buttons_count: 18,
  images_missing_alt: 6,
  accessibility_violations_count: 24,
  load_time_ms: 3240,
};

export const DEMO_LOGS = [
  { time: "14:23:01", level: "info" as const, message: "connected to server" },
  { time: "14:23:02", level: "info" as const, message: "scanning https://acme-store.vercel.app" },
  { time: "14:23:08", level: "success" as const, message: "mapped 47 links, 3 forms" },
  { time: "14:23:08", level: "warning" as const, message: "24 accessibility violations" },
  { time: "14:23:09", level: "info" as const, message: "deploying 10 agents" },
  { time: "14:23:10", level: "info" as const, message: "Margaret, 68 started testing" },
  { time: "14:23:10", level: "info" as const, message: "James, 74 started testing" },
  { time: "14:23:11", level: "info" as const, message: "Priya, 31 started testing" },
  { time: "14:23:11", level: "info" as const, message: "FormAnarchist started testing" },
  { time: "14:23:12", level: "info" as const, message: "RageQuitter started testing" },
  { time: "14:23:12", level: "info" as const, message: "Aiko, 22 started testing" },
  { time: "14:23:13", level: "info" as const, message: "Dana, 41 started testing" },
  { time: "14:23:13", level: "info" as const, message: "Marco, 28 started testing" },
  { time: "14:23:14", level: "info" as const, message: "SpeedRunner started testing" },
  { time: "14:23:14", level: "info" as const, message: "Kai, 26 started testing" },
  { time: "14:23:18", level: "success" as const, message: "RageQuitter completed" },
  { time: "14:23:21", level: "success" as const, message: "SpeedRunner completed" },
  { time: "14:23:22", level: "success" as const, message: "FormAnarchist completed" },
  { time: "14:23:23", level: "success" as const, message: "Kai, 26 completed" },
  { time: "14:23:25", level: "error" as const, message: "James, 74 was blocked" },
  { time: "14:23:28", level: "warning" as const, message: "Aiko, 22 struggled" },
  { time: "14:23:30", level: "warning" as const, message: "Margaret, 68 struggled" },
  { time: "14:23:32", level: "success" as const, message: "Dana, 41 completed" },
  { time: "14:23:34", level: "success" as const, message: "Marco, 28 completed" },
  { time: "14:23:38", level: "warning" as const, message: "Priya, 31 struggled" },
  { time: "14:23:39", level: "info" as const, message: "generating report..." },
  { time: "14:23:52", level: "success" as const, message: "report ready" },
];
