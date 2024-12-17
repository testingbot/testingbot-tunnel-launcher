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

	it('should correctly return an error when the tunnel returns an error', function(done) {
		this.timeout(10000);
		tunnelLauncher({ apiKey: 'fake', apiSecret: 'fake' }, function(err, tunnel) {
			assert.equal(tunnel, null);
			assert.equal(err.message, "Invalid credentials. Please supply the correct key/secret obtained from TestingBot.com");
			done();
		});
	});

	
	it('should correctly parse arguments', function(done) {
		// Test for tunnelIdentifier
		const args1 = tunnelLauncher.createArgs({ apiKey: 'fake', apiSecret: 'fake', tunnelIdentifier: 'my-tunnel' });
		assert.ok(args1.includes('--tunnel-identifier'), 'Tunnel identifier argument should be included');
		assert.ok(args1.includes('my-tunnel'), 'Tunnel identifier value should be included');

		// Test for debug flag (should only include if true)
		const args2 = tunnelLauncher.createArgs({ apiKey: 'fake', apiSecret: 'fake', debug: true });
		assert.ok(args2.includes('--debug'), 'Debug flag should be included when debug is true');

		// Test for debug flag being omitted (should not include if null)
		const args3 = tunnelLauncher.createArgs({ apiKey: 'fake', apiSecret: 'fake', debug: null });
		assert.ok(!args3.includes('--debug'), 'Debug flag should not be included when debug is null');

		// Test for noBump flag
		const args4 = tunnelLauncher.createArgs({ apiKey: 'fake', apiSecret: 'fake', noBump: true });
		assert.ok(args4.includes('--nobump'), 'NoBump flag should be included when noBump is true');

		// Test for noCache flag
		const args5 = tunnelLauncher.createArgs({ apiKey: 'fake', apiSecret: 'fake', noCache: true });
		assert.ok(args5.includes('--nocache'), 'NoCache flag should be included when noCache is true');

		// Test default flags
		const args6 = tunnelLauncher.createArgs({ apiKey: 'fake', apiSecret: 'fake' });
		assert.ok(!args6.includes('--nocache', '--nobump'));

		done();
	});
});