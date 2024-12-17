# testingbot-tunnel-launcher

[![npm](https://img.shields.io/npm/v/testingbot-tunnel-launcher.svg?maxAge=2592000)](https://www.npmjs.com/package/testingbot-tunnel-launcher)
[![Tests](https://github.com/testingbot/testingbot-tunnel-launcher/actions/workflows/test.yml/badge.svg)](https://github.com/testingbot/testingbot-tunnel-launcher/actions/workflows/test.yml)

A library to download and launch [TestingBot Tunnel](https://testingbot.com/support/other/tunnel).

## Installation

```sh
npm install testingbot-tunnel-launcher
```

## Usage


### Simple Usage

```javascript
const testingbotTunnel = require('testingbot-tunnel-launcher');

testingbotTunnel({
  apiKey: 'key',
  apiSecret: 'secret',
  verbose: true
}, function (err, tunnel) {
  if (err) {
    console.error(err.message);
    return;
  }
  console.log("Tunnel ready");

  tunnel.close(function () {
    console.log("Tunnel closed completely");
  })
});
```

### Advanced Usage

```javascript

const testingbotTunnel = require('testingbot-tunnel-launcher')
const options = {
  // The TestingBot API key which you can get for free, listed in the TestingBot member area
  apiKey: 'key',

  // The TestingBot API secret which you can get for free, listed in the TestingBot member area
  apiSecret: 'secret',

  // More verbose output from the tunnel
  verbose: true,

  // Port on which the tunnel Selenium relay will listen for
  // requests. Default 4445. (optional)
  se-port: null,

  // Proxy host and port the tunnel can use to connect to an upstream proxy
  // e.g. "localhost:1234" (optional)
  proxy: null,

  // a comma-separated list of domains that
  // will not go through the tunnel. (optional)
  fast-fail-regexps: null,

  // Write logging output to this logfile (optional)
  logfile: null,

  // Change the tunnel version - see versions on https://testingbot.com/support/other/tunnel/changelog.html
  tunnelVersion: "4.0",

  // Gives this tunnel a unique identifier
  tunnelIdentifier: "myIdentifier"
};

testingbotTunnel(options, function(err, tunnel) {
  console.log("Started Tunnel");
  tunnel.close(function () {
    console.log("Closed tunnel");
  });
});

```

### Credentials

You can pass the [TestingBot credentials](https://testingbot.com/members) as `apiKey` and `apiSecret` in the options.

You can also create a `.testingbot` file in your `$HOME` directory, with `apiKey:apiSecret` as contents.


## Testing

```
npm test
```

## Changelog

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


## MIT license

Copyright (c) TestingBot &lt;info@testingbot.com&gt;