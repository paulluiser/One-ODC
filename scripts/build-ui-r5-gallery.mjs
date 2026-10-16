import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
const root = "ui-review",
  manifest = JSON.parse(readFileSync(`${root}/manifest.json`, "utf8"));
const captured = manifest.filter((m) => m.status === "captured");
writeFileSync(
  `${root}/manifest.csv`,
  [
    "role,screen,theme,viewport,width,height,status,file,reason",
    ...manifest.map((m) =>
      [
        m.role,
        m.screen,
        m.theme,
        m.viewport,
        m.width,
        m.height,
        m.status,
        m.file,
        m.reason ?? "",
      ]
        .map((x) => '"' + String(x).replaceAll('"', '""') + '"')
        .join(","),
    ),
  ].join("\n") + "\n",
);
mkdirSync(`${root}/references`, { recursive: true });
for (const name of [
  "01-dashboard.png",
  "02-project-workspace.png",
  "03-visual-style.png",
  "04-data-layout.png",
])
  copyFileSync(`docs/design-references/${name}`, `${root}/references/${name}`);
const data = JSON.stringify(captured).replaceAll("<", "\\u003c");
writeFileSync(
  `${root}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>One ODC — UI-R5 visual review</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f6fb;color:#18263d;font:14px Inter,system-ui,sans-serif}header{padding:28px 4vw;background:white;border-bottom:1px solid #e7ebf2}h1{font-size:28px;font-weight:500;margin:0 0 10px}p{max-width:1000px;line-height:1.6}a{color:#2663d8}nav{display:flex;gap:18px;flex-wrap:wrap}form{padding:20px 4vw;display:flex;gap:18px;flex-wrap:wrap}label{display:grid;gap:6px}select,input{font:inherit;padding:10px;border:1px solid #a6b3c8;border-radius:8px;min-height:42px}a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #2663d8;outline-offset:3px}main{padding:0 4vw 40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px}figure{margin:0;padding:14px;background:white;border:1px solid #e7ebf2;border-radius:16px}figure a{display:block}img{display:block;max-width:100%;max-height:350px;object-fit:contain;margin:auto}figcaption{margin-top:14px;line-height:1.6}small{color:#5e6c82}#count{padding:0 4vw} @media(prefers-color-scheme:dark){body{background:#101722;color:#edf2fa}header,figure{background:#1b2533;border-color:#354256}a{color:#afceff}small{color:#a6b3c8}input,select{background:#222f40;color:#edf2fa}}
</style><header><h1>One ODC · Final frontend review</h1><p>Actual authorized staging screens. Select a screenshot to inspect its original size. Each image is a viewport capture unless the manifest states otherwise; content below it is not implied to have been reviewed. Team identities are masked in administration captures. No credentials or invitation links are included.</p><nav><a href="review.md">Review, comparison and known issues</a><a href="manifest.csv">Screen/role/viewport manifest</a><a href="verification.json">Verification results</a><a href="references/01-dashboard.png">Reference 1</a><a href="references/02-project-workspace.png">Reference 2</a><a href="references/03-visual-style.png">Reference 3</a><a href="references/04-data-layout.png">Reference 4</a></nav></header><form id="filters"><label>Role<select id="role" aria-label="Role"><option value="">All roles</option></select></label><label>Theme<select id="theme" aria-label="Theme"><option value="">Both themes</option><option>Light</option><option>Dark</option></select></label><label>Viewport<select id="viewport" aria-label="Viewport"><option value="">All viewports</option><option>desktop</option><option>laptop</option><option>mobile</option></select></label><label>Find a screen<input id="screen" type="search" aria-label="Find a screen"></label></form><p id="count" role="status"></p><main id="gallery"></main><script>
const data=${data};const fields=['role','theme','viewport','screen'];const role=document.getElementById('role');for(const r of [...new Set(data.map(x=>x.role))]){const o=document.createElement('option');o.textContent=r;role.append(o)}function render(){const shown=data.filter(x=>fields.every(k=>!document.getElementById(k).value||(k==='screen'?x.screen.includes(document.getElementById(k).value.toLowerCase()):x[k]===document.getElementById(k).value)));document.getElementById('count').textContent=shown.length+' of '+data.length+' captured states';const g=document.getElementById('gallery');g.replaceChildren();for(const x of shown){const f=document.createElement('figure'),a=document.createElement('a'),img=document.createElement('img'),c=document.createElement('figcaption');a.href=x.file;img.src=x.file;img.alt=x.role+' '+x.screen+' '+x.theme+' '+x.viewport;img.loading='lazy';a.append(img);c.textContent=x.role+' · '+x.screen+' · '+x.theme+' · '+x.width+' × '+x.height;f.append(a,c);g.append(f)}}document.getElementById('filters').addEventListener('input',render);render();
</script></html>`,
);
console.log(
  JSON.stringify({
    gallery: captured.length,
    unavailable: manifest.length - captured.length,
  }),
);
