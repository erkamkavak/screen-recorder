const fs = require("node:fs/promises");
const path = require("node:path");

const SANDBOX = "chrome-sandbox";

async function fixSandbox(context) {
  const sandboxPath = path.join(context.appOutDir, SANDBOX);
  try {
    await fs.access(sandboxPath);
    await fs.chmod(sandboxPath, 0o4755);
    await fs.chown(sandboxPath, 0, 0);
    console.log(`Fixed ${SANDBOX} permissions inside ${context.appOutDir}`);
  } catch (error) {
    console.warn(`Could not adjust ${SANDBOX}: ${error.message}`);
  }
}

module.exports = fixSandbox;