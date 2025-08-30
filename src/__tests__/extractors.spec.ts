import { extractRepliesFromDOM, extractSingleReply } from '../utils/extractors';

const html = `
  <div>
    <div data-pressable-container="true">
      <a href="https://threads.com/@alice">@alice</a>
      <span translate="no">alice</span>
      <time datetime="2024-01-01T12:00:00Z">Jan 1</time>
      <div class="text">alice This is a sample reply about ThreadForge.</div>
    </div>
    <div data-pressable-container="true">
      <a href="https://threads.com/@bob">@bob</a>
      <span translate="no">bob</span>
      <time title="2024-01-02 09:00">Jan 2</time>
      <div class="text">bob Another helpful comment with details.</div>
    </div>
  </div>
`;

describe('extractors', () => {
  it('extracts replies from a Document', () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const replies = extractRepliesFromDOM(doc);
    expect(replies.length).toBe(2);
    const authors = replies.map(r => r.author);
    expect(authors).toContain('alice');
    expect(authors).toContain('bob');
    expect(replies[0].text).toBeTruthy();
  });

  it('extracts a single reply from a container', () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const el = doc.querySelector('[data-pressable-container="true"]') as HTMLElement;
    const reply = extractSingleReply(el);
    expect(reply).not.toBeNull();
    expect(reply!.author).toBe('alice');
    expect(reply!.text).toMatch(/sample reply/i);
    expect(reply!.timestamp).toBeTruthy();
  });
});

