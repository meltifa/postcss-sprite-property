TO DO.



Configuration:



```javascript
require('postcss-sprite-property')({
  path: {
    // [string|function] OPTIONAL. public path of sprite image in css
    // placeholders can be:
    // 1. [name]
    // 2. [dir]
    // 3. [contenthash:<length>]
    public: '../images/sprite_[name].png',
    // [string|function] REQUIRED. where to write sprite image
    output: './dist/images/sprite_[name].png'
  },
  retina: false, // [boolean] OPTIONAL: `true` if 2x retina image is needed
  cwd: undefined, // [string] OPTIONAL: currernt working directory to resolve paths
  spriteSmith: { // [object] OPTIONAL:  options aside from `src` that are passed to Spritesmith directly
    padding: 8 // `8` is recommended for retina, and `2` for normal
  },
  pngquant: {// [object] OPTIONAL. options that are passed to imagemin-pngquant directly
    
  },
  alias: { // [object] OPTIONAL. transform properties
    // from:	sprite-item: el(home/back)
    // to:		sprite-prop: el(home/back) width height background background-position
    item: ['width', 'height', 'background', 'background-position']
  },
  counter: { // [object] OPTIONAL. custom methods to resolve values
    'background-image': function(info) {
      // ...
    }
  },
  // [function] OPTIONAL. custom method to write sprite images
  write: function(data, done) {
  }
});
```
