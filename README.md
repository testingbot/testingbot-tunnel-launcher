# testingbot-tunnel-launcher

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

You can also create a ~/.testingbot file with apiKey:apiSecret as content


## Testing

```
npm test
```

## Changelog

### v1.0.6
- Small fixes
- Display new version/invalid credentials

### v1.0.5
- Add `tunnelVersion` support to specify which version of the tunnel you want to use

### v1.0.1 - v1.0.4
- Minor fixes

### v1.0.0
- First release of testingbot-tunnel-launcher



## License

(The MIT License)

Copyright (c) TestingBot &lt;info@testingbot.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
