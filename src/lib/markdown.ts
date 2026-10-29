// Small, safe Markdown subset (ported from the artifact) plus GitHub-style tables.
// Everything is escaped first; only the constructs below produce HTML.

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function inline(t: string) {
  let s = esc(t);
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());

export function md(src: string | undefined): string {
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  let out = "", i = 0;
  const para: string[] = [];
  const flush = () => { if (para.length) { out += `<p>${inline(para.join(" "))}</p>`; para.length = 0; } };
  while (i < lines.length) {
    const L = lines[i];
    let m: RegExpMatchArray | null;
    if (/^```/.test(L)) {
      flush(); const lang = L.replace(/^```/, "").trim(); const buf: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out += `<div class="codewin"><div class="cbar"><span>${esc(lang || "code")}</span><button type="button" data-copy>Copy</button></div><pre><code>${esc(buf.join("\n"))}</code></pre></div>`;
      continue;
    }
    if ((m = L.match(/^:::hint\s*(.*)$/))) {
      flush(); const buf: string[] = []; i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out += `<details><summary>${inline(m[1] || "Hint")}</summary>${md(buf.join("\n"))}</details>`;
      continue;
    }
    if ((m = L.match(/^(#{1,4})\s+(.*)$/))) { flush(); const lv = Math.min(4, m[1].length + 1); out += `<h${lv}>${inline(m[2])}</h${lv}>`; i++; continue; }
    if (isRow(L) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush(); const head = cells(L); i += 2; const rows: string[][] = [];
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]));
      out += `<div class="tablewrap"><table><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      continue;
    }
    if (/^\s*[-*]\s+/.test(L) || /^\s*\d+\.\s+/.test(L)) {
      flush(); const ordered = /^\s*\d+\./.test(L); const items: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const l = lines[i];
        if (/^\s*([-*]|\d+\.)\s+/.test(l)) items.push(l.replace(/^\s*([-*]|\d+\.)\s+/, "")); else items[items.length - 1] += " " + l.trim();
        i++;
      }
      out += `<${ordered ? "ol" : "ul"}>${items.map(x => `<li>${inline(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`;
      continue;
    }
    if (/^>\s?/.test(L)) {
      flush(); const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out += `<blockquote>${md(buf.join("\n"))}</blockquote>`;
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(L)) { flush(); out += "<hr>"; i++; continue; }
    if (!L.trim()) { flush(); i++; continue; }
    para.push(L.trim()); i++;
  }
  flush();
  return out;
}
