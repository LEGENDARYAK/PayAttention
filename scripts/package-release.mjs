import { copyFile, mkdir, readFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const output = new URL('../.output/', import.meta.url);
const releases = new URL('../release-assets/', import.meta.url);

await mkdir(releases, { recursive: true });
await copyFile(
  new URL(`payattention-${version}-chrome.zip`, output),
  new URL(`PayAttention-${version}-Chrome-Brave.zip`, releases),
);
await copyFile(
  new URL(`payattention-${version}-firefox.zip`, output),
  new URL(`PayAttention-${version}-Firefox-unsigned-temporary.zip`, releases),
);

console.log(`Copied PayAttention ${version} browser packages to release-assets/`);
