import { describe, expect, it } from "vitest";
import { md } from "./markdown";

describe("md", () => {
  it("escapes HTML", () => {
    expect(md("<script>x</script>")).toBe("<p>&lt;script&gt;x&lt;/script&gt;</p>");
  });
  it("renders code windows with escaped code", () => {
    const h = md("```cpp\nvector<int> v;\n```");
    expect(h).toContain('class="codewin"');
    expect(h).toContain("vector&lt;int&gt; v;");
  });
  it("turns :::hint into details", () => {
    expect(md(":::hint Why?\nBecause.\n:::")).toBe("<details><summary>Why?</summary><p>Because.</p></details>");
  });
  it("renders tables", () => {
    const h = md("| a | b |\n|---|---|\n| 1 | `2` |");
    expect(h).toContain("<th>a</th>");
    expect(h).toContain("<td><code>2</code></td>");
  });
  it("only links http(s)", () => {
    expect(md("[ok](https://x.dev)")).toContain('<a href="https://x.dev"');
    expect(md("[bad](javascript:alert(1))")).not.toContain("<a");
  });
});
