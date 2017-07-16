const update = require("immutability-helper");
const config = require("./screeps-multimeter");
const webpack_config = require("./webpack.config");

const test_config = update(webpack_config, {
  entry: { $splice: [[1, 1, "./src/test"]] },
});

module.exports = function(grunt) {
  grunt.loadNpmTasks("grunt-webpack");
  grunt.loadNpmTasks("grunt-screeps");

  grunt.initConfig({
    webpack: {
      default: webpack_config,
      test: test_config,
    },
    screeps: {
      options: {
        email: config.email,
        password: config.password,
        branch: grunt.option("branch") || "default",
        ptr: config.ptr,
      },
      dist: {
        src: ["dist/*.js"],
      },
    },
  });

  grunt.registerTask("default", ["webpack:default", "screeps"]);
  grunt.registerTask("online-test", ["webpack:test", "screeps"]);
};
