import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from "node:fs";
const source = "artifacts/verification/brand-theme",
  root = "ui-review/brand-redesign";
mkdirSync(root, { recursive: true });
const read = (name) => JSON.parse(readFileSync(`${source}/${name}`, "utf8"));
const manifest = [];
for (const stage of ["before", "after"]) {
  const rows = read(`${stage}/manifest.json`);
  if (stage === "after")
    for (const file of ["loading-manifest.json", "startup-manifest.json"])
      if (existsSync(`${source}/${file}`)) rows.push(...read(file));
  for (const row of rows) {
    const file = `${stage}/${row.file}`;
    if (row.status === "captured") {
      mkdirSync(`${root}/${stage}/screenshots`, { recursive: true });
      copyFileSync(`${source}/${stage}/${row.file}`, `${root}/${file}`);
    }
    manifest.push({ ...row, stage, file });
  }
}
writeFileSync(`${root}/manifest.json`, JSON.stringify(manifest, null, 2));
writeFileSync(
  `${root}/manifest.csv`,
  [
    "stage,role,screen,theme,viewport,width,height,status,file,reason",
    ...manifest.map((r) =>
      [
        r.stage,
        r.role,
        r.screen,
        r.theme,
        r.viewport,
        r.width,
        r.height,
        r.status,
        r.file,
        r.reason ?? "",
      ]
        .map((x) => '"' + String(x).replaceAll('"', '""') + '"')
        .join(","),
    ),
  ].join("\n") + "\n",
);
const checks = readdirSync(`${source}/after`)
  .filter((f) => f.startsWith("checks-"))
  .flatMap((f) => read(`after/${f}`));
const verification = {
  captured: manifest.filter((r) => r.status === "captured").length,
  unavailable: manifest.filter((r) => r.status !== "captured"),
  overflow: manifest.filter((r) => r.overflow),
  axe: {
    states: checks.length,
    violations: checks.filter((r) => r.violations.length),
    incompleteRules: checks.reduce((a, r) => a + r.incomplete.length, 0),
  },
  crossBrowser: read("cross-browser.json"),
  crossBrowserRetries: existsSync(`${source}/cross-browser-retry.json`)
    ? read("cross-browser-retry.json")
    : [],
  entry: read("entry-checks.json"),
  loadingObservations: read("genuine-loading.json"),
  startupObservations: read("startup-manifest.json"),
};
verification.effectiveCrossBrowser = verification.crossBrowser.map((r) => {
  const retry = verification.crossBrowserRetries.find(
    (x) => x.browser === r.browser && x.role === r.role,
  );
  return retry ? { ...retry, retried: true, initialReason: r.reason } : r;
});
if (existsSync(`${source}/checkpoint.json`))
  verification.checkpoint = read("checkpoint.json");
if (existsSync(`${source}/gallery-check.json`))
  verification.gallery = read("gallery-check.json");
writeFileSync(
  `${root}/verification.json`,
  JSON.stringify(verification, null, 2),
);
const data = JSON.stringify(
  manifest.filter((r) => r.status === "captured"),
).replaceAll("<", "\\u003c");
writeFileSync(
  `${root}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>One ODC — Opulence brand review</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8f7f3;color:#242321;font:14px system-ui,sans-serif}header{padding:28px 4vw;background:#fff;border-bottom:1px solid #e8e4da}h1{font-size:28px;font-weight:500;margin:0 0 12px}p{max-width:1000px;line-height:1.6}a{color:#795514}nav,form{display:flex;gap:18px;flex-wrap:wrap}form{padding:20px 4vw}label{display:grid;gap:6px}select,input{font:inherit;padding:10px;border:1px solid #918576;border-radius:8px;min-height:42px}a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #87601a;outline-offset:3px}main{padding:0 4vw 40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px}figure{margin:0;padding:14px;background:#fff;border:1px solid #e8e4da;border-radius:16px}figure a{display:block}img{display:block;max-width:100%;max-height:350px;object-fit:contain;margin:auto}figcaption{margin-top:14px;line-height:1.6}#count{padding:0 4vw}@media(prefers-color-scheme:dark){body{background:#141518;color:#f4f0e8}header,figure{background:#202124;border-color:#363532}a{color:#e1bc74}input,select{background:#292a2d;color:#f4f0e8}}
</style><header><h1>One ODC · Opulence brand review</h1><p>Actual staging captures of the Gold and warm neutral theme. Approved layouts are preserved. Before images show the preceding Blue palette; select a screenshot for full size. Administration identities are masked. System images use an operating-system Dark preference. Only captured content is represented; full-page captures and transient states are labeled.</p><nav><a href="review.md">Comparison and limitations</a><a href="manifest.csv">Capture manifest</a><a href="verification.json">Verification evidence</a><a href="one-odc-brand-review.zip">Download review package</a></nav></header><form id="filters"><label>Stage<select id="stage" aria-label="Stage"><option value="">Before and after</option><option>before</option><option selected>after</option></select></label><label>Role<select id="role" aria-label="Role"><option value="">All roles</option></select></label><label>Theme<select id="theme" aria-label="Theme"><option value="">All themes</option><option>Light</option><option>Dark</option><option>System</option></select></label><label>Viewport<select id="viewport" aria-label="Viewport"><option value="">All viewports</option><option>desktop</option><option>laptop</option><option>mobile</option></select></label><label>Find a screen<input id="screen" type="search" aria-label="Find a screen"></label></form><p id="count" role="status"></p><main id="gallery"></main><script>
const data=${data},fields=['stage','role','theme','viewport','screen'];const role=document.getElementById('role');for(const r of [...new Set(data.map(x=>x.role))]){const o=document.createElement('option');o.textContent=r;role.append(o)}function render(){const shown=data.filter(x=>fields.every(k=>!document.getElementById(k).value||(k==='screen'?x.screen.includes(document.getElementById(k).value.toLowerCase()):x[k]===document.getElementById(k).value)));document.getElementById('count').textContent=shown.length+' of '+data.length+' captured states';const g=document.getElementById('gallery');g.replaceChildren();for(const x of shown){const f=document.createElement('figure'),a=document.createElement('a'),img=document.createElement('img'),c=document.createElement('figcaption');a.href=x.file;img.src=x.file;img.alt=x.role+' '+x.screen+' '+x.theme+' '+x.viewport;img.loading='lazy';a.append(img);c.textContent=x.stage+' · '+x.role+' · '+x.screen+' · '+x.theme+' · '+x.width+' × '+x.height+(x.fullPage?' · Full page':'')+(x.transient?' · Genuine transient':'');f.append(a,c);g.append(f)}}document.getElementById('filters').addEventListener('input',render);render();</script></html>`,
);
console.log(
  JSON.stringify({
    captured: verification.captured,
    axe: verification.axe.states,
    violations: verification.axe.violations.length,
    overflow: verification.overflow.length,
  }),
);
