const tunnelLauncher = require('./../lib/tunnel-launcher');
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

describe('parseDoctorOutput', function() {
	it('should read the json log format', function() {
		const lines = [
			'{"timestamp":"2026-11-05T10:03:52.745Z","level":"INFO","logger":"com.testingbot.tunnel.Doctor","message":"Resolving https://testingbot.com"}',
			'{"timestamp":"2026-11-05T10:03:52.749Z","level":"INFO","logger":"com.testingbot.tunnel.Doctor","message":"OK - Resolved https://testingbot.com to 104.26.2.97"}',
			'{"timestamp":"2026-11-05T10:03:52.750Z","level":"SEVERE","logger":"com.testingbot.tunnel.Doctor","message":"Cannot open Selenium port 4445.\\nPerhaps another process is using this port?"}',
			'{"timestamp":"2026-11-05T10:03:52.751Z","level":"WARNING","logger":"com.testingbot.tunnel.Doctor","message":"WARN - the tunnel server\'s SSH host key will not be verified."}'
		];

		assert.deepEqual(tunnelLauncher.parseDoctorOutput(lines), [
			{ status: 'info', message: 'Resolving https://testingbot.com' },
			{ status: 'ok', message: 'Resolved https://testingbot.com to 104.26.2.97' },
			{ status: 'fail', message: 'Cannot open Selenium port 4445.\nPerhaps another process is using this port?' },
			{ status: 'warn', message: 'the tunnel server\'s SSH host key will not be verified.' }
		]);
	});

	it('should read the text log format', function() {
		const lines = [
			'Nov 05, 2026 11:03:51 AM com.testingbot.tunnel.Doctor performCheck',
			'INFO: OK - URL https://testingbot.com can be reached.',
			'Nov 05, 2026 11:03:52 AM com.testingbot.tunnel.Doctor checkOpenPorts',
			'SEVERE: Cannot open Selenium port 4445.',
			'Perhaps another process is using this port?',
			'Nov 05, 2026 11:03:52 AM com.testingbot.tunnel.Doctor checkSshHostKeyPins',
			'WARNING: WARN - the tunnel server\'s SSH host key will not be verified.'
		];

		assert.deepEqual(tunnelLauncher.parseDoctorOutput(lines), [
			{ status: 'ok', message: 'URL https://testingbot.com can be reached.' },
			{ status: 'fail', message: 'Cannot open Selenium port 4445.\nPerhaps another process is using this port?' },
			{ status: 'warn', message: 'the tunnel server\'s SSH host key will not be verified.' }
		]);
	});

	it('should ignore output that is not a log message', function() {
		assert.deepEqual(tunnelLauncher.parseDoctorOutput(['', 'something else', '{"not":"a record"}']), []);
	});
});

describe('parsePacTestOutput', function() {
	it('should read the result', function() {
		const lines = [
			'PAC file : /etc/proxy.pac',
			'URL      : https://a.example.com/x',
			'Host     : a.example.com',
			'Result   : PROXY proxy.local:3128; DIRECT',
			'Egress   : via proxy.local:3128'
		];

		assert.deepEqual(tunnelLauncher.parsePacTestOutput(lines), {
			pacFile: '/etc/proxy.pac',
			url: 'https://a.example.com/x',
			host: 'a.example.com',
			result: 'PROXY proxy.local:3128; DIRECT',
			egress: 'via proxy.local:3128',
			direct: false
		});
	});

	it('should know a direct connection', function() {
		const result = tunnelLauncher.parsePacTestOutput(['Result   : DIRECT', 'Egress   : direct connection']);
		assert.equal(result.direct, true);
	});

	it('should return null without a result', function() {
		assert.equal(tunnelLauncher.parsePacTestOutput(['PAC file not found: /etc/proxy.pac']), null);
	});
});

describe('pacTest options', function() {
	it('should need pacLocal', async function() {
		await assert.rejects(tunnelLauncher.pacTest({}, 'https://example.com/'), {
			message: 'pacTest needs the pacLocal option, the PAC file or URL to test'
		});
	});

	it('should need a URL', async function() {
		await assert.rejects(tunnelLauncher.pacTest({ pacLocal: '/etc/proxy.pac' }), {
			message: 'pacTest needs the URL to test'
		});
	});

	it('should refuse tunnels older than 5.0', async function() {
		this.timeout(60000);
		await assert.rejects(tunnelLauncher.pacTest({ tunnelVersion: '4.9', pacLocal: '/etc/proxy.pac' }, 'https://example.com/'), /pacLocal requires TestingBot Tunnel 5.0 or higher/);
	});
});

// A port nothing listens on
async function freePort() {
	const server = net.createServer();
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const port = server.address().port;
	await new Promise(resolve => server.close(resolve));
	return port;
}

describe('running the doctor and pacTest', function() {
	const tunnelVersion = '5.1';
	let directory;
	let pacFile;

	// Runs the real tunnel, which needs Java 17 or higher
	before(async function() {
		this.timeout(180000);
		const java = await tunnelLauncher.checkJava();
		if (java.version === null || java.version < 17) {
			this.skip();
		}
		await tunnelLauncher.downloadAsync({ tunnelVersion });

		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pac-test-'));
		pacFile = path.join(directory, 'proxy.pac');
		fs.writeFileSync(pacFile, 'function FindProxyForURL(url, host) { if (dnsDomainIs(host, ".example.com")) return "PROXY proxy.local:3128; DIRECT"; return "DIRECT"; }');
	});

	after(function() {
		if (directory) {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});

	it('should report where the PAC file sends a URL', async function() {
		this.timeout(60000);

		const viaProxy = await tunnelLauncher.pacTest({ tunnelVersion, pacLocal: pacFile }, 'https://app.example.com/login');
		assert.equal(viaProxy.host, 'app.example.com');
		assert.equal(viaProxy.result, 'PROXY proxy.local:3128; DIRECT');
		assert.equal(viaProxy.egress, 'via proxy.local:3128');
		assert.equal(viaProxy.direct, false);

		const direct = await tunnelLauncher.pacTest({ tunnelVersion, pacLocal: pacFile }, 'https://other.org/');
		assert.equal(direct.direct, true);
	});

	it('should reject with what the tunnel says about a PAC file it can not use', async function() {
		this.timeout(60000);

		await assert.rejects(tunnelLauncher.pacTest({ tunnelVersion, pacLocal: path.join(directory, 'missing.pac') }, 'https://example.com/'), /PAC file not found/);
	});

	it('should reject when the PAC file does not match its checksum', async function() {
		this.timeout(60000);

		await assert.rejects(tunnelLauncher.pacTest({ tunnelVersion, pacLocal: pacFile, pacLocalSha256: 'a'.repeat(64) }, 'https://example.com/'));
	});

	it('should run the checks of the doctor', async function() {
		this.timeout(120000);

		const report = await tunnelLauncher.doctor({ tunnelVersion, apiKey: 'key', apiSecret: 'secret', 'se-port': await freePort() });

		assert.ok(report.checks.length > 0, 'The doctor should report checks');
		assert.ok(report.checks.some(check => check.status === 'ok'), `Expected a check that passed: ${JSON.stringify(report.checks)}`);
		assert.ok(report.output.length > 0);
	});

	it('should report a port that can not be opened', async function() {
		this.timeout(120000);

		const server = net.createServer();
		await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
		const port = server.address().port;

		try {
			const report = await tunnelLauncher.doctor({ tunnelVersion, apiKey: 'key', apiSecret: 'secret', 'se-port': port });

			assert.equal(report.ok, false);
			assert.ok(report.checks.some(check => check.status === 'fail' && check.message.includes(`Selenium port ${port}`)), JSON.stringify(report.checks));
		} finally {
			server.close();
		}
	});

	it('should reject when the checks can not run', async function() {
		this.timeout(60000);

		await assert.rejects(tunnelLauncher.doctor({ tunnelVersion, apiKey: 'key', apiSecret: 'secret', 'not-an-option': true }), /Could not start TestingBot Tunnel. Exit code/);
	});
});
