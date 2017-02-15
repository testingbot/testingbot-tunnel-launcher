# testingbot-tunnel-launcher

[![Greenkeeper badge](https://badges.greenkeeper.io/testingbot/testingbot-tunnel-launcher.svg)](https://greenkeeper.io/)
[![npm](https://img.shields.io/npm/v/testingbot-tunnel-launcher.svg?maxAge=2592000)](https://www.npmjs.com/package/testingbot-tunnel-launcher)
[![dependencies Status](https://david-dm.org/testingbot/testingbot-tunnel-launcher/status.svg)](https://david-dm.org/testingbot/testingbot-tunnel-launcher)
[![devDependencies Status](https://david-dm.org/testingbot/testingbot-tunnel-launcher/dev-status.svg)](https://david-dm.org/testingbot/testingbot-tunnel-launcher?type=dev)
[![CircleCI](https://circleci.com/gh/testingbot/testingbot-tunnel-launcher.svg?style=shield)](https://circleci.com/gh/testingbot/testingbot-tunnel-launcher)

A library to download and launch TestingBot Tunnel.

## Installation

```sh
npm install testingbot-tunnel-launcher
```

## Usage


### Simple Usage

```javascript
var testingbotTunnel = require('testingbot-tunnel-launcher');

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

var testingbotTunnel = require('testingbot-tunnel-launcher'),
  options = {

    // The TestingBot API key which you can get for free, listed in our member area
    apiKey: 'key',

    // The TestingBot API secret which you can get for free, listed in our member area
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

    // Change the tunnel version - see versions on https://testingbot.com/support/other/tunnel
    tunnelVersion: "1.19" // or 2.1 (Java 8)
  };

testingbotTunnel(options, function(err, tunnel) {
  console.log("Started Tunnel");
  tunnel.close(function () {
    console.log("Closed tunnel");
  });
});

```

### Credentials

You can pass the TestingBot credentials as `apiKey` and `apiSecret` in the options.

You can also create a `~/.testingbot` file with `apiKey:apiSecret` as content


## Testing

```
npm test
```

## Changelog

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