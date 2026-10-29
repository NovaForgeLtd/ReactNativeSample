const fs = require('fs');
const Module = require('module');
const originalLoader = Module._extensions['.js'];
Module._extensions['.js'] = function sideForgeExpoLoader(module, filename) {
  if (filename.endsWith('prebuild\\resolveOptions.js') || filename.endsWith('prebuild/resolveOptions.js')) {
    const source = fs.readFileSync(filename, 'utf8').replace(
      "process.platform === 'win32' && platforms.includes('ios')",
      "false && platforms.includes('ios')"
    );
    module._compile(source, filename);
    return;
  }
  originalLoader(module, filename);
};
