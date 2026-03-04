import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

const readLatestYmlInfo = (latestYmlPath) => {
  const latestYml = readFileSync(latestYmlPath, 'utf-8');
  const versionLine = latestYml.match(/^version:\s*(.+)$/m)?.[1]?.trim();
  const pathLine = latestYml.match(/^path:\s*(.+)$/m)?.[1]?.trim();

  if (!versionLine) {
    throw new Error('Unable to read version from dist/latest.yml.');
  }

  if (!pathLine) {
    throw new Error('Unable to read installer path from dist/latest.yml.');
  }

  return {
    version: versionLine,
    installerFileName: pathLine,
  };
};

const ensureVersionChanged = (previousVersion, nextVersion) => {
  if (previousVersion === nextVersion) {
    throw new Error(
      `Version did not change (${nextVersion}). Use a higher bump or provide a different exact version.`,
    );
  }
};

const verifyBuiltVersionArtifacts = (version) => {
  const latestYmlPath = path.resolve('dist', 'latest.yml');
  if (!existsSync(latestYmlPath)) {
    throw new Error(`Missing latest.yml at ${latestYmlPath}.`);
  }

  const latestYmlInfo = readLatestYmlInfo(latestYmlPath);

  if (latestYmlInfo.version !== version) {
    throw new Error(
      `latest.yml version mismatch. Expected ${version}, got ${latestYmlInfo.version}.`,
    );
  }

  const expectedInstaller = path.resolve('dist', latestYmlInfo.installerFileName);
  if (!existsSync(expectedInstaller)) {
    throw new Error(
      `Expected installer not found for version ${version}: ${expectedInstaller}. Build output version does not match latest.yml path.`,
    );
  }

  return latestYmlInfo;
};

const collectReleaseAssets = (rootDir, installerFileName) => {
  if (!existsSync(rootDir)) {
    return [];
  }

  const candidates = [
    path.join(rootDir, 'latest.yml'),
    path.join(rootDir, installerFileName),
    path.join(rootDir, `${installerFileName}.blockmap`),
  ];

  return candidates.filter((candidate) => existsSync(candidate));
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
  ensureVersionChanged(previousVersion, version);

  const tag = `v${version}`;
  console.log(`\nVersion bumped: ${previousVersion} -> ${version}`);

  run('npm run dist');
  const latestYmlInfo = verifyBuiltVersionArtifacts(version);

  run('git add package.json package-lock.json');
  run(`git commit -m ${quote(`release: ${tag}`)}`);
  run(`git tag ${tag}`);
  run('git push');
  run(`git push origin ${tag}`);

  const assets = collectReleaseAssets(path.resolve('dist'), latestYmlInfo.installerFileName);
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