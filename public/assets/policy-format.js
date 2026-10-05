(function (root) {
  const escape = (v) =>
    String(v).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const inline = (line) =>
    escape(line).replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      '<a href="$2" rel="noopener noreferrer">$1</a>'
    );
  function render(text) {
    let list = false;
    const out = [];
    for (const line of String(text).split(/\r?\n/)) {
      const item = /^[-*] +(.+)/.exec(line);
      if (item) {
        if (!list) out.push('<ul>');
        list = true;
        out.push('<li>' + inline(item[1]) + '</li>');
        continue;
      }
      if (list) {
        out.push('</ul>');
        list = false;
      }
      const heading = /^(#{1,3}) +(.+)/.exec(line);
      if (heading) {
        const n = heading[1].length + 1;
        out.push('<h' + n + '>' + inline(heading[2]) + '</h' + n + '>');
      } else if (line.trim()) out.push('<p>' + inline(line) + '</p>');
    }
    if (list) out.push('</ul>');
    return out.join('\n');
  }
  const api = { render, escape };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AgesportPolicyFormat = api;
})(typeof window === 'undefined' ? globalThis : window);
