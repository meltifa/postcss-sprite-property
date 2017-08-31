const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const mkdirp = require('mkdirp');
const util = require('./util');

function parseOptions(opt) {
	const options = {
		spritesmith: Object(opt.spritesmith),
		pngquant: Object(opt.pngquant),
		isRetina: Boolean(opt.retina),
		isDevelopment: Boolean(opt.development),
		resolve: opt.resolve,
		cwd: opt.cwd,
		style: {},
		path: {},
		write: typeof opt.write === 'function'
			? opt.write.bind(null)
			: util.writeFile,
		includeCSS: null,
		excludeCSS: null
	};

	// includeCSS
	const includeCSS = opt.includeCSS;
	const includeCSSType = util.type(includeCSS);
	if (includeCSSType === 'regexp') {
		options.includeCSS = file => includeCSS.test(file);
	} else if (includeCSSType === 'string') {
		options.includeCSS = file => includeCSS.indexOf(file) > -1;
	} else if (includeCSSType === 'function') {
		options.includeCSS = file => includeCSS(file);
	} else {
		options.includeCSS = () => true;
	}
	// excludeCSS
	const excludeCSS = opt.excludeCSS;
	const excludeCSSType = util.type(excludeCSS);
	if (excludeCSSType === 'regexp') {
		options.excludeCSS = file => excludeCSS.test(file);
	} else if (excludeCSSType === 'string') {
		options.excludeCSS = file => excludeCSS.indexOf(file) > -1;
	} else if (excludeCSSType === 'function') {
		options.excludeCSS = file => excludeCSS(file);
	} else {
		options.excludeCSS = () => false;
	}

	// filter
	const filter = opt.filter;
	const filterType = util.type(filter);
	switch (filterType) {
	case 'function':
		options.filter = filter.bind(null);
		break;
	case 'regexp':
		options.filter = filter.test.bind(filter);
		break;
	case 'string':
		options.filter = url => url.indexOf(filter) > -1;
		break;
	default:
		options.filter = () => false;
	}

	// path
	const pathOpt = Object(opt.path);
	const outputPath = pathOpt.output;
	const publicPath = pathOpt.public;
	if (!/^string|function$/.test(typeof outputPath)) {
		throw new TypeError('PostCSS-Sprite-Property: `path.output` must be a string or a function!');
	}
	function replacePlaceholder(tpl, meta) {
		const parse = path.parse(util.slash(path.relative(options.cwd, meta.input)));
		return tpl
			.replace(/\[name\]/g, parse.name)
			.replace(/\[path\]/g, parse.dir)
			.replace(/\[contenthash(:(\d+))?\]/g, function replaceHash(_, __, len) {
				const length = parseInt(len, 10) || 32;
				return meta.hash.substring(0, length);
			});
	}
	options.path.output = function resolveOutputPath(meta) {
		const tpl = typeof outputPath === 'function'
			? outputPath(meta)
			: outputPath;
		const filepath = replacePlaceholder(tpl, meta);
		return util.slash(path.resolve(options.cwd, filepath));
	};
	options.path.public = function resolvePublichPath(meta) {
		let tpl = typeof publicPath === 'function'
			? publicPath(meta)
			: publicPath;
		tpl = tpl || util.slash(path.relative(options.cwd, options.path.output(meta)));
		return replacePlaceholder(tpl, meta);
	};

	// style
	const style = Object(opt.style);
	const backgroundImage = style['background-image'] || style.backgroundImage;
	const backgroundSize = style['background-size'] || style.backgroundSize;
	const backgroundPosition = style['background-position'] || style.backgroundPosition;
	if (typeof backgroundImage === 'function') {
		options.style['background-image'] = backgroundImage.bind(null);
	} else {
		options.style['background-image'] = function calcBackgroundImageNormal(data) {
			const publicUrl = options.path.public(data.meta);
			if (options.isRetina) {
				const retinaPublicUrl = publicUrl.replace(/\.png$/, '@2x.png');
				const fallbackUrl = backgroundImage === 'normal' ? publicUrl : retinaPublicUrl;
				return [
					{ prop: 'background-image', value: `url(${fallbackUrl})` },
					{ prop: 'background-image', value: `-webkit-image-set(url(${publicUrl}) 1x, url(${retinaPublicUrl}) 2x)` }
				];
			}
			return `url(${publicUrl})`;
		};
	}
	if (backgroundPosition === 'normal' && options.isRetina) {
		options.style['background-position'] = function calcBackgroundPositionNormal(data) {
			const coordinate = data.coordinate;
			const str = String(coordinate.x / -2).concat('px ', coordinate.y / -2, 'px');
			const minify = str.replace(/-0px/g, 0);
			return minify;
		};
	} else if (backgroundPosition === 'percent') {
		options.style['background-position'] = function calcBackgroundPositionPercent(data) {
			const coordinate = data.coordinate;
			const properties = data.properties;
			/*eslint-disable*/
			const x = coordinate.x ? (-coordinate.x / (coordinate.width - properties.width) * 100).toFixed(4) + '%' : 0;
			const y = coordinate.y ? (-coordinate.y / (coordinate.height - properties.height) * 100).toFixed(4) + '%' : 0;
			/*eslint-enable*/
			const str = `${x} ${y}`;
			const minify = str.replace(/\.?0+%($|\s)/g, '%$1');
			return minify;
		};
	} else if (typeof backgroundPosition === 'function') {
		options.style['background-position'] = backgroundPosition.bind(null);
	} else {
		options.style['background-position'] = function calcBackgroundPosition(data) {
			const coordinate = data.coordinate;
			const str = String(coordinate.x / -1).concat('px ', coordinate.y / -1, 'px');
			const minify = str.replace(/(^|\s)-?0px/g, '$10');
			return minify;
		};
	}
	if (backgroundSize === 'normal' && options.isRetina) {
		options.style['background-size'] = function calcBackgroundSizeNormal(data) {
			const properties = data.properties;
			return String(properties.width / 2).concat('px ', properties.height / 2, 'px');
		};
	} else if (typeof backgroundSize === 'function') {
		options.style['background-size'] = backgroundSize.bind(null);
	} else {
		options.style['background-size'] = function calcBackgroundSize(data) {
			const properties = data.properties;
			return String(properties.width).concat('px ', properties.height, 'px');
		};
	}

	return options;
}

module.exports = postcss.plugin('postcss-sprite-property', function factory(opt) {
	const options = parseOptions(Object(opt));
	const resolve = options.resolve;
	const isRetina = options.isRetina;

	return function processor(css) {
		const cssInput = util.slash(css.source.input.file);

		if (options.isDevelopment || !options.includeCSS(cssInput) || options.excludeCSS(cssInput)) {
			return Promise.resolve();
		}

		const cssMeta = {
			input: cssInput,
			hash: ''
		};

		const sprites = [];
		css.walkDecls(/background(-image)?$/, function lookUpSprites(decl) {
			const url = util.extractUrl(decl.value);
			if (url && options.filter(url)) {
				const file = resolve(url);
				if (!file) {
					throw decl.error('Sprite element not found!', {
						word: url,
						index: decl.toString().indexOf(url)
					});
				}
				sprites.push({
					decl,
					url,
					file: resolve(url)
				});
			}
		});

		if (!sprites.length) {
			return Promise.resolve();
		}

		function createOriginalSprite() {
			const spritesmith = options.spritesmith;
			spritesmith.src = sprites.reduceRight(function collectImagePaths(paths, sprite, index) {
				Object.defineProperty(paths, sprite.file, {
					value: true,
					writable: true,
					enumerable: true
				});
				if (!index) {
					return Object.keys(paths);
				}
				return paths;
			}, Object.create(null));

			return util.createSprite(spritesmith).then(function modifyData(data) {
				return {
					coordinates: data.coordinates,
					properties: data.properties,
					originBuffer: data.image
				};
			});
		}

		function checkRetinaSizesIfNeeded(data) {
			if (isRetina) {
				const coordinates = data.coordinates;
				const oddImages = Object.keys(coordinates).filter(function checkOdd(file) {
					const sprite = coordinates[file];
					if (sprite.width % 2 === 1 || sprite.height % 2 === 1) {
						return true;
					}
					return false;
				});
				if (oddImages.length) {
					const relative = path.relative.bind(path, process.cwd());
					const list = oddImages
						.map((file, index) => `${index + 1}. ${util.slash(relative(file))}`)
						.join('\n');
					return Promise.reject(`Odd images detected. Check:\n${list}`);
				}
			}
			return data;
		}

		function createNormalSpriteIfNeeded(data) {
			if (!isRetina) {
				return data;
			}
			const properties = data.properties;
			const width = properties.width / 2;
			const height = properties.height / 2;
			return util.resizeImage(data.originBuffer, width, height).then(function add(buffer) {
				return Object.defineProperty(data, 'normalBuffer', {
					value: buffer,
					enumerable: true,
					writable: true
				});
			});
		}

		function compressImagesIfNeeded(data) {
			const pngquant = options.pngquant;
			if (pngquant) {
				const handler = typeof pngquant === 'function'
					? pngquant
					: util.compressImage.bind(null, pngquant);
				const waitings = [
					handler(data.originBuffer)
				];
				if (data.normalBuffer) {
					waitings.push(handler(data.normalBuffer));
				}
				return Promise.all(waitings).then(function replace([origin, normal]) {
					if (origin) {
						Object.defineProperty(data, 'originBuffer', {
							value: origin,
							enumerable: true,
							writable: true
						});
					}
					if (normal) {
						Object.defineProperty(data, 'normalBuffer', {
							value: normal,
							enumerable: true,
							writable: true
						});
					}
					return data;
				});
			}
			return data;
		}

		function appendHashMetaData(data) {
			cssMeta.hash = util.hash(data.originBuffer);
			return data;
		}

		function updateCSS(data) {
			const info = {
				properties: data.properties,
				meta: cssMeta
			};
			const computeStyle = function computeStyle(property, args) {
				let result = options.style[property](args);
				if (!Array.isArray(result)) {
					if (util.type(result) === 'object') {
						result = [result];
					} else {
						result = [{
							prop: property,
							value: result
						}];
					}
				}
				return result;
			};
			const backgroundImage = computeStyle('background-image', info);
			const backgroundSize = computeStyle('background-size', info);

			let total = sprites.slice();
			const next = function next() {
				const first = total.shift();
				if (!first) {
					return total;
				}
				const context = first.decl.parent.parent;
				const match = [first];
				const unmatch = [];
				total.forEach(function sort(sprite) {
					const box = sprite.decl.parent.parent === context ? match : unmatch;
					box.push(sprite);
				});

				total = unmatch;
				return match;
			};
			let match = next();
			const createDecl = postcss.decl.bind(postcss);

			function append(parent, child) {
				if (Array.isArray(child)) {
					return child.forEach(append.bind(null, parent));
				}
				return parent.append(child);
			}

			while (match.length) {
				const first = match[0];
				const rule = first.decl.parent;
				const context = rule.parent;
				let clone = rule.clone({
					selectors: match.map(sprite => sprite.decl.parent.selector)
				});
				clone.removeAll();
				append(clone, backgroundImage.map(createDecl));
				append(clone, backgroundSize.map(createDecl));

				if (context.type === 'atrule') {
					const atrule = context.clone();
					atrule.removeAll();
					atrule.append(clone);
					clone = atrule;
				}
				css.append(clone);
				match = next();
			}

			sprites.forEach(function replaceDecl(sprite) {
				const backgroundPosition = computeStyle('background-position', {
					coordinate: data.coordinates[sprite.file],
					properties: data.properties,
					meta: cssMeta
				});
				const decl = sprite.decl;
				const parent = decl.parent;
				backgroundPosition.forEach(parent.insertBefore.bind(parent, decl));
				decl.remove();
			});

			return data;
		}

		function outputImages(data) {
			function writeFile(file, buffer) {
				return new Promise(function asyncWriteFile(succ, fail) {
					options.write(file, buffer, function callback(err) {
						return err ? fail(err) : succ();
					});
				});
			}
			const outputPath = options.path.output(cssMeta);
			const waitings = [];
			if (isRetina) {
				const retinaOutputPath = outputPath.replace(/\.png$/, '@2x.png');
				waitings.push(writeFile(retinaOutputPath, data.originBuffer));
				waitings.push(writeFile(outputPath, data.normalBuffer));
			} else {
				waitings.push(writeFile(outputPath, data.originBuffer));
			}
			return Promise.all(waitings).then(() => data);
		}

		return createOriginalSprite()
			.then(checkRetinaSizesIfNeeded)
			.then(createNormalSpriteIfNeeded)
			.then(compressImagesIfNeeded)
			.then(appendHashMetaData)
			.then(updateCSS)
			.then(outputImages);
	};
});