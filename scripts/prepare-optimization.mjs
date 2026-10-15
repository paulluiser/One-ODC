import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/optimization/vendor", { recursive: true });
for (const file of ["qpdf.js", "qpdf.wasm"])
  copyFileSync(
    `node_modules/@neslinesli93/qpdf-wasm/dist/${file}`,
    `public/optimization/vendor/${file}`,
  );
