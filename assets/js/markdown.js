// @ts-check
import { Parser, HtmlRenderer } from 'commonmark';

const parser = new Parser();
const renderer = new HtmlRenderer({ safe: true });

export function renderMarkdown(text) {
  const tree = parser.parse(text);
  const walker = tree.walker();
  let event;
  while ((event = walker.next())) {
    const node = event.node;
    if (['html_inline', 'html_block'].includes(node.type)) throw new Error('Article contains unsupported raw HTML.');
    if (node.type === 'link' || node.type === 'image') {
      const url = new URL(node.destination, 'https://tyemirov.net');
      if (!['https:', 'mailto:'].includes(url.protocol) || url.username || url.password) throw new Error('Article contains an unsupported URL.');
      if (node.type === 'image' && (!node.destination.startsWith('/articles/images/') || !node.firstChild)) throw new Error('Article images require a local image and alt text.');
    }
  }
  return renderer.render(tree);
}
