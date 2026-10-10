// Modified for Svelto: signing arguments support paths containing spaces (2026-10-09).
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const { execFileSync } = require('child_process')

// Note: these fuses should match those defined in createPackage.js
flipFuses(require('electron'), {
  version: FuseVersion.V1,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false
})
  .then(() => {
    // macOS ARM always requires a valid code signature
    if (process.platform === 'darwin' && process.arch === 'arm64') {
      execFileSync('codesign', ['-s', '-', '-a', 'arm64', '-f', '--deep', require('electron')])
    }
  })
