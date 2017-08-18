const path = require('path');
const imageSize = require('image-size');
const { Gaze } = require('gaze');
const { types: { Null: { NULL: SassNULL }, Number: SassNumber } } = require('node-sass');
const { slash } = require('./util');

function querySize(filepath) {
	try {
		const dimensions = imageSize(filepath);
		return {
			width: dimensions.width,
			height: dimensions.height
		};
	} catch (e) {
		return null;
	}
}

function Cache(options) {
	this.data = {};
	this.cwd = process.cwd();
	this.isDev = Boolean(options.development);

	if (this.isDev) {
		this.gaze = new Gaze();
		const gaze = this.gaze;
		gaze.on('changed', (filepath) => {
			const key = this.key(filepath);
			const size = querySize(filepath);
			if (size) {
				this.data[key] = size;
			}
		});
		gaze.on('deleted', (filepath) => {
			const key = this.key(filepath);
			gaze.remove(filepath);
			delete this.data[key];
		});
		gaze.on('renamed', (newPath, oldPath) => {
			const newKey = this.key(newPath);
			const oldKey = this.key(oldPath);
			const data = this.data;
			data[newKey] = data[oldKey];
			delete data[oldKey];
		});
	}
}

Cache.prototype.key = function key(filepath) {
	return slash(path.relative(this.cwd, filepath));
};

Cache.prototype.get = function get(filepath) {
	const key = this.key(filepath);
	return this.data[key] || null;
};

Cache.prototype.set = function set(filepath, size) {
	const key = this.key(filepath);
	if (this.isDev && !this.data[key]) {
		this.gaze.add(key);
	}
	this.data[key] = size;
};

module.exports = function factory(options) {
	const resolve = options.resolve;
	const names = options.names;
	const cache = new Cache({
		development: options.development
	});

	function sizeOf(file) {
		const filepath = resolve(file);
		if (!filepath) {
			return null;
		}
		const data = cache.get(filepath);
		if (data) {
			return data;
		}
		const size = querySize(filepath);
		if (!size) {
			return null;
		}
		cache.set(filepath, size);
		return size;
	}

	function width(name) {
		const size = sizeOf(name.getValue());
		if (!size) {
			return SassNULL;
		}
		return new SassNumber(size.width, 'px');
	}

	function height(name) {
		const size = sizeOf(name.getValue());
		if (!size) {
			return SassNULL;
		}
		return new SassNumber(size.height, 'px');
	}

	return {
		[names.width ? names.width : 'image-width']: width,
		[names.height ? names.height : 'image-height']: height
	};
};