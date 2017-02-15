var tunnelLauncher = require('./../lib/tunnel-launcher');
var assert = require('assert');

describe('Tunnel Launcher', function() {
	it('should error when trying to kill a non-existing tunnel', function(done) {
		tunnelLauncher.kill(function(err) {
			assert.equal(err.message, 'no active tunnel');
			done();
		});
	});

	it('should error when trying to download a wrong tunnel version', function(done) {
		tunnelLauncher({ tunnelVersion: 'wrong' }, function(err, tunnel) {
			assert.equal(tunnel, null);
			assert.equal(err.message, 'Could not download the tunnel from TestingBot - please check your connection. Could not download https://testingbot.com/tunnel/testingbot-tunnel-wrong.jar, statusCode: 404');
			done();
		});
	});

});