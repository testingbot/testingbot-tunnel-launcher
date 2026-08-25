const tunnelLauncher = require('./../lib/tunnel-launcher');
const assert = require('assert');
const os = require('os');

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

describe('Options Validation', function() {
	describe('validateOptions', function() {
		it('should accept valid options', function() {
			// Should not throw
			tunnelLauncher.validateOptions({ apiKey: 'key', apiSecret: 'secret' });
			tunnelLauncher.validateOptions({ apiKey: 'key', apiSecret: 'secret', tunnelIdentifier: 'my-tunnel' });
			tunnelLauncher.validateOptions({ apiKey: 'key', apiSecret: 'secret', tunnelVersion: '4.0' });
			tunnelLauncher.validateOptions({ apiKey: 'key', apiSecret: 'secret', timeout: 120 });
			tunnelLauncher.validateOptions({}); // Empty options should be valid
		});

		it('should reject non-string apiKey', function() {
			assert.throws(() => {
				tunnelLauncher.validateOptions({ apiKey: 123 });
			}, /apiKey must be a string/);
		});

		it('should reject non-string apiSecret', function() {
			assert.throws(() => {
				tunnelLauncher.validateOptions({ apiSecret: 123 });
			}, /apiSecret must be a string/);
		});

		it('should reject empty apiKey', function() {
			assert.throws(() => {
				tunnelLauncher.validateOptions({ apiKey: '' });
			}, /apiKey cannot be empty/);
			assert.throws(() => {
				tunnelLauncher.validateOptions({ apiKey: '   ' });
			}, /apiKey cannot be empty/);
		});

		it('should reject empty apiSecret', function() {
			assert.throws(() => {
				tunnelLauncher.validateOptions({ apiSecret: '' });
			}, /apiSecret cannot be empty/);
		});

		it('should reject non-string tunnelVersion', function() {
			assert.throws(() => {
				tunnelLauncher.validateOptions({ tunnelVersion: 4.0 });
			}, /tunnelVersion must be a string/);
		});

		it('should reject non-string tunnelIdentifier', function() {
			assert.throws(() => {
				tunnelLauncher.validateOptions({ tunnelIdentifier: 123 });
			}, /tunnelIdentifier must be a string/);
		});

		it('should reject invalid timeout', function() {
			assert.throws(() => {
				tunnelLauncher.validateOptions({ timeout: 'fast' });
			}, /timeout must be a positive number/);
			assert.throws(() => {
				tunnelLauncher.validateOptions({ timeout: -10 });
			}, /timeout must be a positive number/);
			assert.throws(() => {
				tunnelLauncher.validateOptions({ timeout: 0 });
			}, /timeout must be a positive number/);
		});

		it('should reject non-boolean shared', function() {
			assert.throws(() => {
				tunnelLauncher.validateOptions({ shared: 'true' });
			}, /shared must be a boolean/);
			assert.throws(() => {
				tunnelLauncher.validateOptions({ shared: 1 });
			}, /shared must be a boolean/);
		});

		it('should accept boolean shared', function() {
			// Should not throw
			tunnelLauncher.validateOptions({ shared: true });
			tunnelLauncher.validateOptions({ shared: false });
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

		// Test for shared flag
		const args6 = tunnelLauncher.createArgs({ apiKey: 'fake', apiSecret: 'fake', shared: true });
		assert.ok(args6.includes('--shared'), 'Shared flag should be included when shared is true');

		// Test for shared flag being omitted (should not include if false)
		const args7 = tunnelLauncher.createArgs({ apiKey: 'fake', apiSecret: 'fake', shared: false });
		assert.ok(!args7.includes('--shared'), 'Shared flag should not be included when shared is false');

		// Test default flags
		const args8 = tunnelLauncher.createArgs({ apiKey: 'fake', apiSecret: 'fake' });
		assert.ok(!args8.includes('--nocache', '--nobump', '--shared'));

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

describe('redactCredentials', function() {
	const options = { apiKey: 'a'.repeat(32), apiSecret: 'b'.repeat(32) };

	it('should redact the key and secret from an argument list', function() {
		const args = ['-jar', 'tunnel.jar', options.apiKey, options.apiSecret, '--tunnel-identifier', 'my-tunnel'];
		const redacted = tunnelLauncher.redactCredentials(args, options);
		assert.ok(!redacted.includes(options.apiKey));
		assert.ok(!redacted.includes(options.apiSecret));
		assert.equal(redacted.filter(arg => arg === '***').length, 2);
		assert.ok(redacted.includes('my-tunnel'));
	});

	it('should redact the key and secret from tunnel output', function() {
		const line = `Using ${options.apiKey}:${options.apiSecret} to connect`;
		assert.equal(tunnelLauncher.redactCredentials(line, options), 'Using ***:*** to connect');
	});

	it('should leave output untouched when no credentials are given', function() {
		assert.equal(tunnelLauncher.redactCredentials('hello', {}), 'hello');
		assert.equal(tunnelLauncher.redactCredentials('hello', { apiKey: '  ' }), 'hello');
	});
});

describe('credentials in the environment', function() {
	const options = { apiKey: 'a'.repeat(32), apiSecret: 'b'.repeat(32) };

	it('should not pass the key and secret as arguments', function() {
		const args = tunnelLauncher.createArgs({ ...options, tunnelIdentifier: 'my-tunnel' });
		assert.ok(!args.includes(options.apiKey), 'apiKey should not be passed as an argument');
		assert.ok(!args.includes(options.apiSecret), 'apiSecret should not be passed as an argument');
		assert.ok(args.includes('my-tunnel'), 'Other options should still be passed as arguments');
	});

	it('should pass the key and secret through the environment', function() {
		const env = tunnelLauncher.createEnv(options);
		assert.equal(env.TESTINGBOT_KEY, options.apiKey);
		assert.equal(env.TESTINGBOT_SECRET, options.apiSecret);
		assert.equal(env.PATH, process.env.PATH, 'The existing environment should be inherited');
	});

	it('should not set the variables when no credentials are given', function() {
		const env = tunnelLauncher.createEnv({});
		assert.ok(!('TESTINGBOT_KEY' in env));
		assert.ok(!('TESTINGBOT_SECRET' in env));
	});
});

describe('isJarValid', function() {
	const path = require('path');
	const fs = require('fs');
	const jarLocation = path.join(__dirname, '..', 'testingbot-tunnel.jar');

	it('should accept a working jar', async function() {
		this.timeout(30000);
		if (!fs.existsSync(jarLocation)) {
			this.skip();
		}
		assert.equal(await tunnelLauncher.isJarValid(jarLocation), true);
	});

	it('should accept a working jar when the JVM writes to stderr', async function() {
		this.timeout(30000);
		if (!fs.existsSync(jarLocation)) {
			this.skip();
		}
		// The JVM prints 'Picked up JAVA_TOOL_OPTIONS' to stderr, which is not a sign of a corrupt jar
		const previous = process.env.JAVA_TOOL_OPTIONS;
		process.env.JAVA_TOOL_OPTIONS = '-Xmx512m';
		try {
			assert.equal(await tunnelLauncher.isJarValid(jarLocation), true);
		} finally {
			if (previous === undefined) {
				delete process.env.JAVA_TOOL_OPTIONS;
			} else {
				process.env.JAVA_TOOL_OPTIONS = previous;
			}
		}
	});

	it('should reject a corrupt jar', async function() {
		this.timeout(30000);
		const corruptJar = path.join(os.tmpdir(), `corrupt-${process.pid}.jar`);
		fs.writeFileSync(corruptJar, 'this is not a jar file');
		try {
			assert.equal(await tunnelLauncher.isJarValid(corruptJar), false);
		} finally {
			fs.unlinkSync(corruptJar);
		}
	});
});

describe('readyfile', function() {
	const fs = require('fs');
	const path = require('path');

	it('should give every tunnel its own readyfile', async function() {
		const first = await tunnelLauncher.createReadyFilePath();
		const second = await tunnelLauncher.createReadyFilePath();

		try {
			assert.notEqual(first, second, 'Two tunnels should not share a readyfile');
			assert.notEqual(path.dirname(first), path.dirname(second), 'Two tunnels should not share a directory');
			assert.equal(path.basename(first), 'testingbot.ready');
			assert.ok(fs.existsSync(path.dirname(first)), 'The directory should be created upfront');
			assert.ok(!fs.existsSync(first), 'The readyfile itself is written by the tunnel');
		} finally {
			await tunnelLauncher.removeReadyFilePath(first);
			await tunnelLauncher.removeReadyFilePath(second);
		}
	});

	it('should create the readyfile inside the temp directory', async function() {
		const readyFile = await tunnelLauncher.createReadyFilePath();
		try {
			assert.ok(readyFile.startsWith(os.tmpdir()), `Expected ${readyFile} to live in ${os.tmpdir()}`);
		} finally {
			await tunnelLauncher.removeReadyFilePath(readyFile);
		}
	});

	it('should remove the readyfile and its directory', async function() {
		const readyFile = await tunnelLauncher.createReadyFilePath();
		fs.writeFileSync(readyFile, '');

		await tunnelLauncher.removeReadyFilePath(readyFile);

		assert.ok(!fs.existsSync(readyFile));
		assert.ok(!fs.existsSync(path.dirname(readyFile)));
	});

	it('should not throw when the directory is already gone', async function() {
		const readyFile = await tunnelLauncher.createReadyFilePath();
		await tunnelLauncher.removeReadyFilePath(readyFile);
		await tunnelLauncher.removeReadyFilePath(readyFile);
	});
});

describe('stopProcess', function() {
	const { spawn } = require('child_process');

	it('should only resolve once the process is gone', async function() {
		const proc = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
		await new Promise(resolve => proc.once('spawn', resolve));

		await tunnelLauncher.stopProcess(proc);

		assert.ok(proc.exitCode !== null || proc.signalCode !== null, 'The process should have exited');
		assert.equal(proc.killed, true);
	});

	it('should kill a process that ignores SIGINT', async function() {
		this.timeout(10000);
		const script = "process.on('SIGINT', () => {}); setInterval(() => {}, 1000); console.log('ready')";
		const proc = spawn(process.execPath, ['-e', script]);
		// Wait for the handler to be installed, otherwise SIGINT still kills the process
		await new Promise(resolve => proc.stdout.once('data', resolve));

		const start = Date.now();
		await tunnelLauncher.stopProcess(proc, 500);

		assert.equal(proc.signalCode, 'SIGKILL', 'The process should have been killed');
		assert.ok(Date.now() - start >= 500, 'The grace period should be respected');
	});

	it('should resolve for a process that already exited', async function() {
		const proc = spawn(process.execPath, ['-e', '']);
		await new Promise(resolve => proc.once('close', resolve));

		await tunnelLauncher.stopProcess(proc);
	});
});

describe('createArgs option handling', function() {
	it('should pass numeric options with their value', function() {
		const args = tunnelLauncher.createArgs({ apiKey: 'k', apiSecret: 's', 'se-port': 4445 });
		assert.ok(args.includes('--se-port'), 'The option should be included');
		assert.equal(args[args.indexOf('--se-port') + 1], '4445', 'The value should follow the option');
	});

	it('should not pass launcher options on to the tunnel', function() {
		// The tunnel does not know --timeout and refuses to start when it is passed
		const args = tunnelLauncher.createArgs({ apiKey: 'k', apiSecret: 's', timeout: 120 });
		assert.ok(!args.includes('--timeout'), 'timeout is handled by the launcher itself');
	});

	it('should skip empty and unset options', function() {
		const args = tunnelLauncher.createArgs({ apiKey: 'k', apiSecret: 's', logfile: '', proxy: null, dns: undefined });
		assert.ok(!args.includes('--logfile'));
		assert.ok(!args.includes('--proxy'));
		assert.ok(!args.includes('--dns'));
	});

	it('should pass booleans as a flag without a value', function() {
		const args = tunnelLauncher.createArgs({ apiKey: 'k', apiSecret: 's', shared: true, noCache: false });
		assert.ok(args.includes('--shared'));
		assert.ok(!args.includes('--nocache'));
		assert.equal(args[args.indexOf('--shared') + 1], undefined, 'A flag should not be followed by a value');
	});
});

describe('jar location', function() {
	const fs = require('fs');
	const path = require('path');
	const crypto = require('crypto');

	const cacheDirVariable = process.env.TESTINGBOT_TUNNEL_CACHE_DIR;

	afterEach(function() {
		if (cacheDirVariable === undefined) {
			delete process.env.TESTINGBOT_TUNNEL_CACHE_DIR;
		} else {
			process.env.TESTINGBOT_TUNNEL_CACHE_DIR = cacheDirVariable;
		}
	});

	function tempDir(mode) {
		const dir = path.join(os.tmpdir(), `tb_${crypto.randomBytes(6).toString('hex')}`);
		fs.mkdirSync(dir, { recursive: true });
		if (mode !== undefined) {
			fs.chmodSync(dir, mode);
		}
		return dir;
	}

	it('should keep the jar in the package by default', function() {
		const locations = tunnelLauncher.jarLocations('testingbot-tunnel.jar');
		assert.equal(locations[0], path.join(tunnelLauncher.packageDirectory(), 'testingbot-tunnel.jar'));
		assert.equal(path.dirname(locations[1]), tunnelLauncher.cacheDirectory());
	});

	it('should use the cache directory from the environment', function() {
		process.env.TESTINGBOT_TUNNEL_CACHE_DIR = path.join(os.tmpdir(), 'tb-cache');
		assert.equal(tunnelLauncher.cacheDirectory(), path.join(os.tmpdir(), 'tb-cache'));
		assert.equal(tunnelLauncher.jarLocations('a.jar')[1], path.join(os.tmpdir(), 'tb-cache', 'a.jar'));
	});

	it('should point the cache directory at the home directory of the user', function() {
		delete process.env.TESTINGBOT_TUNNEL_CACHE_DIR;
		const cacheDir = tunnelLauncher.cacheDirectory();
		assert.equal(path.basename(cacheDir), 'testingbot-tunnel-launcher');
		assert.ok(path.isAbsolute(cacheDir), 'The cache directory should be an absolute path');
	});

	it('should recognize a directory that can not be written to', function() {
		if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
			this.skip();
		}

		const writable = tempDir();
		const readOnly = tempDir(0o555);

		try {
			assert.equal(tunnelLauncher.isWritableDirectory(writable), true);
			assert.equal(tunnelLauncher.isWritableDirectory(readOnly), false);
			assert.equal(tunnelLauncher.isWritableDirectory(path.join(readOnly, 'nope')), false);
		} finally {
			fs.chmodSync(readOnly, 0o755);
			fs.rmSync(writable, { recursive: true, force: true });
			fs.rmSync(readOnly, { recursive: true, force: true });
		}
	});

	it('should fall back to the next location when the first one is read only', function() {
		if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
			this.skip();
		}

		const readOnly = tempDir(0o555);
		const writable = tempDir();

		try {
			const location = tunnelLauncher.writableJarLocation('testingbot-tunnel.jar', [
				path.join(readOnly, 'testingbot-tunnel.jar'),
				path.join(writable, 'testingbot-tunnel.jar')
			]);
			assert.equal(location, path.join(writable, 'testingbot-tunnel.jar'));
		} finally {
			fs.chmodSync(readOnly, 0o755);
			fs.rmSync(readOnly, { recursive: true, force: true });
			fs.rmSync(writable, { recursive: true, force: true });
		}
	});

	it('should create the location it downloads to', function() {
		const parent = tempDir();
		const target = path.join(parent, 'nested', 'testingbot-tunnel.jar');

		try {
			assert.equal(tunnelLauncher.writableJarLocation('testingbot-tunnel.jar', [target]), target);
			assert.ok(fs.existsSync(path.dirname(target)), 'The directory should be created');
		} finally {
			fs.rmSync(parent, { recursive: true, force: true });
		}
	});

	it('should explain itself when no location can be written to', function() {
		if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
			this.skip();
		}

		const readOnly = tempDir(0o555);

		try {
			assert.throws(
				() => tunnelLauncher.writableJarLocation('testingbot-tunnel.jar', [path.join(readOnly, 'testingbot-tunnel.jar')]),
				/TESTINGBOT_TUNNEL_CACHE_DIR/
			);
		} finally {
			fs.chmodSync(readOnly, 0o755);
			fs.rmSync(readOnly, { recursive: true, force: true });
		}
	});
});

describe('createLineReader', function() {
	it('should join a line that arrives in pieces', function() {
		const lines = [];
		const read = tunnelLauncher.createLineReader(line => lines.push(line));

		// The tunnel writes in chunks, a message can be split anywhere
		read('An error ocurred: 401 Una');
		read('uthorized. Please supply the correct API key\n');

		assert.deepEqual(lines, ['An error ocurred: 401 Unauthorized. Please supply the correct API key']);
	});

	it('should hand out one line at a time', function() {
		const lines = [];
		const read = tunnelLauncher.createLineReader(line => lines.push(line));

		read('first\nsecond\nthird\n');

		assert.deepEqual(lines, ['first', 'second', 'third']);
	});

	it('should keep an unfinished line until it is complete', function() {
		const lines = [];
		const read = tunnelLauncher.createLineReader(line => lines.push(line));

		read('finished\nunfinished');
		assert.deepEqual(lines, ['finished'], 'An unfinished line should not be handed out yet');

		read(' after all\n');
		assert.deepEqual(lines, ['finished', 'unfinished after all']);
	});

	it('should hand out the last line on flush', function() {
		const lines = [];
		const read = tunnelLauncher.createLineReader(line => lines.push(line));

		read('no line ending here');
		read.flush();
		read.flush();

		assert.deepEqual(lines, ['no line ending here'], 'Flushing twice should not repeat the line');
	});

	it('should handle windows line endings and buffers', function() {
		const lines = [];
		const read = tunnelLauncher.createLineReader(line => lines.push(line));

		read(Buffer.from('first\r\nsecond\r\n'));

		assert.deepEqual(lines, ['first', 'second']);
	});
});

describe('running several tunnels', function() {
	const fs = require('fs');
	const path = require('path');
	const crypto = require('crypto');

	function corruptJar() {
		const jar = path.join(os.tmpdir(), `not_a_jar_${crypto.randomBytes(6).toString('hex')}.jar`);
		fs.writeFileSync(jar, 'this is not a jar file');
		return jar;
	}

	function readyFileDirectories() {
		return fs.readdirSync(os.tmpdir()).filter(entry => entry.startsWith('testingbot-tunnel-'));
	}

	it('should use the jar it is given instead of the last one downloaded', function() {
		const args = tunnelLauncher.createArgs({ apiKey: 'k', apiSecret: 's' }, '/somewhere/else.jar');
		assert.equal(args[args.indexOf('-jar') + 1], '/somewhere/else.jar');
	});

	it('should report the location of the jar it downloaded', async function() {
		this.timeout(120000);
		const jarLocation = await tunnelLauncher.downloadAsync({});
		assert.ok(jarLocation, 'The location of the jar should be returned');
		assert.ok(fs.existsSync(jarLocation), `Expected a jar at ${jarLocation}`);
	});

	it('should keep the state of tunnels started next to each other apart', async function() {
		this.timeout(60000);
		const jar = corruptJar();
		const before = readyFileDirectories();

		try {
			// Neither tunnel can start, both should be told about their own failure
			const results = await Promise.allSettled([
				tunnelLauncher.startTunnelAsync({ apiKey: 'k', apiSecret: 's' }, jar),
				tunnelLauncher.startTunnelAsync({ apiKey: 'k', apiSecret: 's' }, jar)
			]);

			assert.deepEqual(results.map(result => result.status), ['rejected', 'rejected']);
			for (const result of results) {
				assert.ok(result.reason.message.includes('Could not start TestingBot Tunnel'), `Unexpected error: ${result.reason.message}`);
			}

			assert.deepEqual(tunnelLauncher.activeTunnels(), [], 'No tunnel should be left behind');
			assert.deepEqual(readyFileDirectories(), before, 'The readyfile directories should be cleaned up');
		} finally {
			fs.unlinkSync(jar);
		}
	});

	it('should reject killAsync when no tunnel is running', async function() {
		await assert.rejects(() => tunnelLauncher.killAsync(), /no active tunnel/);
	});

	it('should do nothing when killing all tunnels while none are running', async function() {
		await tunnelLauncher.killAllAsync();
		assert.deepEqual(tunnelLauncher.activeTunnels(), []);
	});
});

describe('stopTunnelsSync', function() {
	const { spawn } = require('child_process');
	const fs = require('fs');
	const path = require('path');

	it('should stop a tunnel and clean up its readyfile', async function() {
		const readyFile = await tunnelLauncher.createReadyFilePath();
		const proc = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
		proc.readyFile = readyFile;
		await new Promise(resolve => proc.once('spawn', resolve));

		const exited = new Promise(resolve => proc.once('exit', (code, signal) => resolve(signal)));
		tunnelLauncher.stopTunnelsSync([proc]);

		assert.equal(await exited, 'SIGINT', 'The tunnel should have been asked to stop');
		assert.ok(!fs.existsSync(path.dirname(readyFile)), 'The readyfile directory should be gone');
	});

	it('should not throw for a tunnel that is already gone', async function() {
		const proc = spawn(process.execPath, ['-e', '']);
		await new Promise(resolve => proc.once('close', resolve));

		tunnelLauncher.stopTunnelsSync([proc]);
	});

	it('should stop tunnels when the process it runs in exits', async function() {
		this.timeout(60000);
		const jar = path.join(os.tmpdir(), `not_a_jar_${Date.now()}.jar`);
		fs.writeFileSync(jar, 'this is not a jar file');

		const before = process.listeners('exit').length;

		try {
			// The tunnel can not start, but it is registered while it runs
			await Promise.allSettled([
				tunnelLauncher.startTunnelAsync({ apiKey: 'k', apiSecret: 's' }, jar),
				tunnelLauncher.startTunnelAsync({ apiKey: 'k', apiSecret: 's' }, jar)
			]);

			const added = process.listeners('exit').length - before;
			assert.ok(added <= 1, `Expected at most one handler to be added, got ${added}`);
			assert.ok(process.listeners('exit').length >= 1, 'A handler should be registered to stop tunnels on exit');
		} finally {
			fs.unlinkSync(jar);
		}
	});
});
