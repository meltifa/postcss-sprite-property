const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const postcss = require('postcss');
const crypto = require('crypto');
const gm = require('./graphicsmagick');
const spriteEngine = require('./spritesmith');
const spritePropertyFactory = require('./property');
const compressImage = require('./compress');

const PNG_FORMAT_RE = /\.png$/i;

// 回退
// 如果自定义的函数返回数据失败
// 则调用默认函数
function fallback(custom, def) {
	return function apply() {
		let data = custom.apply(this, arguments);
		if (!data) {
			data = def.apply(this, arguments);
		}
		return data;
	};
}

// 占位替换
function placeholder(str) {
	return function replace(data) {
		return str.replace(/\[([^\]]+)\]/g, function(_, key) {
			return typeof data[key] === 'undefined' ? '' : data[key];
		});
	}
}

function slash(str) {
	return str.replace(/\\/g, '/');
}

// 默认 CSS 内图片计算方式
// 利用 PostCSS 提供的源路径与用户提供的输出路径进行相对计算
function resolveDefaultPublicPath(info) {
	if (info.input && info.output) {
		const publicPath = path.relative(path.resolve(info.input, '../'), info.output);
		if (publicPath) {
			return publicPath;
		}
	}
	throw new Error('PostCSS-Sprite-Property: Unable to resolve public path for sprite images!');
}

// 处理参数
function parseOptions(opt) {
	const settings = Object(opt);
	const sPath = Object(settings.path);
	const sAlias = Object(settings.alias);
	const sCounter = Object(settings.counter);

	// 当前工作目录
	const cwd = settings.cwd ? path.resolve(settings.cwd) : process.cwd();

	// 引入路径
	const includePaths = [];
	if (Array.isArray(sPath.include)) {
		sPath.include.reduce(function addPath(includePaths, pathname) {
			if (typeof pathname === 'string') {
				includePaths.push(path.resolve(cwd, pathname));
			}
			return includePaths;
		}, includePaths);
	}

	// 输出路径函数
	let outputPath;
	const outputType = typeof sPath.output;
	if (outputType === 'function') {
		outputPath = sPath.output;
	} else if (outputType === 'string') {
		outputPath = function() { return sPath.output; };
	} else {
		throw new TypeError('PostCSS-Sprite-Property: `path.output` must be a string or a function!');
	}

	// CSS 中的图片公共路径
	let publicPath = resolveDefaultPublicPath;
	const publicType = typeof sPath.public;
	if (publicType === 'function') {
		publicPath = fallback(sPath.public, resolveDefaultPublicPath);
	} else if (publicType === 'string') {
		publicPath = function() { return sPath.public; };
	}

	// 别名
	const alias = Object.keys(sAlias).reduce(function addAlias(alias, key) {
		// 跳过 `sprite-prop`
		if (key !== 'prop') {
			const properties = sAlias[key];
			if (Array.isArray(properties)) {
				alias[key] = properties;
			}
		}
		return alias;
	}, {});

	// 属性计算器
	const counter = Object.keys(sCounter).reduce(function addCounter(counter, property) {
		const handler = sCounter[property];
		if (typeof handler === 'function') {
			counter[property] = handler;
		}
		return counter;
	}, {});

	function defaultWriteFile(data, done) {
		const file = path.resolve(cwd, data.path);
		const source = data.source;
		mkdirp(path.resolve(file, '../'), function(err) {
			if (err) {
				return done(err);
			}
			return fs.writeFile(file, source, done);
		});
	}

	return {
		path: {
			include: includePaths,
			output: outputPath,
			public: publicPath
		},
		spriteSmith: Object(settings.spriteSmith),
		pngquant: settings.pngquant ? Object(settings.pngquant) : null,
		alias: alias,
		counter: counter,
		cwd: cwd,
		retina: settings.retina === 2 ? 2 : (settings.retina ? 1 : 0),
		write: typeof settings.write === 'function' ? settings.write : defaultWriteFile
	};
}

module.exports = postcss.plugin('postcss-sprite-property', function main(opt) {
	const options = parseOptions(opt);

	// 属性处理器
	// 允许用户自定义或覆盖默认的属性值输出方式
	const spriteProperty = spritePropertyFactory(options.counter);

	// 解析起于用户提供(或默认)的开发目录的绝对地址
	function resolve(url) {
		return path.resolve(options.cwd, url);
	}

	// 解析 CSS 中的 `sprite-*`
	function parseSpriteDeclaration(str) {
		const args = str.split(/\s+/g);
		// 如 `sprite-prop: url(home/back) width background-image normal`
		const info = {
			element: null, // `home-back`
			property: [], // ['width', 'background-image']
			normal: false // true
		};
		const url = /^el\((["']?)([^)]+)\1\)$/;
		for (let arg of args) {
			if (url.test(arg)) {
				info.element = RegExp.$2;
			} else if (spriteProperty.contains(arg)) {
				info.property.push(arg);
			} else if (arg === 'normal') {
				info.normal = true;
			}
		}
		return info;
	}

	return function factory(css) {
		// 源文件路径
		// 如果为空且用户且不提供 `path.public`
		// 则无法计算雪碧图在 CSS 中的公开路径
		const cssInput = css.source.input.file;

		// 解析切片元素路径
		function resolveSpriteElementPath(element) {
			// 指定文件名查找
			function lookup(item) {
				let src;
				// 相对 CSS 源
				if (fs.existsSync(cssInput)) {
					src = path.resolve(cssInput, '../', item);
					if (fs.existsSync(src)) {
						return src;
					}
				}
				// 相对包含目录
				const includePaths = options.path.include;
				for(let i = 0, l = includePaths.length; i < l; i++) {
					const includePath = includePaths[i];
					src = path.resolve(includePath, item);
					if (fs.existsSync(src)) {
						return src;
					}
				}
				// 相对工作目录
				src = resolve(item);
				if (fs.existsSync(src)) {
					return src;
				}
				return null;
			}

			// 切片图的后缀强制为 .png
			const item = PNG_FORMAT_RE.test(element) ? element : element + '.png';

			// 如果切片命名上显式采用 `xx@2x.png` 此类形式
			// 则直接查找
			if (item.indexOf('@2x') > -1) {
				return lookup(item);
			}
			// 只声明 `xx.png`
			// 则优先查找 `xx@2x.png`
			// 后查找 `xx.png`
			const item2x = item.replace(PNG_FORMAT_RE, '@2x.png');
			return lookup(item2x) || lookup(item);
		}

		// 替把所有别名都转换成 `sprite-prop`
		const aliasKeys = Object.keys(options.alias);
		if (aliasKeys.length) {
			const aliasRE = new RegExp('^sprite-(' + aliasKeys.join('|') + ')$');
			css.walkDecls(aliasRE, function transformAliasToProp(decl) {
				const alias = aliasRE.exec(decl.prop)[1];
				const sprite = parseSpriteDeclaration(decl.value);
				// 校验图片是否存在
				const elementPath = resolveSpriteElementPath(sprite.element);
				if (!elementPath) {
					throw new Error('PostCSS-Sprite-Property: Element `' + sprite.element + '` not found!');
				}
				// 插入新节点
				decl.parent.insertAfter(decl, {
					prop: 'sprite-prop',
					value: [sprite.element ? 'el(' + sprite.element + ')' : ''].concat(options.alias[alias], sprite.normal ? 'normal' : '').join(' ')
				});
				// 移除别名节点
				decl.remove();
			});
		}

		// 雪碧图信息
		const sprites = [];
		// 雪碧图切片元素地址
		const elementPaths = [];

		// 查找全部雪碧图定义
		css.walkDecls('sprite-prop', function getSprites(decl) {
			const sprite = parseSpriteDeclaration(decl.value);
			// 校验图片存在与否
			const elementPath = resolveSpriteElementPath(sprite.element);
			if (!elementPath) {
				throw new Error('PostCSS-Sprite-Property: Element `' + sprite.element + '` not found!');
			}
			// 添加到路径组
			if (elementPaths.indexOf(elementPath) < 0) {
				elementPaths.push(elementPath);
			}
			// 记录此雪碧图数据
			sprites.push({
				element: sprite.element,// url() 中的内容
				property: sprite.property,// 需要转换的属性集
				normal: sprite.normal,// 是否有 `normal` 值
				path: elementPath,// 对应切片的绝对路径
				node: decl// 此属性节点
			});
		});

		// 校验图片偶数
		function checkRetinaIfNeeded() {
			// 高清雪碧图要求所有切片必须偶数
			if (options.retina) {
				return Promise.all(elementPaths.map(function getImageInfo(pathname) {
					return gm.identify(pathname);
				})).then(function checkImageInfo(images) {
					images.forEach(function checkOdd(image) {
						const size = image.size;
						if (size.width % 2 === 1 || size.height % 2 === 1) {
							throw new Error('PostCSS-Sprite-Property: Odd size detected! Check image: ' + slash(path.relative(options.cwd, image.path)));
						}
					});
				});
			}
			// 没有高清图则无需检查
			return Promise.resolve();
		}

		// 生成雪碧图数据
		function createSprite() {
			const engineOptions = options.spriteSmith;
			engineOptions.src = elementPaths;
			return spriteEngine(engineOptions).then(function(data) {
				const properties = data.properties;
				const size = [properties.width, properties.height];
				const coordinates = Object.keys(data.coordinates).reduce(function(coordinates, key) {
					const item = data.coordinates[key];
					coordinates[key] = {
						position: [item.x, item.y],// 切片在雪碧图中的偏移
						width: item.width,// 切片宽
						height: item.height,// 切片高
						size: size// 雪碧图总尺寸
					};
					return coordinates;
				}, {});
				return {
					coordinates: coordinates,
					originBuffer: data.image
				};
			});
		}

		// 按需创建普通屏雪碧图
		function createNormalSpriteIfNeeded(data) {
			if (!options.retina) {
				return data;
			}
			const coordinates = data.coordinates;
			// 取第一张切片的数据就可知道整张雪碧图大小
			const size = coordinates[Object.keys(coordinates).shift()].size;
			// 普通图直接缩小一倍
			return gm.resize(data.originBuffer, size[0] / 2, size[1] / 2).then(function(buffer) {
				// 数据挂到 data 并传递下去
				data.normalBuffer = buffer;
				return data;
			});
		}

		function compressImagesIfNeeded(data) {
			if (options.pngquant) {
				const waitings = [];
				waitings.push(compressImage(data.originBuffer));

				if (data.normalBuffer) {
					waitings.push(compressImage(data.normalBuffer));
				}
				return Promise.all(waitings).then(function([origin, normal]) {
					if (origin) {
						data.originBuffer = origin;
					}
					if (normal) {
						data.normalBuffer = normal;
					}
					return data;
				});
			}
			return data;
		}

		// 整理数据
		function collectData(spriteData) {
			const parseCssPath = cssInput ? path.parse(cssInput) : {};
			const cssName = /^([^.]+)/.test(parseCssPath.name) ? RegExp.$1 : parseCssPath.name;
			const cssDir = slash(path.relative(options.cwd, parseCssPath.dir));
			const cssContentHash = crypto.createHash('md5').update(spriteData.originBuffer).digest('hex');

			function resolveTpl(str) {
				return str.replace(/\[(dir|name|contenthash(:(\d+))?)\]/g, function(_, key, __, len) {
					// `path` or `name`
					if (key === 'dir') {
						return cssDir;
					}
					if (key === 'name') {
						return cssName;
					}
					// `contenthash`
					const sliceLength = len > 1 ? parseInt(len, 10) : 20;
					const contenthash = cssContentHash.substring(0, sliceLength);
					return contenthash;
				});
			}

			const outputPath = resolveTpl(slash(options.path.output.call(null, {
				dir: cssDir,
				name: cssName,
				contenthash: cssContentHash,
				input: cssInput
			})));
			const publicPath = resolveTpl(slash(options.path.public.call(null, {
				dir: cssDir,
				name: cssName,
				contenthash: cssContentHash,
				input: cssInput,
				output: outputPath
			})));

			if (!PNG_FORMAT_RE.test(outputPath) || !PNG_FORMAT_RE.test(publicPath)) {
				throw new Error('PostCSS-Sprite-Property: Sprite images must be PNG format!');
			}

			const coordinates = spriteData.coordinates;
			const eachCoordinate = function(handler) {
				Object.keys(coordinates).forEach(function(key) {
					const item = coordinates[key];
					return handler(item);
				});
			};

			// 给所有切片信息里加入普通屏路径信息
			const normalPath = {
				public: publicPath,
				output: outputPath
			};
			eachCoordinate(function(item) {
				item.image = {
					normal: normalPath
				};
			});

			let buffer;
			if (options.retina) {
				// 加入高清屏信息
				const replace = function(str) {
					return str.replace(PNG_FORMAT_RE, '@2x.png');
				};
				const retinaPath = {
					public: replace(publicPath),
					output: replace(outputPath)
				};
				eachCoordinate(function(item) {
					item.image.retina = retinaPath;
				});
				// 整理图片
				buffer = {
					retina: {
						path: retinaPath.output,
						source: spriteData.originBuffer
					},
					normal: {
						path: outputPath,
						source: spriteData.normalBuffer
					}
				};
			} else {
				// 只整理图片
				buffer = {
					normal: {
						path: outputPath,
						source: spriteData.originBuffer
					}
				};
			}
			return {
				buffer: buffer,
				coordinates: coordinates
			};
		}

		// background 作为公共抽离，额外添加选择器节点
		function addBackgroundProperty(backgroundProperty) {
			let list = backgroundProperty.slice();

			// 抽取组
			// 同一组满足如下条件：
			// 1. background 值相同
			// 2. 属于同一个根节点（注意考虑于 @media 等规则）
			// 3. 都是普通屏数据/高清屏数据
			function nextGroup() {
				const element = list.shift();
				if (!element) {
					return null;
				}

				// 是否使用普通屏数据
				const isNormalData = element.normal;
				// 属性节点
				const node = element.node;
				// 根节点
				const parent = node.parent.parent;

				// 抽离
				const newList = [];
				const siblings = [];
				list.reduce(function(box, item) {
					const newList = box.newList;
					const siblings = box.siblings;
					// 根节点一致并且都是普通屏/高清屏
					if (parent === item.node.parent.parent && isNormalData === item.normal) {
						siblings.push(item);
					} else {
						newList.push(item);
					}
					return box;
				}, {
					newList: newList,
					siblings: siblings
				});
				list = newList;
				siblings.unshift(element);
				return siblings;
			}

			let group = nextGroup();
			while(group) {
				// 组里头一个记录
				const firstObj = group[0];
				const firstDeclaration = firstObj.node;
				const firstContainer = firstDeclaration.parent;

				// 拿到所有选择器名字符串
				// 同时移除属性节点
				const selectors = group.map(function getSelectorAndRemove(item) {
					const node = item.node;
					const selector = node.parent.selector;
					node.remove();
					return selector;
				});

				// 拷贝一个节点出来
				// 修改其选择器并移除所有声明
				const cloneContainer = firstContainer.clone({ selectors: selectors });
				cloneContainer.removeAll();

				// 遍历属性添加到拷贝的选择器节点中
				firstObj.properties.forEach(function(prop) {
					const decl = postcss.decl(prop);
					cloneContainer.append(decl);
				});

				// 追加到根节点的起始
				// 不能追加到末尾
				// 因为可能导致覆盖住通常放在后面的媒体查询
				firstContainer.parent.prepend(cloneContainer);

				group = nextGroup();
			}
		}

		// 将所有 `sprite-prop` 转换到正常 CSS 属性
		function modifyCSS(data) {
			const coordinates = data.coordinates;

			// background 不要放到每个选择器里
			// 合并到一个选择器去
			const backgroundProperty = [];

			sprites.forEach(function modify(sprite) {
				// 切片信息
				const coordinate = coordinates[sprite.path];
				// 属性声明节点
				const node = sprite.node;
				// 选择器节点
				const parent = node.parent;
				// 插入到声明属性之前
				const insert = parent.insertBefore.bind(parent, node);
				// 所有需要生成的属性
				const properties = sprite.property;
				// 遍历所有需要新建的属性
				properties.forEach(function transformProperty(property) {
					// 是否使用一般的数据
					// 要么是属性声明里面规定的
					// 要么是配置里面强制的
					const normal = sprite.normal || options.retina === 2;
					// 此属性的节点
					// 属性可能生成多个节点
					var newNodes = [].concat(spriteProperty[property].call(null, {
						data: coordinate,
						meta: {
							id: sprite.element,
							path: sprite.path,
							// 是否显式注明 normal 与雪碧图是否高清无关
							// 是否高清应当判断 coordinate.image.retina 是否存在
							normal: normal,
							property: sprite.property,
							input: cssInput
						}
					}));
					// 如果属性不是 background 则直接插入
					if (property !== 'background') {
						newNodes.forEach(insert);
					// 否则以后处理
					} else {
						backgroundProperty.push({
							properties: newNodes,
							node: node,
							normal: normal
						});
					}
				});
				// 如果不添加 background 就可以直接删除这个节点了
				if (properties.indexOf('background') === -1) {
					node.remove();
				}
			});
			// 把所有 background 尽量合并
			addBackgroundProperty(backgroundProperty);
			return data;
		}

		// 输出雪碧图到文件夹
		function writeImages(data) {
			const buffer = data.buffer;
			const promises = [];

			function writeFile(file) {
				return new Promise(function(resolve) {
					const result = options.write.call(null, file, resolve);
					if (result) {
						Promise.resolve(result).then(resolve);
					}
				});
			}

			promises.push(writeFile(buffer.normal));
			if (buffer.retina) {
				promises.push(writeFile(buffer.retina));
			}

			return Promise.all(promises).then(function() {
				return data;
			});
		}

		if(!sprites.length) {
			return;
		}

		return checkRetinaIfNeeded()
			.then(createSprite)
			.then(createNormalSpriteIfNeeded)
			.then(compressImagesIfNeeded)
			.then(collectData)
			.then(modifyCSS)
			.then(writeImages);
	};
});