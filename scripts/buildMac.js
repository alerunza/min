// Modified for Svelto: app bundle and archive names; safe signing arguments (2026-10-09).
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const archiver = require('archiver')
const builder = require('electron-builder')
const Arch = builder.Arch

const packageFile = require('./../package.json')
const version = packageFile.version
const appBundle = packageFile.productName + '.app'
const platform = process.argv.find(arg => arg.match('platform')).split('=')[1]

function toArch (platform) {
  switch (platform) {
    case 'x86':
      return Arch.x64
    case 'arm64':
      return Arch.arm64
  }
}

require('./createPackage.js')('mac', { arch: toArch(platform) }).then(function (packagePath) {
  if (platform === 'arm64') {
    execFileSync('codesign', ['-s', '-', '-a', 'arm64', '-f', '--deep', path.join(packagePath, appBundle)])
  }

  /* create output directory if it doesn't exist */

  if (!fs.existsSync('dist/app')) {
    fs.mkdirSync('dist/app')
  }

  /* create zip file */

  var output = fs.createWriteStream('dist/app/svelto-v' + version + '-mac-' + platform + '.zip')
  var archive = archiver('zip', {
    zlib: { level: 9 }
  })

  archive.directory(path.resolve(packagePath, appBundle), appBundle)

  archive.pipe(output)
  archive.finalize()
})
