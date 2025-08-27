console.log("ThreadForge Content Script Loaded!");

// Example: Modify the background color of the page
// document.body.style.backgroundColor = 'lightblue';

// Add your content script logic here
// This script runs in the context of the Threads webpage

// --- Expand All Comments Feature ---

const MAX_EXPAND_ITERATIONS = 30;
const EXPAND_DELAY_MS = 800; // Adjusted delay for stability

// Specific selectors based on review
const SPECIFIC_EXPAND_SELECTORS = [
  'button[aria-label*="View replies"]',
  'button[data-testid="more-replies"]',
  'button[aria-label*="Load more"]', // Adding common variations
  'button[aria-label*="Show more"]',
];

// Fallback terms for text-based search
const FALLBACK_REPLIES_TERMS = [
  "view replies",
  "more replies",
  "view more",
  "replies",
  "查看",
  "回复",
  "更多",
];

// Import enhanced data models
import { CommentData, OverlayState, ExpandState, PerformanceMetrics, ViewportState, ErrorType } from './types';

// Function to delay execution
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Find elements using specific selectors, text fallbacks, and potential comment bodies
function findAllPossibleExpandElements(): HTMLElement[] {
  console.log("Searching for expand elements (Buttons, Links, Comments)...");
  let elements: HTMLElement[] = [];

  // --- Step 1: Prioritize specific dedicated buttons/links ---
  console.log("Searching for specific buttons/links...");
  for (const selector of SPECIFIC_EXPAND_SELECTORS) {
    try {
      const found = Array.from(
        document.querySelectorAll<HTMLElement>(selector)
      );
      elements.push(...found);
    } catch (e) {
      console.warn(`Error querying selector: ${selector}`, e);
    }
  }
  console.log(
    `Found ${elements.length} elements using specific button/link selectors.`
  );

  // --- Step 2: Fallback search for text indicating replies ---
  console.log("Searching for fallback text elements (spans/divs)...");
  const potentialTextElements = Array.from(
    document.querySelectorAll<HTMLElement>(
      'span, div[role="button"], div[tabindex="0"]'
    )
  );
  for (const el of potentialTextElements) {
    if (elements.includes(el)) continue; // Skip if already found
    try {
      const text = el.textContent?.toLowerCase().trim() || "";
      if (
        FALLBACK_REPLIES_TERMS.some((term) => text.includes(term.toLowerCase()))
      ) {
        console.log(`Found fallback text element: "${text}"`);
        elements.push(el);
      }
    } catch (e) {
      console.warn("Error processing fallback text element:", e);
    }
  }

  // --- Step 3: Identify potential comment elements that might hide replies ---
  // Comments themselves might be clickable to reveal replies.
  // We target potential comment containers (e.g., articles within articles)
  // or divs that contain reply indicators but aren't the indicators themselves.
  console.log("Searching for potentially clickable comment bodies...");
  // Selector for comment containers - adjust if needed based on Threads structure
  const commentContainerSelector = 'article div[role="article"]'; // Article within an article
  const potentialCommentContainers = Array.from(
    document.querySelectorAll<HTMLElement>(commentContainerSelector)
  );

  for (const container of potentialCommentContainers) {
    if (elements.includes(container)) continue; // Skip if already targeted

    // Check if this container likely has hidden replies that aren't already targeted by a button
    // Heuristic: Look for reply text *within* the container, but *not* in an already targeted element.
    const hasReplyText = Array.from(
      container.querySelectorAll<HTMLElement>("span, div")
    ).some((innerEl) => {
      if (elements.includes(innerEl)) return false; // Don't double-count if the text itself is targeted
      const text = innerEl.textContent?.toLowerCase().trim() || "";
      // Look for numbers + reply terms, or just reply terms
      return (
        (/\d+/.test(text) &&
          FALLBACK_REPLIES_TERMS.some((term) => text.includes(term))) ||
        FALLBACK_REPLIES_TERMS.some((term) => text === term)
      ); // Exact match for simple terms like 'replies'
    });

    if (hasReplyText) {
      console.log(
        `Found potential comment container to click (has reply text inside):`,
        container
      );
      // We might need to click the container itself, or a specific child?
      // For now, let's target the container.
      elements.push(container);
    }
  }

  // --- Step 4: Filter for visible, not-yet-clicked, and useful elements ---
  const visibleAndNewElements = elements.filter((el) => {
    try {
      if (!el || !isElementVisible(el) || el.hasAttribute("data-tf-clicked")) {
        return false;
      }
      // Avoid clicking elements that are *inside* something already marked as clicked
      if (el.closest('[data-tf-clicked="true"]')) {
        // console.log("Skipping element inside already-clicked container:", el);
        return false;
      }
      return true;
    } catch (e) {
      console.warn("Error filtering element:", e);
      return false;
    }
  });

  // --- Step 5: Deduplicate ---
  const uniqueElements = Array.from(new Set(visibleAndNewElements));

  console.log(
    `Found ${uniqueElements.length} unique, visible, and new potential expand elements to click.`
  );
  return uniqueElements;
}

// Helper to check if an element is visible
function isElementVisible(el: HTMLElement): boolean {
  if (!el) return false;
  try {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  } catch (e) {
    console.warn("Error checking element visibility:", e);
    return false;
  }
}

// For debugging - highlight elements so we can see what we're finding
function highlightElement(el: HTMLElement): void {
  if (!el) return;
  try {
    const originalBackground = el.style.backgroundColor;
    const originalOutline = el.style.outline;

    el.style.backgroundColor = "rgba(255, 165, 0, 0.3)"; // Orange highlight
    el.style.outline = "2px solid orange";

    setTimeout(() => {
      // Check if element still exists before resetting styles
      if (document.body.contains(el)) {
        el.style.backgroundColor = originalBackground;
        el.style.outline = originalOutline;
      }
    }, 1500); // Highlight duration
  } catch (e) {
    console.warn("Error highlighting element:", e);
  }
}

// --- Core Logic ---

// Renamed function - This will only run the loop to click expand buttons
async function runExpansionLoop(): Promise<void> {
  console.log("Starting expansion loop...");
  let iterations = 0;
  let foundAnyInLastIteration = true;
  let totalClicked = 0;

  while (foundAnyInLastIteration && iterations < MAX_EXPAND_ITERATIONS) {
    iterations++;
    console.log(
      `Expansion Iteration ${iterations}: Looking for expand elements...`
    );
    await sleep(500);
    let expandElements = findAllPossibleExpandElements();

    if (expandElements.length === 0) {
      if (foundAnyInLastIteration) {
        console.log("No elements found, waiting and retrying once more...");
        await sleep(1500);
        expandElements = findAllPossibleExpandElements();
        if (expandElements.length === 0) {
          foundAnyInLastIteration = false;
        }
      } else {
        foundAnyInLastIteration = false;
      }
      if (!foundAnyInLastIteration) {
        console.log(
          "No expandable elements found in this iteration or retry. Stopping loop."
        );
        continue;
      }
    }

    foundAnyInLastIteration = expandElements.length > 0;
    console.log(
      `Found ${expandElements.length} potential elements to click in iteration ${iterations}.`
    );

    for (const el of expandElements) {
      if (!el) continue;
      try {
        const text =
          el.getAttribute("aria-label") ||
          el.textContent?.trim() ||
          "[No Text]";
        console.log(`Attempting to click element: "${text}"`);
        // highlightElement(el); // Optional: Keep for debugging if needed
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        await sleep(300);
        if (!isElementVisible(el)) {
          console.warn(
            `Element "${text}" not visible after scroll, skipping click.`
          );
          continue;
        }
        el.click();
        el.setAttribute("data-tf-clicked", "true");
        totalClicked++;
        console.log(`Clicked element "${text}" successfully.`);
        await sleep(EXPAND_DELAY_MS);
      } catch (err) {
        const errorText = el
          ? el.getAttribute("aria-label") ||
            el.textContent?.trim() ||
            "[Element exists but no text]"
          : "[Element is null]";
        console.error(`Error clicking element "${errorText}":`, err);
      }
    }
    if (expandElements.length > 0) {
      await sleep(1000);
    }
  }
  console.log(
    `Finished expansion loop. Clicked ${totalClicked} elements in ${iterations} iterations.`
  );
  if (iterations >= MAX_EXPAND_ITERATIONS) {
    console.warn("Reached maximum expansion iterations");
  }

  // Clean up clicked markers after loop finishes
  document.querySelectorAll('[data-tf-clicked="true"]').forEach((el) => {
    try {
      el.removeAttribute("data-tf-clicked");
    } catch (e) {
      /* Ignore */
    }
  });
}

// Function to scrape data from a single comment element and its replies
function scrapeSingleComment(commentElement: HTMLElement): CommentData | null {
  if (!commentElement) return null;

  // Generate unique ID for each comment
  const id = `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // --- Selectors (These are examples - NEED INSPECTION on Threads.net) ---
  const authorLink = commentElement.querySelector<HTMLAnchorElement>(
    'a[href*="/profile/"]'
  );
  const authorSpan = commentElement.querySelector<HTMLElement>(
    'span[style*="font-weight: 600"]'
  );
  const author =
    authorLink?.href.split("/").pop() ||
    authorSpan?.textContent?.trim() ||
    null;

  // Try to find the main text content
  // Look for divs directly under the main container, avoiding nested articles/buttons
  let textContent = "";
  // Simple approach: find the first non-empty div/span text that is not an author or button
  const potentialTextElements = Array.from(
    commentElement.querySelectorAll<HTMLElement>("div > span, div > div")
  );
  for (const el of potentialTextElements) {
    // Basic checks to avoid scraping buttons, nested articles, etc.
    if (el.closest('button, a, article div[role="article"]')) continue;
    const text = el.textContent?.trim();
    if (
      text &&
      text !== author &&
      !FALLBACK_REPLIES_TERMS.some((term) =>
        text.toLowerCase().includes(term)
      ) &&
      !/\d+\s*(replies|reply|more)/i.test(text)
    ) {
      textContent = text; // Take the first suitable text block
      break;
    }
  }
  const text = textContent || null;

  // Try to find timestamp (example selector)
  const timeElement = commentElement.querySelector<HTMLTimeElement>("time");
  const timestamp =
    timeElement?.getAttribute("datetime") ||
    timeElement?.textContent?.trim() ||
    null;

  // --- Recursively scrape replies ---
  const replies: CommentData[] = [];
  // *** CHANGE: Look for nested divs with role="article" ***
  const replyElements = Array.from(
    commentElement.querySelectorAll<HTMLElement>(':scope div[role="article"]') 
  ); 
  // console.log(`Found ${replyElements.length} potential reply elements for comment by ${author}`);
  for (const replyEl of replyElements) {
    const scrapedReply = scrapeSingleComment(replyEl);
    if (scrapedReply) {
      replies.push(scrapedReply);
    }
  }

  // Basic validation - only return if we found some text or author
  if (author || text) {
    return { id, author, text, timestamp, replies };
  }

  return null; // Ignore elements that don't seem like valid comments
}

// Main scraping function - Simplified approach using role="article"
function scrapeCommentData(): CommentData[] { 
  console.log("Scraping actual comment data using role='article'...");
  const comments: CommentData[] = [];

  // --- Find ALL divs with role="article" on the page ---
  const allArticleElements = Array.from(
    document.querySelectorAll<HTMLElement>('div[role="article"]') // *** CHANGED SELECTOR ***
  );
  console.log(`Found ${allArticleElements.length} total div[role="article"] elements.`);

  if (allArticleElements.length === 0) {
    console.warn("No <div role='article'> elements found on the page at all.");
    return []; // Nothing to scrape
  }
  
  // --- Filter to find likely top-level comments ---
  // Assume top-level comments are role=article divs not nested within others.
  let topLevelCommentCount = 0;
  for (const el of allArticleElements) {
    try {
      // Check if the element is still in the DOM and visible
      if (!document.body.contains(el) || !isElementVisible(el)) continue; 

      // Check if its closest role=article ancestor is itself
      const parentArticle = el.parentElement?.closest('div[role="article"]'); // *** CHECK NESTING ***
      if (!parentArticle || parentArticle === el) { 
        // This is likely a top-level comment or the main post
         console.log("Processing potential top-level div[role='article']:", el);
         topLevelCommentCount++;
         const scrapedComment = scrapeSingleComment(el);
         if (scrapedComment) {
             comments.push(scrapedComment);
         }
      }
    } catch (e) {
      console.error("Error processing a div[role='article'] element:", el, e);
    }
  }

  console.log(`Finished scraping. Processed ${topLevelCommentCount} potential top-level items, extracted ${comments.length} comments/posts.`);
  // TODO: Might need logic here to differentiate the main post from the first comment if structure is identical.
  return comments;
}

// Placeholder function for displaying the panel - TO BE IMPLEMENTED
function displayCommentsInPanel(commentsData: any[]): void {
  console.log("Displaying comments in panel... (Placeholder)", commentsData);
  // TODO: Implement panel creation and population logic here.
  alert(
    "Comment Panel Display (Not Implemented Yet)\n\n" +
      JSON.stringify(commentsData, null, 2)
  );
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(
    "Message received from:",
    sender.tab ? "content script:" + sender.tab.url : "extension"
  );
  console.log("Request action:", request.action);

  if (request.action === "gatherComments") {
    console.log("Gathering comments action triggered...");
    // Use an async IIFE to handle the async operations
    (async () => {
      try {
        // Optional: Add visual indicator like a temporary banner
        // showStatusIndicator("Expanding comments...");

        await runExpansionLoop();

        // Optional: Update status
        // showStatusIndicator("Scraping comments...");

        const commentsData = scrapeCommentData();

        console.log("Sending comment data back to popup.");
        sendResponse({ success: true, data: commentsData });

        // Optional: Remove indicator
        // hideStatusIndicator();
      } catch (error) {
        console.error("Error during comment gathering:", error);
        // Optional: Remove indicator
        // hideStatusIndicator();
        sendResponse({
          success: false,
          error: (error as Error).message || "Unknown error during gathering",
        });
      }
    })();

    return true; // Indicates that the response is sent asynchronously
  } else if (request.action === "displayComments") {
    console.log("Displaying comments action triggered...");
    try {
      displayCommentsInPanel(request.data);
      sendResponse({ success: true }); // Acknowledge display command
    } catch (error) {
      console.error("Error displaying comments panel:", error);
      sendResponse({
        success: false,
        error: (error as Error).message || "Unknown error during display",
      });
    }
    return false; // Response is synchronous for display command
  }

  // Handle other potential messages if needed
  console.log("Unknown action received:", request.action);
  return false; // Indicate synchronous response for unknown actions
});

// --- Initial setup ---
// Removed observer logic as it's no longer needed for button injection
console.log("ThreadForge Content Script initialized and listener ready.");
