const gm = require('gm');

exports.identify = function identify(image) {
	return new Promise(function(resolve, reject) {
		return gm(image).identify(function(err, data) {
			if (err) {
				return reject(err);
			}
			return resolve({
				format: data.format.toLowerCase(),
				size: data.size,
				path: data.path
			});
		});
	});
};

exports.resize = function resize(image, width, height) {
	return new Promise(function(resolve, reject) {
		return gm(image).resize(width, height, '!').toBuffer('png', function(err, buffer) {
			return err ? reject(err) : resolve(buffer);
		});
	});
};