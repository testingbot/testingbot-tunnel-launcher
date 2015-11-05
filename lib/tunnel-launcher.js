var async = require('async');
var fs = require('fs');
var os = require('os');
var path = require('path');
var spawn = require('child_process').spawn;
var downloader = require('./downloader');
var tunnelLocation = path.normalize(__dirname + "/../testingbot-tunnel.jar");
var activeTunnel;
var started = false;

function logger(msg) {
	console.log.apply(console, arguments);
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

	var onReady = function() {
		started = true;
		logger("Tunnel is ready");
		callback(null, activeTunnel);
	};

	var args = [];

	args.push('-jar');
	args.push(tunnelLocation);

	if (options.apiKey) {
		args.push(options.apiKey);
	}

	if (options.apiSecret) {
		args.push(options.apiSecret);
	}

	for (var i in options) {
		if ((i === 'apiKey') || (i === 'apiSecret') || (i === 'verbose')) {
			continue;
		}

		if (options[i]) {
			args.push('--' + i);
			args.push(options[i]);
		} else {
			args.push('--' + i);
		}
	}

	var readyFile = path.join(os.tmpdir(), "testingbot.ready");
	try {
		if (fs.statSync(readyFile).isFile()) {
			logger("Tunnel Readyfile already exists, removing");
			fs.unlinkSync(readyFile);
		}
	} catch (ignore) {}

	args.push('-f' + readyFile);

	var readyFileChecker = setInterval(function() {
		fs.stat(readyFile, function (error, stat) {
			if (!error) {
				clearInterval(readyFileChecker);
				onReady();
			}
		});
	}, 800);

	if (options.verbose) {
		logger("Starting tunnel with options", args);
	}
	activeTunnel = spawn('java', args, {
	   detached: true
	});

	activeTunnel.unref();

	activeTunnel.stderr.on('data', function(data) {
		if (options.verbose && data !== "") {
	      logger(data.toString());
	    }
	});

	activeTunnel.stdout.on("data", function (data) {
	    data = data.toString().trim();
	    if (options.verbose && data !== "") {
	      logger(data.toString());
	    }
	});

	activeTunnel.close = function(closeCallback) {
		if (closeCallback) {
			activeTunnel.on("close", function () {
				closeCallback();
			});
	    }
	    activeTunnel.kill("SIGINT");
	};

	activeTunnel.on("exit", function (code, signal) {
	    logger("Closing TestingBot Tunnel");
	    if (!started) {
	      	callback(new Error("Could not start TestingBot Tunnel. Exit code " + code + " signal: " + signal));
	    }

	    started = false;
	    activeTunnel = null;
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

	activeTunnel.kill("SIGINT");
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
	    async.apply(run, options)
	], callback);
}

process.on("exit", function () {
    logger("Shutting down tunnel");
    killTunnel();
});

module.exports = downloadAndRun;
module.exports.kill = killTunnel;