const fs = require('fs');
const path = require('path');
const postcss = require('./postcss');
const functions = require('./sass-functions');

module.exports = function factory(opt) {
	const options = Object(opt);
	const pathOption = Object(options.path);

	options.cwd = options.cwd
		? path.resolve(options.cwd)
		: process.cwd();

	const includePaths = [];
	if (Array.isArray(pathOption.include)) {
		pathOption.include.reduce(function addPath(paths, pathname) {
			if (typeof pathname === 'string') {
				paths.push(path.resolve(options.cwd, pathname));
			}
			return paths;
		}, includePaths);
	}

	options.resolve = function resolve(file) {
		function lookup(item) {
			let src;
			for (let i = 0, l = includePaths.length; i < l; i += 1) {
				const includePath = includePaths[i];
				src = path.resolve(includePath, item);
				if (fs.existsSync(src)) {
					return src;
				}
			}
			src = path.resolve(options.cwd, item);
			if (fs.existsSync(src)) {
				return src;
			}
			return null;
		}
		const format = /\.(jpe?g|png|gif|webp|svg)$/i;
		let item;
		let ext;
		if (/\.(jpe?g|png|gif|webp|svg)$/i.test(file)) {
			ext = RegExp.$1;
			item = file;
		} else {
			ext = 'png';
			item = `${file}.png`;
		}
		if (item.indexOf('@2x') > -1) {
			return lookup(item);
		}
		const item2x = item.replace(format, `@2x.${ext}`);
		return lookup(item2x) || lookup(item);
	};

	return {
		functions: () => functions({
			resolve: options.resolve,
			names: Object(options.functionNames),
			development: Boolean(options.development)
		}),
		postcss: () => postcss(options)
	};
};