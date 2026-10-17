import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../script.js', import.meta.url));
const proxyUrl = process.argv[2];
const workersUrl = /^https:\/\/prismorar-game-launch\.[a-z0-9-]+\.workers\.dev\/api\/game-launch\/$/;

if (!proxyUrl || !workersUrl.test(proxyUrl)) {
  throw new Error('Provide the HTTPS Prismorar game-launch Workers URL.');
}

const originalScript = await readFile(scriptPath, 'utf8');
let script = originalScript;
const proxySetting = `const GAME_LAUNCH_PROXY_URL = '${proxyUrl}';`;
if (script.includes('const GAME_LAUNCH_PROXY_URL = ')) {
  script = script.replace(
    /const GAME_LAUNCH_PROXY_URL = '[^']+';/,
    proxySetting,
  );
} else {
  const apiSetting =
    "const GAME_LAUNCH_API_URL = new URL('/api/v1/games/launch-demo-mode/', SOURCE_URL);";
  if (!script.includes(apiSetting)) {
    throw new Error('Could not find the game-launch API setting in script.js.');
  }
  script = script.replace(apiSetting, proxySetting);
  const apiUsage = 'new URL(encodeURIComponent(game.id), GAME_LAUNCH_API_URL)';
  if (!script.includes(apiUsage)) {
    throw new Error('Could not find the game-launch API call in script.js.');
  }
  script = script.replace(
    apiUsage,
    'new URL(encodeURIComponent(game.id), GAME_LAUNCH_PROXY_URL)',
  );
}

const index = await readFile(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const updatedIndex = index.replace(
  /script\.js\?v=(\d+)/,
  (_, version) => `script.js?v=${Number(version) + 1}`,
);
if (updatedIndex === index && script !== originalScript) {
  throw new Error('Could not increment the script cache version in index.html.');
}

if (script !== originalScript) {
  await writeFile(scriptPath, script);
  await writeFile(fileURLToPath(new URL('../index.html', import.meta.url)), updatedIndex);
}
