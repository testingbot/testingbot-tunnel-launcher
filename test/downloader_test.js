const downloader = require('./../build/downloader');
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