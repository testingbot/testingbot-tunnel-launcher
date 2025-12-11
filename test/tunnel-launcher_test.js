const tunnelLauncher = require('./../build/tunnel-launcher');
const assert = require('assert');

describe('Java Version Check', function() {
	describe('checkJava', function() {
		it('should resolve with version when Java is installed', async function() {
			this.timeout(10000);
			const result = await tunnelLauncher.checkJava();
			assert.ok(result.version >= 11, `Expected Java version >= 11, got ${result.version}`);
		});
	});

	describe('parseJavaVersion', function() {
		it('should parse Java 8 version string', function() {
			const output = 'java version "1.8.0_301"\nJava(TM) SE Runtime Environment (build 1.8.0_301-b09)';
			assert.equal(tunnelLauncher.parseJavaVersion(output), 1);
		});

		it('should parse Java 11 version string', function() {
			const output = 'openjdk version "11.0.12" 2021-07-20\nOpenJDK Runtime Environment';
			assert.equal(tunnelLauncher.parseJavaVersion(output), 11);
		});

		it('should parse Java 17 version string', function() {
			const output = 'openjdk version "17.0.1" 2021-10-19\nOpenJDK Runtime Environment';
			assert.equal(tunnelLauncher.parseJavaVersion(output), 17);
		});

		it('should parse Java 21 version string', function() {
			const output = 'openjdk version "21" 2023-09-19\nOpenJDK Runtime Environment';
			assert.equal(tunnelLauncher.parseJavaVersion(output), 21);
		});

		it('should return null for invalid version string', function() {
			const output = 'some random output';
			assert.equal(tunnelLauncher.parseJavaVersion(output), null);
		});

		it('should return null for empty string', function() {
			assert.equal(tunnelLauncher.parseJavaVersion(''), null);
		});
	});

	describe('validateJavaVersion', function() {
		it('should reject Java 8', function() {
			const output = 'java version "1.8.0_301"';
			const result = tunnelLauncher.validateJavaVersion(output);
			assert.equal(result.valid, false);
			assert.equal(result.version, 1);
			assert.ok(result.error.includes('Java 1 is installed'));
			assert.ok(result.error.includes('Java 11 or higher is required'));
		});

		it('should reject Java 10', function() {
			const output = 'openjdk version "10.0.2"';
			const result = tunnelLauncher.validateJavaVersion(output);
			assert.equal(result.valid, false);
			assert.equal(result.version, 10);
			assert.ok(result.error.includes('Java 10 is installed'));
		});

		it('should accept Java 11', function() {
			const output = 'openjdk version "11.0.12" 2021-07-20';
			const result = tunnelLauncher.validateJavaVersion(output);
			assert.equal(result.valid, true);
			assert.equal(result.version, 11);
			assert.equal(result.error, null);
		});

		it('should accept Java 17', function() {
			const output = 'openjdk version "17.0.1" 2021-10-19';
			const result = tunnelLauncher.validateJavaVersion(output);
			assert.equal(result.valid, true);
			assert.equal(result.version, 17);
			assert.equal(result.error, null);
		});

		it('should accept Java 21', function() {
			const output = 'openjdk version "21" 2023-09-19';
			const result = tunnelLauncher.validateJavaVersion(output);
			assert.equal(result.valid, true);
			assert.equal(result.version, 21);
			assert.equal(result.error, null);
		});

		it('should return error for unparseable version', function() {
			const output = 'not a java version';
			const result = tunnelLauncher.validateJavaVersion(output);
			assert.equal(result.valid, false);
			assert.equal(result.version, null);
			assert.ok(result.error.includes('Could not determine Java version'));
		});
	});
});

describe('Tunnel Launcher (callback API)', function() {

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

describe('Tunnel Launcher (async API)', function() {

	it('should reject when trying to kill a non-existing tunnel', async function() {
		try {
			await tunnelLauncher.killAsync();
			assert.fail('Expected killAsync to throw');
		} catch (err) {
			assert.equal(err.message, 'no active tunnel');
		}
	});

	it('should reject when trying to download a wrong tunnel version', async function() {
		try {
			await tunnelLauncher.downloadAndRunAsync({ tunnelVersion: 'wrong' });
			assert.fail('Expected downloadAndRunAsync to throw');
		} catch (err) {
			assert.equal(err.message, 'Could not download the tunnel from TestingBot - please check your connection. Could not download https://testingbot.com/tunnel/testingbot-tunnel-wrong.jar, statusCode: 404');
		}
	});

	it('should reject when the tunnel returns an error', async function() {
		this.timeout(10000);
		try {
			await tunnelLauncher.downloadAndRunAsync({ apiKey: 'fake', apiSecret: 'fake' });
			assert.fail('Expected downloadAndRunAsync to throw');
		} catch (err) {
			assert.equal(err.message, 'Invalid credentials. Please supply the correct key/secret obtained from TestingBot.com');
		}
	});
});