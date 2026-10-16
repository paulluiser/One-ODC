import { mkdirSync, writeFileSync } from "node:fs";
const root = "ui-review/startup-composition";
mkdirSync(`${root}/assets`, { recursive: true });
const base = "http://localhost:3003";
const html = await (await fetch(base)).text();
const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0];
if (!main?.includes('viewBox="0 0 240 180"'))
  throw Error("Expected actual rebuilt startup markup");
const styles = [
  ...new Set(
    [...html.matchAll(/href="([^"]+\.css[^"]*)"/g)].map((m) =>
      m[1].replaceAll("&amp;", "&"),
    ),
  ),
];
let asset = 0;
const links = [];
for (const [i, path] of styles.entries()) {
  const url = new URL(path, base);
  let css = await (await fetch(url)).text();
  const resources = [
    ...new Set(
      [...css.matchAll(/url\(([^)]+)\)/g)].map((m) =>
        m[1].replaceAll('"', "").replaceAll("'", ""),
      ),
    ),
  ].filter((x) => !x.startsWith("data:"));
  for (const path of resources) {
    const resource = new URL(path, url),
      res = await fetch(resource);
    if (!res.ok) throw Error("Cannot copy preview CSS resource");
    const file = `asset-${asset++}.${resource.pathname.split(".").pop()}`;
    writeFileSync(
      `${root}/assets/${file}`,
      Buffer.from(await res.arrayBuffer()),
    );
    css = css.replaceAll(path, `./${file}`);
  }
  writeFileSync(`${root}/assets/style-${i}.css`, css);
  links.push(`<link rel="stylesheet" href="assets/style-${i}.css">`);
}
let markup = main;
for (const theme of ["light", "dark"]) {
  const path = `/brand/opulence/display/one-odc-logo-${theme}.svg`,
    file = `logo-${theme}.svg`;
  writeFileSync(
    `${root}/assets/${file}`,
    await (await fetch(base + path)).text(),
  );
  markup = markup.replaceAll(path, `assets/${file}`);
}
writeFileSync(
  `${root}/index.html`,
  `<!doctype html><html lang="en" data-one-odc-brand="opulence"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>One ODC · Startup composition preview</title>${links.join("")}<script>function appearance(t){document.documentElement.className=t==='dark'||t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.dataset.previewTheme=t}appearance(new URLSearchParams(location.search).get('theme')||'system');matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{if(document.documentElement.dataset.previewTheme==='system')appearance('system')})</script><style>.preview-controls{position:fixed;top:16px;right:16px;display:flex;gap:6px;flex-wrap:wrap;z-index:2}.preview-controls button{font:12px system-ui;padding:8px 12px;border:1px solid var(--brand-input);border-radius:8px;background:var(--brand-surface);color:var(--brand-text)}.preview-note{position:fixed;bottom:16px;left:24px;right:24px;font:12px/1.5 system-ui;color:var(--brand-muted);text-align:center}</style></head><body>${markup}<nav class="preview-controls" aria-label="Preview controls"><button onclick="appearance('light')">Light</button><button onclick="appearance('dark')">Dark</button><button onclick="appearance('system')">System</button><button onclick="const m=document.querySelector('main');m.replaceWith(m.cloneNode(true))">Replay</button></nav><p class="preview-note">Component preview · Assembly loops gently while loading. The live app never waits for this animation.</p></body></html>`,
);
console.log(
  "Standalone preview generated from actual server-rendered markup and built assets; no application route or delay added.",
);
