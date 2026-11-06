const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Ensures Apple Silicon (arm64) .app bundles always carry a valid ad-hoc signature
// when built without a paid Apple Developer ID certificate.
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.CSC_LINK) return; // Paid certificate already configured

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[after-pack] Applying ad-hoc codesign to ${appPath}...`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
};
