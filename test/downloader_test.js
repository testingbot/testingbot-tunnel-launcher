var downloader = require('./../lib/downloader');
var assert = require('assert');
var os = require('os');
var path = require('path');

describe('Downloader', function() {
	it('should download a file correctly', function(done) {
		var destinationPath = path.join(os.tmpdir(), "test_" + Math.round(Math.random()*10000));
		downloader.get('https://testingbot.com/assets/about.png', { destination: destinationPath }, function(err, downloadedFilePath) {
			assert.equal(err, null);
			assert.equal(downloadedFilePath, destinationPath);
			done();
		});
	});

	it('should return an error when a download fails (bad http code)', function(done) {
		var destinationPath = path.join(os.tmpdir(), "test_" + Math.round(Math.random()*10000));
		downloader.get('https://testingbot.com/assets/this_does_not_exist.png', { destination: destinationPath }, function(err, downloadedFilePath) {
			assert.equal(err.message, 'Could not download https://testingbot.com/assets/this_does_not_exist.png, statusCode: 404');
			assert.equal(downloadedFilePath, null);
			done();
		});
	});
});