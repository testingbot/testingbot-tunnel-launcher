var https = require('https');
var fs = require('fs');

exports.get = function(url, options, cb) {
    var dest = options.destination;

	var request = https.get(url, function(response) {
		if (parseInt(response.statusCode.toString().substring(0), 10) > 3) {
			return cb(new Error("Could not download " + url + ", statusCode: " + response.statusCode.toString()), null);
		}

		var file = fs.createWriteStream(dest);
		response.pipe(file);
		file.on('finish', function() {
			file.close();
			cb(null, dest);
		});
	}).on('error', function(e) {
		cb(e.message, null);
	});
};