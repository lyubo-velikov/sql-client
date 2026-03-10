const { execSync } = require('child_process')
const { join } = require('path')
const { existsSync, copyFileSync } = require('fs')

const electronApp = join(__dirname, '../node_modules/electron/dist/Electron.app/Contents')
const plist = join(electronApp, 'Info.plist')
const electronIcon = join(electronApp, 'Resources/electron.icns')
const ourIcon = join(__dirname, '../resources/icon.icns')

if (process.platform === 'darwin' && existsSync(plist)) {
  try {
    execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleName 'SQL Client'" "${plist}"`)
    execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'SQL Client'" "${plist}"`)
    console.log('Patched Electron.app name to "SQL Client"')
  } catch {
    console.warn('Could not patch Electron.app name')
  }

  try {
    if (existsSync(ourIcon)) {
      copyFileSync(ourIcon, electronIcon)
      console.log('Patched Electron.app icon')
    }
  } catch {
    console.warn('Could not patch Electron.app icon')
  }
}
