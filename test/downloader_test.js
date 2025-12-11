const downloader = require('./../build/downloader');
const assert = require('assert');
const os = require('os');
const path = require('path');

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
});