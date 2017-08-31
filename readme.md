雪碧图处理工具。



用法参见文档最末。

Webpack 版：https://github.com/HaoyCn/sprite-property-plugin-webpack





### 一、特色

- 通过注入自定义函数，在 SCSS 中直接查询图片宽高，利用混合后更能提高效率
- 区分开发和打包双阶段，开发阶段直接使用原切片元素预览，仅打包阶段合并雪碧图
- 告别以往的预处理模式（先生成雪碧图后在 CSS 中使用），或者后处理模式（手动书写切片元素宽高），两种模式相结合，按需生成雪碧图，避免未使用的元素混入







### 二、选项

##### cwd

- 可选，默认：`process.cwd()`
- 工作目录。配置的所有路径都基于此目录查找。



##### path

- 必需，类型：`Object`
- **path.output**
  - 必须，类型：`Function | String`
  - 合成的雪碧图的本地路径，将根据 `cwd` 解析为一个绝对地址
  - 如果提供一个函数
    - 接受一个对象为参数，包含 `input` 和 `hash` 两个属性，分别为 CSS 文件路径和雪碧图的 Hash
    - 返回一个路径，该路径等同于直接提供的字符串（如下）
  - 如果提供一个字符串
    - 路径必须是 `.png` 文件路径
    - 无需指定二倍高清图路径，假设生成雪碧图为 `sprite.png`，则高清雪碧图自动为 `sprite@2x.png`
    - 可使用占位符：
      - `[name]` ：CSS 文件名
      - `[path]` ：CSS 文件所在目录（相对于 `cwd`）
      - `[contenthash:<length>]` ：雪碧图的 Hash，默认长度：32
- **path.public**
  - 可选，类型：`Function |String`，默认：雪碧图本地路径相对于CSS文件的相对路径
  - 合成的雪碧图在 CSS 文件 `url()` 中的路径
  - 提供的函数和字符串用法同 `path.output`
- **path.input**
  - 可选，类型：`Function`
  - 接受 CSS `url()` 中的地址，返回该地址代表文件的实际地址
  - 文件查找原理：通过 `path.input` 修改地址后，经 `path.include` 查找改文件
  - 如在 Webpack 中，雪碧图切片的地址可能加入了 Hash 值（视 Webpack 配置），可以通过此参数去除 Hash 获得原始的文件名
- **path.include**
  - 可选，类型：`Array`
  - 雪碧图切片元素所在文件路径。当匹配到一个满足条件的切片 Url 后，默认地将相对于 CSS 文件去查找雪碧图路径，如果无法找到，则根据此选项提供的目录去查找雪碧图



##### retina	

 - 可选，类型：`Boolean`，默认：`false`
- 指明是否生成响应2倍高清雪碧图
- 如果开启此选项，那么
  - 以上路径处理均只针对普通屏雪碧图，高清雪碧图在普通图基础上只将后缀 `.png` 替换为 `@2x.png`
  - 所有切片元素图片的宽高均应是偶数



##### development

- 可选，类型：`Boolean`，默认 `false`
- 指定当前是否合成雪碧图
- 项目可区分出开发和打包两个流程。在开发流程中，预览直接使用切片元素；在打包流程中，合并所有的切片为雪碧图



##### filter

- 必须，类型：`String | RegExp | Function`
- 接受 CSS 中的 `url()` 内字符串，判定是否是雪碧图切片元素
- 不同类型判断方法不一：
  - `String`：地址是否包含此字符串
  - `RexExp`：地址是否匹配此字符串
  - `Function`：以地址为传参，是否返回布尔真



##### includeCSS #####

- 可选，类型：`String | RegExp | Function`，默认： `() => true`
- 接受 CSS 路径地址，判断是否为此 CSS 生成雪碧图。判定方法同 `filter`



##### excludeCSS	

- 可选，类型：`String | RegExp | Function`，默认：`() => false`
- 接受 CSS 路径地址，判断是否不为此 CSS 生成雪碧图。判定方法同 `filter`



##### style

- 可选，类型：`Object`
- 指定生成的 CSS。以 CSS 属性为键，以函数或关键词为值
- 键可能有（短横线或者驼峰写法均可）：`background-image`  `background-position`  `background-size`
- 当且仅当 `retina` 为布尔真时，`background-size` 才会紧跟着 `background-image` 生成，否则不生成此值
- 值如果是一个函数：
  - 接受一个参数，包含该雪碧图切片的信息
  - 应当返回如 `{ prop: 'background-image', value: 'url(xxx.png)' }` 格式的对象或对象数组
- 值如果是关键字：
  - `normal`：`background-image`使用普通图，`background-size`使用普通图宽高，`background-position` 使用在普通图上的偏移
  - `percent`：仅对 `background-position` 有效，返回百分比形式的偏移



##### write

- 可选，类型：`Function`
- 将雪碧图文件写入本地的函数
- 接受三个参数，分别为：雪碧图本地路径（已计算）、雪碧图 Buffer 数据、回调



##### functionNames

- 可选，类型：`Object`，默认：`{ width: 'image-width', height: 'image-height' }`
- 工具可返回 Node-Sass 自定义函数对象，用于在 SASS 中查询图片宽高，此选项用于指定自定义函数的名称



##### spritesmith

- 可选，传递给 spritesmith 工具的参数



##### pngquant

- 可选，传递给 imagemin-pngquant 的参数
- 如果设定此值，则会压缩雪碧图







### 三、示例：

如下：

```javascript
// gulpfile.js
var Sprite = require('postcss-sprite-property')
var sass = require('gulp-sass')
var postcss = require('gulp-postcss')
var gulp = require('gulp')

var sprite = new Sprite({
  path: {
    include: ['src/css'],
    output: 'dist/images/sprite_[name].png',
    public: '../images/sprite_[name].png?v=[contenthash:8]'
  },
  filter: /asset\/sprite\/.+\.png$/,
  development: false,
  pngquant: {
    floyd: 0.8
  },
  spritesmith: {
    padding: 8
  }
})

// 返回一个对象，传递给 Node-Sass 后可注入自定义函数
var functions = sprite.functions()

var processor = sprite.postcss()

gulp.task(function generateSprite() {
  return gulp.src('src/css/*.scss')
  	.pipe(sass({ functions: functions }))
  	.pipe(postcss([ processor ]))
    .pipe(gulp.dest('dist/css'))
})
```

```scss
// scss

// 使用混合提升开发效率
@mixin sprite-item($name) {
	$url: '../asset/sprite/#{$name}.png';
	$width: image-width($url);// image-width 是注入的自定义函数
	@if (null == $width) {
		@warn 'Sprite element `#{$name}` not found!';
	} @else {
		$height: image-height($url);// image-height 是注入的自定义函数
		width: $width;
		height: $height;
		background: url($url) 0 0 / #{$width} #{$height} no-repeat;
	}
}

@mixin sprite-position($name) {
	$url: '../asset/sprite/#{$name}.png';
	$width: image-width($url);
	@if (null == $width) {
		@warn 'Sprite element `#{$name}` not found!';
	} @else {
		$height: image-height($url);
		background: url($url) 0 0 / #{$width} #{$height} no-repeat;
	}
}

.home {
  > .home-back {
    	&:before {
          @include sprite-item('home/back');
          content: '';
          position: absolute;
          top: 0;
          right: 0;
    	}
    
    	&:hover:after {
           @include sprite-position('home/back_hover');
    	}
  }
}
```