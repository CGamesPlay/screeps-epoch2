const path = require('path');

module.exports = {
  entry: [ "./src/init.js" ],
  output: {
    path: path.join(__dirname, "dist"),
    filename: "main.js",
    library: "main",
    libraryTarget: "commonjs2"
  },
  externals: {
    lodash: "lodash"
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
      }
    ]
  },
};
