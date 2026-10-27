'use strict';

process.argv[1] = require('path').join(__dirname, '..', 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
require('../node_modules/@angular/cli/bin/bootstrap');
