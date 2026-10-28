import { describe, expect, it } from 'vitest';
import { inline, renderMarkdown } from '../../src/player/markdown';

describe('markdown', () => {
  it('renders code, bold, italic and paragraphs', () => {
    expect(renderMarkdown('A **list** holds `[1, 2]`.\n\nNext *idea*.')).toBe(
      '<p>A <strong>list</strong> holds <code>[1, 2]</code>.</p><p>Next <em>idea</em>.</p>',
    );
  });

  it('escapes HTML everywhere, including inside code', () => {
    expect(renderMarkdown('<script>x</script> `<b>`')).toBe('<p>&lt;script&gt;x&lt;/script&gt; <code>&lt;b&gt;</code></p>');
  });

  it('does not apply emphasis inside code spans', () => {
    expect(inline('`a * b * c` and `**kw`')).toBe('<code>a * b * c</code> and <code>**kw</code>');
  });

  it('renders fenced code blocks and lists', () => {
    expect(renderMarkdown('Try:\n```python\nx = 1\n```\n- one\n- two')).toBe(
      '<p>Try:</p><pre class="code-sample"><code>x = 1</code></pre><ul><li>one</li><li>two</li></ul>',
    );
  });

  it('only links http(s) URLs', () => {
    expect(inline('[ok](https://docs.python.org) [bad](javascript:alert(1))')).toBe(
      '<a href="https://docs.python.org" rel="noopener" target="_blank">ok</a> [bad](javascript:alert(1))',
    );
  });
});
