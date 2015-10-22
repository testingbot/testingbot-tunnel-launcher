var async = require('async');
var fs = require('fs');
var path = require('path');
var downloader = require('./downloader');
var tunnelLocation = path.normalize(__dirname + "/../testingbot-tunnel.jar");
var activeTunnel;

function logger(msg) {
	console.log(msg);
}

function download(options, callback)
{
	if (fs.existsSync(tunnelLocation)) {
		return callback(null);
	}

	downloader.get('https://testingbot.com/tunnel/testingbot-tunnel.jar', { fileName: 'testingbot-tunnel', destination: tunnelLocation }, function(err, destination) {
		if (err) {
			return callback(new Error("Could not download the tunnel from TestingBot - please check your connection. " + err.message))
		}

		return callback(null);
	});
}

function run(options, callback)
{
	if (!fs.existsSync(tunnelLocation)) {
		return callback(new Error('Tunnel jar file is not present in ' + tunnelLocation));
	}

	fs.watchFile(readyFile, { persistent: false }, function() {

	});

	activeTunnel = spawn(tunnelLocation, args);

	activeTunnel.stdout.on("data", function (data) {
	    data = data.toString().trim();
	    if (options.verbose && data !== "") {
	      console.log(data);
	    }
	});

	activeTunnel.on("exit", function (code, signal) {
	    activeTunnel = null;

	    logger("Closing TestingBot Tunnel");
	    if (code > 0) {
	      	callback(new Error("Could not start TestingBot Tunnel. Exit code " + code + " signal: " + signal));
	    }
	});
}

function killTunnel(callback)
{
	if (!callback) {
		callback = function() {};
	}

	if (!activeTunnel) {
		return callback(new Error('no active tunnel'));
	}

	activeTunnel.kill("SIGTERM");
}

function downloadAndRun(options, callback)
{
	if (!options) {
		options = {};
	}

	if (!callback) {
		callback = function() {};
	}

	async.waterfall([
	    async.apply(download, options),
	  //  async.apply(run, options)
	], callback);
}

module.exports = downloadAndRun;
module.exports.kill = killTunnel;