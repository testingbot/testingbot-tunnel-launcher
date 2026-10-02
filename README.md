# testingbot-tunnel-launcher

[![npm](https://img.shields.io/npm/v/testingbot-tunnel-launcher.svg?maxAge=2592000)](https://www.npmjs.com/package/testingbot-tunnel-launcher)
[![Tests](https://github.com/testingbot/testingbot-tunnel-launcher/actions/workflows/test.yml/badge.svg)](https://github.com/testingbot/testingbot-tunnel-launcher/actions/workflows/test.yml)

A library to download and launch [TestingBot Tunnel](https://testingbot.com/support/tunnel).

## Installation

```sh
npm install testingbot-tunnel-launcher
```

## Usage


### Simple Usage (Callback)

```javascript
const testingbotTunnel = require('testingbot-tunnel-launcher');

testingbotTunnel({
  apiKey: process.env.TB_KEY,
  apiSecret: process.env.TB_SECRET,
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

### Simple Usage (Async/Await)

```javascript
const testingbotTunnel = require('testingbot-tunnel-launcher');

async function runTests() {
  try {
    const tunnel = await testingbotTunnel.downloadAndRunAsync({
      apiKey: process.env.TB_KEY,
      apiSecret: process.env.TB_SECRET,
      verbose: true
    });
    console.log("Tunnel ready");

    // Run your tests here...

    // Close the tunnel when done
    await testingbotTunnel.killAsync();
    console.log("Tunnel closed completely");
  } catch (err) {
    console.error(err.message);
  }
}

runTests();
```

### Options

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
  'se-port': 4445,

  // Proxy host and port the tunnel can use to connect to an upstream proxy
  // e.g. "localhost:1234" (optional)
  proxy: null,

  // A comma-separated list of domains that
  // will not go through the tunnel. (optional)
  'fast-fail-regexps': null,

  // Write logging output to this logfile (optional)
  logfile: null,

  // Change the tunnel version - see versions on https://testingbot.com/support/other/tunnel/changelog.html
  tunnelVersion: "5.0",

  // Gives this tunnel a unique identifier
  tunnelIdentifier: "myIdentifier",

  // Share this tunnel with other team members on TestingBot
  shared: true,

  // Timeout in seconds for the tunnel to start (default: 90)
  timeout: 120,

  // Disable SSL bumping/rewriting
  noBump: false,

  // Disable caching
  noCache: false
};

testingbotTunnel(options, function(err, tunnel) {
  console.log("Started Tunnel");
  tunnel.close(function () {
    console.log("Closed tunnel");
  });
});
```

Any other option is passed on to the tunnel as `--option value`, booleans as a flag without a value and lists pass the option once for every value.

### TestingBot Tunnel 5.0

[TestingBot Tunnel 5.0](https://github.com/testingbot/Testingbot-Tunnel/releases/tag/v5.0) requires **Java 17** or higher, older tunnels run on Java 11. The launcher asks the jar which version it is and checks for the Java version that version needs.

5.0 adds these options. Passing them to an older tunnel fails before it is started, with a message saying which option needs 5.0.

```javascript
const tunnel = await testingbotTunnel.downloadAndRunAsync({
  apiKey: process.env.TB_KEY,
  apiSecret: process.env.TB_SECRET,
  tunnelVersion: '5.0',

  // The Selenium relay, local proxy and metrics now listen on 127.0.0.1 only.
  // Use 0.0.0.0 when tests run on another machine than the tunnel.
  bindAddress: '0.0.0.0',

  // error, warn, info (default), debug or trace
  logLevel: 'info',
  // text (default) or json, the launcher understands both
  logFormat: 'text',
  // Which requests to log: none, url, headers or errors (default)
  logHttp: 'url',

  // Only allow these hosts through the tunnel, others get a 403
  allowHosts: 'example.com,*.example.com',
  // Do not bump SSL for these hosts
  noBumpDomains: 'bank.example.com',
  // Whether tests may reach localhost: allow (default) or deny
  localhostPolicy: 'allow',

  // Change request and response headers, a list passes the option for every entry
  header: ['X-Test: 1', '-Cookie'],
  responseHeader: '-Server',
  requestIdHeader: 'X-Request-Id',

  // Trust extra CA certificates (PEM)
  cacertFile: ['/etc/ssl/corporate.pem'],
  // Send connections for a host to another host
  connectTo: 'app.example.com:443:127.0.0.1:8443',

  // DNS: timeout in seconds and round robin over the servers in `dns`
  dnsTimeout: 5,
  dnsRoundRobin: false,

  // Timeouts in seconds
  httpDialTimeout: 15,
  httpIdleTimeout: 120,

  // Proxy for the connection to TestingBot itself, defaults to `proxy`
  proxyTestingbot: 'http://proxy.example.com:3128',
  proxyTestingbotUserpwd: 'user:pwd',
  // basic (default) or negotiate, with Kerberos
  proxyAuthScheme: 'basic',
  proxySpn: 'HTTP/proxy.example.com',
  krb5Principal: 'user@EXAMPLE.COM',
  krb5Keytab: '/etc/krb5.keytab',
  krb5Hosts: 'intranet.example.com',

  // Proxy autoconfiguration for the tunnel itself
  pacLocal: '/etc/proxy.pac',
  pacLocalSha256: '<sha256 of the pac file>',

  // Pin the SSH host key of TestingBot: warn (default) or require
  sshHostKey: 'SHA256:...',
  sshHostKeyPolicy: 'require',

  // How websockets are proxied: connect (default) or get
  wsProxyMode: 'connect',

  // Read options from a properties file
  config: '/etc/testingbot-tunnel.properties'
});
```

Tunnel 5.0 also reads every option from a `TESTINGBOT_` environment variable, for example `TESTINGBOT_SE_PORT` for `se-port`. The tunnel inherits the environment of your process, so such variables apply to tunnels started with this launcher as well. Options passed to the launcher take precedence.

### Credentials

You can pass the [TestingBot credentials](https://testingbot.com/members) as `apiKey` and `apiSecret` in the options.

You can also create a `~/.testingbot` file in your `$HOME` directory, with `apiKey:apiSecret` as contents.

The credentials are handed to the tunnel through the `TESTINGBOT_KEY` and `TESTINGBOT_SECRET` environment variables instead of the command line, so they do not show up in the process list. They are also redacted from the output when `verbose` is enabled.

### Running more than one tunnel

Every tunnel keeps its own state, so several tunnels can run next to each other. Give each one its own `tunnelIdentifier` and hold on to the tunnel you get back to close it:

```javascript
const first = await testingbotTunnel.downloadAndRunAsync({ ...options, tunnelIdentifier: 'first' });
const second = await testingbotTunnel.downloadAndRunAsync({ ...options, tunnelIdentifier: 'second' });

first.close();
await testingbotTunnel.killAllAsync();
```

`killAsync` closes the tunnel that was started last, `killAllAsync` closes all of them and `activeTunnels()` returns the ones that are still running.

### Where the tunnel is stored

The tunnel jar is downloaded into the directory of this package. When that directory can not be written to, which is the case for global installs and read-only images, it is stored in the cache directory of the user (`~/.cache/testingbot-tunnel-launcher` on Linux, `~/Library/Caches/testingbot-tunnel-launcher` on macOS and `%LOCALAPPDATA%` on Windows).

Set `TESTINGBOT_TUNNEL_CACHE_DIR` to store the jar somewhere else.


## Testing

```
npm test
```

## MIT license

Copyright (c) TestingBot &lt;info@testingbot.com&gt;