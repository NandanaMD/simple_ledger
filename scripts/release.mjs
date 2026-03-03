import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const run = (command) => {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit' });
};

const runAndCapture = (command) =>
  execSync(command, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
  }).trim();

const quote = (value) => `"${String(value).replace(/"/g, '\\"')}"`;

const isSemverLike = (value) =>
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);

const readPackageJson = () => JSON.parse(readFileSync('package.json', 'utf-8'));

const ensureVersionChanged = (previousVersion, nextVersion) => {
  if (previousVersion === nextVersion) {
    throw new Error(
      `Version did not change (${nextVersion}). Use a higher bump or provide a different exact version.`,
    );
  }
};

const verifyBuiltVersionArtifacts = (version, productName) => {
  const expectedInstaller = path.resolve('dist', `${productName} Setup ${version}.exe`);
  if (!existsSync(expectedInstaller)) {
    throw new Error(
      `Expected installer not found for version ${version}: ${expectedInstaller}. Build output version does not match package version.`,
    );
  }

  const latestYmlPath = path.resolve('dist', 'latest.yml');
  if (!existsSync(latestYmlPath)) {
    throw new Error(`Missing latest.yml at ${latestYmlPath}.`);
  }

  const latestYml = readFileSync(latestYmlPath, 'utf-8');
  const versionLine = latestYml.match(/^version:\s*(.+)$/m)?.[1]?.trim();
  if (!versionLine) {
    throw new Error('Unable to read version from dist/latest.yml.');
  }

  if (versionLine !== version) {
    throw new Error(
      `latest.yml version mismatch. Expected ${version}, got ${versionLine}.`,
    );
  }
};

const collectReleaseAssets = (rootDir) => {
  if (!existsSync(rootDir)) {
    return [];
  }

  const wanted = [/\.exe$/i, /\.blockmap$/i, /latest.*\.ya?ml$/i];
  const assets = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (wanted.some((pattern) => pattern.test(entry.name))) {
        assets.push(fullPath);
      }
    }
  }

  return assets;
};

const inputVersion = process.argv[2] ?? 'patch';
const allowedBumps = new Set([
  'patch',
  'minor',
  'major',
  'prepatch',
  'preminor',
  'premajor',
  'prerelease',
]);

if (!allowedBumps.has(inputVersion) && !isSemverLike(inputVersion)) {
  console.error(
    'Invalid version. Use: patch | minor | major | prepatch | preminor | premajor | prerelease | <exact semver>',
  );
  process.exit(1);
}

try {
  run('gh --version');
  run('gh auth status');
  run('git rev-parse --is-inside-work-tree');

  const initialGitStatus = runAndCapture('git status --porcelain');
  if (initialGitStatus) {
    throw new Error('Working tree is not clean. Commit or stash changes before running release.');
  }

  const packageBefore = readPackageJson();
  const previousVersion = packageBefore.version;

  run(`npm version ${inputVersion} --no-git-tag-version`);

  const packageJson = readPackageJson();
  const version = packageJson.version;
  const productName = packageJson.build?.productName ?? packageJson.name;
  ensureVersionChanged(previousVersion, version);

  const tag = `v${version}`;
  console.log(`\nVersion bumped: ${previousVersion} -> ${version}`);

  run('npm run dist');
  verifyBuiltVersionArtifacts(version, productName);

  run('git add package.json package-lock.json');
  run(`git commit -m ${quote(`release: ${tag}`)}`);
  run(`git tag ${tag}`);
  run('git push');
  run(`git push origin ${tag}`);

  const assets = collectReleaseAssets(path.resolve('dist'));
  if (assets.length === 0) {
    console.warn('\nNo release assets found under dist/. Creating tag release without attached binaries.');
  }

  const assetArgs = assets.map(quote).join(' ');
  const createReleaseCommand = [
    `gh release create ${tag}`,
    assetArgs,
    `--title ${quote(tag)}`,
    `--notes ${quote(`Release ${tag}`)}`,
  ]
    .filter(Boolean)
    .join(' ');

  run(createReleaseCommand);
  console.log(`\nRelease completed: ${tag}`);
} catch (error) {
  console.error('\nRelease automation failed. Resolve the error above and run again.');
  process.exit(1);
}