const downloader = require('./../lib/downloader');
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

describe('Downloader', function() {
	it('should download a file correctly', function(done) {
		const destinationPath = path.join(os.tmpdir(), "test_" + Math.round(Math.random()*10000));
		downloader.get('https://testingbot.com/assets/about.png', { destination: destinationPath }, function(err, downloadedFilePath) {
			assert.equal(err, null);
			assert.equal(downloadedFilePath, destinationPath);
			done();
		});
	});

	it('should return an error when a download fails (bad http code)', function(done) {
		const destinationPath = path.join(os.tmpdir(), "test_" + Math.round(Math.random()*10000));
		downloader.get('https://testingbot.com/assets/this_does_not_exist.png', { destination: destinationPath }, function(err, downloadedFilePath) {
			assert.notEqual(err, null);
			assert.equal(downloadedFilePath, null);
			done();
		});
	});

	it('should follow redirects and download the file', function(done) {
		this.timeout(10000);
		const destinationPath = path.join(os.tmpdir(), "test_redirect_" + Math.round(Math.random()*10000));
		const redirectUrl = 'https://httpbin.org/redirect-to?url=' + encodeURIComponent('https://testingbot.com/assets/about.png');
		downloader.get(redirectUrl, { destination: destinationPath }, function(err, downloadedFilePath) {
			assert.equal(err, null);
			assert.equal(downloadedFilePath, destinationPath);
			// Verify file was actually downloaded
			assert.ok(fs.existsSync(destinationPath), 'Downloaded file should exist');
			const stats = fs.statSync(destinationPath);
			assert.ok(stats.size > 0, 'Downloaded file should not be empty');
			// Clean up
			fs.unlinkSync(destinationPath);
			done();
		});
	});

	it('should error when too many redirects occur', function(done) {
		this.timeout(10000);
		const destinationPath = path.join(os.tmpdir(), "test_redirect_" + Math.round(Math.random()*10000));
		// This URL redirects 10 times, exceeding our MAX_REDIRECTS of 5
		downloader.get('https://httpbin.org/redirect/10', { destination: destinationPath }, function(err, downloadedFilePath) {
			assert.notEqual(err, null);
			assert.ok(err.message.includes('Too many redirects'), 'Error should mention too many redirects');
			assert.equal(downloadedFilePath, null);
			done();
		});
	});
});
describe('Downloader hardening', function() {
	const http = require('http');
	const crypto = require('crypto');

	let server;
	let baseUrl;
	const handlers = {};

	before(function(done) {
		server = http.createServer((req, res) => {
			const handler = handlers[req.url.split('?')[0]];
			if (!handler) {
				res.writeHead(404);
				return res.end('not found');
			}
			handler(req, res);
		});
		server.listen(0, '127.0.0.1', () => {
			baseUrl = `http://127.0.0.1:${server.address().port}`;
			done();
		});
	});

	after(function(done) {
		server.close(done);
	});

	function destination() {
		return path.join(os.tmpdir(), `download_${crypto.randomBytes(6).toString('hex')}`);
	}

	describe('resolveRedirect', function() {
		it('should resolve an absolute redirect', function() {
			assert.equal(downloader.resolveRedirect('https://testingbot.com/tunnel/a.jar', 'https://cdn.testingbot.com/b.jar'), 'https://cdn.testingbot.com/b.jar');
		});

		it('should resolve a relative redirect', function() {
			assert.equal(downloader.resolveRedirect('https://testingbot.com/tunnel/a.jar', '/downloads/b.jar'), 'https://testingbot.com/downloads/b.jar');
			assert.equal(downloader.resolveRedirect('https://testingbot.com/tunnel/a.jar', 'b.jar'), 'https://testingbot.com/tunnel/b.jar');
		});

		it('should refuse to be redirected from https to http', function() {
			assert.throws(
				() => downloader.resolveRedirect('https://testingbot.com/tunnel/a.jar', 'http://testingbot.com/tunnel/a.jar'),
				/no longer be encrypted/
			);
		});

		it('should allow a redirect that stays on http', function() {
			assert.equal(downloader.resolveRedirect('http://example.com/a.jar', 'http://example.com/b.jar'), 'http://example.com/b.jar');
		});
	});

	it('should not write the destination when the download is interrupted', function(done) {
		handlers['/truncated'] = (req, res) => {
			res.writeHead(200, { 'Content-Length': '1000' });
			res.write('partial');
			res.destroy();
		};

		const destinationPath = destination();
		downloader.get(`${baseUrl}/truncated`, { destination: destinationPath }, function(err, downloadedFilePath) {
			assert.notEqual(err, null, 'An interrupted download should report an error');
			assert.equal(downloadedFilePath, null);
			assert.ok(!fs.existsSync(destinationPath), 'A half finished download should not end up at the destination');
			assert.equal(leftoverTempFiles(destinationPath).length, 0, 'The temporary file should be cleaned up');
			done();
		});
	});

	it('should time out instead of hanging on a stalled download', function(done) {
		this.timeout(10000);
		handlers['/stalled'] = (req, res) => {
			res.writeHead(200, { 'Content-Length': '1000' });
			res.write('start');
			// Never finishes the response
		};

		const destinationPath = destination();
		downloader.get(`${baseUrl}/stalled`, { destination: destinationPath, timeout: 500 }, function(err, downloadedFilePath) {
			assert.notEqual(err, null);
			assert.ok(err.message.includes('Timed out'), `Expected a timeout error, got: ${err.message}`);
			assert.equal(downloadedFilePath, null);
			assert.ok(!fs.existsSync(destinationPath));
			done();
		});
	});

	it('should not let concurrent downloads write over each other', function(done) {
		this.timeout(10000);
		handlers['/slow'] = (req, res) => {
			const body = req.url.includes('second') ? 'second'.repeat(100) : 'first'.repeat(100);
			res.writeHead(200, { 'Content-Length': String(body.length) });
			res.write(body.slice(0, 10));
			setTimeout(() => res.end(body.slice(10)), 100);
		};

		const destinationPath = destination();
		let pending = 2;
		const finish = (err, downloadedFilePath) => {
			assert.equal(err, null);
			assert.equal(downloadedFilePath, destinationPath);
			pending -= 1;
			if (pending > 0) {
				return;
			}

			// Both downloads wrote a complete file, so the result is one of the two, not a mix
			const contents = fs.readFileSync(destinationPath, 'utf8');
			assert.ok(contents === 'first'.repeat(100) || contents === 'second'.repeat(100), 'The destination should hold one complete download');
			assert.equal(leftoverTempFiles(destinationPath).length, 0, 'The temporary files should be cleaned up');
			fs.unlinkSync(destinationPath);
			done();
		};

		downloader.get(`${baseUrl}/slow?first`, { destination: destinationPath }, finish);
		downloader.get(`${baseUrl}/slow?second`, { destination: destinationPath }, finish);
	});

	function leftoverTempFiles(destinationPath) {
		const dir = path.dirname(destinationPath);
		const prefix = `${path.basename(destinationPath)}.`;
		return fs.readdirSync(dir).filter(entry => entry.startsWith(prefix));
	}
});
