## Changelog

### v1.1.17
- Do not include the jar in the NPM package

### v1.1.16
- Improve the Java check to make sure it is available and at least JDK11
- Provide async/await functionality

### v1.1.15
- Wait up to 90 seconds for the tunnel to become ready. If it fails after 90 seconds, return an error

### v1.1.14
- Make sure the npm package contains the build folder

### v1.1.13
- Add support for `noBump`

### v1.1.12
- Improve error handling

### v1.1.11
- Add support for `tunnelIdentifier`
- Improve parsing of arguments passed to the tunnel

### v1.1.11
- Throw error when user does not have any minutes left

### v1.1.9
- Add corrupt download check for tunnel binary

### v1.1.8
- Update dependencies

### v1.1.0
- Get rid of exit handlers, they're causing issues
- Add tests
- Update dependencies

### v1.0.7
- Properly handle SIGINT, exit and uncaughtException

### v1.0.6
- Small fixes
- Display new version/invalid credentials

### v1.0.5
- Add `tunnelVersion` support to specify which version of the tunnel you want to use

### v1.0.1 - v1.0.4
- Minor fixes

### v1.0.0
- First release of testingbot-tunnel-launcher
