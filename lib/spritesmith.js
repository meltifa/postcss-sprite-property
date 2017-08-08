const Spritesmith = require('spritesmith');

module.exports = function createSprite(options) {
	return new Promise(function(resolve, reject) {
		Spritesmith.run(options, function(err, images) {
			if (err) {
				return reject(err);
			}
			return resolve(images);
		});
	});
};