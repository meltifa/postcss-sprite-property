function isDevide(info) {
	return info.meta.normal && info.data.image.retina;
}

function width(info) {
	const value = info.data.width;
	return {
		value: ( isDevide(info) ? value / 2 : value ) + 'px',
		prop: 'width'
	};
}

function height(info) {
	const value = info.data.height;
	return {
		value: ( isDevide(info) ? value / 2 : value ) + 'px',
		prop: 'height'
	};
}

function backgroundImage(info) {
	const image = info.data.image;
	const normalPublic = image.normal.public;
	if (!image.retina) {
		return {
			value: 'url(' + normalPublic + ')',
			prop: 'background-image'
		};
	} else {
		const retinaPublic = image.retina.public;
		return [
			{ prop: 'background-image', value: 'url(' + (isDevide(info) ? normalPublic : retinaPublic) + ')' },
			{ prop: 'background-image', value: '-webkit-image-set(url(' + normalPublic + ') 1x, url(' + retinaPublic + ') 2x)' }
		];
	}
}

function backgroundSize(info) {
	const divide = isDevide(info) ? 2 : 1;
	return {
		value: info.data.size.map(function(val) { return val === 0 ? val : val / divide + 'px'; }).join(' '),
		prop: 'background-size'
	};
}

function backgroundPosition(info) {
	const divide = isDevide(info) ? -2 : -1;
	return {
		value: info.data.position.map(function(val) { return val === 0 ? val : val / divide + 'px'; }).join(' '),
		prop: 'background-position'
	};
}

function background(info) {
	const size = this['background-size'](info);
	const image = this['background-image'](info);

	const result = [].concat(image, {
		prop: 'background-repeat',
		value: 'no-repeat'
	});

	if (info.data.image.retina) {
		result.push(size);
	}

	return result;
}


module.exports = function(counter) {
	const properties = {};
	const bind = function(fn) {
		return fn.bind(properties);
	};
	properties.width = bind(width);
	properties.height = bind(height);
	properties.background = bind(background);
	properties['background-image'] = bind(backgroundImage);
	properties['background-position'] = bind(backgroundPosition);
	properties['background-size'] = bind(backgroundSize);
	Object.keys(counter).reduce(function(properties, key) {
		properties[key] = bind(counter[key]);
		return properties;
	}, properties);
	const names = Object.keys(properties);
	properties.contains = function(prop) {
		return names.indexOf(prop) > -1;
	};
	return properties;
};