const tunnelLauncher = require('./../lib/tunnel-launcher');
const fakeJava = require('./helpers/fake-java');
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

describe('bundledPlatform', function() {
	it('should name the platforms there is a download with Java included for', function() {
		assert.equal(tunnelLauncher.bundledPlatform('darwin', 'arm64'), 'macos-arm64');
		assert.equal(tunnelLauncher.bundledPlatform('darwin', 'x64'), 'macos-x64');
		assert.equal(tunnelLauncher.bundledPlatform('linux', 'x64'), 'linux-x64');
		assert.equal(tunnelLauncher.bundledPlatform('linux', 'arm64'), 'linux-arm64');
		assert.equal(tunnelLauncher.bundledPlatform('win32', 'x64'), 'windows-x64');
	});

	it('should return null for other platforms', function() {
		assert.equal(tunnelLauncher.bundledPlatform('win32', 'arm64'), null);
		assert.equal(tunnelLauncher.bundledPlatform('freebsd', 'x64'), null);
		assert.equal(tunnelLauncher.bundledPlatform('linux', 'ia32'), null);
	});
});

describe('bundledArchiveName', function() {
	it('should be a zip for Windows and a tar.gz otherwise', function() {
		assert.equal(tunnelLauncher.bundledArchiveName('windows-x64'), 'testingbot-tunnel-windows-x64.zip');
		assert.equal(tunnelLauncher.bundledArchiveName('linux-arm64'), 'testingbot-tunnel-linux-arm64.tar.gz');
	});
});

describe('parseChecksum', function() {
	const checksum = 'a'.repeat(64);

	it('should read the checksum the way sha256sum writes it', function() {
		assert.equal(tunnelLauncher.parseChecksum(`${checksum}  testingbot-tunnel-linux-x64.tar.gz\n`), checksum);
		assert.equal(tunnelLauncher.parseChecksum(`${checksum.toUpperCase()} *testingbot-tunnel-windows-x64.zip`), checksum);
		assert.equal(tunnelLauncher.parseChecksum(checksum), checksum);
	});

	it('should return null for anything else', function() {
		assert.equal(tunnelLauncher.parseChecksum('<html>not found</html>'), null);
		assert.equal(tunnelLauncher.parseChecksum(''), null);
	});
});

describe('javaRuntime option', function() {
	it('should accept auto, system and bundled', function() {
		for (const javaRuntime of ['auto', 'system', 'bundled']) {
			assert.doesNotThrow(() => tunnelLauncher.validateOptions({ javaRuntime }));
		}
	});

	it('should refuse anything else', function() {
		assert.throws(() => tunnelLauncher.validateOptions({ javaRuntime: 'java' }), {
			message: 'javaRuntime must be one of "auto", "system", "bundled"'
		});
	});

	it('should not be passed to the tunnel', function() {
		assert.deepEqual(tunnelLauncher.createArgs({ javaRuntime: 'bundled' }, 'tunnel.jar'), ['-jar', 'tunnel.jar']);
	});
});

// A local stand-in for the GitHub releases, serving a download with a fake java inside
describe('downloads with Java included', function() {
	const platformName = tunnelLauncher.bundledPlatform();
	const archiveName = platformName && tunnelLauncher.bundledArchiveName(platformName);

	let server;
	let releasesUrl;
	let archive;
	let checksum;
	let requests;
	let latestVersion;
	let cacheDirectory;
	let originalEnvironment;
	let originalPath;

	before(function(done) {
		// The fake java is a shell script, and Windows downloads are zip files
		if (process.platform === 'win32' || !platformName) {
			this.skip();
		}

		const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-fixture-'));
		const root = path.join(fixture, `testingbot-tunnel-${platformName}`);
		fakeJava.write(path.join(root, 'runtime', 'bin'));
		fs.mkdirSync(path.join(root, 'lib'));
		fs.writeFileSync(path.join(root, 'lib', 'testingbot-tunnel.jar'), 'not really a jar');

		archive = path.join(fixture, archiveName);
		execFileSync('tar', ['-czf', archive, '-C', fixture, path.basename(root)]);
		checksum = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');

		server = http.createServer((req, res) => {
			requests.push(req.url);

			if (req.url === '/latest') {
				if (!latestVersion) {
					res.writeHead(500);
					return res.end();
				}
				res.writeHead(302, { location: `/tag/v${latestVersion}` });
				return res.end();
			}

			const match = req.url.match(/^\/download\/v([^/]+)\/(.+)$/);
			if (match && match[1] === '9.9') {
				res.writeHead(404);
				return res.end('not found');
			}
			if (match && match[2] === archiveName) {
				const contents = fs.readFileSync(archive);
				res.writeHead(200, { 'Content-Length': String(contents.length) });
				return res.end(contents);
			}
			if (match && match[2] === `${archiveName}.sha256`) {
				res.writeHead(200);
				return res.end(`${checksum}  ${archiveName}\n`);
			}

			res.writeHead(404);
			res.end('not found');
		});
		server.listen(0, '127.0.0.1', () => {
			releasesUrl = `http://127.0.0.1:${server.address().port}`;
			done();
		});
	});

	beforeEach(function() {
		requests = [];
		latestVersion = '5.1';
		cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-cache-'));
		originalEnvironment = {
			TESTINGBOT_TUNNEL_CACHE_DIR: process.env.TESTINGBOT_TUNNEL_CACHE_DIR,
			TESTINGBOT_TUNNEL_RELEASES_URL: process.env.TESTINGBOT_TUNNEL_RELEASES_URL
		};
		originalPath = process.env.PATH;
		process.env.TESTINGBOT_TUNNEL_CACHE_DIR = cacheDirectory;
		process.env.TESTINGBOT_TUNNEL_RELEASES_URL = releasesUrl;
	});

	afterEach(async function() {
		this.timeout(30000);
		await tunnelLauncher.killAllAsync();
		process.env.PATH = originalPath;
		delete process.env.FAKE_JAVA;
		delete process.env.FAKE_JAVA_RUNTIME;
		for (const [name, value] of Object.entries(originalEnvironment)) {
			if (value === undefined) {
				delete process.env[name];
			} else {
				process.env[name] = value;
			}
		}
		fs.rmSync(cacheDirectory, { recursive: true, force: true });
	});

	after(function(done) {
		if (archive) {
			fs.rmSync(path.dirname(archive), { recursive: true, force: true });
		}
		server ? server.close(done) : done();
	});

	// A PATH holding what unpacking and the fake java need, but no java
	function pathWithoutJava() {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'no-java-'));
		for (const tool of ['tar', 'gzip', 'touch', 'sleep']) {
			try {
				const location = execFileSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).trim();
				fs.symlinkSync(location, path.join(directory, tool));
			} catch {
				// gzip is only needed by GNU tar
			}
		}
		return directory;
	}

	it('should download the latest version and unpack it in the cache directory', async function() {
		const bundle = await tunnelLauncher.downloadBundledAsync();

		assert.equal(bundle.version, '5.1');
		assert.equal(bundle.directory, path.join(cacheDirectory, 'bundles', `5.1-${platformName}`));
		assert.equal(bundle.java, path.join(bundle.directory, 'runtime', 'bin', 'java'));
		assert.equal(bundle.jar, path.join(bundle.directory, 'lib', 'testingbot-tunnel.jar'));
		assert.ok(fs.existsSync(bundle.java));
		assert.ok(fs.existsSync(bundle.jar));
		assert.deepEqual(fs.readdirSync(path.join(cacheDirectory, 'bundles')), [`5.1-${platformName}`], 'Nothing else should be left behind');
	});

	it('should download the tunnelVersion that is asked for', async function() {
		const bundle = await tunnelLauncher.downloadBundledAsync({ tunnelVersion: '5.0' });

		assert.equal(bundle.version, '5.0');
		assert.ok(requests.includes(`/download/v5.0/${archiveName}`));
		assert.ok(!requests.includes('/latest'), 'There is no need to look up the latest version');
	});

	it('should use a download that is already unpacked', async function() {
		await tunnelLauncher.downloadBundledAsync();
		requests = [];

		const bundle = await tunnelLauncher.downloadBundledAsync();

		assert.equal(bundle.version, '5.1');
		assert.deepEqual(requests, ['/latest'], 'Only the latest version should be looked up');
	});

	it('should use the newest download it has when the latest version can not be looked up', async function() {
		await tunnelLauncher.downloadBundledAsync({ tunnelVersion: '5.0' });
		await tunnelLauncher.downloadBundledAsync({ tunnelVersion: '5.10' });
		latestVersion = null;

		const bundle = await tunnelLauncher.downloadBundledAsync();

		assert.equal(bundle.version, '5.10');
	});

	it('should reject when the latest version can not be looked up and nothing was downloaded before', async function() {
		latestVersion = null;

		await assert.rejects(tunnelLauncher.downloadBundledAsync(), /Could not find the latest version of TestingBot Tunnel/);
	});

	it('should refuse a download that does not match its checksum', async function() {
		const realChecksum = checksum;
		checksum = 'b'.repeat(64);

		try {
			await assert.rejects(tunnelLauncher.downloadBundledAsync(), /does not match its published checksum/);
			assert.deepEqual(fs.readdirSync(path.join(cacheDirectory, 'bundles')), [], 'Nothing should be left behind');
		} finally {
			checksum = realChecksum;
		}
	});

	it('should refuse tunnels older than 5.0', async function() {
		await assert.rejects(tunnelLauncher.downloadBundledAsync({ tunnelVersion: '4.9' }), /TestingBot Tunnel 4.9 has no download with Java included/);
		assert.deepEqual(requests, []);
	});

	it('should report a version that was not published', async function() {
		await assert.rejects(tunnelLauncher.downloadBundledAsync({ tunnelVersion: '9.9' }), /Could not download TestingBot Tunnel 9.9 with Java included .*statusCode: 404/);
		assert.deepEqual(fs.readdirSync(path.join(cacheDirectory, 'bundles')), [], 'Nothing should be left behind');
	});

	it('should start the tunnel with the java it includes for javaRuntime "bundled"', async function() {
		this.timeout(15000);
		process.env.FAKE_JAVA = 'ready';

		const tunnel = await tunnelLauncher.downloadAndRunAsync({ javaRuntime: 'bundled', apiKey: 'key', apiSecret: 'secret' });

		assert.equal(tunnel.spawnfile, path.join(cacheDirectory, 'bundles', `5.1-${platformName}`, 'runtime', 'bin', 'java'));
	});

	it('should use the download with Java included when Java is not installed', async function() {
		this.timeout(15000);
		const onlyTar = pathWithoutJava();
		process.env.PATH = onlyTar;
		process.env.FAKE_JAVA = 'ready';

		try {
			const tunnel = await tunnelLauncher.downloadAndRunAsync({ apiKey: 'key', apiSecret: 'secret' });
			assert.equal(tunnel.spawnfile, path.join(cacheDirectory, 'bundles', `5.1-${platformName}`, 'runtime', 'bin', 'java'));
		} finally {
			fs.rmSync(onlyTar, { recursive: true, force: true });
		}
	});

	it('should not fall back for javaRuntime "system"', async function() {
		this.timeout(15000);
		const onlyTar = pathWithoutJava();
		process.env.PATH = onlyTar;

		try {
			await assert.rejects(tunnelLauncher.downloadAndRunAsync({ javaRuntime: 'system', tunnelVersion: '5.1', apiKey: 'key', apiSecret: 'secret' }), /Java might not be installed/);
			assert.ok(!requests.some(url => url.includes(archiveName)), 'Nothing should be downloaded from the releases');
		} finally {
			fs.rmSync(onlyTar, { recursive: true, force: true });
		}
	});

	it('should use the download with Java included when the installed Java is too old', async function() {
		this.timeout(180000);
		const java = fakeJava.install();
		process.env.FAKE_JAVA_RUNTIME = '11';
		process.env.FAKE_JAVA = 'ready';

		try {
			// The jar itself comes from TestingBot, the fake java accepts it
			const tunnel = await tunnelLauncher.downloadAndRunAsync({ tunnelVersion: '5.1', apiKey: 'key', apiSecret: 'secret' });
			assert.equal(tunnel.spawnfile, path.join(cacheDirectory, 'bundles', `5.1-${platformName}`, 'runtime', 'bin', 'java'));
		} finally {
			java.restore();
		}
	});
});

// Downloads the real thing, about 30 MB, so only when asked for
describe('the real download with Java included', function() {
	before(function() {
		if (!process.env.TESTINGBOT_TEST_BUNDLED || !tunnelLauncher.bundledPlatform()) {
			this.skip();
		}
	});

	it('should run the tunnel with the java it includes', async function() {
		this.timeout(300000);
		const bundle = await tunnelLauncher.downloadBundledAsync();

		const output = execFileSync(bundle.java, ['-jar', bundle.jar, '--version'], { encoding: 'utf8' });
		assert.ok(output.includes(`Version: testingbot-tunnel.jar ${bundle.version}`), output);
	});
});
