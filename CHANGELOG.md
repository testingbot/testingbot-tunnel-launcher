## Changelog

### v1.1.20
- Report what the tunnel says when it can not start. Only wrong credentials and an account without minutes were passed on, so the most common first failure, `You already have N tunnels active - please close another tunnel first`, reached the caller as `Could not start TestingBot Tunnel. Exit code 1`. Everything the TestingBot API refuses is passed on now, in the wording of the tunnel

### v1.1.19
- Update the development dependencies, `npm audit` reports no vulnerabilities anymore
- Pass the credentials to the tunnel via the `TESTINGBOT_KEY`/`TESTINGBOT_SECRET` environment variables instead of the command line, so they no longer appear in the process list
- Redact the key and secret from the output when `verbose` is enabled
- Do not redownload the jar when the JVM writes to stderr, for example when `JAVA_TOOL_OPTIONS` is set
- Give every tunnel its own readyfile, so tunnels running next to each other no longer interfere with each other
- `killAsync` now resolves once the tunnel has really exited, and kills the tunnel when it does not stop in time
- Pass numeric options such as `se-port` with their value, and no longer pass `timeout` on to the tunnel, which refused to start because of it
- Fix the type definitions, which did not compile because of the `export =` assignment
- Refuse redirects that would download the jar over an unencrypted connection
- Time out downloads that stall instead of waiting forever
- Download to a temporary file and rename it, so an interrupted download never ends up as the jar
- Keep the state of every tunnel with the tunnel itself, tunnels started next to each other used to write over each other's state and `kill` left all but the last one running
- Add `killAllAsync` and `activeTunnels` for working with more than one tunnel
- Stop running tunnels when the process that started them exits, they used to keep running and leave their readyfile behind
- `downloadAsync` returns the location of the jar, `startTunnelAsync` and `createArgs` accept it
- Read the output of the tunnel line by line, messages such as `401 Unauthorized` were missed when they were split over two chunks
- Fall back to the cache directory of the user when the jar can not be stored in the package itself, which is the case for global installs and read-only images. `TESTINGBOT_TUNNEL_CACHE_DIR` overrides the location

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
