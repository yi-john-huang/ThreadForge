import { CommentData } from '../types';

export function extractSingleReply(container: HTMLElement): CommentData | null {
  let author: string | null = null;

  // Try multiple selectors for username
  const usernameSelectors = [
    'a[href*="/@"]',
    'a[href*="/t/"]',
    '[data-testid="post-author-username"]',
    'span[dir="ltr"]',
    'span[translate="no"]'
  ];
  
  for (const selector of usernameSelectors) {
    const element = container.querySelector(selector);
    if (element) {
      const href = element.getAttribute('href');
      if (href) {
        const match = href.match(/@([^/?]+)|t\/([^/?]+)/);
        if (match) {
          author = match[1] || match[2];
          break;
        }
      } else {
        const text = element.textContent?.trim();
        if (text && text.length > 0 && text.length < 30 && !text.includes(' ')) {
          author = text;
          break;
        }
      }
    }
  }

  // Extract text content more carefully
  let textContent = '';
  
  // Try to find the main text area
  const textSelectors = [
    '[data-testid="post-text"]',
    'div[dir="auto"]',
    'span[dir="auto"]',
    'div[class*="text"]',
    'div[class*="content"]'
  ];
  
  for (const selector of textSelectors) {
    const textElement = container.querySelector(selector);
    if (textElement) {
      textContent = textElement.textContent?.trim() || '';
      if (textContent.length > 10) break;
    }
  }
  
  // Fallback to full text if specific selectors don't work
  if (!textContent || textContent.length < 10) {
    const fullText = container.textContent?.trim();
    if (fullText && fullText.length > 10) {
      textContent = fullText;
      // Clean up the text
      if (author) {
        textContent = textContent.replace(new RegExp(`^${author}`, 'i'), '').trim();
      }
      // Remove common UI elements
      textContent = textContent.replace(/^\s*(\d+\s*(replies?|comments?|likes?)|reply|more|view|show|translate|follow|share)\s*/gi, '').trim();
      textContent = textContent.replace(/\s*(\d+\s*(replies?|comments?|likes?)|reply|more|view|show|translate|follow|share)\s*$/gi, '').trim();
    }
  }

  // Extract timestamp
  let timestamp: string | null = null;
  const timeElement = container.querySelector('time, [datetime], a[href*="/post/"] span') as HTMLElement | null;
  if (timeElement) {
    timestamp = timeElement.getAttribute('datetime') || 
                timeElement.getAttribute('title') || 
                timeElement.textContent?.trim() || null;
  }

  if (!author && !textContent) return null;

  return {
    id: `reply-${Math.random().toString(36).slice(2)}`,
    author: author || null,
    text: textContent || null,
    timestamp,
  };
}

export function extractRepliesFromDOM(doc: Document): CommentData[] {
  const replies: CommentData[] = [];
  
  // Try multiple selectors to find comment containers
  const selectors = [
    'div[data-pressable-container="true"]',
    'article',
    '[role="article"]',
    'div[class*="reply"]',
    'div[class*="comment"]',
    '[data-testid="reply"]',
    '[data-testid="comment"]'
  ];
  
  const processedElements = new Set<HTMLElement>();
  
  for (const selector of selectors) {
    const containers = doc.querySelectorAll(selector);
    for (const container of Array.from(containers)) {
      if (processedElements.has(container as HTMLElement)) continue;
      
      try {
        const reply = extractSingleReply(container as HTMLElement);
        if (reply && reply.text && reply.text.length > 10) {
          replies.push(reply);
          processedElements.add(container as HTMLElement);
        }
      } catch (error) {
        console.warn('Error extracting reply:', error);
      }
    }
  }

  // Remove duplicates based on text content
  const uniqueReplies = replies.filter((reply, index, arr) =>
    index === arr.findIndex(r => 
      (r.text === reply.text && r.author === reply.author) ||
      (r.text && reply.text && r.text.includes(reply.text.substring(0, 50)))
    )
  );

  return uniqueReplies.slice(0, 20);
}

export function extractRepliesFromCurrentPage(doc: Document = document): CommentData[] {
  const replies: CommentData[] = [];
  const commentContainers = doc.querySelectorAll('div[data-pressable-container="true"]');

  for (const container of Array.from(commentContainers)) {
    try {
      const reply = extractSingleReply(container as HTMLElement);
      if (reply) replies.push(reply);
    } catch {
      // ignore extraction errors
    }
  }

  return replies.slice(0, 5);
}

// Parse replies from embedded JSON blobs in SPA pages (e.g., Next.js/GraphQL dehydrated state)
export function extractRepliesFromEmbeddedJSON(doc: Document): CommentData[] {
  const results: CommentData[] = [];
  // Be conservative: gather all <script> tags without fancy selectors to avoid syntax issues
  const scripts = Array.from(doc.getElementsByTagName('script')) as HTMLScriptElement[];

  const tryParse = (raw: string): any | null => {
    try { return JSON.parse(raw); } catch {}
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) {
      const slice = raw.slice(first, last + 1);
      try { return JSON.parse(slice); } catch {}
    }
    return null;
  };

  const pushReply = (author: string | null, text: string | null, ts?: string | number | null) => {
    if (!author && !text) return;
    results.push({
      id: `reply-${Math.random().toString(36).slice(2)}`,
      author: author || null,
      text: text || null,
      timestamp: typeof ts === 'number' ? new Date(ts * 1000).toISOString() : (ts as string | null) || null,
    });
  };

  const visit = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      // Heuristic: objects with user + text-like fields
      for (const c of node) {
        if (!c || typeof c !== 'object') continue;
        const author = (c.user?.username || c.user?.handle || c.owner?.username || c.owner?.handle || c.author?.username || c.author?.handle || c.username || c.handle || c.profile?.username || null) as string | null;
        const text = (typeof c.text === 'string' ? c.text : c.body?.text || c.caption?.text || c.caption || c.content?.text || c.content || c.message || null) as string | null;
        const ts = (c.created_at || c.taken_at || c.timestamp || c.time || null) as string | number | null;
        if (author || text) pushReply(author, text, ts);
      }
      return;
    }
    if (typeof node === 'object') {
      // Common reply container keys used by SPA/GraphQL data
      const arrays = [
        node.replies,
        node.reply_threads,
        node.thread_items,
        node.comments,
        node.comment_list,
        node.comment_threads,
        node.items,
        node.edges?.map((e: any) => e?.node) || node.edges,
        node.children,
      ].filter(Boolean);
      for (const arr of arrays) visit(arr);
      // Continue traversal but avoid huge strings or obvious irrelevant keys
      for (const key of Object.keys(node)) {
        const value = (node as any)[key];
        if (typeof value === 'string' && value.length > 200000) continue;
        visit(value);
      }
    }
  };

  // Prioritize known JSON script buckets first (e.g., __NEXT_DATA__)
  const prioritized = [] as HTMLScriptElement[];
  const rest = [] as HTMLScriptElement[];
  for (const s of scripts) {
    if (s.id === '__NEXT_DATA__' || s.type === 'application/json' || s.type === 'application/ld+json') {
      prioritized.push(s);
    } else {
      rest.push(s);
    }
  }

  const queue = [...prioritized, ...rest];

  for (const s of queue) {
    const raw = s.textContent || '';
    if (raw.length < 50) continue;
    const parsed = tryParse(raw);
    if (!parsed) continue;
    visit(parsed);
    if (results.length >= 10) break;
  }

  const unique = results.filter((r, i, arr) => i === arr.findIndex(x => x.text === r.text && x.author === r.author));
  return unique.slice(0, 10);
}
