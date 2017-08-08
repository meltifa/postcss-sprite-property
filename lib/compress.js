const imagemin = require('imagemin');
const pngquant = require('imagemin-pngquant');

module.exports = function compress(buffer, options) {
	return imagemin.buffer(buffer, {
		plugins: [
			pngquant(options)
		]
	});
};