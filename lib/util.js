const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const gm = require('gm');
const imagemin = require('imagemin');
const pngquant = require('imagemin-pngquant');
const spritesmith = require('spritesmith');
const mkdirp = require('mkdirp');

exports.resizeImage = function resizeImage(image, width, height) {
	return new Promise(function asyncResize(resolve, reject) {
		return gm(image).resize(width, height, '!').toBuffer('png', function callback(err, buffer) {
			return err ? reject(err) : resolve(buffer);
		});
	});
};

exports.createSprite = function createSprite(options) {
	return new Promise(function asyncCreate(resolve, reject) {
		spritesmith.run(options, function callback(err, images) {
			if (err) {
				return reject(err);
			}
			return resolve(images);
		});
	});
};

exports.compressImage = function compressImage(options, buffer) {
	return imagemin.buffer(buffer, {
		plugins: [
			pngquant(options)
		]
	});
};

exports.type = function type(obj) {
	return Object.prototype.toString.call(obj)
		.match(/^\[object\s([^\]]+)\]$/i)[1]
		.toLowerCase();
};

exports.slash = function slash(str) {
	return str.replace(/\\/g, '/');
};

exports.hash = function hash(content) {
	return crypto.createHash('md5').update(content).digest('hex');
};

exports.extractUrl = function extractUrl(str) {
	if (/url\((["']?)([\s\S]+?)\1\)/.test(str)) {
		return RegExp.$2;
	}
	return null;
};

exports.writeFile = function writeFile(filepath, buffer, cb) {
	const dir = path.resolve(filepath, '../');
	return mkdirp(dir, function write(err) {
		if (err) {
			return cb(err);
		}
		return fs.writeFile(filepath, buffer, cb);
	});
};