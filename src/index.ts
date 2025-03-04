const moduleAlias = require('module-alias')
// Or multiple aliases
moduleAlias.addAliases({
  '@': __dirname
})
require('./main')
