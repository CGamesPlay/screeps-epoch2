const config = require('./screeps-multimeter');
const webpack_config = require('./webpack.config');

module.exports = function(grunt) {
  grunt.loadNpmTasks('grunt-webpack');
  grunt.loadNpmTasks('grunt-screeps');

  grunt.initConfig({
    webpack: {
      default: webpack_config
    },
    screeps: {
      options: {
        email: config.email,
        password: config.password,
        branch: grunt.option('branch') || 'default',
        ptr: config.ptr,
      },
      dist: {
        src: ['dist/*.js']
      }
    }
  });

  grunt.registerTask('default', ['webpack:default', 'screeps']);
}
